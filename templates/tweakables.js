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

    const row = document.createElement('div');
    row.style.cssText = 'margin:4px 0;display:flex;flex-direction:column;gap:2px;';

    const labelEl = document.createElement('div');
    labelEl.textContent = labelText;
    row.appendChild(labelEl);

    const num = document.createElement('input');
    num.type = 'number';
    num.step = String(step);
    num.value = String(codeDefault);
    num.style.cssText = 'width:90px;background:#222;color:#eee;border:1px solid #444;';
    row.appendChild(num);

    const apply = (v) =>
    {
        setByPath(window, path, v);
        num.value = String(v);
    };

    num.addEventListener('input', () =>
    {
        const v = parseFloat(num.value);
        if (Number.isNaN(v)) return;
        setByPath(window, path, v);
    });

    return {
        type: 'number',
        codeDefault,
        options,
        rowEl: row,
        applyValue: apply,
    };
}
