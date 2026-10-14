# Security Policy

## Supported versions

Only the latest release of the **littlejs** plugin receives fixes. The current version is the `version` field in [`.claude-plugin/plugin.json`](.claude-plugin/plugin.json).

## What is in scope

This plugin ships skills (Markdown instructions), the LittleJS engine build in `dist/`, templates, examples, and a local build script (`build.mjs`). It runs no server, has no MCP servers or hooks, and collects no data.

Issues in the LittleJS engine itself belong in the [LittleJS repository](https://github.com/KilledByAPixel/LittleJS).

## Reporting a vulnerability

Please report it privately through GitHub: on this repository's **Security** tab, choose **Report a vulnerability**. Do not open a public issue for a security problem.

Expect a reply within a week. Once a fix ships, the report is credited in [`CHANGELOG.md`](CHANGELOG.md) unless you ask otherwise.
