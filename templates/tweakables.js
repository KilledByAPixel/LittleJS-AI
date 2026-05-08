'use strict';

// AI can use this module to mark globals as tweakable so they can be
// changed live in an HTML overlay panel. Toggle the panel with Tab.
//
// Usage:
//   tweak('jumpPower');                          // number, no slider
//   tweak('gravity.y', {min: -.05, max: 0});    // slider with range
//   tweak('debugDraw');                          // boolean checkbox
//   tweak('skyColor');                           // Color picker
//   tweak('gravity', {min: -.05, max: .05});    // Vector2 paired
//   tweakEngineDefaults();                       // common engine globals

const tweakRegistry = new Map();
let tweakPanelEl = null;
let tweakRowsEl = null;
let tweakPanelVisible = false;
let tweakStorageKey = null;
let tweakStoredValues = null;

function tweak(path, options = {})
{
    initTweakSystem();

    const currentValue = getByPath(path);
    if (currentValue === undefined || currentValue === null)
    {
        console.warn('tweak: path "' + path + '" did not resolve, skipping');
        return;
    }

    let codeDefault = currentValue;
    if (options.value !== undefined)
    {
        setByPath(path, options.value);
        codeDefault = options.value;
    }

    const type = detectTweakType(codeDefault);
    if (!type)
    {
        console.warn('tweak: unsupported value type for "' + path + '"');
        return;
    }

    const existing = tweakRegistry.get(path);
    if (existing && existing.rowEl) existing.rowEl.remove();

    let entry;
    if (type === 'number')
        entry = buildNumberRow(path, codeDefault, options);
    else if (type === 'boolean')
        entry = buildBooleanRow(path, codeDefault, options);
    else if (type === 'color')
        entry = buildColorRow(path, codeDefault, options);
    else if (type === 'vec2')
        entry = buildVec2Row(path, codeDefault, options);
    else
    {
        console.warn('tweak: type "' + type + '" not yet implemented');
        return;
    }

    tweakRegistry.set(path, entry);
    tweakRowsEl.appendChild(entry.rowEl);

    const stored = tweakStoredValues && tweakStoredValues[path];
    if (stored !== undefined)
    {
        const restored = restoreStoredValue(type, stored);
        if (restored !== undefined)
            entry.applyValue(restored);
        else
            console.warn('tweak: stored value for "' + path + '" type mismatch, ignoring');
    }
}

function tweakEngineDefaults()
{
    if (getByPath('gravity') instanceof Vector2)
        tweak('gravity', {min: -.05, max: .05});
    if (typeof getByPath('cameraScale') === 'number')
        tweak('cameraScale', {min: 4, max: 128, step: 1});
    if (typeof getByPath('soundVolume') === 'number')
        tweak('soundVolume', {min: 0, max: 1});
    if (typeof getByPath('glEnable') === 'boolean')
        tweak('glEnable');
    if (typeof getByPath('paused') === 'boolean')
        tweak('paused');
    if (typeof getByPath('debugOverlay') === 'boolean')
        tweak('debugOverlay');
}

// --- internals ---

function initTweakSystem()
{
    if (tweakPanelEl) return;

    tweakStorageKey = 'littlejs-tweaks-' + location.pathname;
    try
    {
        const raw = localStorage.getItem(tweakStorageKey);
        tweakStoredValues = raw ? JSON.parse(raw) : {};
    }
    catch (e)
    {
        tweakStoredValues = {};
    }

    tweakPanelEl = document.createElement('div');
    tweakPanelEl.style.cssText =
        'position:fixed;top:8px;right:8px;width:280px;max-height:90vh;' +
        'overflow-y:auto;background:rgba(20,20,20,.92);color:#eee;' +
        'font:12px/1.4 monospace;padding:8px;border-radius:4px;' +
        'box-shadow:0 2px 12px rgba(0,0,0,.5);display:none;z-index:9999;';

    // Stop input events from bubbling to LittleJS's document-level handlers,
    // which would otherwise preventDefault() our clicks and block focus.
    const stop = e => e.stopPropagation();
    ['mousedown','mouseup','pointerdown','pointerup',
     'touchstart','touchend','touchmove','wheel','click'].forEach(t =>
        tweakPanelEl.addEventListener(t, stop));

    tweakRowsEl = document.createElement('div');
    tweakPanelEl.appendChild(tweakRowsEl);

    const footer = document.createElement('div');
    footer.style.cssText = 'margin-top:8px;display:flex;gap:6px;';

    const copyBtn = document.createElement('button');
    copyBtn.textContent = 'Copy';
    copyBtn.style.cssText = 'flex:1;padding:4px;cursor:pointer;';
    copyBtn.onclick = copyTweakLines;
    footer.appendChild(copyBtn);

    const resetBtn = document.createElement('button');
    resetBtn.textContent = 'Reset';
    resetBtn.style.cssText = 'flex:1;padding:4px;cursor:pointer;';
    resetBtn.onclick = resetTweaks;
    footer.appendChild(resetBtn);

    tweakPanelEl.appendChild(footer);

    document.body.appendChild(tweakPanelEl);
    addEventListener('keydown', onTweakKey);
}

