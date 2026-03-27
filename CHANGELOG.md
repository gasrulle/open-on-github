# Changelog

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
