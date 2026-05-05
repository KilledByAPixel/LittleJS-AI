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
