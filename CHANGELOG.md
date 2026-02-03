# Changelog

## Unreleased

- Refactor: split monolith into `src/` modules (config, logger, UI, bot manager, bot instance, digging, utils).
- Improved digging loop to avoid premature restarts when chunks are missing.
- Added tests, lint, and bench scripts.
