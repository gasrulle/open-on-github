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
| Unit tests | `npm test` |
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
- **Multi-Repository Selection:** A repository-specific SCM menu's `rootUri` is authoritative. VS Code 1.103's global SCM toolbar passes no repository context when multiple repositories are visible (`SCMViewPane.getActionsContext`), so commands without context use `Repository.ui.selected` from the Git API. When none is selected, consider all repositories; prompt with a QuickPick if multiple GitHub origins are eligible. Never redirect an explicit or sole selected non-GitHub repository to another repository. Picker cancellation is a normal no-op.
- **URL Conversion:** Supports SSH (`git@github.com:`), SSH with protocol prefix (`ssh://git@github.com/`), and HTTPS remote formats, converting them to `https://github.com/...` base URLs. Trailing slashes and `.git` suffixes are stripped during normalization.
- **External Browser:** Uses `vscode.env.openExternal()` to open URLs.
- **Commands:** Four commands (Code, Issues, Pull Requests, Actions) registered via `vscode.commands.registerCommand`, all pushed to `context.subscriptions` for proper disposal. Command callbacks must `return` the promise from async handlers to avoid floating promises.

### Menu Contributions

- The extension contributes a **submenu** (`openOnGithub.githubMenu`) to the `scm/title` menu area.
- The submenu is shown only when `scmProvider == git && openOnGithub.isGitHub`. The custom context checks for a GitHub `origin`, matching the commands' remote selection.
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

### ESLint v10 — completed (as of Jun 2026)

- **ESLint has been upgraded to v10** (`^10.6.0`). This was previously blocked because `typescript-eslint` v8.x only declared `eslint: ^8.57.0 || ^9.0.0`. As of **typescript-eslint v8.62.1**, the peer dependency is `eslint: ^8.57.0 || ^9.0.0 || ^10.0.0`, so the two were upgraded together.
- The migration was clean — no source or config changes were needed. The flat config (`eslint.config.mjs`) was already v10-ready: no `eslint-env` comments, no JSX, no legacy `.eslintrc`, and no affected rule options.
- ESLint v10 requires Node.js ≥ v20.19.0. Other notable v10 changes: `eslint:recommended` adds three rules (`no-unassigned-vars`, `no-useless-assignment`, `preserve-caught-error`); config lookup now starts from the linted file's directory; `.eslintrc`/`eslint-env` and `FlatESLint`/`LegacyESLint` APIs are removed.

### TypeScript v6 — completed (as of Jun 2026)

- **TypeScript has been upgraded to v6** (`^6.0.3`). `typescript-eslint` v8.62.1 supports it via peer `typescript: >=4.8.4 <6.1.0`. **Do not upgrade past TypeScript 6.0.x (e.g. to the 7.0 RC) until typescript-eslint widens this peer range**, or linting will break.
- **TS 6.0 partitions ambient globals more strictly.** With `lib: ["ES2022"]` (no DOM), Node globals like `setTimeout`/`clearTimeout` were no longer auto-resolved and `tsc` failed with `Cannot find name 'setTimeout'`. **Fix: `tsconfig.json` now sets `"types": ["node"]`** to explicitly load `@types/node` globals. Keep this entry — do not remove it.

### Version-pinning policy for `@types/*`

- **`@types/vscode` is pinned to `^1.103.0` to match `engines.vscode`.** Do NOT bump it above the declared minimum engine, or the extension may compile against APIs unavailable in the minimum supported VS Code.
- **`@types/node` is pinned to `22.x` to match the Node version bundled with VS Code** (≈Node 22 for the 1.103 engine). Do NOT chase the latest `@types/node` major (e.g. 26.x) — it would expose Node APIs newer than the runtime.

### `@vscode/vsce` transitive vulnerabilities

- `npm audit` may report vulnerabilities in transitive deps of `@vscode/vsce` (e.g. `undici`, `lodash`, `shell-quote`, `tmp`). These are **dev/packaging-only** and never ship in the VSIX (which contains only `dist/extension.js` + assets). `npm audit fix` resolves them without breaking the build.


## Maintaining These Instructions

> **It is very important to keep this file constantly updated.** Whenever you discover new findings about the project — such as dependency compatibility issues, architectural decisions, build quirks, upgrade blockers, or resolved issues — update this document immediately. Treat these instructions as a living knowledge base, not a static document. Every learning should be captured here so future sessions have full context without re-discovering the same information.

## Testing

- Run `npm test` for unit regressions in `src/test/extension.test.cjs`. These use Node's built-in test runner and an in-memory esbuild bundle with a mocked VS Code API; no additional dependencies or build output are required.
- Unit tests verify command behavior and repository selection, not actual VS Code menu argument forwarding.
- For release UI verification, load the extracted production VSIX in an isolated VS Code profile, test every submenu action in two real repositories, and verify a command without SCM arguments follows the selected repository. Also check that a non-GitHub repository warns without redirecting. Intercept only the external-browser handoff to assert the exact URLs without opening browser tabs.
- On macOS, keep temporary `--user-data-dir` paths short (Unix-domain sockets have a 103-character limit). Playwright can automate context menus when the isolated profile sets `"window.menuStyle": "custom"`; do not change the user's settings. Remove session-local VS Code, Node, drivers, profiles, and caches after testing and publishing.
- Use the `@vscode/test-electron` runner if integration tests are added.

## Contributing Guidelines

- Keep the extension lightweight — avoid adding heavy dependencies.
- GitHub issue forms live in `.github/ISSUE_TEMPLATE/`: bug reports capture workspace layout, command entry point, repository/remote details, and versions; feature requests and questions use separate forms. Blank issues are disabled. Keep forms aligned with supported commands and repository-selection behavior, and never request credentials or private repository information.
- Any new command must be registered in both `package.json` (`contributes.commands`) and `extension.ts` (`activate`).
- Update `CHANGELOG.md` for every user-facing change.
- Run `npm run compile` before committing to ensure type checks and lint pass.
- The VSIX filename follows the pattern `open-on-github-scm-<version>.vsix`.
