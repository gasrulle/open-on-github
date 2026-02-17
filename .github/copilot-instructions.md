# Copilot Instructions — Open on GitHub

## Project Overview

**Open on GitHub** is a VS Code extension that adds a GitHub submenu (with a `$(github)` icon) to the Source Control title bar, giving one-click access to a repository's **Code**, **Pull Requests**, and **Actions** pages on GitHub. It is published under the `Gasrulle` publisher ID.

## Tech Stack

- **Language:** TypeScript (strict mode)
- **Target:** ES2022, Node16 module resolution
- **Bundler:** esbuild (CommonJS output to `dist/extension.js`)
- **Linter:** ESLint with `typescript-eslint`
- **Package Manager:** npm
- **VS Code Engine:** `^1.103.0`
- **License:** MIT

## Repository Structure

```
open-on-github/
├── .github/              # GitHub config (this file)
├── .vscode/              # VS Code workspace settings
│   ├── extensions.json   # Recommended extensions for contributors
│   ├── launch.json       # Extension Host debug config
│   └── tasks.json        # Watch & package tasks
├── resources/            # Extension icon assets (icon.png, icon.svg, hero.png)
├── scripts/
│   └── package.js        # VSIX packaging script (uses @vscode/vsce)
├── src/
│   └── extension.ts      # Entire extension source (single-file extension)
├── dist/                 # Build output (git-ignored)
├── esbuild.js            # esbuild bundler config
├── eslint.config.mjs     # ESLint flat config
├── tsconfig.json         # TypeScript config
├── package.json          # Extension manifest & npm scripts
├── CHANGELOG.md          # Version history
└── README.md             # Marketplace readme
```

## Build & Development

| Action | Command |
|---|---|
| Full compile (types + lint + bundle) | `npm run compile` |
| Watch mode (esbuild + tsc in parallel) | `npm run watch` |
| Type check only | `npm run check-types` |
| Lint | `npm run lint` |
| Production bundle | `npm run package` |
| Create VSIX | `npm run vsce:package` |
| Debug extension | Press F5 (launches Extension Host via `launch.json`) |

The default build task in VS Code runs the `watch` task, which starts both `watch:esbuild` and `watch:tsc` in parallel using `npm-run-all2`.

## Architecture & Key Patterns

### Single-File Extension

All extension logic lives in `src/extension.ts`. Keep the extension small and focused. If the extension grows, consider splitting into modules under `src/` but retain a single entry point.

### VS Code API Usage

- **Activation:** `onStartupFinished` — the extension activates lazily after VS Code has fully started.
- **Extension Dependency:** Depends on the built-in `vscode.git` extension to read Git remote information.
- **Git Integration:** Uses the `vscode.git` extension API (`GitExtension` → `GitAPI` → `Repository` → `RepositoryState` → `Remote`) to extract the `origin` remote URL. The Git extension types are declared locally as interfaces in `extension.ts` (not imported from a types package).
- **Git API Caching:** The `GitAPI` instance is cached in a module-level variable (`cachedGitApi`) to avoid redundant `vscode.extensions.getExtension()` lookups on every command invocation.
- **Regex Constant:** The GitHub URL regex is extracted to a module-level constant (`GITHUB_URL_RE`) to avoid recompilation on every call.
- **Debounced Context Updates:** All event-driven context re-evaluations go through `scheduleUpdateContext()`, which debounces calls to `updateIsGitHubContext()` with a 150ms timer. This prevents redundant `setContext` calls when multiple repos change state in quick succession (e.g., during fetch). Only the initial call in `activate()` invokes `updateIsGitHubContext()` directly for instant startup.
- **Per-Repo Disposable Tracking:** Per-repository `onDidChange` listeners are tracked in a `Map<string, Disposable>` (`repoDisposables`) keyed by `repo.rootUri.toString()`. When `onDidCloseRepository` fires, the corresponding listener is looked up, disposed, and removed from the map — preventing listener leaks on stale repository objects.
- **URI-Based Path Comparison:** Repository matching uses `rootUri.toString()` (not `fsPath`) to ensure case-insensitive, platform-safe URI comparison.
- **URL Conversion:** Supports SSH (`git@github.com:`), SSH with protocol prefix (`ssh://git@github.com/`), and HTTPS remote formats, converting them to `https://github.com/...` base URLs. Trailing slashes and `.git` suffixes are stripped during normalization.
- **External Browser:** Uses `vscode.env.openExternal()` to open URLs.
- **Commands:** Three commands registered via `vscode.commands.registerCommand`, all pushed to `context.subscriptions` for proper disposal. Command callbacks must `return` the promise from async handlers to avoid floating promises.

