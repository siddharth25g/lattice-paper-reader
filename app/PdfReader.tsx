import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as pdfjsLib from "pdfjs-dist";
import type { PDFDocumentLoadingTask, PDFDocumentProxy, RenderTask } from "pdfjs-dist";
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import type { Highlight, HighlightRect, PdfMetadataSuggestion } from "./types";

pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl;
(globalThis as typeof globalThis & { pdfjsLib: typeof pdfjsLib }).pdfjsLib = pdfjsLib;
const viewerModule = import("pdfjs-dist/web/pdf_viewer.mjs");

type PageJump = { page: number; nonce: number };
type SearchMatch = { page: number; occurrence: number };
type PdfReaderProps = {
  url: string;
  title: string;
  zoom: number;
  highlights: Highlight[];
  pageJump?: PageJump;
  searchRequest?: number;
  onPageChange?: (page: number) => void;
  onPageCount?: (pages: number) => void;
  onMetadataSuggestion?: (suggestion: PdfMetadataSuggestion) => void;
  onHighlightAnchored?: (highlightId: string, rects: HighlightRect[]) => void;
};
type TextPosition = { node: Text; offset: number };

function clampUnit(value: number) { return Math.min(1, Math.max(0, value)); }

function normalizedRects(range: Range, page: Element): HighlightRect[] {
  const pageBox = page.getBoundingClientRect();
  if (!pageBox.width || !pageBox.height) return [];
  return Array.from(range.getClientRects()).filter((rect) => rect.width > 1 && rect.height > 1 && rect.bottom > pageBox.top && rect.top < pageBox.bottom).map((rect) => ({
    x: clampUnit((Math.max(rect.left, pageBox.left) - pageBox.left) / pageBox.width),
    y: clampUnit((Math.max(rect.top, pageBox.top) - pageBox.top) / pageBox.height),
    width: clampUnit(Math.min(rect.right, pageBox.right) / pageBox.width - Math.max(rect.left, pageBox.left) / pageBox.width),
    height: clampUnit(Math.min(rect.bottom, pageBox.bottom) / pageBox.height - Math.max(rect.top, pageBox.top) / pageBox.height),
  })).filter((rect) => rect.width > 0 && rect.height > 0);
}

export function capturePdfSelection() {
  const selection = window.getSelection();
  if (!selection?.rangeCount || selection.isCollapsed) return null;
  const range = selection.getRangeAt(0);
  const start = range.startContainer.nodeType === Node.ELEMENT_NODE ? range.startContainer as Element : range.startContainer.parentElement;
  const page = start?.closest(".pdf-page");
  if (!page) return null;
  return { text: selection.toString().replace(/\s+/g, " ").trim(), page: Number(page.getAttribute("data-page-number")) || 1, rects: normalizedRects(range, page) };
}

function normalizeText(value: string) { return value.replace(/\s+/g, " ").trim().toLocaleLowerCase(); }

function textLayerMap(layer: Element) {
  const walker = document.createTreeWalker(layer, NodeFilter.SHOW_TEXT);
  const positions: TextPosition[] = [];
  let normalized = "";
  let pendingSpace: TextPosition | null = null;
  let node = walker.nextNode() as Text | null;
  while (node) {
    for (let offset = 0; offset < node.data.length; offset += 1) {
      const position = { node, offset };
      if (/\s/.test(node.data[offset])) { if (normalized) pendingSpace = position; }
      else {
        if (pendingSpace && normalized.at(-1) !== " ") { normalized += " "; positions.push(pendingSpace); }
        pendingSpace = null; normalized += node.data[offset].toLocaleLowerCase(); positions.push(position);
      }
    }
    node = walker.nextNode() as Text | null;
  }
  return { normalized, positions };
}

function occurrenceRects(layer: Element, page: Element, phrase: string) {
  const needle = normalizeText(phrase);
  if (!needle) return [];
  const { normalized, positions } = textLayerMap(layer);
  const occurrences: HighlightRect[][] = [];
  let from = 0;
  while (from <= normalized.length - needle.length) {
    const index = normalized.indexOf(needle, from);
    if (index < 0) break;
    const first = positions[index]; const last = positions[index + needle.length - 1];
    if (first && last) {
      const range = document.createRange();
      range.setStart(first.node, first.offset); range.setEnd(last.node, Math.min(last.node.length, last.offset + 1));
      occurrences.push(normalizedRects(range, page));
    }
    from = index + Math.max(1, needle.length);
  }
  return occurrences;
}

