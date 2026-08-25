import { convertFileSrc, isTauri } from "@tauri-apps/api/core";
import { basename, documentDir, join } from "@tauri-apps/api/path";
import { open } from "@tauri-apps/plugin-dialog";
import { BaseDirectory, copyFile, exists, mkdir } from "@tauri-apps/plugin-fs";
import Database from "@tauri-apps/plugin-sql";
import type { Highlight, LibraryState, Paper, Workspace } from "./types";

const LIBRARY_FOLDER = "Lattice Library";
const PDF_FOLDER = `${LIBRARY_FOLDER}/PDFs`;
let databasePromise: Promise<Database> | null = null;

type PaperRow = {
  id: string;
  cite: string;
  title: string;
  authors: string;
  year: number;
  journal: string;
  status: Paper["status"];
  tags: string;
  color: string;
  summary: string;
  pdf_path: string;
  file_name: string;
  note: string | null;
};

export function isDesktopApp() {
  return isTauri();
}

async function database() {
  if (!databasePromise) {
    databasePromise = Database.load("sqlite:lattice.db").then(async (db) => {
      await db.execute(`CREATE TABLE IF NOT EXISTS papers (
        id TEXT PRIMARY KEY,
        cite TEXT NOT NULL,
        title TEXT NOT NULL,
        authors TEXT NOT NULL,
        year INTEGER NOT NULL,
        journal TEXT NOT NULL,
        status TEXT NOT NULL,
        tags TEXT NOT NULL,
        color TEXT NOT NULL,
        summary TEXT NOT NULL,
        pdf_path TEXT NOT NULL UNIQUE,
        file_name TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      )`);
      await db.execute(`CREATE TABLE IF NOT EXISTS notes (
        paper_id TEXT PRIMARY KEY,
        body TEXT NOT NULL,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      )`);
      await db.execute(`CREATE TABLE IF NOT EXISTS app_meta (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      )`);
      await db.execute(`CREATE TABLE IF NOT EXISTS workspaces (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        color TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      )`);
      await db.execute(`CREATE TABLE IF NOT EXISTS workspace_papers (
        workspace_id TEXT NOT NULL,
        paper_id TEXT NOT NULL,
        PRIMARY KEY (workspace_id, paper_id)
      )`);
      await db.execute(`CREATE TABLE IF NOT EXISTS hidden_papers (
        paper_id TEXT PRIMARY KEY,
        hidden_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      )`);
      await db.execute(`CREATE TABLE IF NOT EXISTS highlights (
        id TEXT PRIMARY KEY,
        paper_id TEXT NOT NULL,
        page INTEGER NOT NULL,
        selected_text TEXT NOT NULL,
        comment TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      )`);
      await db.execute(`CREATE TABLE IF NOT EXISTS favorite_papers (
        paper_id TEXT PRIMARY KEY,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      )`);
      await db.execute(`CREATE TABLE IF NOT EXISTS paper_activity (
        paper_id TEXT PRIMARY KEY,
        last_opened_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      )`);
      const seeded = await db.select<{ value: string }[]>("SELECT value FROM app_meta WHERE key = 'default_workspaces_seeded'");
      if (!seeded.length) {
        await db.execute("INSERT INTO workspaces (id, name, color) VALUES ($1, $2, $3)", ["hank-ftpl", "HANK × FTPL", "#a95a43"]);
        await db.execute("INSERT INTO workspaces (id, name, color) VALUES ($1, $2, $3)", ["public-pensions", "Public pensions", "#687c63"]);
        await db.execute("INSERT INTO workspaces (id, name, color) VALUES ($1, $2, $3)", ["sequence-space", "Sequence space", "#69728d"]);
        for (const paperId of ["auclert", "kaplan", "cochrane", "bassetto"]) {
          await db.execute("INSERT OR IGNORE INTO workspace_papers (workspace_id, paper_id) VALUES ($1, $2)", ["hank-ftpl", paperId]);
        }
        await db.execute("INSERT INTO app_meta (key, value) VALUES ('default_workspaces_seeded', '1')");
      }
      return db;
    });
  }
  return databasePromise;
}

