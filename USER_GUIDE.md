# Using Lattice

Lattice is a private research library for reading papers, writing notes, and
keeping track of intellectual relationships between papers.

## Everyday workflow

1. Open **Lattice** from Applications, Spotlight, or the Dock.
2. Select **Import paper** and choose a PDF. Lattice copies it into
   `~/Documents/Lattice Library/PDFs/`, so the PDF remains an ordinary file.
3. Select a paper in the left sidebar to read it.
4. Use the right sidebar for your summary, working note, tags, highlights, and
   linked papers. Notes save automatically in the local database.
5. Use **Workspaces** for research questions or projects. The same paper can
   eventually belong to several workspaces without duplicating its PDF.
6. Press **⌘K** to search the library quickly.
7. Select **Prepare research context** to choose several papers and copy or
   download a Markdown bundle containing their summaries, notes, and
   highlights. Attach that bundle and the relevant PDFs to ChatGPT.

## Where your data lives

- PDFs: `~/Documents/Lattice Library/PDFs/`
- Metadata and notes:
  `~/Library/Application Support/com.siddharthgundapaneni.lattice/lattice.db`

Back up both locations if you want a complete backup. Lattice does not upload
them anywhere.

## Current limitation

Imported PDFs currently use the macOS embedded PDF viewer. The visible sample
highlights demonstrate the intended design; durable anchored highlighting and
writing standard annotations back into PDFs are not implemented yet.
