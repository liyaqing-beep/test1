# Repository Guidelines

## Project Structure & Module Organization
- Source code lives in `src/`.
- Tests live in `tests/` (unit and integration).
- Developer tooling and one-off scripts go in `scripts/`.
- Static assets (images, fixtures) are in `assets/`.
- Root-level config: `.editorconfig`, `.gitignore`, optional `Makefile` and tool configs.

## Build, Test, and Development Commands
- `make setup` — install dependencies and toolchain.
- `make dev` — run the app or watchers for local development.
- `make test` — run all tests with coverage.
- `make lint` — run static analysis/linters.
- `make fmt` — auto-format code.

If no `Makefile` exists, use scripts under `scripts/` (e.g., `scripts/setup.sh`, `scripts/test.sh`, `scripts/lint.sh`). Prefer mirroring the names above for consistency.

## Coding Style & Naming Conventions
- Use an auto-formatter: Prettier (JS/TS), Black (Python), `gofmt` (Go).
- Lint with ESLint / Ruff / golangci-lint as applicable.
- Indentation: follow language defaults; never mix tabs/spaces.
- Names: directories `kebab-case`; files `snake_case` (Python) or `kebab-case` (JS); classes/types `PascalCase`; constants `UPPER_SNAKE_CASE`.

## Testing Guidelines
- Prefer fast, deterministic unit tests; mock external services and I/O.
- Test file patterns: `tests/test_*.py`, `**/*.test.ts`, or `*_test.go` (by language).
- Target ≥80% line coverage; document justified exceptions in the PR.

## Commit & Pull Request Guidelines
- Use Conventional Commits: `feat`, `fix`, `docs`, `style`, `refactor`, `test`, `chore`.
- PRs must include: clear description, linked issues, before/after notes or screenshots (for UI), and a test plan.
- Keep PRs focused and reasonably small (~400 LOC) to ease review.

## Security & Configuration Tips
- Never commit secrets. Use `.env` (ignored) and provide `.env.example`.
- Validate inputs and handle errors; avoid panics/exits in libraries.
- Pin dependency versions where possible; run security checks if tooling exists (`make audit` or `scripts/audit.sh`).

## Agent-Specific Instructions
- Follow this structure and conventions when adding files or code.
- Minimize unrelated changes; update docs and scripts when introducing new tools.
- Prefer additive changes; seek approval before destructive operations.
