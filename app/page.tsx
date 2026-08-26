"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  createDesktopWorkspace, deleteDesktopHighlight, deleteDesktopPaperLink, deleteDesktopWorkingNote,
  deleteDesktopWorkspace, importDesktopPaper, isDesktopApp, loadDesktopLibraryState,
  loadDesktopPapers, loadDesktopWorkingNotes, recordDesktopPaperOpened, removeDesktopPaper,
  saveDesktopHighlight, saveDesktopPaperAlias, saveDesktopPaperLink, saveDesktopPaperMetadata,
  saveDesktopPaperTags, saveDesktopWorkingNote, setDesktopFavorite, setDesktopWorkspaceMembership,
} from "./desktop";
import { capturePdfSelection, PdfReader } from "./PdfReader";
import type { Highlight, HighlightRect, LibraryState, Paper, PaperLink, PaperMetadataOverride, PdfMetadataSuggestion, WorkingNote, Workspace } from "./types";

export type { Paper } from "./types";

const starterPapers: Paper[] = [
  { id: "auclert", cite: "Auclert, Rognlie & Straub", title: "The Intertemporal Keynesian Cross", authors: "Adrien Auclert, Matthew Rognlie, Ludwig Straub", year: 2018, journal: "NBER Working Paper 25020", status: "Reading", tags: ["HANK", "MPCs", "Fiscal policy"], color: "#aa5a43", summary: "A sufficient-statistics representation of how household heterogeneity shapes aggregate demand through intertemporal marginal propensities to consume.", note: "The iMPC matrix is the object to carry into the FTPL comparison. Ask whether the revaluation shock maps cleanly into the same sequence-space representation.", highlights: [
    { id: "starter-auclert-1", page: 7, text: "The general equilibrium response can be represented as the interaction of intertemporal MPCs with income exposure.", comment: "Core sufficient-statistics result." },
    { id: "starter-auclert-2", page: 19, text: "Redistribution changes not only the level of demand but its entire time profile.", comment: "Compare with fiscal revaluation channel." },
  ] },
  { id: "kaplan", cite: "Kaplan, Moll & Violante", title: "Monetary Policy According to HANK", authors: "Greg Kaplan, Benjamin Moll, Giovanni L. Violante", year: 2018, journal: "American Economic Review, 108(3)", status: "Read", tags: ["HANK", "Monetary policy", "Redistribution"], color: "#637c73", summary: "Decomposes monetary transmission in a heterogeneous-agent New Keynesian model, emphasizing indirect income effects over direct intertemporal substitution.", note: "Canonical reference for indirect effects. Useful benchmark for whether fiscal-price-level adjustment operates through labor income, asset income, or valuation.", highlights: [
    { id: "starter-kaplan-1", page: 4, text: "Indirect effects arising from general-equilibrium changes in household income dominate direct substitution effects.", comment: "Main mechanism in one line." },
  ] },
  { id: "cochrane", cite: "Cochrane", title: "The Fiscal Theory of the Price Level", authors: "John H. Cochrane", year: 2023, journal: "Princeton University Press", status: "Reading", tags: ["FTPL", "Determinacy", "Government debt"], color: "#6d7294", summary: "Develops the fiscal theory as a framework in which the price level adjusts so that the real value of nominal government liabilities equals expected primary surpluses.", note: "Need a sharper mapping from the representative-agent valuation equation to heterogeneous portfolios. Separate nominal debt exposure from heterogeneous MPCs.", highlights: [
    { id: "starter-cochrane-1", page: 38, text: "The government debt valuation equation is an equilibrium condition, not an optional constraint imposed after the fact.", comment: "Good framing for theory section." },
  ] },
  { id: "bassetto", cite: "Bassetto", title: "A Game-Theoretic View of the Fiscal Theory of the Price Level", authors: "Marco Bassetto", year: 2002, journal: "Econometrica, 70(6)", status: "To read", tags: ["FTPL", "Policy games", "Equilibrium"], color: "#7f684e", summary: "Recasts monetary–fiscal interactions as an explicit game to clarify which policy commitments and off-equilibrium behavior support fiscal equilibria.", note: "Read alongside Cochrane’s equilibrium selection discussion. Pay attention to timing and the policy game, not only the valuation equation.", highlights: [] },
];

const defaultWorkspaces: Workspace[] = [
  { id: "hank-ftpl", name: "HANK × FTPL", color: "#a95a43" },
  { id: "public-pensions", name: "Public pensions", color: "#687c63" },
  { id: "sequence-space", name: "Sequence space", color: "#69728d" },
];
const defaultLibraryState: LibraryState = { workspaces: defaultWorkspaces, memberships: { "hank-ftpl": ["auclert", "kaplan", "cochrane", "bassetto"] }, hiddenPaperIds: [], highlights: {}, favoritePaperIds: [], recentPaperIds: [], paperAliases: {}, paperLinks: [
  { id: "starter-link-kaplan", sourcePaperId: "auclert", targetPaperId: "kaplan", relation: "mechanism", detail: "Indirect income effects" },
  { id: "starter-link-cochrane", sourcePaperId: "auclert", targetPaperId: "cochrane", relation: "contrast", detail: "Debt valuation channel" },
], metadataOverrides: {}, tagOverrides: {} };
const DB_NAME = "lattice-local-library";
const DB_STORE = "papers";
const STATE_KEY = "lattice-library-state-v2";
const WORKING_NOTES_KEY = "lattice-working-notes-v1";
type View = { kind: "library" | "inbox" | "recent" | "favorites" | "workspace"; workspaceId?: string };
type MenuState = { kind: "paper" | "workspace"; id: string; x: number; y: number } | null;

function openLibraryDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => { const db = request.result; if (!db.objectStoreNames.contains(DB_STORE)) db.createObjectStore(DB_STORE, { keyPath: "paper.id" }); };
    request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
  });
}
async function storeLocalPaper(paper: Paper, file: File) {
  const db = await openLibraryDb();
  await new Promise<void>((resolve, reject) => { const tx = db.transaction(DB_STORE, "readwrite"); tx.objectStore(DB_STORE).put({ paper: { ...paper, pdfUrl: undefined }, file }); tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error); }); db.close();
}
async function readLocalPapers(): Promise<Paper[]> {
  const db = await openLibraryDb();
  const records = await new Promise<{ paper: Paper; file: Blob }[]>((resolve, reject) => { const request = db.transaction(DB_STORE, "readonly").objectStore(DB_STORE).getAll(); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); }); db.close();
  return records.map(({ paper, file }) => ({ ...paper, tags: paper.tags.filter((tag) => tag !== "Inbox"), pdfUrl: URL.createObjectURL(file) }));
}
async function deleteLocalPaper(paperId: string) {
  const db = await openLibraryDb();
  await new Promise<void>((resolve, reject) => { const tx = db.transaction(DB_STORE, "readwrite"); tx.objectStore(DB_STORE).delete(paperId); tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error); }); db.close();
}
function loadBrowserState(): LibraryState { try { const saved = JSON.parse(localStorage.getItem(STATE_KEY) ?? "{}") as Partial<LibraryState>; return { ...defaultLibraryState, ...saved, tagOverrides: saved.tagOverrides ?? {} }; } catch { return defaultLibraryState; } }
function loadBrowserWorkingNotes(): Record<string, WorkingNote[]> {
  try {
    const saved = localStorage.getItem(WORKING_NOTES_KEY);
    if (saved) return JSON.parse(saved) as Record<string, WorkingNote[]>;
    const legacy = JSON.parse(localStorage.getItem("lattice-paper-notes") ?? "{}") as Record<string, string>;
    const migrated = Object.fromEntries(Object.entries(legacy).filter(([, body]) => body.trim()).map(([paperId, body]) => [paperId, [{ id: `legacy-note-${paperId}`, paperId, title: "Working note", body, position: 0 }]]));
    if (Object.keys(migrated).length) localStorage.setItem(WORKING_NOTES_KEY, JSON.stringify(migrated));
    return migrated;
  } catch { return {}; }
}
function Mark({ children }: { children: React.ReactNode }) { return <span className="paper-mark">{children}</span>; }
function mergeHighlights(existing: Highlight[], saved: Highlight[]) {
  return [...new Map([...existing, ...saved].map((highlight) => [highlight.id, highlight])).values()];
}

