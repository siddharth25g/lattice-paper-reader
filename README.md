# Lattice

Lattice is a private, local-first academic paper reader and research map. It is
packaged as a native macOS application with a React interface and a Tauri
desktop shell.

## Where data lives

- Imported PDFs: `~/Documents/Lattice Library/PDFs/`
- Notes and library metadata: `~/Library/Application Support/com.siddharthgundapaneni.lattice/lattice.db`

No account, cloud service, subscription, or API key is required.

For a short explanation of the interface, see [Using Lattice](USER_GUIDE.md).

## Development

Prerequisites: Node.js 22 or newer, the Rust stable toolchain, and the macOS
Command Line Tools.

```bash
npm install
npm run desktop
```

Build an installable macOS application and disk image with:

```bash
npm run desktop:build
```

The finished bundles are written under `src-tauri/target/release/bundle/`.

Before opening a pull request, run:

```bash
npm run lint
npm run build
npm run desktop:build -- --bundles app
```

## Current product slice

- Three-pane paper reader and research context
- Local PDF import into an ordinary filesystem folder
- SQLite-backed working notes and paper metadata
- Persistent workspaces, favorites, recent papers, command search, and paper switching
- Right-click paper/workspace management with confirmation-safe removal
- Local passage highlights with page numbers and comments
- Multi-paper Markdown context bundles for use with ChatGPT

PDF rendering currently uses the macOS web view. Saving a highlight uses a
select-copy-press-H workflow. Anchored colored overlays and standard PDF
annotation writeback remain the next major implementation milestone.

## Contributing with an LLM coding agent

This repository is deliberately agent-friendly. Give your coding agent the
repository, ask it to read `AGENTS.md`, and describe the workflow you want in
plain language. A good starter prompt is:

> Read `AGENTS.md`, `README.md`, and `USER_GUIDE.md`. Implement this feature:
> **[describe the research workflow and desired behavior]**. Preserve local-only
> storage and existing user data. Run the required checks, then summarize the
> implementation, data migration, and remaining limitations.

See [CONTRIBUTING.md](CONTRIBUTING.md) for the full workflow.

## License

MIT. See [LICENSE](LICENSE).
