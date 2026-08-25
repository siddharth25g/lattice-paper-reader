# Instructions for coding agents

## Product intent

Lattice is a quiet, local-first academic paper reader and research map. Its
primary user is an academic macroeconomist. Favor dense, keyboard-friendly,
editorial interfaces over generic dashboards. The core product is the reading
and note-taking workflow, not a decorative graph visualization.

## Non-negotiable invariants

- Keep PDFs, notes, metadata, and annotations local by default.
- Do not add accounts, telemetry, hosted databases, or cloud uploads without an
  explicit user request.
- Never delete, move, overwrite, or rewrite a user's PDF without confirmation.
- Preserve existing SQLite data. Schema changes require forward migrations and
  must not rely on dropping populated tables.
- Prefer standard PDF annotations or an export path so annotations are not
  trapped inside Lattice.
- Keep the three-pane reading layout calm and information-dense. Reuse the
  existing typography, spacing, and color system.
- Do not commit user PDFs, SQLite databases, build outputs, credentials, or
  machine-specific paths.

## Architecture

- UI: React 19 + TypeScript + Vite in `app/` and `src/`
- Desktop shell: Tauri 2 in `src-tauri/`
- Local database: SQLite through `@tauri-apps/plugin-sql`
- Local file import: Tauri dialog and filesystem plugins
- PDFs: `~/Documents/Lattice Library/PDFs/`
- Database: the macOS Application Support directory for the bundle identifier

`app/page.tsx` currently contains most of the product surface. When a feature
substantially enlarges it, extract cohesive components rather than adding more
unrelated state to the same file.

## Required implementation workflow

1. Read `README.md`, `USER_GUIDE.md`, and the relevant source before editing.
2. Restate the user-visible behavior and identify any data migration.
3. Implement the smallest complete workflow, including empty and error states.
4. Keep browser fallback behavior working when practical, but prioritize the
   installed macOS application.
5. Run:

   ```bash
   npm run lint
   npm run build
   npm run desktop:build -- --bundles app
   ```

6. Report what changed, how it was verified, any migration performed, and any
   remaining limitation. Do not claim an interaction works unless it was
   implemented and tested proportionately.

## Useful prompts for an agent

### New feature

> Read `AGENTS.md` first. Add **[feature]** because I need to **[research
> workflow]**. Preserve local storage and existing data. Match the current UI,
> add any safe migration required, run all required checks, and tell me exactly
> what remains incomplete.

### Bug fix

> Read `AGENTS.md` first. Reproduce and fix this behavior: **[steps and observed
> result]**. Do not redesign unrelated UI. Add a regression check where
> practical and run all required checks.

### Product exploration

> Read `AGENTS.md` and inspect the current app. Propose the smallest useful
> version of **[idea]** for an academic paper-reading workflow. Separate product
> decisions from implementation details and do not edit files until the scope
> is clear.
