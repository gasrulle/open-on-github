# Changelog

## [Unreleased]

### Changed

- Updated development and packaging dependencies, including npm-run-all2 9 and @vscode/vsce 4
- Replaced the deprecated typescript-eslint configuration helper with ESLint's `defineConfig`
- Restricted VS Code typings to 1.103.x and TypeScript to the supported 6.0.x line

## [0.0.8] - 2026-10-10

### Fixed

- GitHub commands now use the selected Source Control repository in multi-repository workspaces instead of always opening the first GitHub repository
- Repository-specific menus no longer silently redirect to another repository when their repository has no GitHub `origin`

### Changed

- Commands prompt for a repository when multiple GitHub repositories are eligible and the choice is ambiguous

## [0.0.6] - 2026-06-30

### Fixed

- "Code" command now falls back to the repository's default branch when the current branch does not exist on origin, avoiding a 404 on GitHub

### Changed

- Updated dev dependencies: ESLint 9 → 10, TypeScript 5.9 → 6, esbuild 0.27 → 0.28, npm-run-all2 7 → 8, typescript-eslint 8.54 → 8.62, @vscode/vsce 3.0 → 3.9
- Added `"types": ["node"]` to `tsconfig.json` for TypeScript 6 compatibility

## [0.0.5] - 2026-03-27

### Changed

- "Code" command now opens the currently checked-out branch on GitHub instead of the default branch

## [0.0.4] - 2026-02-19

### Added

- Added "Issues" menu item to the GitHub submenu, linking to the repository's issues page

## [0.0.3] - 2026-02-17

### Changed

- Improved performance by caching Git API reference and extracting regex constant
- Merged duplicate `onDidOpenRepository` listeners to eliminate redundant event handling
- Fixed floating promises in command callbacks to properly propagate errors
- Enabled type-aware ESLint linting with `projectService` for stronger static analysis
- Replaced abandoned `npm-run-all` with actively maintained `npm-run-all2`
- Added explicit `noEmit` and `skipLibCheck` to TypeScript config
- Added `target: "node20"` to esbuild config for optimized output
- Excluded `.github/` directory from VSIX package
- Added recommended extensions config for esbuild problem matchers

## [0.0.1] - 2026-02-13

### Added

- GitHub submenu in the Source Control title bar with `$(github)` icon
- **Code** command to open the repository home page
- **Pull Requests** command to open the pull requests tab
- **Actions** command to open the GitHub Actions tab
- Support for SSH and HTTPS remote URL formats