export default function Home() {
  const desktopApp = isDesktopApp();
  const [libraryPapers, setLibraryPapers] = useState<Paper[]>(starterPapers);
  const [libraryState, setLibraryState] = useState<LibraryState>(defaultLibraryState);
  const [activeId, setActiveId] = useState("auclert");
  const [view, setView] = useState<View>({ kind: "library" });
  const [query, setQuery] = useState("");
  const [workingNotes, setWorkingNotes] = useState<Record<string, WorkingNote[]>>({});
  const [expandedNoteIds, setExpandedNoteIds] = useState<string[]>([]);
  const [noteSaveState, setNoteSaveState] = useState<Record<string, "Saving" | "Saved" | "Not saved">>({});
  const [contextTab, setContextTab] = useState<"notes" | "details">("notes");
  const [commandOpen, setCommandOpen] = useState(false);
  const [contextOpen, setContextOpen] = useState(false);
  const [contextIds, setContextIds] = useState<string[]>([]);
  const [copyState, setCopyState] = useState("Copy context");
  const [zoom, setZoom] = useState(112);
  const [createWorkspaceOpen, setCreateWorkspaceOpen] = useState(false);
  const [workspaceName, setWorkspaceName] = useState("");
  const [menu, setMenu] = useState<MenuState>(null);
  const [highlightOpen, setHighlightOpen] = useState(false);
  const [highlightText, setHighlightText] = useState("");
  const [highlightPage, setHighlightPage] = useState("1");
  const [highlightComment, setHighlightComment] = useState("");
  const [editingHighlightId, setEditingHighlightId] = useState<string | null>(null);
  const [highlightRects, setHighlightRects] = useState<HighlightRect[]>([]);
  const [renamePaperId, setRenamePaperId] = useState<string | null>(null);
  const [paperLabel, setPaperLabel] = useState("");
  const [linkSourceId, setLinkSourceId] = useState<string | null>(null);
  const [linkTargetId, setLinkTargetId] = useState("");
  const [linkRelation, setLinkRelation] = useState("related");
  const [linkDetail, setLinkDetail] = useState("");
  const [editingLinkId, setEditingLinkId] = useState<string | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [tagsOpen, setTagsOpen] = useState(false);
  const [tagDraft, setTagDraft] = useState("");
  const [metadataAuthors, setMetadataAuthors] = useState("");
  const [metadataYear, setMetadataYear] = useState("");
  const [metadataJournal, setMetadataJournal] = useState("");
  const [metadataSummary, setMetadataSummary] = useState("");
  const [metadataSuggestions, setMetadataSuggestions] = useState<Record<string, PdfMetadataSuggestion>>({});
  const [notice, setNotice] = useState("");
  const [readerPage, setReaderPage] = useState(1);
  const [readerPageInput, setReaderPageInput] = useState("1");
  const [readerPageCount, setReaderPageCount] = useState(1);
  const [pageJump, setPageJump] = useState({ page: 1, nonce: 0 });
  const [pdfSearchRequest, setPdfSearchRequest] = useState(0);
  const searchRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const readerStageRef = useRef<HTMLDivElement>(null);
  const noteSaveQueuesRef = useRef<Record<string, Promise<void>>>({});

  const availablePapers = useMemo(() => libraryPapers
    .filter((paper) => !libraryState.hiddenPaperIds.includes(paper.id))
    .map((paper) => ({ ...paper, ...(libraryState.metadataOverrides[paper.id] ?? {}), tags: libraryState.tagOverrides[paper.id] ?? paper.tags })),
  [libraryPapers, libraryState.hiddenPaperIds, libraryState.metadataOverrides, libraryState.tagOverrides]);
  const assignedPaperIds = useMemo(() => new Set(Object.values(libraryState.memberships).flat()), [libraryState.memberships]);
  const inboxPapers = useMemo(() => availablePapers.filter((paper) => !assignedPaperIds.has(paper.id)), [assignedPaperIds, availablePapers]);
  const papersInView = useMemo(() => {
    if (view.kind === "inbox") return inboxPapers;
    if (view.kind === "recent") return libraryState.recentPaperIds.map((id) => availablePapers.find((paper) => paper.id === id)).filter(Boolean) as Paper[];
    if (view.kind === "favorites") return availablePapers.filter((paper) => libraryState.favoritePaperIds.includes(paper.id));
    if (view.kind === "workspace") return availablePapers.filter((paper) => libraryState.memberships[view.workspaceId ?? ""]?.includes(paper.id));
    return availablePapers;
  }, [availablePapers, inboxPapers, libraryState.favoritePaperIds, libraryState.memberships, libraryState.recentPaperIds, view]);
  const paperLabelFor = (paper: Paper) => libraryState.paperAliases[paper.id] ?? paper.cite;
  const visiblePapers = useMemo(() => { const term = query.trim().toLowerCase(); return term ? papersInView.filter((paper) => [paper.title, paper.authors, paper.tags.join(" "), libraryState.paperAliases[paper.id] ?? paper.cite].join(" ").toLowerCase().includes(term)) : papersInView; }, [libraryState.paperAliases, papersInView, query]);
  const commandResults = useMemo(() => { const term = query.trim().toLowerCase(); return term ? availablePapers.filter((paper) => [paper.title, paper.authors, paper.tags.join(" "), libraryState.paperAliases[paper.id] ?? paper.cite].join(" ").toLowerCase().includes(term)) : availablePapers; }, [availablePapers, libraryState.paperAliases, query]);
  const activePaper = visiblePapers.find((paper) => paper.id === activeId) ?? visiblePapers[0];
  const activeLinks = activePaper ? libraryState.paperLinks.filter((link) => link.sourcePaperId === activePaper.id || link.targetPaperId === activePaper.id) : [];
  const linkSourcePaper = linkSourceId ? availablePapers.find((paper) => paper.id === linkSourceId) : undefined;
  const linkExistingIds = new Set(libraryState.paperLinks.flatMap((link) => link.sourcePaperId === linkSourceId ? [link.targetPaperId] : link.targetPaperId === linkSourceId ? [link.sourcePaperId] : []));
  const editingLink = editingLinkId ? libraryState.paperLinks.find((link) => link.id === editingLinkId) : undefined;
  const currentEditTarget = editingLink ? (editingLink.sourcePaperId === linkSourceId ? editingLink.targetPaperId : editingLink.sourcePaperId) : undefined;
  const linkCandidates = availablePapers.filter((paper) => paper.id !== linkSourceId && (!linkExistingIds.has(paper.id) || paper.id === currentEditTarget));
  const selectedWorkspace = menu?.kind === "workspace" ? libraryState.workspaces.find((item) => item.id === menu.id) : undefined;
  const selectedMenuPaper = menu?.kind === "paper" ? availablePapers.find((item) => item.id === menu.id) : undefined;
  const activeViewName = view.kind === "workspace" ? libraryState.workspaces.find((item) => item.id === view.workspaceId)?.name ?? "Workspace" : ({ library: "Library", inbox: "Inbox", recent: "Recently read", favorites: "Favorites" } as const)[view.kind];
  const persistBrowserState = (next: LibraryState) => { try { localStorage.setItem(STATE_KEY, JSON.stringify(next)); } catch { /* optional */ } };
  const updateLibraryState = (change: (state: LibraryState) => LibraryState) => setLibraryState((state) => { const next = change(state); if (!desktopApp) persistBrowserState(next); return next; });

  useEffect(() => {
    document.body.classList.toggle("tauri-app", desktopApp);
    if (desktopApp) {
      Promise.all([loadDesktopPapers(), loadDesktopWorkingNotes(), loadDesktopLibraryState()]).then(([imported, savedNotes, state]) => {
        setLibraryPapers((current) => [...current, ...imported.filter((paper) => !current.some((item) => item.id === paper.id))].map((paper) => ({ ...paper, highlights: mergeHighlights(paper.highlights, state.highlights[paper.id] ?? []) })));
        setWorkingNotes(savedNotes); setLibraryState(state);
      }).catch(() => setNotice("Lattice could not load some saved library data."));
    } else {
      const state = loadBrowserState(); queueMicrotask(() => setLibraryState(state));
      readLocalPapers().then((imported) => setLibraryPapers((current) => [...current, ...imported.filter((paper) => !current.some((item) => item.id === paper.id))].map((paper) => ({ ...paper, highlights: mergeHighlights(paper.highlights, state.highlights[paper.id] ?? []) })))).catch(() => undefined);
      queueMicrotask(() => setWorkingNotes(loadBrowserWorkingNotes()));
    }
  }, [desktopApp]);

  async function beginHighlight(paper: Paper) {
    const anchor = capturePdfSelection();
    let text = anchor?.text ?? window.getSelection()?.toString().trim() ?? "";
    const page = anchor?.page ?? readerPage;
    if (!text && paper.pdfUrl) { try { text = (await navigator.clipboard.readText()).trim(); } catch { /* paste remains available */ } }
    setEditingHighlightId(null); setHighlightText(text); setHighlightPage(String(page)); setHighlightComment(""); setHighlightRects(anchor?.rects ?? []); setHighlightOpen(true);
  }
  const beginEditHighlight = (highlight: Highlight) => {
    setEditingHighlightId(highlight.id); setHighlightText(highlight.text); setHighlightPage(String(highlight.page)); setHighlightComment(highlight.comment); setHighlightRects(highlight.rects ?? []); setHighlightOpen(true);
  };

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement; const typing = ["INPUT", "TEXTAREA"].includes(target.tagName) || target.isContentEditable;
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") { event.preventDefault(); setCommandOpen((open) => !open); }
      if (!typing && event.ctrlKey && !event.metaKey && event.key.toLowerCase() === "h" && activePaper) { event.preventDefault(); void beginHighlight(activePaper); }
      if (event.key === "Escape") { setCommandOpen(false); setMenu(null); setHighlightOpen(false); setCreateWorkspaceOpen(false); setRenamePaperId(null); setLinkSourceId(null); setDetailsOpen(false); setTagsOpen(false); }
    };
    window.addEventListener("keydown", onKeyDown); return () => window.removeEventListener("keydown", onKeyDown);
  });
  useEffect(() => { if (commandOpen) requestAnimationFrame(() => searchRef.current?.focus()); }, [commandOpen]);
  useEffect(() => { if (!notice) return; const timer = window.setTimeout(() => setNotice(""), 3200); return () => window.clearTimeout(timer); }, [notice]);
  useEffect(() => { queueMicrotask(() => { setReaderPage(1); setReaderPageInput("1"); setReaderPageCount(1); setPageJump({ page: 1, nonce: 0 }); }); }, [activePaper?.id]);

  const updateReaderPage = (page: number) => { setReaderPage(page); setReaderPageInput(String(page)); };
  const jumpToPage = (page: number) => {
    const next = Math.max(1, Math.min(readerPageCount, Math.round(page) || 1));
    setReaderPage(next); setReaderPageInput(String(next)); setPageJump((jump) => ({ page: next, nonce: jump.nonce + 1 }));
  };
  const toggleFullscreen = async () => {
    try { if (document.fullscreenElement) await document.exitFullscreen(); else await readerStageRef.current?.requestFullscreen(); }
    catch { setNotice("Full screen is not available in this window."); }
  };

  const selectPaper = (paper: Paper) => {
    setActiveId(paper.id);
    updateLibraryState((state) => ({ ...state, recentPaperIds: [paper.id, ...state.recentPaperIds.filter((id) => id !== paper.id)].slice(0, 50) }));
    if (desktopApp) void recordDesktopPaperOpened(paper.id);
  };
  const selectView = (next: View) => { setView(next); setQuery(""); setMenu(null); };
  const notesForPaper = (paper: Paper) => workingNotes[paper.id] ?? (!paper.imported && paper.note ? [{ id: `starter-note-${paper.id}`, paperId: paper.id, title: "Working note", body: paper.note, position: 0 }] : []);
  const persistWorkingNote = async (note: WorkingNote, allNotes: Record<string, WorkingNote[]>) => {
    setNoteSaveState((state) => ({ ...state, [note.id]: "Saving" }));
    try {
      if (desktopApp) {
        const prior = noteSaveQueuesRef.current[note.id] ?? Promise.resolve();
        const queued = prior.catch(() => undefined).then(() => saveDesktopWorkingNote(note));
        noteSaveQueuesRef.current[note.id] = queued;
        await queued;
        if (noteSaveQueuesRef.current[note.id] !== queued) return;
      } else localStorage.setItem(WORKING_NOTES_KEY, JSON.stringify(allNotes));
      setNoteSaveState((state) => ({ ...state, [note.id]: "Saved" }));
    } catch { setNoteSaveState((state) => ({ ...state, [note.id]: "Not saved" })); setNotice("That note could not be saved."); }
  };
  const updateWorkingNote = (note: WorkingNote, change: Partial<Pick<WorkingNote, "title" | "body">>) => {
    const updated = { ...note, ...change };
    const existing = workingNotes[note.paperId] ?? [note];
    const next = { ...workingNotes, [note.paperId]: existing.map((item) => item.id === note.id ? updated : item) };
    setWorkingNotes(next);
    void persistWorkingNote(updated, next);
  };
  const addWorkingNote = async () => {
    if (!activePaper) return;
    const note: WorkingNote = { id: `note-${window.crypto.randomUUID()}`, paperId: activePaper.id, title: "Untitled note", body: "", position: notesForPaper(activePaper).length };
    const next = { ...workingNotes, [activePaper.id]: [...notesForPaper(activePaper), note] };
    setWorkingNotes(next);
    void persistWorkingNote(note, next);
    setExpandedNoteIds((ids) => [...ids, note.id]);
  };
  const removeWorkingNote = async (note: WorkingNote) => {
    if (!window.confirm(`Delete “${note.title || "Untitled note"}”?\n\nThis removes only this working note.`)) return;
    try {
      if (desktopApp) await deleteDesktopWorkingNote(note.id);
      const next = { ...workingNotes, [note.paperId]: (workingNotes[note.paperId] ?? []).filter((item) => item.id !== note.id) };
      if (!desktopApp) localStorage.setItem(WORKING_NOTES_KEY, JSON.stringify(next));
      setWorkingNotes(next);
      setExpandedNoteIds((ids) => ids.filter((id) => id !== note.id));
    } catch { setNotice("That note could not be deleted."); }
  };

  const importPaper = async (file?: File) => {
    if (!file || file.type !== "application/pdf") return;
    const base = file.name.replace(/\.pdf$/i, "").replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim();
    const year = Number(base.match(/(?:19|20)\d{2}/)?.[0]) || new Date().getFullYear(); const title = base.replace(/(?:19|20)\d{2}/, "").trim() || "Untitled paper";
    const paper: Paper = { id: `local-${Date.now()}`, cite: title.split(" ").slice(0, 2).join(" "), title, authors: "Metadata pending", year, journal: "Local PDF", status: "To read", tags: [], color: "#7b7469", summary: "Add a concise summary after reading this paper.", note: "", highlights: [], pdfUrl: URL.createObjectURL(file), fileName: file.name, imported: true };
    setLibraryPapers((current) => [...current, paper]); selectView({ kind: "inbox" }); selectPaper(paper); await storeLocalPaper(paper, file).catch(() => setNotice("The paper opened, but could not be saved."));
  };
  const handleImport = async () => {
    if (!desktopApp) { fileRef.current?.click(); return; }
    const paper = await importDesktopPaper().catch(() => null); if (!paper) return;
    setLibraryPapers((current) => [...current, paper]); selectView({ kind: "inbox" }); selectPaper(paper);
  };
  const addWorkspace = async () => {
    const name = workspaceName.trim(); if (!name) return;
    const palette = ["#a95a43", "#687c63", "#69728d", "#8a6a45", "#7d627c"];
    const workspace = { id: `workspace-${Date.now()}`, name, color: palette[libraryState.workspaces.length % palette.length] };
    updateLibraryState((state) => ({ ...state, workspaces: [...state.workspaces, workspace], memberships: { ...state.memberships, [workspace.id]: [] } }));
    if (desktopApp) await createDesktopWorkspace(workspace).catch(() => setNotice("The workspace could not be saved."));
    setWorkspaceName(""); setCreateWorkspaceOpen(false); selectView({ kind: "workspace", workspaceId: workspace.id });
  };
  const removeWorkspace = async (workspace: Workspace) => {
    setMenu(null); if (!window.confirm(`Delete “${workspace.name}”?\n\nIts papers and PDFs will remain in your Library.`)) return;
    updateLibraryState((state) => { const memberships = { ...state.memberships }; delete memberships[workspace.id]; return { ...state, workspaces: state.workspaces.filter((item) => item.id !== workspace.id), memberships }; });
    if (view.kind === "workspace" && view.workspaceId === workspace.id) selectView({ kind: "library" });
    if (desktopApp) await deleteDesktopWorkspace(workspace.id).catch(() => setNotice("The workspace could not be deleted."));
  };
  const removePaper = async (paper: Paper) => {
    setMenu(null); const fileNote = paper.imported ? "The PDF file will stay in Documents/Lattice Library/PDFs." : "This only hides the included demo paper.";
    if (!window.confirm(`Remove “${paper.title}” from Lattice?\n\n${fileNote}`)) return;
    updateLibraryState((state) => ({ ...state, hiddenPaperIds: paper.imported ? state.hiddenPaperIds : [...state.hiddenPaperIds, paper.id], memberships: Object.fromEntries(Object.entries(state.memberships).map(([id, ids]) => [id, ids.filter((paperId) => paperId !== paper.id)])), favoritePaperIds: state.favoritePaperIds.filter((id) => id !== paper.id), recentPaperIds: state.recentPaperIds.filter((id) => id !== paper.id), paperLinks: state.paperLinks.filter((link) => link.sourcePaperId !== paper.id && link.targetPaperId !== paper.id) }));
    if (paper.imported) { setLibraryPapers((items) => items.filter((item) => item.id !== paper.id)); if (!desktopApp) await deleteLocalPaper(paper.id).catch(() => undefined); }
    if (desktopApp) await removeDesktopPaper(paper.id, Boolean(paper.imported)).catch(() => setNotice("The paper could not be removed."));
  };
  const toggleMembership = async (workspaceId: string, paperId: string) => {
    const member = !(libraryState.memberships[workspaceId] ?? []).includes(paperId);
    updateLibraryState((state) => ({ ...state, memberships: { ...state.memberships, [workspaceId]: member ? [...(state.memberships[workspaceId] ?? []), paperId] : (state.memberships[workspaceId] ?? []).filter((id) => id !== paperId) } }));
    if (desktopApp) await setDesktopWorkspaceMembership(workspaceId, paperId, member).catch(() => setNotice("Workspace membership could not be saved."));
  };
  const toggleFavorite = async (paperId: string) => {
    const favorite = !libraryState.favoritePaperIds.includes(paperId);
    setMenu(null);
    updateLibraryState((state) => ({ ...state, favoritePaperIds: favorite ? [...state.favoritePaperIds, paperId] : state.favoritePaperIds.filter((id) => id !== paperId) }));
    if (desktopApp) await setDesktopFavorite(paperId, favorite).catch(() => setNotice("Favorite could not be saved."));
  };
  const beginRenamePaper = (paper: Paper) => { setMenu(null); setRenamePaperId(paper.id); setPaperLabel(paperLabelFor(paper)); };
  const renamePaper = async () => {
    const label = paperLabel.trim(); if (!renamePaperId || !label) return;
    const paperId = renamePaperId;
    updateLibraryState((state) => ({ ...state, paperAliases: { ...state.paperAliases, [paperId]: label } }));
    setRenamePaperId(null); setNotice("Paper label renamed.");
    if (desktopApp) await saveDesktopPaperAlias(paperId, label).catch(() => setNotice("The paper label could not be saved."));
  };
  const beginEditDetails = (paper: Paper) => {
    setMetadataAuthors(paper.authors === "Metadata pending" ? "" : paper.authors);
    setMetadataYear(String(paper.year));
    setMetadataJournal(paper.journal === "Local PDF" ? "" : paper.journal);
    setMetadataSummary(paper.summary === "Add a concise summary after reading this paper." ? "" : paper.summary);
    setDetailsOpen(true);
  };
  const savePaperDetails = async () => {
    if (!activePaper) return;
    const metadata: PaperMetadataOverride = {
      authors: metadataAuthors.trim() || "Metadata pending",
      year: Math.max(1, Number(metadataYear) || activePaper.year),
      journal: metadataJournal.trim() || "Local PDF",
      summary: metadataSummary.trim(),
    };
    try {
      if (desktopApp) await saveDesktopPaperMetadata(activePaper.id, metadata);
      updateLibraryState((state) => ({ ...state, metadataOverrides: { ...state.metadataOverrides, [activePaper.id]: metadata } }));
      setDetailsOpen(false); setNotice("Paper details saved locally.");
    } catch { setNotice("Paper details could not be saved."); }
  };
  const useMetadataSuggestions = () => {
    if (!activePaper) return;
    const suggestion = metadataSuggestions[activePaper.id];
    if (suggestion?.authors) setMetadataAuthors(suggestion.authors);
    if (suggestion?.year) setMetadataYear(String(suggestion.year));
  };
  const beginEditTags = (paper: Paper) => { setTagDraft(paper.tags.join(", ")); setTagsOpen(true); };
  const saveTags = async () => {
    if (!activePaper) return;
    const tags = [...new Map(tagDraft.split(/[,\n]/).map((tag) => tag.trim()).filter(Boolean).map((tag) => [tag.toLocaleLowerCase(), tag])).values()];
    try {
      if (desktopApp) await saveDesktopPaperTags(activePaper.id, tags);
      updateLibraryState((state) => ({ ...state, tagOverrides: { ...state.tagOverrides, [activePaper.id]: tags } }));
      setTagsOpen(false); setNotice("Tags saved locally.");
    } catch { setNotice("Tags could not be saved."); }
  };
  const beginLinkPaper = (paper: Paper) => {
    const existingIds = new Set(libraryState.paperLinks.flatMap((link) => link.sourcePaperId === paper.id ? [link.targetPaperId] : link.targetPaperId === paper.id ? [link.sourcePaperId] : []));
    const firstTarget = availablePapers.find((candidate) => candidate.id !== paper.id && !existingIds.has(candidate.id));
    setMenu(null); setEditingLinkId(null); setLinkSourceId(paper.id); setLinkTargetId(firstTarget?.id ?? ""); setLinkRelation("related"); setLinkDetail("");
  };
  const beginEditLink = (link: PaperLink, paper: Paper) => {
    setEditingLinkId(link.id); setLinkSourceId(paper.id);
    setLinkTargetId(link.sourcePaperId === paper.id ? link.targetPaperId : link.sourcePaperId);
    setLinkRelation(link.relation); setLinkDetail(link.detail);
  };
  const saveLink = async () => {
    if (!linkSourceId || !linkTargetId || linkSourceId === linkTargetId) return;
    const link: PaperLink = { id: editingLinkId ?? `link-${Date.now()}`, sourcePaperId: linkSourceId, targetPaperId: linkTargetId, relation: linkRelation.trim() || "related", detail: linkDetail.trim() };
    try {
      if (desktopApp) await saveDesktopPaperLink(link);
      updateLibraryState((state) => ({ ...state, paperLinks: editingLinkId ? state.paperLinks.map((item) => item.id === editingLinkId ? link : item) : [...state.paperLinks, link] }));
      setLinkSourceId(null); setEditingLinkId(null); setNotice("Paper link saved.");
    } catch { setNotice("The paper link could not be saved."); }
  };
  const removeLink = async (linkId: string) => {
    if (!window.confirm("Remove this paper link?\n\nBoth papers, their PDFs, notes, and highlights will remain.")) return;
    try {
      if (desktopApp) await deleteDesktopPaperLink(linkId);
      updateLibraryState((state) => ({ ...state, paperLinks: state.paperLinks.filter((link) => link.id !== linkId) }));
    } catch { setNotice("The paper link could not be removed."); }
  };
  const saveHighlight = async () => {
    if (!activePaper || !highlightText.trim()) return;
    const previous = editingHighlightId ? activePaper.highlights.find((item) => item.id === editingHighlightId) : undefined;
    const page = Math.max(1, Number(highlightPage) || 1); const text = highlightText.trim();
    const rects = previous && (previous.page !== page || previous.text !== text) ? [] : highlightRects;
    const highlight: Highlight = { id: editingHighlightId ?? `highlight-${Date.now()}`, page, text, comment: highlightComment.trim(), rects };
    try {
      if (desktopApp) await saveDesktopHighlight(activePaper.id, highlight);
      setLibraryPapers((items) => items.map((paper) => paper.id === activePaper.id ? { ...paper, highlights: editingHighlightId ? paper.highlights.map((item) => item.id === editingHighlightId ? highlight : item) : [...paper.highlights, highlight] } : paper));
      updateLibraryState((state) => {
        const saved = state.highlights[activePaper.id] ?? [];
        const nextHighlights = editingHighlightId
          ? saved.some((item) => item.id === editingHighlightId) ? saved.map((item) => item.id === editingHighlightId ? highlight : item) : [...saved, highlight]
          : [...saved, highlight];
        return { ...state, highlights: { ...state.highlights, [activePaper.id]: nextHighlights } };
      });
      setHighlightOpen(false); setEditingHighlightId(null); setHighlightRects([]); setNotice("Highlight saved locally.");
    } catch { setNotice("The highlight could not be saved."); }
  };
  const anchorHighlight = (highlightId: string, rects: HighlightRect[]) => {
    if (!activePaper || !rects.length) return;
    const highlight = activePaper.highlights.find((item) => item.id === highlightId);
    if (!highlight || highlight.rects?.length) return;
    const anchored = { ...highlight, rects };
    setLibraryPapers((items) => items.map((paper) => paper.id === activePaper.id ? { ...paper, highlights: paper.highlights.map((item) => item.id === highlightId ? anchored : item) } : paper));
    updateLibraryState((state) => ({ ...state, highlights: { ...state.highlights, [activePaper.id]: (state.highlights[activePaper.id] ?? []).map((item) => item.id === highlightId ? anchored : item) } }));
    if (desktopApp) void saveDesktopHighlight(activePaper.id, anchored).catch(() => setNotice("A highlight position could not be saved."));
  };
  const removeHighlight = async (highlight: Highlight) => {
    if (!activePaper || !window.confirm("Delete this saved highlight?\n\nThe PDF itself will not be changed.")) return;
    try {
      if (desktopApp) await deleteDesktopHighlight(highlight.id);
      setLibraryPapers((items) => items.map((paper) => paper.id === activePaper.id ? { ...paper, highlights: paper.highlights.filter((item) => item.id !== highlight.id) } : paper));
      updateLibraryState((state) => ({ ...state, highlights: { ...state.highlights, [activePaper.id]: (state.highlights[activePaper.id] ?? []).filter((item) => item.id !== highlight.id) } }));
    } catch { setNotice("The highlight could not be deleted."); }
  };
  const openContextBuilder = () => { if (!activePaper) return; setContextIds([activePaper.id, ...activeLinks.map((link) => link.sourcePaperId === activePaper.id ? link.targetPaperId : link.sourcePaperId)].filter((id, index, ids) => ids.indexOf(id) === index)); setCopyState("Copy context"); setContextOpen(true); };
  const buildContext = () => contextIds.map((id) => {
    const paper = availablePapers.find((item) => item.id === id); if (!paper) return "";
    const highlights = paper.highlights.length ? paper.highlights.map((item) => `- p. ${item.page}: “${item.text}”\n  Note: ${item.comment || "None"}`).join("\n") : "- None yet";
    const paperNotes = notesForPaper(paper);
    const noteText = paperNotes.length ? paperNotes.map((note) => `### ${note.title || "Untitled note"}\n${note.body || "None yet"}`).join("\n\n") : "None yet";
    return `# ${paper.title}\n\n${paper.authors} (${paper.year})\n${paper.journal}\n\n## Summary\n${paper.summary || "None yet"}\n\n## Working notes\n${noteText}\n\n## Highlights\n${highlights}`;
  }).filter(Boolean).join("\n\n---\n\n");
  const copyContext = async () => {
    try { await navigator.clipboard.writeText(buildContext()); setCopyState("Copied"); window.setTimeout(() => setCopyState("Copy context"), 1600); }
    catch { setCopyState("Could not copy"); setNotice("The research context could not be copied. Try Download .md instead."); }
  };
  const downloadContext = () => { const href = URL.createObjectURL(new Blob([buildContext()], { type: "text/markdown;charset=utf-8" })); const anchor = document.createElement("a"); anchor.href = href; anchor.download = "lattice-research-context.md"; anchor.click(); URL.revokeObjectURL(href); };

  return <main className="app-shell">
    <header className="topbar" data-tauri-drag-region><div className="brand"><span className="brand-mark">L</span><span>Lattice</span></div><button className="command-trigger" onClick={() => setCommandOpen(true)}><span>Search papers, notes, or ideas</span><kbd>⌘ K</kbd></button><div className="topbar-actions"><span className="sync-state"><i /> {desktopApp ? "On this Mac" : "Local library"} · {availablePapers.length} items</span></div></header>
    <div className="workspace-grid">
      <aside className="library-sidebar"><div className="sidebar-scroll">
        <nav className="primary-nav" aria-label="Library navigation">
          <button className={`nav-item ${view.kind === "library" ? "active" : ""}`} onClick={() => selectView({ kind: "library" })}><span className="nav-icon">▤</span>Library <span className="count">{availablePapers.length}</span></button>
          <button className={`nav-item ${view.kind === "inbox" ? "active" : ""}`} onClick={() => selectView({ kind: "inbox" })}><span className="nav-icon">↘</span>Inbox <span className="count warm">{inboxPapers.length}</span></button>
          <button className={`nav-item ${view.kind === "recent" ? "active" : ""}`} onClick={() => selectView({ kind: "recent" })}><span className="nav-icon">◷</span>Recently read</button>
          <button className={`nav-item ${view.kind === "favorites" ? "active" : ""}`} onClick={() => selectView({ kind: "favorites" })}><span className="nav-icon">☆</span>Favorites</button>
        </nav>
        <section className="nav-section"><div className="section-label"><span>Workspaces</span><button aria-label="Add workspace" onClick={() => setCreateWorkspaceOpen(true)}>+</button></div>
          {libraryState.workspaces.map((workspace) => <button key={workspace.id} className={`workspace-item ${view.kind === "workspace" && view.workspaceId === workspace.id ? "selected" : ""}`} onClick={() => selectView({ kind: "workspace", workspaceId: workspace.id })} onContextMenu={(event) => { event.preventDefault(); setMenu({ kind: "workspace", id: workspace.id, x: event.clientX, y: event.clientY }); }}><span className="workspace-dot" style={{ background: workspace.color }} /><span><b>{workspace.name}</b><small>{libraryState.memberships[workspace.id]?.filter((id) => availablePapers.some((paper) => paper.id === id)).length ?? 0} papers</small></span></button>)}
        </section>
        <section className="nav-section paper-list-section"><div className="section-label"><span>{activeViewName}</span><span className="section-count">{papersInView.length}</span></div><div className="mini-search"><span>⌕</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Filter papers" aria-label="Filter papers" /></div><div className="paper-list">
          {visiblePapers.map((paper) => <button key={paper.id} className={`paper-list-item ${activePaper?.id === paper.id ? "active" : ""}`} onClick={() => selectPaper(paper)} onContextMenu={(event) => { event.preventDefault(); setMenu({ kind: "paper", id: paper.id, x: event.clientX, y: event.clientY }); }}><span className="paper-accent" style={{ background: paper.color }} /><span className="paper-list-copy"><b>{paperLabelFor(paper)} <em>{paper.year}</em></b><small>{paper.title}</small></span>{libraryState.favoritePaperIds.includes(paper.id) && <span className="favorite-glyph">★</span>}</button>)}
          {!visiblePapers.length && <p className="paper-list-empty">No papers here yet.</p>}
        </div></section>
      </div><div className="sidebar-footer"><input ref={fileRef} className="file-input" type="file" accept="application/pdf" onChange={(event) => importPaper(event.target.files?.[0])} /><button className="import-button" onClick={handleImport}><span>＋</span> Import paper</button></div></aside>

      {activePaper ? <>
        <section className="reader-column"><header className="paper-toolbar"><div className="paper-identity"><span className="eyebrow">{activePaper.authors} · {activePaper.year}</span><h1>{activePaper.title}</h1></div><div className="reader-actions">{activePaper.pdfUrl && <><button className="tool-button" aria-label="Search within PDF" title="Search within PDF (Control-F)" onClick={() => setPdfSearchRequest((value) => value + 1)}>⌕</button><form className="page-jump" onSubmit={(event) => { event.preventDefault(); jumpToPage(Number(readerPageInput)); }}><label><span className="sr-only">Current PDF page</span><input inputMode="numeric" value={readerPageInput} onChange={(event) => setReaderPageInput(event.target.value.replace(/\D/g, ""))} onBlur={() => jumpToPage(Number(readerPageInput))} aria-label="Current PDF page" /></label><span>/ {readerPageCount}</span></form></>}<span className="selection-mode" aria-label="Text selection is active" title="Text selection is active">↖</span><button className="tool-button" aria-label="Add highlight" title="Add highlight (Control-H)" onClick={() => void beginHighlight(activePaper)}>▰</button><span className="toolbar-divider" /><button className="page-control" aria-label="Zoom out" onClick={() => setZoom((value) => Math.max(80, value - 8))}>−</button><span className="zoom-level">{zoom}%</span><button className="page-control" aria-label="Zoom in" onClick={() => setZoom((value) => Math.min(160, value + 8))}>＋</button><button className="tool-button" aria-label="Toggle full screen" onClick={() => void toggleFullscreen()}>⛶</button></div></header>
          {activePaper.pdfUrl && <div className="reader-tip">Select text in the PDF, then press <kbd>Control H</kbd> to save a highlight.</div>}
          <div className="reader-stage" ref={readerStageRef}>{!activePaper.pdfUrl && <div className="page-rail"><span>6</span><span className="active">7</span><span>8</span><span>9</span></div>}{activePaper.pdfUrl ? <PdfReader key={activePaper.id} url={activePaper.pdfUrl} title={activePaper.title} zoom={zoom} highlights={activePaper.highlights} pageJump={pageJump} searchRequest={pdfSearchRequest} onPageChange={updateReaderPage} onPageCount={setReaderPageCount} onHighlightAnchored={anchorHighlight} onMetadataSuggestion={(suggestion) => setMetadataSuggestions((current) => ({ ...current, [activePaper.id]: suggestion }))} /> : <article className="paper-page" data-page-number="7" style={{ transform: `scale(${zoom / 112})`, transformOrigin: "top center", marginBottom: `${Math.max(0, (zoom / 112 - 1) * 815)}px` }}><div className="journal-line">NBER WORKING PAPER SERIES</div><h2>{activePaper.title.toUpperCase()}</h2><p className="paper-authors">{activePaper.authors}</p><p className="paper-date">Working Paper · {activePaper.year}</p><div className="paper-rule" /><h3>2. A sufficient-statistics representation</h3><p>We characterize the aggregate response to a change in policy by separating the household-side exposure to income from the sequence of consumption responses. This representation makes the role of heterogeneity transparent while remaining agnostic about many details of the microeconomic environment.</p><p>Let the sequence of marginal propensities to consume summarize the response of household expenditure across dates. <Mark>The general equilibrium response can be represented as the interaction of intertemporal MPCs with income exposure.</Mark> The resulting object is useful because it separates the distributional incidence of a policy from equilibrium feedback.</p><div className="margin-note"><span>SG</span><p>Core sufficient-statistics result. This is the bridge to the valuation channel.</p></div><p>This decomposition also clarifies why representative-agent benchmarks can miss important dynamics. Two policies with the same present-value transfer may generate different paths for demand when their incidence across households or dates differs.</p><div className="paper-equation">ΔC = M · ΔY &nbsp;&nbsp; and &nbsp;&nbsp; ΔY = E · ΔG</div><p>Combining these expressions yields an intertemporal multiplier whose shape depends on the full matrix of household responses. The next section embeds this relation in general equilibrium.</p><span className="page-number">7</span></article>}</div>
        </section>
        <aside className="context-panel"><div className="context-tabs" role="tablist"><button className={contextTab === "notes" ? "active" : ""} onClick={() => setContextTab("notes")}>Notes</button><button className={contextTab === "details" ? "active" : ""} onClick={() => setContextTab("details")}>Details</button></div>
          {contextTab === "notes" ? <div className="context-scroll">
            <section className="context-section summary-section"><div className="context-heading"><span>My summary</span><button aria-label="Edit summary" onClick={() => beginEditDetails(activePaper)}>✎</button></div><p>{activePaper.summary || <span className="empty-copy">No summary yet.</span>}</p></section>
            <section className="context-section"><div className="context-heading"><span>Working notes</span><button aria-label="Add working note" onClick={addWorkingNote}>＋</button></div><div className="working-notes">
              {notesForPaper(activePaper).map((note) => { const expanded = expandedNoteIds.includes(note.id); return <article className={`working-note ${expanded ? "expanded" : ""}`} key={note.id}><header><button className="note-toggle" onClick={() => setExpandedNoteIds((ids) => expanded ? ids.filter((id) => id !== note.id) : [...ids, note.id])}><span>{expanded ? "⌄" : "›"}</span><b>{note.title || "Untitled note"}</b></button><small className={noteSaveState[note.id] === "Not saved" ? "save-error" : "saved"}>{noteSaveState[note.id] ?? "Saved"}</small></header>{expanded && <div className="working-note-body"><label>Title<input value={note.title} onChange={(event) => updateWorkingNote(note, { title: event.target.value })} placeholder="Note title" /></label><textarea className="note-editor" value={note.body} onChange={(event) => updateWorkingNote(note, { body: event.target.value })} placeholder="Write while you read…" /><button className="note-delete" onClick={() => void removeWorkingNote(note)}>Delete note…</button></div>}</article>; })}
              {!notesForPaper(activePaper).length && <p className="empty-copy">No working notes yet. Use + to add one.</p>}
            </div></section>
            <section className="context-section"><div className="context-heading"><span>Tags</span><button aria-label="Edit tags" onClick={() => beginEditTags(activePaper)}>✎ Edit</button></div><div className="tag-row">{activePaper.tags.length ? activePaper.tags.map((tag) => <span key={tag} className="tag">{tag}</span>) : <span className="empty-copy">No tags yet.</span>}</div></section>
            <section className="context-section"><div className="context-heading"><span>Highlights</span><button aria-label="Add highlight" onClick={() => void beginHighlight(activePaper)}>＋</button></div>{activePaper.highlights.length ? activePaper.highlights.map((highlight) => <div className="highlight-card" key={highlight.id}><div className="highlight-card-head">{activePaper.pdfUrl ? <button className="highlight-page" onClick={() => jumpToPage(highlight.page)} title={`Jump to page ${highlight.page}`}>p. {highlight.page}</button> : <span className="highlight-page">p. {highlight.page}</span>}<span><button aria-label="Edit highlight" title="Edit highlight" onClick={() => beginEditHighlight(highlight)}>✎</button><button aria-label="Delete highlight" title="Delete highlight" onClick={() => void removeHighlight(highlight)}>×</button></span></div><q>{highlight.text}</q>{highlight.comment && <small>{highlight.comment}</small>}</div>) : <p className="empty-copy">No highlights yet. Select PDF text, then press Control-H.</p>}</section>
            <section className="context-section"><div className="context-heading"><span>Linked papers</span><button aria-label="Link paper" onClick={() => beginLinkPaper(activePaper)}>＋</button></div>
              {activeLinks.length ? activeLinks.map((link) => {
                const otherId = link.sourcePaperId === activePaper.id ? link.targetPaperId : link.sourcePaperId;
                const paper = availablePapers.find((entry) => entry.id === otherId);
                return paper ? <div className="linked-paper-row" key={link.id}><button className="linked-paper" onClick={() => { selectView({ kind: "library" }); selectPaper(paper); }}><span className="link-glyph">↗</span><span><b>{paperLabelFor(paper)} ({paper.year})</b><small><em>{link.relation}</em>{link.detail ? ` · ${link.detail}` : ""}</small></span></button><button className="unlink-button" aria-label={`Edit link to ${paperLabelFor(paper)}`} title="Edit link" onClick={() => beginEditLink(link, activePaper)}>✎</button><button className="unlink-button" aria-label={`Unlink ${paperLabelFor(paper)}`} title="Remove link" onClick={() => void removeLink(link.id)}>×</button></div> : null;
              }) : <p className="empty-copy">No linked papers yet. Use + or right-click a paper.</p>}
            </section>
          </div> : <div className="context-scroll details-pane"><section className="context-section"><div className="detail-cover" style={{ "--cover": activePaper.color } as React.CSSProperties}><span>{paperLabelFor(activePaper)}</span><b>{activePaper.title}</b><small>{activePaper.year}</small></div></section><section className="context-section metadata-list"><div className="context-heading"><span>Paper details</span><button onClick={() => beginEditDetails(activePaper)}>✎ Edit</button></div><dl><dt>Authors</dt><dd>{activePaper.authors}</dd><dt>Published</dt><dd>{activePaper.journal}</dd><dt>Year</dt><dd>{activePaper.year}</dd><dt>Status</dt><dd><span className="status-pill">{activePaper.status}</span></dd><dt>Cite key</dt><dd className="mono">{activePaper.id}{activePaper.year}</dd></dl></section></div>}
          <footer className="context-footer"><button onClick={openContextBuilder}><span>⬡</span> Prepare research context</button></footer>
        </aside>
      </> : <section className="empty-reader"><span>◇</span><h1>{activeViewName}</h1><p>No papers match this view. Import a PDF, or right-click a paper in Library to add it to a workspace.</p></section>}
    </div>

    {menu && <><button className="menu-dismiss" aria-label="Close menu" onClick={() => setMenu(null)} /><div className="context-menu" style={{ left: Math.min(menu.x, window.innerWidth - 245), top: Math.min(menu.y, window.innerHeight - 320) }}>{selectedMenuPaper && <><button onClick={() => beginRenamePaper(selectedMenuPaper)}>✎ Rename in Lattice…</button><button onClick={() => beginLinkPaper(selectedMenuPaper)}>↗ Link to paper…</button><button onClick={() => void toggleFavorite(selectedMenuPaper.id)}>{libraryState.favoritePaperIds.includes(selectedMenuPaper.id) ? "☆ Remove from favorites" : "★ Add to favorites"}</button><div className="menu-label">Workspaces</div>{libraryState.workspaces.map((workspace) => { const checked = libraryState.memberships[workspace.id]?.includes(selectedMenuPaper.id); return <button key={workspace.id} onClick={() => void toggleMembership(workspace.id, selectedMenuPaper.id)}><span className="menu-check">{checked ? "✓" : ""}</span>{workspace.name}</button>; })}<div className="menu-rule" /><button className="danger-action" onClick={() => void removePaper(selectedMenuPaper)}>Remove from Lattice…</button></>}{selectedWorkspace && <><div className="menu-label">{selectedWorkspace.name}</div><button className="danger-action" onClick={() => void removeWorkspace(selectedWorkspace)}>Delete workspace…</button></>}</div></>}

    {createWorkspaceOpen && <dialog open className="modal-backdrop"><form className="small-modal" onSubmit={(event) => { event.preventDefault(); void addWorkspace(); }}><span className="eyebrow">New collection</span><h2>Add workspace</h2><label>Workspace name<input value={workspaceName} onChange={(event) => setWorkspaceName(event.target.value)} placeholder="e.g. Inflation expectations" /></label><footer><button type="button" className="secondary-action" onClick={() => setCreateWorkspaceOpen(false)}>Cancel</button><button type="submit" className="primary-action" disabled={!workspaceName.trim()}>Create</button></footer></form></dialog>}
    {renamePaperId && <dialog open className="modal-backdrop"><form className="small-modal" onSubmit={(event) => { event.preventDefault(); void renamePaper(); }}><span className="eyebrow">Library label</span><h2>Rename in Lattice</h2><p>This changes the short label shown in Lattice. The paper title and PDF filename stay exactly as they are.</p><label>Paper label<input value={paperLabel} onChange={(event) => setPaperLabel(event.target.value)} placeholder="e.g. Auclert, Rognlie & Straub" /></label><footer><button type="button" className="secondary-action" onClick={() => setRenamePaperId(null)}>Cancel</button><button type="submit" className="primary-action" disabled={!paperLabel.trim()}>Rename</button></footer></form></dialog>}
    {linkSourceId && linkSourcePaper && <dialog open className="modal-backdrop"><form className="link-modal" onSubmit={(event) => { event.preventDefault(); void saveLink(); }}><span className="eyebrow">{paperLabelFor(linkSourcePaper)}</span><h2>{editingLinkId ? "Edit paper link" : "Link to paper"}</h2><p>Record an intellectual relationship between two papers. The link will appear from both papers.</p>{linkCandidates.length ? <div className="link-fields"><label>Paper<select value={linkTargetId} onChange={(event) => setLinkTargetId(event.target.value)}>{linkCandidates.map((paper) => <option key={paper.id} value={paper.id}>{paperLabelFor(paper)} — {paper.title}</option>)}</select></label><label>Relation<input value={linkRelation} onChange={(event) => setLinkRelation(event.target.value)} placeholder="e.g. extension, contrast, mechanism" /></label><label>Note <small>optional</small><textarea value={linkDetail} onChange={(event) => setLinkDetail(event.target.value)} placeholder="What is the connection?" /></label></div> : <p className="empty-copy">Every other paper is already linked to this one.</p>}<footer><button type="button" className="secondary-action" onClick={() => { setLinkSourceId(null); setEditingLinkId(null); }}>Cancel</button><button type="submit" className="primary-action" disabled={!linkTargetId || !linkCandidates.length}>Save link</button></footer></form></dialog>}
    {highlightOpen && activePaper && <dialog open className="modal-backdrop"><form className="highlight-modal" onSubmit={(event) => { event.preventDefault(); void saveHighlight(); }}><span className="eyebrow">{paperLabelFor(activePaper)}</span><h2>{editingHighlightId ? "Edit highlight" : "Add highlight"}</h2><p>{editingHighlightId ? "Update the saved passage, page, or your comment." : activePaper.pdfUrl ? "Your selected PDF text should appear below automatically." : "The selected passage is ready to save."}</p><div className="highlight-fields"><label className="page-field">Page<input type="number" min="1" value={highlightPage} onChange={(event) => setHighlightPage(event.target.value)} /></label><label>Passage<textarea value={highlightText} onChange={(event) => setHighlightText(event.target.value)} placeholder="Paste the selected text…" /></label><label>Comment <small>optional</small><textarea value={highlightComment} onChange={(event) => setHighlightComment(event.target.value)} placeholder="Why does this matter?" /></label></div><footer><button type="button" className="secondary-action" onClick={() => { setHighlightOpen(false); setEditingHighlightId(null); setHighlightRects([]); }}>Cancel</button><button type="submit" className="primary-action" disabled={!highlightText.trim()}>Save highlight</button></footer></form></dialog>}
    {tagsOpen && activePaper && <dialog open className="modal-backdrop"><form className="small-modal tags-modal" onSubmit={(event) => { event.preventDefault(); void saveTags(); }}><span className="eyebrow">{paperLabelFor(activePaper)}</span><h2>Edit tags</h2><p>Separate tags with commas. Tags are saved only in Lattice.</p><label>Tags<input value={tagDraft} onChange={(event) => setTagDraft(event.target.value)} placeholder="HANK, monetary policy, MPCs" /></label><footer><button type="button" className="secondary-action" onClick={() => setTagsOpen(false)}>Cancel</button><button type="submit" className="primary-action">Save tags</button></footer></form></dialog>}
    {detailsOpen && activePaper && <dialog open className="modal-backdrop"><form className="details-modal" onSubmit={(event) => { event.preventDefault(); void savePaperDetails(); }}><span className="eyebrow">{paperLabelFor(activePaper)}</span><h2>Edit paper details</h2><p>The PDF and its filename will not be changed.</p>{(metadataSuggestions[activePaper.id]?.authors || metadataSuggestions[activePaper.id]?.year) && <div className="metadata-suggestion"><span>Suggested from the PDF’s first page</span><p>{metadataSuggestions[activePaper.id]?.authors || "Author not detected"}{metadataSuggestions[activePaper.id]?.year ? ` · ${metadataSuggestions[activePaper.id].year}` : ""}</p><button type="button" onClick={useMetadataSuggestions}>Use suggestion</button></div>}<div className="details-fields"><label>Authors<input value={metadataAuthors} onChange={(event) => setMetadataAuthors(event.target.value)} placeholder="Author names" /></label><label className="year-input">Year<input type="number" min="1000" max="2200" value={metadataYear} onChange={(event) => setMetadataYear(event.target.value)} /></label><label>Publication / venue<input value={metadataJournal} onChange={(event) => setMetadataJournal(event.target.value)} placeholder="Journal, working paper series, or book" /></label><label>My summary<textarea value={metadataSummary} onChange={(event) => setMetadataSummary(event.target.value)} placeholder="Add a concise summary…" /></label></div><footer><button type="button" className="secondary-action" onClick={() => setDetailsOpen(false)}>Cancel</button><button type="submit" className="primary-action">Save details</button></footer></form></dialog>}
    {commandOpen && <dialog open className="command-backdrop" aria-label="Search library" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setCommandOpen(false); }}><div className="command-palette"><div className="command-input"><span>⌕</span><input ref={searchRef} value={query} onChange={(event) => setQuery(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && commandResults[0]) { event.preventDefault(); selectView({ kind: "library" }); selectPaper(commandResults[0]); setCommandOpen(false); } }} placeholder="Search your research library…" /><kbd>esc</kbd></div><div className="command-results"><span className="command-label">Papers</span>{commandResults.map((paper) => <button key={paper.id} onClick={() => { selectView({ kind: "library" }); selectPaper(paper); setCommandOpen(false); }}><span className="result-icon">PDF</span><span><b>{paper.title}</b><small>{paper.authors} · {paper.year}</small></span><em>↵</em></button>)}</div><div className="command-hint"><span>↵ to open first result</span><span>⌘K to close</span></div></div></dialog>}
    {contextOpen && <dialog open className="context-builder-backdrop" aria-label="Prepare research context" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setContextOpen(false); }}><section className="context-builder"><header><div><span className="eyebrow">Research bundle</span><h2>Prepare context</h2></div><button className="close-button" onClick={() => setContextOpen(false)} aria-label="Close">×</button></header><p className="builder-intro">Choose papers to carry into your next LLM conversation. Summaries, notes, and highlights are included automatically.</p><div className="context-paper-choices">{availablePapers.map((paper) => { const checked = contextIds.includes(paper.id); return <label className={checked ? "checked" : ""} key={paper.id}><input type="checkbox" checked={checked} onChange={() => setContextIds((ids) => checked ? ids.filter((id) => id !== paper.id) : [...ids, paper.id])} /><span className="choice-check">{checked ? "✓" : ""}</span><span className="choice-copy"><b>{paper.title}</b><small>{paperLabelFor(paper)} · {paper.year}</small></span><span className="choice-count">{paper.highlights.length} highlights</span></label>; })}</div><div className="bundle-summary"><span>{contextIds.length} papers</span><span>Notes + highlights</span><span>Markdown</span></div><footer><button className="secondary-action" disabled={!contextIds.length} onClick={downloadContext}>Download .md</button><button className="primary-action" disabled={!contextIds.length} onClick={copyContext}>{copyState}</button></footer></section></dialog>}
    {notice && <div className="toast" role="status">{notice}</div>}
  </main>;
}