function buildPageText(items: unknown[]) {
  let value = "";
  for (const item of items) {
    if (!item || typeof item !== "object" || !("str" in item)) continue;
    value += String(item.str);
    if ("hasEOL" in item && item.hasEOL) value += "\n";
  }
  return normalizeText(value);
}

function buildFirstPageLines(items: unknown[]) {
  const lines: string[] = []; let line = "";
  for (const item of items) {
    if (!item || typeof item !== "object" || !("str" in item)) continue;
    const text = String(item.str).trim(); if (text) line += `${line ? " " : ""}${text}`;
    if ("hasEOL" in item && item.hasEOL) { if (line) lines.push(line); line = ""; }
  }
  if (line) lines.push(line);
  return lines.map((value) => value.replace(/\s+/g, " ").trim()).filter(Boolean);
}

function likelyAuthorLine(lines: string[], title: string) {
  const titleWords = new Set(title.toLowerCase().match(/[a-z]{4,}/g) ?? []);
  const blocked = /abstract|working paper|university|department|school of|institute|research bureau|federal reserve|www\.|https?:|@|january|february|march|april|may|june|july|august|september|october|november|december/i;
  let best: { text: string; score: number } | undefined;
  for (const text of lines.slice(0, 35)) {
    if (text.length < 5 || text.length > 150 || blocked.test(text) || /\d{3,}/.test(text)) continue;
    const words = text.match(/[A-Za-zÀ-ÖØ-öø-ÿ.'-]+/g) ?? [];
    if (words.length < 2 || words.length > 14) continue;
    const overlap = words.filter((word) => titleWords.has(word.toLowerCase())).length / words.length; if (overlap > 0.45) continue;
    const capitalized = words.filter((word) => /^[A-ZÀ-ÖØ-Þ]/.test(word)).length / words.length;
    let score = capitalized; if (/\band\b|&/.test(text)) score += 0.6; if (/,/.test(text)) score += 0.35; if (/\*|†|‡/.test(text)) score += 0.15;
    if (!best || score > best.score) best = { text, score };
  }
  return best && best.score >= 0.8 ? best.text.replace(/[\s*†‡]+$/g, "") : undefined;
}

function RectLayer({ rects, kind }: { rects: { rect: HighlightRect; active?: boolean }[]; kind: "saved" | "search" }) {
  return <div className={`pdf-rect-layer ${kind}`} aria-hidden="true">{rects.map(({ rect, active }, index) => <span key={`${index}-${rect.x}-${rect.y}`} className={active ? "active" : ""} style={{ left: `${rect.x * 100}%`, top: `${rect.y * 100}%`, width: `${rect.width * 100}%`, height: `${rect.height * 100}%` }} />)}</div>;
}

function PdfPage({ document: pdfDocument, pageNumber, zoom, highlights, searchQuery, activeOccurrence, onHighlightAnchored }: {
  document: PDFDocumentProxy; pageNumber: number; zoom: number; highlights: Highlight[]; searchQuery: string; activeOccurrence: number | null; onHighlightAnchored?: (highlightId: string, rects: HighlightRect[]) => void;
}) {
  const wrapperRef = useRef<HTMLDivElement>(null); const canvasRef = useRef<HTMLCanvasElement>(null); const textHostRef = useRef<HTMLDivElement>(null);
  const resolvedRef = useRef(new Set<string>()); const [nearViewport, setNearViewport] = useState(pageNumber <= 2); const [ratio, setRatio] = useState(11 / 8.5); const [textVersion, setTextVersion] = useState(0);
  const [searchRects, setSearchRects] = useState<{ rect: HighlightRect; active?: boolean }[]>([]);

  useEffect(() => {
    const wrapper = wrapperRef.current; if (!wrapper || nearViewport) return;
    const observer = new IntersectionObserver(([entry]) => { if (entry.isIntersecting) { setNearViewport(true); observer.disconnect(); } }, { rootMargin: "900px 0px" });
    observer.observe(wrapper); return () => observer.disconnect();
  }, [nearViewport]);

  useEffect(() => {
    if (!nearViewport) return;
    let cancelled = false; let renderTask: RenderTask | null = null; let textLayer: InstanceType<(Awaited<typeof viewerModule>)["TextLayerBuilder"]> | null = null;
    const selectionController = new AbortController();
    void pdfDocument.getPage(pageNumber).then(async (page) => {
      if (cancelled) return;
      const viewport = page.getViewport({ scale: zoom / 100 }); setRatio(viewport.height / viewport.width);
      const canvas = canvasRef.current; const textHost = textHostRef.current; if (!canvas || !textHost) return;
      const outputScale = window.devicePixelRatio || 1;
      canvas.width = Math.floor(viewport.width * outputScale); canvas.height = Math.floor(viewport.height * outputScale); canvas.style.width = `${viewport.width}px`; canvas.style.height = `${viewport.height}px`;
      renderTask = page.render({ canvas, viewport, transform: outputScale === 1 ? undefined : [outputScale, 0, 0, outputScale, 0, 0] });
      const { TextLayerBuilder } = await viewerModule; if (cancelled) return;
      textLayer = new TextLayerBuilder({ pdfPage: page, abortSignal: selectionController.signal, onAppend: (textContainer: HTMLDivElement) => {
        textContainer.style.width = `${viewport.width}px`; textContainer.style.height = `${viewport.height}px`; textContainer.style.setProperty("--total-scale-factor", String(viewport.scale)); textContainer.setAttribute("aria-label", `Selectable text for page ${pageNumber}`); textHost.replaceChildren(textContainer);
      } });
      await Promise.all([renderTask.promise, textLayer.render({ viewport, images: undefined as never })]); if (!cancelled) setTextVersion((value) => value + 1);
    }).catch(() => undefined);
    return () => { cancelled = true; selectionController.abort(); renderTask?.cancel(); textLayer?.cancel(); };
  }, [pdfDocument, nearViewport, pageNumber, zoom]);

  useEffect(() => {
    const page = wrapperRef.current; const layer = textHostRef.current?.querySelector(".textLayer"); if (!page || !layer || !textVersion) return;
    const occurrences = searchQuery ? occurrenceRects(layer, page, searchQuery) : [];
    setSearchRects(occurrences.flatMap((rects, occurrence) => rects.map((rect) => ({ rect, active: occurrence === activeOccurrence }))));
    for (const highlight of highlights) {
      if (highlight.rects?.length || resolvedRef.current.has(highlight.id)) continue;
      const rects = occurrenceRects(layer, page, highlight.text)[0] ?? [];
      if (rects.length) { resolvedRef.current.add(highlight.id); onHighlightAnchored?.(highlight.id, rects); }
    }
  }, [activeOccurrence, highlights, onHighlightAnchored, searchQuery, textVersion, zoom]);

  const savedRects = highlights.flatMap((highlight) => (highlight.rects ?? []).map((rect) => ({ rect }))); const width = 612 * zoom / 100;
  return <section ref={wrapperRef} className="pdf-page" data-page-number={pageNumber} style={{ width, minHeight: width * ratio }} aria-label={`Page ${pageNumber}`}><canvas ref={canvasRef} /><RectLayer rects={savedRects} kind="saved" /><RectLayer rects={searchRects} kind="search" /><div ref={textHostRef} className="text-layer-host" /><span className="pdf-page-label">{pageNumber}</span></section>;
}

export function PdfReader({ url, title, zoom, highlights, pageJump, searchRequest = 0, onPageChange, onPageCount, onMetadataSuggestion, onHighlightAnchored }: PdfReaderProps) {
  const [pdfDocument, setPdfDocument] = useState<PDFDocumentProxy | null>(null); const [error, setError] = useState(""); const [findOpen, setFindOpen] = useState(false); const [findQuery, setFindQuery] = useState("");
  const [matches, setMatches] = useState<SearchMatch[]>([]); const [activeMatch, setActiveMatch] = useState(0); const [searching, setSearching] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null); const findInputRef = useRef<HTMLInputElement>(null); const textCacheRef = useRef(new Map<number, string>()); const suggestionCallback = useRef(onMetadataSuggestion);
  useEffect(() => { suggestionCallback.current = onMetadataSuggestion; }, [onMetadataSuggestion]);
  const pageChangeCallback = useRef(onPageChange); const pageCountCallback = useRef(onPageCount);
  const highlightAnchorCallback = useRef(onHighlightAnchored);
  useEffect(() => { pageChangeCallback.current = onPageChange; }, [onPageChange]);
  useEffect(() => { pageCountCallback.current = onPageCount; }, [onPageCount]);
  useEffect(() => { highlightAnchorCallback.current = onHighlightAnchored; }, [onHighlightAnchored]);
  const reportHighlightAnchor = useCallback((highlightId: string, rects: HighlightRect[]) => highlightAnchorCallback.current?.(highlightId, rects), []);

  const goToPage = useCallback((page: number) => {
    const stage = rootRef.current?.closest(".reader-stage"); const target = rootRef.current?.querySelector<HTMLElement>(`[data-page-number="${Math.max(1, Math.min(pdfDocument?.numPages ?? 1, page))}"]`);
    if (stage && target) stage.scrollTo({ top: target.offsetTop - 14, behavior: "smooth" });
  }, [pdfDocument]);

  useEffect(() => {
    let cancelled = false; let task: PDFDocumentLoadingTask | null = null; textCacheRef.current.clear();
    queueMicrotask(() => { if (!cancelled) { setPdfDocument(null); setError(""); } });
    void fetch(url).then((response) => { if (!response.ok) throw new Error(`PDF request failed (${response.status})`); return response.arrayBuffer(); }).then((data) => {
      if (cancelled) return; task = pdfjsLib.getDocument({ data: new Uint8Array(data) }); return task.promise;
    }).then(async (loaded) => {
      if (!loaded || cancelled) return; setPdfDocument(loaded); pageCountCallback.current?.(loaded.numPages); pageChangeCallback.current?.(1);
      const [metadata, firstPage] = await Promise.all([loaded.getMetadata().catch(() => null), loaded.getPage(1).then((page) => page.getTextContent()).catch(() => null)]); if (cancelled) return;
      if (firstPage) textCacheRef.current.set(1, buildPageText(firstPage.items));
      const info = (metadata?.info ?? {}) as Record<string, unknown>; const metadataAuthor = typeof info.Author === "string" && info.Author.trim() ? info.Author.trim() : undefined;
      const dateSource = [info.CreationDate, info.ModDate].find((value) => typeof value === "string") as string | undefined; const metadataYear = Number(dateSource?.match(/(?:19|20)\d{2}/)?.[0]) || undefined;
      const lines = buildFirstPageLines(firstPage?.items ?? []); const pageYear = Number(lines.join(" ").match(/(?:19|20)\d{2}/)?.[0]) || undefined;
      suggestionCallback.current?.({ authors: metadataAuthor ?? likelyAuthorLine(lines, title), year: pageYear ?? metadataYear });
    }).catch(() => { if (!cancelled) setError("This PDF could not be rendered inside Lattice."); });
    return () => { cancelled = true; void task?.destroy(); };
  }, [title, url]);

  useEffect(() => {
    if (!pdfDocument || !rootRef.current) return; const stage = rootRef.current.closest(".reader-stage"); if (!stage) return; const ratios = new Map<number, number>();
    const observer = new IntersectionObserver((entries) => { for (const entry of entries) ratios.set(Number((entry.target as HTMLElement).dataset.pageNumber), entry.intersectionRatio); const visible = [...ratios.entries()].sort((a, b) => b[1] - a[1])[0]; if (visible?.[1] > 0) pageChangeCallback.current?.(visible[0]); }, { root: stage, threshold: [0, .1, .25, .5, .75, 1] });
    rootRef.current.querySelectorAll(".pdf-page").forEach((page) => observer.observe(page)); return () => observer.disconnect();
  }, [pdfDocument, zoom]);
  useEffect(() => { if (pageJump) goToPage(pageJump.page); }, [goToPage, pageJump]);
  useEffect(() => { if (searchRequest) queueMicrotask(() => { setFindOpen(true); requestAnimationFrame(() => findInputRef.current?.select()); }); }, [searchRequest]);
  useEffect(() => { const keydown = (event: KeyboardEvent) => { if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "f") { event.preventDefault(); setFindOpen(true); requestAnimationFrame(() => findInputRef.current?.select()); } }; window.addEventListener("keydown", keydown); return () => window.removeEventListener("keydown", keydown); }, []);

  useEffect(() => {
    if (!pdfDocument || !findQuery.trim()) { queueMicrotask(() => { setMatches([]); setActiveMatch(0); setSearching(false); }); return; }
    let cancelled = false; const timer = window.setTimeout(() => { setSearching(true); void (async () => {
      const needle = normalizeText(findQuery); const found: SearchMatch[] = [];
      for (let pageNumber = 1; pageNumber <= pdfDocument.numPages; pageNumber += 1) {
        let text = textCacheRef.current.get(pageNumber);
        if (text === undefined) { const page = await pdfDocument.getPage(pageNumber); text = buildPageText((await page.getTextContent()).items); textCacheRef.current.set(pageNumber, text); }
        let index = 0; let occurrence = 0;
        while ((index = text.indexOf(needle, index)) >= 0) { found.push({ page: pageNumber, occurrence }); occurrence += 1; index += Math.max(1, needle.length); }
        if (cancelled) return;
      }
      setMatches(found); setActiveMatch(0); setSearching(false); if (found[0]) goToPage(found[0].page);
    })().catch(() => { if (!cancelled) setSearching(false); }); }, 180);
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, [pdfDocument, findQuery, goToPage]);

  const moveMatch = (direction: 1 | -1) => { if (!matches.length) return; const next = (activeMatch + direction + matches.length) % matches.length; setActiveMatch(next); goToPage(matches[next].page); };
  const activeSearch = matches[activeMatch];
  const pageHighlights = useMemo(() => { const grouped = new Map<number, Highlight[]>(); for (const highlight of highlights) { const page = grouped.get(highlight.page) ?? []; page.push(highlight); grouped.set(highlight.page, page); } return grouped; }, [highlights]);

  if (error) return <div className="pdf-load-state"><b>Could not open PDF</b><span>{error}</span></div>;
  if (!pdfDocument) return <div className="pdf-load-state"><span className="pdf-spinner" />Loading {title}…</div>;
  return <div ref={rootRef} className="pdf-reader">
    {findOpen && <div className="pdf-findbar" role="search" aria-label="Search within PDF"><span className="find-icon">⌕</span><input ref={findInputRef} value={findQuery} onChange={(event) => setFindQuery(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); moveMatch(event.shiftKey ? -1 : 1); } if (event.key === "Escape") { event.preventDefault(); setFindOpen(false); } }} placeholder="Find in this PDF" aria-label="Find in this PDF" /><span className="find-count" aria-live="polite">{searching ? "…" : findQuery ? matches.length ? `${activeMatch + 1} / ${matches.length}` : "No matches" : ""}</span><button type="button" onClick={() => moveMatch(-1)} disabled={!matches.length} aria-label="Previous match" title="Previous match (Shift-Enter)">↑</button><button type="button" onClick={() => moveMatch(1)} disabled={!matches.length} aria-label="Next match" title="Next match (Enter)">↓</button><button type="button" onClick={() => setFindOpen(false)} aria-label="Close PDF search">×</button></div>}
    <div className="pdf-document" aria-label={title}>{Array.from({ length: pdfDocument.numPages }, (_, index) => { const pageNumber = index + 1; return <PdfPage key={pageNumber} document={pdfDocument} pageNumber={pageNumber} zoom={zoom} highlights={pageHighlights.get(pageNumber) ?? []} searchQuery={findQuery} activeOccurrence={activeSearch?.page === pageNumber ? activeSearch.occurrence : null} onHighlightAnchored={reportHighlightAnchor} />; })}</div>
  </div>;
}
