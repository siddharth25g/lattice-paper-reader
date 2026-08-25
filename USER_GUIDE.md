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
5. Select **+** beside **Workspaces** to make a project. Right-click a paper to
   rename its short Lattice label, add it to one or several workspaces, mark it
   as a favorite, link it to another paper, or remove it from Lattice. Renaming
   the label does not change the academic title or PDF filename. Right-click a
   workspace to delete it; its papers remain in Library.
6. Press **⌘K** to search the library quickly.
7. Select **Prepare research context** to choose several papers and copy or
   download a Markdown bundle containing their summaries, notes, and
   highlights. Attach that bundle and the relevant PDFs to ChatGPT.

## Saving a highlight

1. Select text directly in the PDF.
2. Press **Control-H**, or select the highlight button in the reader toolbar.
3. Check the passage, enter its page number, and optionally add a comment.
4. Select **Save highlight**. It appears in the right sidebar and is included in
   research-context exports.

Lattice currently stores the passage, page, and comment in its local database.
It does not yet draw the highlight onto the PDF or write a standard PDF
annotation.

## Inbox and links

- **Library** contains every paper in Lattice.
- **Inbox** contains only papers that do not belong to any workspace. Adding a
  paper to its first workspace removes it from Inbox automatically; removing it
  from its last workspace returns it to Inbox.
- To link papers, right-click a paper and choose **Link to paper…**, or select
  **+** beside **Linked papers** in the right panel. Choose the other paper and
  describe the relationship. Links appear from both papers and can be removed
  with the × beside the link.

## Removing things safely

- Removing an imported paper deletes its Lattice metadata after confirmation,
  but deliberately leaves the PDF in `~/Documents/Lattice Library/PDFs/`.
- Deleting a workspace never deletes its papers or PDFs.

## Where your data lives

- PDFs: `~/Documents/Lattice Library/PDFs/`
- Metadata and notes:
  `~/Library/Application Support/com.siddharthgundapaneni.lattice/lattice.db`

Back up both locations if you want a complete backup. Lattice does not upload
them anywhere.

## Current limitation

Imported PDFs use Lattice's local selectable PDF reader. Highlights are durable
passage records, but restoring anchored colored overlays after reopening and
standard PDF annotation writeback are not implemented yet.
