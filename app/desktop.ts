import { convertFileSrc, isTauri } from "@tauri-apps/api/core";
import { basename, documentDir, join } from "@tauri-apps/api/path";
import { open } from "@tauri-apps/plugin-dialog";
import { BaseDirectory, copyFile, exists, mkdir } from "@tauri-apps/plugin-fs";
import Database from "@tauri-apps/plugin-sql";
import type { Paper } from "./page";

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