function rowToPaper(row: PaperRow): Paper {
  return {
    id: row.id,
    cite: row.cite,
    title: row.title,
    authors: row.authors,
    year: Number(row.year),
    journal: row.journal,
    status: row.status,
    tags: JSON.parse(row.tags) as string[],
    color: row.color,
    summary: row.summary,
    note: row.note ?? "",
    highlights: [],
    pdfUrl: convertFileSrc(row.pdf_path),
    fileName: row.file_name,
    imported: true,
  };
}

export async function loadDesktopPapers(): Promise<Paper[]> {
  await mkdir(PDF_FOLDER, { baseDir: BaseDirectory.Document, recursive: true });
  const db = await database();
  const rows = await db.select<PaperRow[]>(`
    SELECT papers.*, notes.body AS note
    FROM papers
    LEFT JOIN notes ON notes.paper_id = papers.id
    ORDER BY papers.created_at ASC
  `);
  return rows.map(rowToPaper);
}

export async function loadDesktopNotes(): Promise<Record<string, string>> {
  const db = await database();
  const rows = await db.select<{ paper_id: string; body: string }[]>("SELECT paper_id, body FROM notes");
  return Object.fromEntries(rows.map((row) => [row.paper_id, row.body]));
}

async function availableFileName(originalName: string) {
  const cleaned = originalName.replace(/[^a-zA-Z0-9.() _-]/g, "-");
  const dot = cleaned.toLowerCase().lastIndexOf(".pdf");
  const stem = dot >= 0 ? cleaned.slice(0, dot) : cleaned;
  let candidate = `${stem}.pdf`;
  let suffix = 2;
  while (await exists(`${PDF_FOLDER}/${candidate}`, { baseDir: BaseDirectory.Document })) {
    candidate = `${stem}-${suffix}.pdf`;
    suffix += 1;
  }
  return candidate;
}

