# Contributing to Lattice

## Proposing a change

Open a GitHub issue describing the research problem before prescribing the
interface. Include:

- what you are trying to do while reading or organizing papers;
- what is awkward today;
- the smallest behavior that would solve it;
- whether it changes PDFs, annotations, or stored metadata;
- what “done” should look like.

For larger changes, use a branch and pull request. Keep each pull request to one
coherent workflow so it is easy to review and reverse.

## Using an LLM coding agent

Clone the repository, open the repository folder in your coding agent, and use:

> Read `AGENTS.md`, `README.md`, and `USER_GUIDE.md`. Implement GitHub issue
> **#[number]**. Preserve all local-first and data-safety invariants. Run the
> required checks. Show me the resulting diff and explain any database migration
> before committing.

The agent should work on a branch, avoid touching unrelated files, and leave the
application in a buildable state. Human review is especially important for
filesystem operations, SQLite migrations, PDF annotation writeback, and macOS
permissions.

## Local setup

Install Node.js 22 or newer, Rust stable, and the macOS Command Line Tools.
Then run:

```bash
npm install
npm run desktop
```

## Verification

```bash
npm run lint
npm run build
npm run desktop:build -- --bundles app
```

The app bundle will appear under
`src-tauri/target/release/bundle/macos/Lattice.app`.