function onTweakKey(e)
{
    if (e.code !== 'Tab') return;
    if (tweakPanelEl.contains(document.activeElement)) return;
    e.preventDefault();
    tweakPanelVisible = !tweakPanelVisible;
    tweakPanelEl.style.display = tweakPanelVisible ? 'block' : 'none';
}

// Resolves a dotted path against the script's top-level scope.
// Uses indirect eval (via new Function) so script-scope `let` bindings
// — including LittleJS engine globals like `gravity`, `cameraScale` —
// are reachable. `window[path]` would not see them.
const TWEAK_PATH_RE = /^[A-Za-z_$][\w$]*(\.[A-Za-z_$][\w$]*)*$/;

function getByPath(path)
{
    if (!TWEAK_PATH_RE.test(path)) return undefined;
    try { return new Function('return ' + path)(); }
    catch (e) { return undefined; }
}

function setByPath(path, value)
{
    if (!TWEAK_PATH_RE.test(path)) return;
    const dot = path.lastIndexOf('.');
    if (dot < 0)
    {
        try { new Function('v', path + ' = v')(value); }
        catch (e) { /* read-only or missing — ignore */ }
        return;
    }
    const parent = getByPath(path.slice(0, dot));
    if (parent != null) parent[path.slice(dot + 1)] = value;
}

function detectTweakType(value)
{
    if (typeof value === 'number') return 'number';
    if (typeof value === 'boolean') return 'boolean';
    if (value instanceof Color) return 'color';
    if (value instanceof Vector2) return 'vec2';
    return null;
}

function autoStep(v)
{
    const a = Math.abs(v);
    if (a >= 10) return 1;
    if (a >= 1) return 0.1;
    return 0.001;
}

function buildNumberRow(path, codeDefault, options)
{
    const labelText = options.label || path;
    const step = options.step !== undefined ? options.step : autoStep(codeDefault);
    const hasRange = typeof options.min === 'number' && typeof options.max === 'number';

    const row = document.createElement('div');
    row.style.cssText = 'margin:4px 0;display:flex;flex-direction:column;gap:2px;';

    const labelEl = document.createElement('div');
    labelEl.textContent = labelText;
    row.appendChild(labelEl);

    const controls = document.createElement('div');
    controls.style.cssText = 'display:flex;gap:4px;align-items:center;';

    let slider = null;
    if (hasRange)
    {
        slider = document.createElement('input');
        slider.type = 'range';
        slider.min = String(options.min);
        slider.max = String(options.max);
        slider.step = String(step);
        slider.value = String(codeDefault);
        slider.style.cssText = 'flex:1;';
        controls.appendChild(slider);
    }

    const num = document.createElement('input');
    num.type = 'number';
    num.step = String(step);
    num.value = String(codeDefault);
    num.style.cssText = 'width:70px;background:#222;color:#eee;border:1px solid #444;';
    controls.appendChild(num);

    row.appendChild(controls);

    const apply = (v) =>
    {
        setByPath(path, v);
        num.value = String(v);
        if (slider) slider.value = String(v);
    };

    if (slider)
    {
        slider.addEventListener('input', () =>
        {
            const v = parseFloat(slider.value);
            setByPath(path, v);
            num.value = String(v);
            persistTweakValue(path, v);
        });
    }

    num.addEventListener('input', () =>
    {
        const v = parseFloat(num.value);
        if (Number.isNaN(v)) return;
        setByPath(path, v);
        if (slider) slider.value = String(v);
        persistTweakValue(path, v);
    });

    return {
        type: 'number',
        codeDefault,
        options,
        rowEl: row,
        applyValue: apply,
    };
}

