'use strict';

// AI can use this class to make sound effects
class SoundGenerator extends Sound
{
    constructor(params = {})
    {
        const {
            volume = 1,        // Volume scale (percent)
            randomness = .05,  // How much to randomize frequency (percent Hz)
            frequency = 220,   // Frequency of sound (Hz)
            attack = 0,        // Attack time, how fast sound starts (seconds)
            release = .1,      // Release time, how fast sound fades out (seconds)
            shapeCurve = 1,    // Squarenes of wave (0=square, 1=normal, 2=pointy)
            slide = 0,         // How much to slide frequency (kHz/s)
            pitchJump = 0,     // Frequency of pitch jump (Hz)
            pitchJumpTime = 0, // Time of pitch jump (seconds)
            repeatTime = 0,    // Resets some parameters periodically (seconds)
            noise = 0,         // How much random noise to add (percent)
            bitCrush = 0,      // Resamples at a lower frequency in (samples*100)
            delay = 0,         // Overlap sound with itself for reverb and flanger effects (seconds)
        } = params;

        super([volume, randomness, frequency, attack, 0, release, 0, shapeCurve, slide, 0,
            pitchJump, pitchJumpTime, repeatTime, noise, 0, bitCrush, delay, 1, 0, 0, 0]);
    }
}

// ============================================================================
// Screen shake — random-walk nudge on cameraPos, decays linearly to zero.
// Stacks by keeping whichever active shake has the larger (amount × remaining)
// "energy" — strongest event wins, weaker is discarded.
//
// Registered as a single engine plugin at file-scope. Future game-feel
// helpers (hit-stop, flashes, etc.) can slot into gameFxUpdate / gameFxRender
// below without games needing additional engineAddPlugin calls.
// ============================================================================

let _shakeAmount    = 0;     // peak amplitude in world units
let _shakeRemaining = 0;     // seconds left
let _shakeDuration  = 1;     // original duration of the active event
let _shakeEnabled   = true;

function addScreenShake(amount, duration)
{
    if (!(amount > 0) || !(duration > 0)) return;
    const newEnergy = amount * duration;
    const curEnergy = _shakeAmount * _shakeRemaining;
    if (newEnergy <= curEnergy) return;
    _shakeAmount    = amount;
    _shakeRemaining = duration;
    _shakeDuration  = duration;
}

function setScreenShakeEnabled(b) { _shakeEnabled = !!b; }
function isScreenShakeEnabled()   { return _shakeEnabled; }

function _shakeUpdate()
{
    if (_shakeRemaining <= 0) return;
    _shakeRemaining -= timeDelta;
    if (_shakeRemaining <= 0)
    {
        _shakeAmount = 0;
        return;
    }
    if (!_shakeEnabled) return;
    const a = _shakeAmount * (_shakeRemaining / _shakeDuration);
    cameraPos = cameraPos.add(vec2(rand(-a, a), rand(-a, a)));
}

// ============================================================================
// Active input device — mouse vs keyboard vs gamepad, "most recently used".
//
// LittleJS tracks isUsingGamepad, but it flips to false on ANY mouse-click OR
// keypress, so it can't tell mouse from keyboard; and mouse *movement* never
// changes it while analog-*stick* movement never sets it. Games with a
// mouse-follow fallback (e.g. paddle = mousePos every frame) therefore snap
// back to the mouse the instant the stick/keys go idle.
//
// This picks whichever device is ACTIVELY being used this frame and, crucially,
// KEEPS the last device when everything is idle (instead of reverting to mouse).
// Refreshes lazily once per frame, so the value is current the first time a
// game reads it inside gameUpdate.
//
//   inputDevice()        -> 'mouse' | 'keyboard' | 'gamepad'
//   usingMouseInput()    -> true only while the mouse is the active device
//   usingKeyboardInput() -> ...
//   usingGamepadInput()  -> ...
//
// Typical use — replace an unconditional mouse fallback:
//     if (usingMouseInput()) paddleX = mousePos.x;       // mouse drives it
//     else                   paddleX += keyOrStick * spd; // kbd/gamepad; idle stays put
// ============================================================================

let _inputDevice = 'mouse';     // sensible default before any input
let _inputDeviceFrame = -1;
const _MOUSE_MOVE_PIXELS = 2;   // ignore sub-pixel hand jitter

function _gamepadActiveNow()
{
    // sticks are already deadzoned by the engine, so a centered stick reads 0
    if (gamepadStick(0).lengthSquared() > .04) return true;
    if (gamepadStick(1).lengthSquared() > .04) return true;
    for (let b = 0; b < 17; b++)
        if (gamepadIsDown(b)) return true;
    return false;
}

function _mouseActiveNow()
{
    return mouseIsDown(0) || mouseIsDown(1) || mouseIsDown(2) ||
        mouseDeltaScreen.length() > _MOUSE_MOVE_PIXELS;
}

function _inputDeviceRefresh()
{
    if (typeof frame === 'undefined' || _inputDeviceFrame === frame) return;
    _inputDeviceFrame = frame;
    if      (_gamepadActiveNow())                 _inputDevice = 'gamepad';
    else if (_mouseActiveNow())                   _inputDevice = 'mouse';
    else if (keyDirection().lengthSquared() > 0)  _inputDevice = 'keyboard';
    // else: keep previous device — the whole point (idle never reverts to mouse)
}

function inputDevice()        { _inputDeviceRefresh(); return _inputDevice; }
function usingMouseInput()    { return inputDevice() === 'mouse'; }
function usingKeyboardInput() { return inputDevice() === 'keyboard'; }
function usingGamepadInput()  { return inputDevice() === 'gamepad'; }

function gameFxUpdate()
{
    _shakeUpdate();
    // future feel-helpers slot in here
}

function gameFxRender()
{
    // reserved for future render-phase effects
}

engineAddPlugin(gameFxUpdate, gameFxRender);
