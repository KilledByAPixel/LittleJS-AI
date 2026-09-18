# Privacy Policy — LittleJS Claude Code Plugin

*Effective 2026-09-18*

## Summary

The `littlejs` plugin runs entirely on your own machine. It does not collect, store, or transmit any personal data. There is no telemetry, no analytics, no account, and no server operated by the plugin author.

## What the plugin is

The plugin is a set of instruction files (skills), a copy of the LittleJS game engine, and code templates. Claude Code reads the instructions and copies files from the plugin into projects you ask it to create. Nothing in the plugin executes in the background or contacts a network on its own.

## Data the plugin handles

- **Your prompts and code** are handled by Claude Code and the Claude model under [Anthropic's privacy policy](https://www.anthropic.com/privacy). The plugin adds instructions to those conversations; it does not see, log, or forward them anywhere.
- **Files the plugin writes** (game projects, the engine copy, templates) stay on your disk in folders you choose.
- **Save data in games you build** uses the browser's `localStorage` on the machine running the game, and never leaves it.

## Network activity

The plugin itself makes no network requests. Three things around it do, and each is your action rather than the plugin's:

1. **Installing or updating the plugin** — Claude Code fetches this repository from GitHub.
2. **Building a 3D game** — a game that uses the three.js template loads three.js from the jsDelivr CDN when the game runs. This is the game you made, and only if you chose 3D.
3. **The optional zip build** — `npm install` fetches build tools from the npm registry, only if you run it.

## Third parties

No data is shared with, or sold to, any third party. There are no advertising or tracking components.

## Children

The plugin is a developer tool and is not directed at children. It collects no information from anyone.

## Changes

If this policy changes, the update will be committed to this repository with a new effective date.

## Contact

Open an issue at <https://github.com/KilledByAPixel/LittleJS-AI/issues>.