function buildBooleanRow(path, codeDefault, options)
{
    const labelText = options.label || path;

    const row = document.createElement('div');
    row.style.cssText = 'margin:4px 0;display:flex;flex-direction:row;align-items:center;gap:6px;';

    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.checked = !!codeDefault;
    row.appendChild(cb);

    const labelEl = document.createElement('label');
    labelEl.textContent = labelText;
    labelEl.style.cssText = 'cursor:pointer;flex:1;';
    labelEl.addEventListener('click', () =>
    {
        cb.checked = !cb.checked;
        cb.dispatchEvent(new Event('change'));
    });
    row.appendChild(labelEl);

    const apply = (v) =>
    {
        const b = !!v;
        setByPath(path, b);
        cb.checked = b;
    };

    cb.addEventListener('change', () =>
    {
        setByPath(path, cb.checked);
        persistTweakValue(path, cb.checked);
    });

    return {
        type: 'boolean',
        codeDefault: !!codeDefault,
        options,
        rowEl: row,
        applyValue: apply,
    };
}

function colorToHex(c)
{
    const toByte = (x) => Math.max(0, Math.min(255, Math.round(x * 255)));
    const hex = (n) => n.toString(16).padStart(2, '0');
    return '#' + hex(toByte(c.r)) + hex(toByte(c.g)) + hex(toByte(c.b));
}

function buildColorRow(path, codeDefault, options)
{
    const labelText = options.label || path;

    const row = document.createElement('div');
    row.style.cssText = 'margin:4px 0;display:flex;flex-direction:row;align-items:center;gap:6px;';

    const labelEl = document.createElement('div');
    labelEl.textContent = labelText;
    labelEl.style.flex = '1';
    row.appendChild(labelEl);

    const picker = document.createElement('input');
    picker.type = 'color';
    picker.value = colorToHex(codeDefault);
    row.appendChild(picker);

    const writeFromHex = (hex) =>
    {
        const cur = getByPath(path);
        cur.r = parseInt(hex.slice(1, 3), 16) / 255;
        cur.g = parseInt(hex.slice(3, 5), 16) / 255;
        cur.b = parseInt(hex.slice(5, 7), 16) / 255;
        // alpha intentionally unchanged (v1 ignores alpha in the picker)
    };

    const apply = (c) =>
    {
        const cur = getByPath(path);
        cur.r = c.r; cur.g = c.g; cur.b = c.b; cur.a = c.a;
        picker.value = colorToHex(cur);
    };

    picker.addEventListener('input', () =>
    {
        writeFromHex(picker.value);
        persistTweakValue(path, getByPath(path));
    });

    return {
        type: 'color',
        codeDefault: new Color(codeDefault.r, codeDefault.g, codeDefault.b, codeDefault.a),
        options,
        rowEl: row,
        applyValue: apply,
    };
}

