# Using Lattice

Lattice is a private research library for reading papers, writing notes, and
keeping track of intellectual relationships between papers.

## Everyday workflow

1. Open **Lattice** from Applications, Spotlight, or the Dock.
2. Select **Import paper** and choose a PDF. Lattice copies it into
   `~/Documents/Lattice Library/PDFs/`, so the PDF remains an ordinary file.
3. Select a paper in the left sidebar to read it.
4. Use the right sidebar for your summary, working notes, tags, highlights, and
   linked papers. Use **+** to add as many titled working notes as you need;
   select a note's title to expand or collapse it. Notes save automatically in
   the local database, with their save status shown beside the title.
5. Select **+** beside **Workspaces** to make a project. Right-click a paper to
   rename its short Lattice label, add it to one or several workspaces, mark it
   as a favorite, link it to another paper, or remove it from Lattice. Renaming
   the label does not change the academic title or PDF filename. Right-click a
   workspace to delete it; its papers remain in Library.
6. Press **⌘K** to search the library quickly.
7. Press **Control-F** or **Command-F** while reading to search inside the
   current PDF. Enter moves to the next result and Shift-Enter moves back. The
   page field in the reader toolbar shows your current page; type another page
   and press Enter to jump there.
8. Select **Prepare research context** to choose several papers and copy or
   download a Markdown bundle containing their summaries, notes, and
   highlights. Attach that bundle and the relevant PDFs to ChatGPT.

## Saving a highlight

1. Select text directly in the PDF.
2. Press **Control-H**, or select the highlight button in the reader toolbar.
3. Check the passage, enter its page number, and optionally add a comment.
4. Select **Save highlight**. It appears in yellow over the PDF text, in the
   right sidebar, and in research-context exports. Selecting its sidebar card
   jumps back to its page.

Use the pencil beside a saved highlight to edit its passage, page, or comment.
Deleting a highlight asks for confirmation and never changes the PDF itself.

Lattice stores the passage, page, comment, and scaled page position in its local
database. Existing passage-only highlights are re-anchored when their page is
rendered. Lattice does not yet write a standard annotation into the PDF file.

## Tags

Select **Edit** beside **Tags**, enter comma-separated tags, and save. Editing
tags changes only Lattice's local metadata, not the PDF.

## Inbox and links

- **Library** contains every paper in Lattice.
- **Inbox** contains only papers that do not belong to any workspace. Adding a
  paper to its first workspace removes it from Inbox automatically; removing it
  from its last workspace returns it to Inbox.
- To link papers, right-click a paper and choose **Link to paper…**, or select
  **+** beside **Linked papers** in the right panel. Choose the other paper and
  describe the relationship. Links appear from both papers. Use the pencil to
  edit a relationship, or × to remove it after confirmation.

## Summaries and paper details

- Select the pencil beside **My summary** to write or edit a summary.
- The same dialog lets you enter authors, year, and publication information.
- For imported PDFs, Lattice reads embedded PDF metadata and the first page
  locally and may offer an author/year suggestion. Suggestions are never saved
  unless you choose **Use suggestion** and then **Save details**.
- Editing these fields never renames or rewrites the PDF.

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

Imported PDFs use Lattice's local selectable PDF reader. Search depends on the
PDF containing an extractable text layer; image-only scans need OCR before their
text can be searched or selected. Standard PDF annotation writeback is not yet
implemented.