export async function importDesktopPaper(): Promise<Paper | null> {
  const selected = await open({
    title: "Import a paper into Lattice",
    multiple: false,
    directory: false,
    filters: [{ name: "Academic papers", extensions: ["pdf"] }],
    fileAccessMode: "scoped",
  });
  if (!selected || Array.isArray(selected)) return null;

  await mkdir(PDF_FOLDER, { baseDir: BaseDirectory.Document, recursive: true });
  const originalName = await basename(selected);
  const fileName = await availableFileName(originalName);
  const relativePath = `${PDF_FOLDER}/${fileName}`;
  await copyFile(selected, relativePath, { toPathBaseDir: BaseDirectory.Document });
  const fullPath = await join(await documentDir(), LIBRARY_FOLDER, "PDFs", fileName);

  const base = fileName.replace(/\.pdf$/i, "").replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim();
  const detectedYear = Number(base.match(/(?:19|20)\d{2}/)?.[0]) || new Date().getFullYear();
  const title = base.replace(/(?:19|20)\d{2}/, "").trim() || "Untitled paper";
  const id = `local-${Date.now()}`;
  const paper: Paper = {
    id,
    cite: title.split(" ").slice(0, 2).join(" "),
    title,
    authors: "Metadata pending",
    year: detectedYear,
    journal: "Local PDF",
    status: "To read",
    tags: ["Inbox"],
    color: "#7b7469",
    summary: "Add a concise summary after reading this paper.",
    note: "",
    highlights: [],
    pdfUrl: convertFileSrc(fullPath),
    fileName,
    imported: true,
  };

  const db = await database();
  await db.execute(
    `INSERT INTO papers
      (id, cite, title, authors, year, journal, status, tags, color, summary, pdf_path, file_name)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
    [paper.id, paper.cite, paper.title, paper.authors, paper.year, paper.journal, paper.status,
      JSON.stringify(paper.tags), paper.color, paper.summary, fullPath, fileName],
  );
  return paper;
}

export async function saveDesktopNote(paperId: string, body: string) {
  const db = await database();
  await db.execute(
    `INSERT INTO notes (paper_id, body, updated_at) VALUES ($1, $2, CURRENT_TIMESTAMP)
     ON CONFLICT(paper_id) DO UPDATE SET body = excluded.body, updated_at = CURRENT_TIMESTAMP`,
    [paperId, body],
  );
}

export async function loadDesktopLibraryState(): Promise<LibraryState> {
  const db = await database();
  const [workspaces, memberships, hidden, highlights, favorites, recent] = await Promise.all([
    db.select<Workspace[]>("SELECT id, name, color FROM workspaces ORDER BY created_at ASC"),
    db.select<{ workspace_id: string; paper_id: string }[]>("SELECT workspace_id, paper_id FROM workspace_papers"),
    db.select<{ paper_id: string }[]>("SELECT paper_id FROM hidden_papers"),
    db.select<{ id: string; paper_id: string; page: number; selected_text: string; comment: string }[]>("SELECT id, paper_id, page, selected_text, comment FROM highlights ORDER BY created_at ASC"),
    db.select<{ paper_id: string }[]>("SELECT paper_id FROM favorite_papers"),
    db.select<{ paper_id: string }[]>("SELECT paper_id FROM paper_activity ORDER BY last_opened_at DESC LIMIT 50"),
  ]);
  const membershipMap: Record<string, string[]> = {};
  for (const row of memberships) (membershipMap[row.workspace_id] ??= []).push(row.paper_id);
  const highlightMap: Record<string, Highlight[]> = {};
  for (const row of highlights) {
    (highlightMap[row.paper_id] ??= []).push({ id: row.id, page: Number(row.page), text: row.selected_text, comment: row.comment });
  }
  return {
    workspaces,
    memberships: membershipMap,
    hiddenPaperIds: hidden.map((row) => row.paper_id),
    highlights: highlightMap,
    favoritePaperIds: favorites.map((row) => row.paper_id),
    recentPaperIds: recent.map((row) => row.paper_id),
  };
}

export async function createDesktopWorkspace(workspace: Workspace) {
  const db = await database();
  await db.execute("INSERT INTO workspaces (id, name, color) VALUES ($1, $2, $3)", [workspace.id, workspace.name, workspace.color]);
}

export async function deleteDesktopWorkspace(workspaceId: string) {
  const db = await database();
  await db.execute("DELETE FROM workspace_papers WHERE workspace_id = $1", [workspaceId]);
  await db.execute("DELETE FROM workspaces WHERE id = $1", [workspaceId]);
}

export async function setDesktopWorkspaceMembership(workspaceId: string, paperId: string, member: boolean) {
  const db = await database();
  if (member) await db.execute("INSERT OR IGNORE INTO workspace_papers (workspace_id, paper_id) VALUES ($1, $2)", [workspaceId, paperId]);
  else await db.execute("DELETE FROM workspace_papers WHERE workspace_id = $1 AND paper_id = $2", [workspaceId, paperId]);
}

export async function removeDesktopPaper(paperId: string, imported: boolean) {
  const db = await database();
  await db.execute("DELETE FROM workspace_papers WHERE paper_id = $1", [paperId]);
  await db.execute("DELETE FROM highlights WHERE paper_id = $1", [paperId]);
  await db.execute("DELETE FROM favorite_papers WHERE paper_id = $1", [paperId]);
  await db.execute("DELETE FROM paper_activity WHERE paper_id = $1", [paperId]);
  if (imported) {
    await db.execute("DELETE FROM notes WHERE paper_id = $1", [paperId]);
    await db.execute("DELETE FROM papers WHERE id = $1", [paperId]);
  } else {
    await db.execute("INSERT OR IGNORE INTO hidden_papers (paper_id) VALUES ($1)", [paperId]);
  }
}

export async function saveDesktopHighlight(paperId: string, highlight: Highlight) {
  const db = await database();
  await db.execute(
    "INSERT INTO highlights (id, paper_id, page, selected_text, comment) VALUES ($1, $2, $3, $4, $5)",
    [highlight.id, paperId, highlight.page, highlight.text, highlight.comment],
  );
}

export async function setDesktopFavorite(paperId: string, favorite: boolean) {
  const db = await database();
  if (favorite) await db.execute("INSERT OR IGNORE INTO favorite_papers (paper_id) VALUES ($1)", [paperId]);
  else await db.execute("DELETE FROM favorite_papers WHERE paper_id = $1", [paperId]);
}

export async function recordDesktopPaperOpened(paperId: string) {
  const db = await database();
  await db.execute(
    `INSERT INTO paper_activity (paper_id, last_opened_at) VALUES ($1, CURRENT_TIMESTAMP)
     ON CONFLICT(paper_id) DO UPDATE SET last_opened_at = CURRENT_TIMESTAMP`,
    [paperId],
  );
}
