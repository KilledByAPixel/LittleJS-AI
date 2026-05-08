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

function tweak(path, options = {})
{
    initTweakSystem();

    const currentValue = getByPath(window, path);
    if (currentValue === undefined || currentValue === null)
    {
        console.warn('tweak: path "' + path + '" did not resolve, skipping');
        return;
    }

    let codeDefault = currentValue;
    if (options.value !== undefined)
    {
        setByPath(window, path, options.value);
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
    else
    {
        console.warn('tweak: type "' + type + '" not yet implemented');
        return;
    }

    tweakRegistry.set(path, entry);
    tweakRowsEl.appendChild(entry.rowEl);
}

function tweakEngineDefaults()
{
    // implemented in a later task
}

// --- internals ---

function initTweakSystem()
{
    if (tweakPanelEl) return;

    tweakPanelEl = document.createElement('div');
    tweakPanelEl.style.cssText =
        'position:fixed;top:8px;right:8px;width:280px;max-height:90vh;' +
        'overflow-y:auto;background:rgba(20,20,20,.92);color:#eee;' +
        'font:12px/1.4 monospace;padding:8px;border-radius:4px;' +
        'box-shadow:0 2px 12px rgba(0,0,0,.5);display:none;z-index:9999;';

    tweakRowsEl = document.createElement('div');
    tweakPanelEl.appendChild(tweakRowsEl);

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

function getByPath(obj, path)
{
    return path.split('.').reduce((o, k) => o == null ? undefined : o[k], obj);
}

function setByPath(obj, path, value)
{
    const parts = path.split('.');
    const last = parts.pop();
    const parent = parts.reduce((o, k) => o[k], obj);
    parent[last] = value;
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
        setByPath(window, path, v);
        num.value = String(v);
        if (slider) slider.value = String(v);
    };

    if (slider)
    {
        slider.addEventListener('input', () =>
        {
            const v = parseFloat(slider.value);
            setByPath(window, path, v);
            num.value = String(v);
        });
    }

    num.addEventListener('input', () =>
    {
        const v = parseFloat(num.value);
        if (Number.isNaN(v)) return;
        setByPath(window, path, v);
        if (slider) slider.value = String(v);
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
        setByPath(window, path, b);
        cb.checked = b;
    };

    cb.addEventListener('change', () =>
    {
        setByPath(window, path, cb.checked);
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
        const cur = getByPath(window, path);
        cur.r = parseInt(hex.slice(1, 3), 16) / 255;
        cur.g = parseInt(hex.slice(3, 5), 16) / 255;
        cur.b = parseInt(hex.slice(5, 7), 16) / 255;
        // alpha intentionally unchanged (v1 ignores alpha in the picker)
    };

    const apply = (c) =>
    {
        const cur = getByPath(window, path);
        cur.r = c.r; cur.g = c.g; cur.b = c.b; cur.a = c.a;
        picker.value = colorToHex(cur);
    };

    picker.addEventListener('input', () => writeFromHex(picker.value));

    return {
        type: 'color',
        codeDefault: new Color(codeDefault.r, codeDefault.g, codeDefault.b, codeDefault.a),
        options,
        rowEl: row,
        applyValue: apply,
    };
}