function buildVec2Row(path, codeDefault, options)
{
    const labelText = options.label || path;
    const hasRange = typeof options.min === 'number' && typeof options.max === 'number';

    const row = document.createElement('div');
    row.style.cssText = 'margin:4px 0;display:flex;flex-direction:column;gap:2px;';

    const labelEl = document.createElement('div');
    labelEl.textContent = labelText;
    row.appendChild(labelEl);

    const buildAxis = (axis, currentAxisValue) =>
    {
        const step = options.step !== undefined ? options.step : autoStep(currentAxisValue);

        const wrap = document.createElement('div');
        wrap.style.cssText = 'display:flex;gap:4px;align-items:center;';

        const axisLabel = document.createElement('span');
        axisLabel.textContent = axis;
        axisLabel.style.cssText = 'width:12px;color:#888;';
        wrap.appendChild(axisLabel);

        let slider = null;
        if (hasRange)
        {
            slider = document.createElement('input');
            slider.type = 'range';
            slider.min = String(options.min);
            slider.max = String(options.max);
            slider.step = String(step);
            slider.value = String(currentAxisValue);
            slider.style.cssText = 'flex:1;';
            wrap.appendChild(slider);
        }

        const num = document.createElement('input');
        num.type = 'number';
        num.step = String(step);
        num.value = String(currentAxisValue);
        num.style.cssText = 'width:60px;background:#222;color:#eee;border:1px solid #444;';
        wrap.appendChild(num);

        const writeAxis = (v) =>
        {
            const cur = getByPath(path);
            cur[axis] = v;
            num.value = String(v);
            if (slider) slider.value = String(v);
        };

        if (slider)
        {
            slider.addEventListener('input', () =>
            {
                const v = parseFloat(slider.value);
                const cur = getByPath(path);
                cur[axis] = v;
                num.value = String(v);
                persistTweakValue(path, cur);
            });
        }
        num.addEventListener('input', () =>
        {
            const v = parseFloat(num.value);
            if (Number.isNaN(v)) return;
            const cur = getByPath(path);
            cur[axis] = v;
            if (slider) slider.value = String(v);
            persistTweakValue(path, cur);
        });

        return { wrap, slider, num, writeAxis };
    };

    const xCtrl = buildAxis('x', codeDefault.x);
    const yCtrl = buildAxis('y', codeDefault.y);
    row.appendChild(xCtrl.wrap);
    row.appendChild(yCtrl.wrap);

    const apply = (v) =>
    {
        const cur = getByPath(path);
        cur.x = v.x; cur.y = v.y;
        xCtrl.num.value = String(v.x);
        yCtrl.num.value = String(v.y);
        if (xCtrl.slider) xCtrl.slider.value = String(v.x);
        if (yCtrl.slider) yCtrl.slider.value = String(v.y);
    };

    return {
        type: 'vec2',
        codeDefault: vec2(codeDefault.x, codeDefault.y),
        options,
        rowEl: row,
        applyValue: apply,
    };
}

function persistTweakValue(path, value)
{
    if (!tweakStoredValues) return;
    let toStore;
    if (typeof value === 'number' || typeof value === 'boolean')
        toStore = value;
    else if (value instanceof Color)
        toStore = [value.r, value.g, value.b, value.a];
    else if (value instanceof Vector2)
        toStore = [value.x, value.y];
    else
        return;
    tweakStoredValues[path] = toStore;
    try
    {
        localStorage.setItem(tweakStorageKey, JSON.stringify(tweakStoredValues));
    }
    catch (e)
    {
        // localStorage full or disabled — keep in-memory only
    }
}

function restoreStoredValue(type, stored)
{
    if (type === 'number' && typeof stored === 'number') return stored;
    if (type === 'boolean' && typeof stored === 'boolean') return stored;
    if (type === 'color' && Array.isArray(stored) && stored.length === 4)
        return new Color(stored[0], stored[1], stored[2], stored[3]);
    if (type === 'vec2' && Array.isArray(stored) && stored.length === 2)
        return vec2(stored[0], stored[1]);
    return undefined;
}

function copyTweakLines()
{
    const lines = [];
    for (const [path, entry] of tweakRegistry)
    {
        const cur = getByPath(path);
        const opts = entry.options || {};
        const fields = [];

        if (entry.type === 'number')
            fields.push('value: ' + cur);
        else if (entry.type === 'boolean')
            fields.push('value: ' + cur);
        else if (entry.type === 'color')
        {
            const r = cur.r.toFixed(3), g = cur.g.toFixed(3), b = cur.b.toFixed(3);
            const tail = cur.a !== 1 ? ', ' + cur.a.toFixed(3) : '';
            fields.push('value: rgb(' + r + ', ' + g + ', ' + b + tail + ')');
        }
        else if (entry.type === 'vec2')
            fields.push('value: vec2(' + cur.x + ', ' + cur.y + ')');

        if (typeof opts.min === 'number') fields.push('min: ' + opts.min);
        if (typeof opts.max === 'number') fields.push('max: ' + opts.max);
        if (opts.step !== undefined) fields.push('step: ' + opts.step);

        lines.push("tweak('" + path + "', {" + fields.join(', ') + '});');
    }
    const text = lines.join('\n');
    if (navigator.clipboard && navigator.clipboard.writeText)
        navigator.clipboard.writeText(text).catch(() => console.log(text));
    else
        console.log(text);
}

function resetTweaks()
{
    for (const [, entry] of tweakRegistry)
        entry.applyValue(entry.codeDefault);
    try { localStorage.removeItem(tweakStorageKey); } catch (e) {}
    tweakStoredValues = {};
}
