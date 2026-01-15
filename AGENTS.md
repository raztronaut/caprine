# Caprine Project Context for Jules

Caprine is an elegant, unofficial Facebook Messenger desktop app built with Electron and TypeScript.

## Architecture

- **Main Process**: Located in `source/index.ts`. Handles app lifecycle, window creation, menus, and system integrations (tray, notifications, etc.).
- **Renderer Process (Preload)**: Located in `source/browser.ts`. Injected into the Messenger webview to customize behavior, styles, and handle IPC.
- **Styles**: Custom CSS files in the `css/` directory are injected into the Messenger page.
- **Configuration**: Managed via `source/config.ts` using `electron-store`.
- **IPC**: Uses `electron-better-ipc` for communication between main and renderer processes.

## Technology Stack

- **Framework**: Electron
- **Language**: TypeScript
- **Linter**: XO
- **Styling**: Stylelint (for custom CSS)
- **Build System**: TypeScript compiler (`tsc`) and `electron-builder` for packaging.

## Common Tasks

- **Adding a Feature**: Usually involves changes in both the main process (`source/index.ts`) and the preload script (`source/browser.ts`), connected by IPC.
- **Styling Changes**: Add or modify CSS files in the `css/` directory. Ensure they are correctly loaded in `source/index.ts`.
- **Updating Dependencies**: Handled through `package.json`. Use `patch-package` for fixing issues in dependencies.

## Development Commands

- `npm install`: Install dependencies.
- `npm run build`: Compile TypeScript.
- `npm start`: Build and launch the app in development mode.
- `npm test`: Run linter and build check.
- `npm run lint`: Run XO and Stylelint.

## Troubleshooting: Dirty Working Tree

Jules requires a clean git working tree to take a snapshot of your environment. If `npm install` modifies `package-lock.json` (due to platform differences), Jules will fail the environment verification.

**Solution:** Add a reset command to your Jules setup script after `npm install`:

```bash
cd /app
npm install
git checkout package-lock.json
npm run build
```

Alternatively, use `npm ci` if you want to strictly follow the lockfile without modification.

## Guidelines for Jules

- **TypeScript**: Always use TypeScript for source changes. Avoid `any` where possible.
- **Electron API**: Be mindful of the differences between main and renderer processes.
- **Messenger Updates**: Since Caprine wraps the Messenger web app, changes to Messenger's DOM can break things. Use `element-ready` for robust selector handling.