### Menu Contributions

- The extension contributes a **submenu** (`openOnGithub.githubMenu`) to the `scm/title` menu area.
- The submenu is shown only when `scmProvider == git`.
- Commands are placed in a group `1_github@N` to control ordering within the submenu.

### Naming Conventions

- **Command IDs:** `openOnGithub.<action>` (camelCase prefix, camelCase action)
- **Submenu IDs:** `openOnGithub.<name>`
- **Functions:** camelCase (`getGitHubUrl`, `openGitHubPage`)
- **Interfaces:** PascalCase (`GitExtension`, `GitAPI`, `Repository`, etc.)
- Imports use `camelCase` or `PascalCase` per ESLint rule.

## Coding Standards

- **Strict TypeScript:** `strict: true` is enabled — never use `any` unless absolutely necessary.
- **Async/Await:** Prefer `async`/`await` over raw Promises.
- **Equality:** Use `===`/`!==` (enforced by `eqeqeq` ESLint rule).
- **Semicolons:** Required (enforced by `semi` ESLint rule).
- **Curly braces:** Always use curly braces for control flow (enforced by `curly` ESLint rule).
- **No throw literals:** Only throw `Error` objects (enforced by `@typescript-eslint/only-throw-error` rule).
- **No floating promises:** All promises must be awaited, returned, or explicitly voided (enforced by `@typescript-eslint/no-floating-promises` rule).
- **Type-aware linting:** ESLint is configured with `parserOptions.projectService` for full TypeScript type information, enabling type-aware rules.
- **Error handling:** Show user-friendly messages via `vscode.window.showWarningMessage()` or `showErrorMessage()` instead of throwing.
- **Null safety:** Use optional chaining (`?.`) and nullish coalescing (`??`) for safe property access.

## Bundling & Packaging

- esbuild bundles `src/extension.ts` → `dist/extension.js` (CommonJS, Node platform, target `node20`).
- `vscode` is marked as external (provided by the VS Code runtime).
- Production builds are minified with no source maps; dev builds include source maps.
- The VSIX is created via `scripts/package.js` using `@vscode/vsce`.
- `.vscodeignore` excludes source files, configs, dev artifacts, and `.github/` from the packaged extension — only `dist/extension.js`, `resources/` assets, `package.json`, `README.md`, `CHANGELOG.md`, and `LICENSE` are included.

## Dependency Upgrade Notes

### ESLint v10 (as of Feb 2026)

- **ESLint v10.0.0** is available but **typescript-eslint does not yet support it**. The current `typescript-eslint` (v8.x) has a peer dependency of `eslint: ^8.57.0 || ^9.0.0`. An official support PR ([typescript-eslint#12057](https://github.com/typescript-eslint/typescript-eslint/pull/12057)) is in progress.
- **Do not upgrade ESLint to v10 until typescript-eslint ships a release with v10 in its peer dependencies.** Upgrade both together when ready.
- **This project's ESLint config is already v10-ready:** it uses flat config (`eslint.config.mjs`), no `eslint-env` comments, no JSX, no legacy `.eslintrc`, and no affected rule options.
- Key ESLint v10 breaking changes to be aware of when upgrading:
  - Node.js ≥ v20.19.0 required.
  - `eslint:recommended` adds three new rules (`no-unassigned-vars`, `no-useless-assignment`, `preserve-caught-error`).
  - Config lookup now starts from the linted file's directory (was cwd-based).
  - Old `.eslintrc` format and `eslint-env` comments are fully removed.
  - `FlatESLint`/`LegacyESLint` APIs removed — use `ESLint` class only.

## Maintaining These Instructions

> **It is very important to keep this file constantly updated.** Whenever you discover new findings about the project — such as dependency compatibility issues, architectural decisions, build quirks, upgrade blockers, or resolved issues — update this document immediately. Treat these instructions as a living knowledge base, not a static document. Every learning should be captured here so future sessions have full context without re-discovering the same information.

## Testing

No test framework is currently set up. If tests are added:
- Use the `@vscode/test-electron` runner for integration tests.
- Place test files in a `src/test/` directory.
- Add a `test` npm script to `package.json`.

## Contributing Guidelines

- Keep the extension lightweight — avoid adding heavy dependencies.
- Any new command must be registered in both `package.json` (`contributes.commands`) and `extension.ts` (`activate`).
- Update `CHANGELOG.md` for every user-facing change.
- Run `npm run compile` before committing to ensure type checks and lint pass.
- The VSIX filename follows the pattern `open-on-github-scm-<version>.vsix`.
