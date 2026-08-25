"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  importDesktopPaper,
  isDesktopApp,
  loadDesktopNotes,
  loadDesktopPapers,
  saveDesktopNote,
} from "./desktop";

export type Paper = {
  id: string;
  cite: string;
  title: string;
  authors: string;
  year: number;
  journal: string;
  status: "Reading" | "Read" | "To read";
  tags: string[];
  color: string;
  summary: string;
  note: string;
  highlights: { page: number; text: string; comment: string }[];
  pdfUrl?: string;
  fileName?: string;
  imported?: boolean;
};

const papers: Paper[] = [
  {
    id: "auclert",
    cite: "Auclert, Rognlie & Straub",
    title: "The Intertemporal Keynesian Cross",
    authors: "Adrien Auclert, Matthew Rognlie, Ludwig Straub",
    year: 2018,
    journal: "NBER Working Paper 25020",
    status: "Reading",
    tags: ["HANK", "MPCs", "Fiscal policy"],
    color: "#aa5a43",
    summary:
      "A sufficient-statistics representation of how household heterogeneity shapes aggregate demand through intertemporal marginal propensities to consume.",
    note:
      "The iMPC matrix is the object to carry into the FTPL comparison. Ask whether the revaluation shock maps cleanly into the same sequence-space representation.",
    highlights: [
      {
        page: 7,
        text: "The general equilibrium response can be represented as the interaction of intertemporal MPCs with income exposure.",
        comment: "Core sufficient-statistics result.",
      },
      {
        page: 19,
        text: "Redistribution changes not only the level of demand but its entire time profile.",
        comment: "Compare with fiscal revaluation channel.",
      },
    ],
  },
  {
    id: "kaplan",
    cite: "Kaplan, Moll & Violante",
    title: "Monetary Policy According to HANK",
    authors: "Greg Kaplan, Benjamin Moll, Giovanni L. Violante",
    year: 2018,
    journal: "American Economic Review, 108(3)",
    status: "Read",
    tags: ["HANK", "Monetary policy", "Redistribution"],
    color: "#637c73",
    summary:
      "Decomposes monetary transmission in a heterogeneous-agent New Keynesian model, emphasizing indirect income effects over direct intertemporal substitution.",
    note:
      "Canonical reference for indirect effects. Useful benchmark for whether fiscal-price-level adjustment operates through labor income, asset income, or valuation.",
    highlights: [
      {
        page: 4,
        text: "Indirect effects arising from general-equilibrium changes in household income dominate direct substitution effects.",
        comment: "Main mechanism in one line.",
      },
    ],
  },
  {
    id: "cochrane",
    cite: "Cochrane",
    title: "The Fiscal Theory of the Price Level",
    authors: "John H. Cochrane",
    year: 2023,
    journal: "Princeton University Press",
    status: "Reading",
    tags: ["FTPL", "Determinacy", "Government debt"],
    color: "#6d7294",
    summary:
      "Develops the fiscal theory as a framework in which the price level adjusts so that the real value of nominal government liabilities equals expected primary surpluses.",
    note:
      "Need a sharper mapping from the representative-agent valuation equation to heterogeneous portfolios. Separate nominal debt exposure from heterogeneous MPCs.",
    highlights: [
      {
        page: 38,
        text: "The government debt valuation equation is an equilibrium condition, not an optional constraint imposed after the fact.",
        comment: "Good framing for theory section.",
      },
    ],
  },
  {
    id: "bassetto",
    cite: "Bassetto",
    title: "A Game-Theoretic View of the Fiscal Theory of the Price Level",
    authors: "Marco Bassetto",
    year: 2002,
    journal: "Econometrica, 70(6)",
    status: "To read",
    tags: ["FTPL", "Policy games", "Equilibrium"],
    color: "#7f684e",
    summary:
      "Recasts monetary–fiscal interactions as an explicit game to clarify which policy commitments and off-equilibrium behavior support fiscal equilibria.",
    note:
      "Read alongside Cochrane’s equilibrium selection discussion. Pay attention to timing and the policy game, not only the valuation equation.",
    highlights: [],
  },
];

const linked = [
  { id: "kaplan", relation: "mechanism", detail: "Indirect income effects" },
  { id: "cochrane", relation: "contrast", detail: "Debt valuation channel" },
];

const DB_NAME = "lattice-local-library";
const DB_STORE = "papers";

function openLibraryDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(DB_STORE)) db.createObjectStore(DB_STORE, { keyPath: "paper.id" });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function storeLocalPaper(paper: Paper, file: File) {
  const db = await openLibraryDb();
  const cleanPaper = { ...paper, pdfUrl: undefined };
  await new Promise<void>((resolve, reject) => {
    const transaction = db.transaction(DB_STORE, "readwrite");
    transaction.objectStore(DB_STORE).put({ paper: cleanPaper, file });
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
  db.close();
}

async function readLocalPapers(): Promise<Paper[]> {
  const db = await openLibraryDb();
  const records = await new Promise<{ paper: Paper; file: Blob }[]>((resolve, reject) => {
    const request = db.transaction(DB_STORE, "readonly").objectStore(DB_STORE).getAll();
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  db.close();
  return records.map(({ paper, file }) => ({ ...paper, pdfUrl: URL.createObjectURL(file) }));
}

function Mark({ children }: { children: React.ReactNode }) {
  return <span className="paper-mark">{children}</span>;
}

export default function Home() {
  const desktopApp = isDesktopApp();
  const [libraryPapers, setLibraryPapers] = useState<Paper[]>(papers);
  const [activeId, setActiveId] = useState("auclert");
  const [query, setQuery] = useState("");
  const [contextTab, setContextTab] = useState<"notes" | "details">("notes");
  const [commandOpen, setCommandOpen] = useState(false);
  const [zoom, setZoom] = useState(112);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [contextOpen, setContextOpen] = useState(false);
  const [contextIds, setContextIds] = useState<string[]>([]);
  const [copyState, setCopyState] = useState("Copy context");
  const searchRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const activePaper = libraryPapers.find((paper) => paper.id === activeId) ?? libraryPapers[0];

  const visiblePapers = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) return libraryPapers;
    return libraryPapers.filter((paper) =>
      [paper.title, paper.authors, paper.tags.join(" ")].join(" ").toLowerCase().includes(term),
    );
  }, [query, libraryPapers]);

  useEffect(() => {
    document.body.classList.toggle("tauri-app", desktopApp);
    if (desktopApp) {
      Promise.all([loadDesktopPapers(), loadDesktopNotes()])
        .then(([imported, savedNotes]) => {
          setLibraryPapers((current) => [...current, ...imported.filter((paper) => !current.some((item) => item.id === paper.id))]);
          setNotes(savedNotes);
        })
        .catch(() => undefined);
    } else {
      readLocalPapers()
        .then((imported) => setLibraryPapers((current) => [...current, ...imported.filter((paper) => !current.some((item) => item.id === paper.id))]))
        .catch(() => undefined);
      try {
        const savedNotes = localStorage.getItem("lattice-paper-notes");
        if (savedNotes) queueMicrotask(() => setNotes(JSON.parse(savedNotes)));
      } catch { /* Local persistence is optional in restricted browser modes. */ }
    }
  }, [desktopApp]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setCommandOpen((open) => !open);
      }
      if (event.key === "Escape") setCommandOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  useEffect(() => {
    if (commandOpen) requestAnimationFrame(() => searchRef.current?.focus());
  }, [commandOpen]);

  const updateNote = (value: string) => {
    setNotes((current) => {
      const next = { ...current, [activePaper.id]: value };
      if (desktopApp) void saveDesktopNote(activePaper.id, value);
      else try { localStorage.setItem("lattice-paper-notes", JSON.stringify(next)); } catch { /* no-op */ }
      return next;
    });
  };

  const importPaper = async (file?: File) => {
    if (!file || file.type !== "application/pdf") return;
    const base = file.name.replace(/\.pdf$/i, "").replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim();
    const detectedYear = Number(base.match(/(?:19|20)\d{2}/)?.[0]) || new Date().getFullYear();
    const title = base.replace(/(?:19|20)\d{2}/, "").replace(/^\s+|\s+$/g, "") || "Untitled paper";
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
      pdfUrl: URL.createObjectURL(file),
      fileName: file.name,
      imported: true,
    };
    setLibraryPapers((current) => [...current, paper]);
    setActiveId(id);
    await storeLocalPaper(paper, file).catch(() => undefined);
  };

  const handleImport = async () => {
    if (!desktopApp) {
      fileRef.current?.click();
      return;
    }
    const paper = await importDesktopPaper().catch(() => null);
    if (!paper) return;
    setLibraryPapers((current) => [...current, paper]);
    setActiveId(paper.id);
  };

  const openContextBuilder = () => {
    setContextIds([activePaper.id, ...linked.map((item) => item.id)].filter((id, index, ids) => ids.indexOf(id) === index));
    setCopyState("Copy context");
    setContextOpen(true);
  };

  const buildContext = () => contextIds.map((id) => {
    const paper = libraryPapers.find((item) => item.id === id);
    if (!paper) return "";
    const paperNote = notes[id] ?? paper.note;
    const highlights = paper.highlights.length
      ? paper.highlights.map((highlight) => `- p. ${highlight.page}: “${highlight.text}”\n  Note: ${highlight.comment}`).join("\n")
      : "- None yet";
    return `# ${paper.title}\n\n${paper.authors} (${paper.year})\n${paper.journal}\n\n## Summary\n${paper.summary}\n\n## My working note\n${paperNote || "None yet"}\n\n## Highlights\n${highlights}`;
  }).filter(Boolean).join("\n\n---\n\n");

  const copyContext = async () => {
    await navigator.clipboard.writeText(buildContext());
    setCopyState("Copied");
    window.setTimeout(() => setCopyState("Copy context"), 1600);
  };

  const downloadContext = () => {
    const blob = new Blob([buildContext()], { type: "text/markdown;charset=utf-8" });
    const href = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = href;
    anchor.download = "lattice-research-context.md";
    anchor.click();
    URL.revokeObjectURL(href);
  };

  return (
    <main className="app-shell">
      <header className="topbar" data-tauri-drag-region>
        <div className="brand">
          <span className="brand-mark">L</span>
          <span>Lattice</span>
        </div>
        <button className="command-trigger" onClick={() => setCommandOpen(true)}>
          <span>Search papers, notes, or ideas</span>
          <kbd>⌘ K</kbd>
        </button>
        <div className="topbar-actions">
          <span className="sync-state"><i /> {desktopApp ? "On this Mac" : "Local library"} · {libraryPapers.length} items</span>
          <button className="icon-button" aria-label="More options">•••</button>
        </div>
      </header>

      <div className="workspace-grid">
        <aside className="library-sidebar">
          <div className="sidebar-scroll">
            <nav className="primary-nav" aria-label="Library navigation">
              <button className="nav-item active"><span className="nav-icon">▤</span>Library <span className="count">{libraryPapers.length}</span></button>
              <button className="nav-item"><span className="nav-icon">↘</span>Inbox <span className="count warm">3</span></button>
              <button className="nav-item"><span className="nav-icon">◷</span>Recently read</button>
              <button className="nav-item"><span className="nav-icon">☆</span>Favorites</button>
            </nav>

            <section className="nav-section">
              <div className="section-label"><span>Workspaces</span><button aria-label="Add workspace">+</button></div>
              <button className="workspace-item selected">
                <span className="workspace-dot terracotta" />
                <span><b>HANK × FTPL</b><small>8 papers · 14 notes</small></span>
              </button>
              <button className="workspace-item">
                <span className="workspace-dot moss" />
                <span><b>Public pensions</b><small>17 papers · 9 notes</small></span>
              </button>
              <button className="workspace-item">
                <span className="workspace-dot ink" />
                <span><b>Sequence space</b><small>6 papers · 3 notes</small></span>
              </button>
            </section>

            <section className="nav-section paper-list-section">
              <div className="section-label"><span>In this workspace</span><button aria-label="Filter papers">≡</button></div>
              <div className="mini-search">
                <span>⌕</span>
                <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Filter papers" aria-label="Filter papers" />
              </div>
              <div className="paper-list">
                {visiblePapers.map((paper) => (
                  <button key={paper.id} className={`paper-list-item ${activeId === paper.id ? "active" : ""}`} onClick={() => setActiveId(paper.id)}>
                    <span className="paper-accent" style={{ background: paper.color }} />
                    <span className="paper-list-copy">
                      <b>{paper.cite} <em>{paper.year}</em></b>
                      <small>{paper.title}</small>
                    </span>
                  </button>
                ))}
              </div>
            </section>
          </div>
          <div className="sidebar-footer">
            <input ref={fileRef} className="file-input" type="file" accept="application/pdf" onChange={(event) => importPaper(event.target.files?.[0])} />
            <button className="import-button" onClick={handleImport}><span>＋</span> Import paper</button>
          </div>
        </aside>

        <section className="reader-column">
          <header className="paper-toolbar">
            <div className="paper-identity">
              <span className="eyebrow">{activePaper.authors} · {activePaper.year}</span>
              <h1>{activePaper.title}</h1>
            </div>
            <div className="reader-actions">
              <button className="tool-button active" aria-label="Pointer">↖</button>
              <button className="tool-button" aria-label="Highlight">▰</button>
              <span className="toolbar-divider" />
              <button className="page-control" aria-label="Zoom out" onClick={() => setZoom((value) => Math.max(80, value - 8))}>−</button>
              <span className="zoom-level">{zoom}%</span>
              <button className="page-control" aria-label="Zoom in" onClick={() => setZoom((value) => Math.min(160, value + 8))}>＋</button>
              <button className="tool-button" aria-label="Full screen">⛶</button>
            </div>
          </header>

          <div className="reader-stage">
            <div className="page-rail">
              <button>6</button><button className="active">7</button><button>8</button><button>9</button>
            </div>
            {activePaper.pdfUrl ? (
              <div className="pdf-frame-wrap" style={{ width: `${zoom}%` }}>
                <iframe className="pdf-frame" src={activePaper.pdfUrl} title={activePaper.title} />
              </div>
            ) : <article className="paper-page" style={{ transform: `scale(${zoom / 112})`, transformOrigin: "top center", marginBottom: `${Math.max(0, (zoom / 112 - 1) * 815)}px` }}>
              <div className="journal-line">NBER WORKING PAPER SERIES</div>
              <h2>{activePaper.title.toUpperCase()}</h2>
              <p className="paper-authors">{activePaper.authors}</p>
              <p className="paper-date">Working Paper · {activePaper.year}</p>
              <div className="paper-rule" />
              <h3>2. A sufficient-statistics representation</h3>
              <p>
                We characterize the aggregate response to a change in policy by separating the household-side exposure to income from the sequence of consumption responses. This representation makes the role of heterogeneity transparent while remaining agnostic about many details of the microeconomic environment.
              </p>
              <p>
                Let the sequence of marginal propensities to consume summarize the response of household expenditure across dates. <Mark>The general equilibrium response can be represented as the interaction of intertemporal MPCs with income exposure.</Mark> The resulting object is useful because it separates the distributional incidence of a policy from equilibrium feedback.
              </p>
              <div className="margin-note"><span>SG</span><p>Core sufficient-statistics result. This is the bridge to the valuation channel.</p></div>
              <p>
                This decomposition also clarifies why representative-agent benchmarks can miss important dynamics. Two policies with the same present-value transfer may generate different paths for demand when their incidence across households or dates differs.
              </p>
              <div className="paper-equation">ΔC = M · ΔY &nbsp;&nbsp; and &nbsp;&nbsp; ΔY = E · ΔG</div>
              <p>
                Combining these expressions yields an intertemporal multiplier whose shape depends on the full matrix of household responses. The next section embeds this relation in general equilibrium.
              </p>
              <span className="page-number">7</span>
            </article>}
          </div>
        </section>

        <aside className="context-panel">
          <div className="context-tabs" role="tablist">
            <button className={contextTab === "notes" ? "active" : ""} onClick={() => setContextTab("notes")}>Notes</button>
            <button className={contextTab === "details" ? "active" : ""} onClick={() => setContextTab("details")}>Details</button>
          </div>
          {contextTab === "notes" ? (
            <div className="context-scroll">
              <section className="context-section summary-section">
                <div className="context-heading"><span>My summary</span><button aria-label="Edit summary">✎</button></div>
                <p>{activePaper.summary}</p>
              </section>
              <section className="context-section">
                <div className="context-heading"><span>Working note</span><span className="saved">Saved</span></div>
                <textarea className="note-editor" value={notes[activePaper.id] ?? activePaper.note} onChange={(event) => updateNote(event.target.value)} placeholder="Write while you read…" />
              </section>
              <section className="context-section">
                <div className="context-heading"><span>Tags</span><button aria-label="Add tag">＋</button></div>
                <div className="tag-row">{activePaper.tags.map((tag) => <button key={tag} className="tag">{tag}</button>)}</div>
              </section>
              <section className="context-section">
                <div className="context-heading"><span>Highlights</span><span className="section-count">{activePaper.highlights.length}</span></div>
                {activePaper.highlights.length ? activePaper.highlights.map((highlight, index) => (
                  <button className="highlight-card" key={index}>
                    <span className="highlight-page">p. {highlight.page}</span>
                    <q>{highlight.text}</q>
                    <small>{highlight.comment}</small>
                  </button>
                )) : <p className="empty-copy">No highlights yet. Select text in the paper to begin.</p>}
              </section>
              <section className="context-section">
                <div className="context-heading"><span>Linked papers</span><button aria-label="Link paper">＋</button></div>
                {linked.map((item) => {
                  const paper = libraryPapers.find((entry) => entry.id === item.id)!;
                  return (
                    <button className="linked-paper" key={item.id} onClick={() => setActiveId(item.id)}>
                      <span className="link-glyph">↗</span>
                      <span><b>{paper.cite} ({paper.year})</b><small><em>{item.relation}</em> · {item.detail}</small></span>
                    </button>
                  );
                })}
              </section>
            </div>
          ) : (
            <div className="context-scroll details-pane">
              <section className="context-section">
                <div className="detail-cover" style={{ "--cover": activePaper.color } as React.CSSProperties}><span>{activePaper.cite}</span><b>{activePaper.title}</b><small>{activePaper.year}</small></div>
              </section>
              <section className="context-section metadata-list">
                <dl><dt>Authors</dt><dd>{activePaper.authors}</dd><dt>Published</dt><dd>{activePaper.journal}</dd><dt>Year</dt><dd>{activePaper.year}</dd><dt>Status</dt><dd><span className="status-pill">{activePaper.status}</span></dd><dt>Cite key</dt><dd className="mono">{activePaper.id}{activePaper.year}</dd></dl>
              </section>
            </div>
          )}
          <footer className="context-footer">
            <button onClick={openContextBuilder}><span>⬡</span> Prepare research context</button>
          </footer>
        </aside>
      </div>

      {commandOpen && (
        <dialog open className="command-backdrop" aria-label="Search library" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setCommandOpen(false); }}>
          <div className="command-palette">
            <div className="command-input"><span>⌕</span><input ref={searchRef} value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search your research library…" /><kbd>esc</kbd></div>
            <div className="command-results">
              <span className="command-label">Papers</span>
              {visiblePapers.map((paper) => (
                <button key={paper.id} onClick={() => { setActiveId(paper.id); setCommandOpen(false); }}>
                  <span className="result-icon">PDF</span><span><b>{paper.title}</b><small>{paper.authors} · {paper.year}</small></span><em>↵</em>
                </button>
              ))}
            </div>
            <div className="command-hint"><span>↑↓ to navigate</span><span>↵ to open</span><span>⌘K to close</span></div>
          </div>
        </dialog>
      )}

      {contextOpen && (
        <dialog open className="context-builder-backdrop" aria-label="Prepare research context" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setContextOpen(false); }}>
          <section className="context-builder">
            <header>
              <div><span className="eyebrow">Research bundle</span><h2>Prepare context</h2></div>
              <button className="close-button" onClick={() => setContextOpen(false)} aria-label="Close">×</button>
            </header>
            <p className="builder-intro">Choose the papers to carry into your next ChatGPT conversation. Your summaries, notes, and highlights are included automatically.</p>
            <div className="context-paper-choices">
              {libraryPapers.map((paper) => {
                const checked = contextIds.includes(paper.id);
                return (
                  <label className={checked ? "checked" : ""} key={paper.id}>
                    <input type="checkbox" checked={checked} onChange={() => setContextIds((ids) => checked ? ids.filter((id) => id !== paper.id) : [...ids, paper.id])} />
                    <span className="choice-check">{checked ? "✓" : ""}</span>
                    <span className="choice-copy"><b>{paper.title}</b><small>{paper.cite} · {paper.year}</small></span>
                    <span className="choice-count">{paper.highlights.length} highlights</span>
                  </label>
                );
              })}
            </div>
            <div className="bundle-summary"><span>{contextIds.length} papers</span><span>Notes + highlights</span><span>Markdown</span></div>
            <footer>
              <button className="secondary-action" disabled={!contextIds.length} onClick={downloadContext}>Download .md</button>
              <button className="primary-action" disabled={!contextIds.length} onClick={copyContext}>{copyState}</button>
            </footer>
          </section>
        </dialog>
      )}
    </main>
  );
}
