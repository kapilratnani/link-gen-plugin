# Repository Guidelines

## Project Structure & Module Organization

This repository is a Chrome Manifest V3 extension. Core files live at the root:

- `manifest.json`: metadata, permissions, commands, and script wiring.
- `background.js`: service worker for extension events and keyboard shortcut handling.
- `content.js`: injected UI, template selection, parameter capture, and link opening.
- `templates.js`: default template definitions and template storage helpers.
- `styles.css`: modal and popup styling for the injected UI.
- `icons/`: required extension icons (`icon16.png`, `icon32.png`, `icon48.png`, `icon128.png`).
- `build.sh`: release script; outputs `build/` and a timestamped zip.

There is currently no separate `src/` or `tests/` directory.

## Build, Test, and Development Commands

- `./build.sh`: validates required files, increments the patch version in `manifest.json`, copies extension assets to `build/`, and creates a zip package.
- Manual local run: open `chrome://extensions/`, enable Developer mode, choose **Load unpacked**, and select this repo or `build/`.
- Manual refresh: use the refresh icon on the extension card.

The build script uses `jq` when available, falls back to `sed`, and expects `zip` and `unzip`.

## Coding Style & Naming Conventions

Use plain JavaScript, CSS, and JSON without a bundler. Keep existing indentation: two spaces in JavaScript and JSON, compact CSS selectors, and descriptive camelCase names (`createTemplateSelector`, `currentParameterIndex`). Prefer direct DOM helpers over new dependencies. Keep template placeholders in `{parameterName}` format with clear camelCase names such as `{requestId}`.

## Testing Guidelines

No automated test suite is configured. Verify changes manually in Chrome:

- Open the selector with `Ctrl+Shift+L` or `Command+Shift+L`.
- Test keyboard navigation, close behavior, template add/edit/delete flows, and selected-text prefill.
- Confirm generated URLs encode parameters correctly and open in a new tab.
- Check the page and service worker consoles for errors.

Before packaging, run `./build.sh` and inspect the printed zip contents.

## Commit & Pull Request Guidelines

Recent commits use short, imperative, lowercase messages, for example `add build script`. Follow that style and keep each commit focused.

Pull requests should include a concise description, manual Chrome verification, build notes, and screenshots or recordings for UI changes. Link related issues when available. Mention `manifest.json` version changes after running the build script.

## Security & Configuration Tips

Keep permissions in `manifest.json` minimal. Avoid broad host or storage access unless required. Default templates may reference internal URLs; do not add secrets, tokens, or credentials to templates or docs.
