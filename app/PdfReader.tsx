import { useEffect, useRef, useState } from "react";
import * as pdfjsLib from "pdfjs-dist";
import type { PDFDocumentLoadingTask, PDFDocumentProxy, RenderTask } from "pdfjs-dist";
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import type { PdfMetadataSuggestion } from "./types";

pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl;
(globalThis as typeof globalThis & { pdfjsLib: typeof pdfjsLib }).pdfjsLib = pdfjsLib;
const viewerModule = import("pdfjs-dist/web/pdf_viewer.mjs");

type PdfReaderProps = {
  url: string;
  title: string;
  zoom: number;
  onMetadataSuggestion?: (suggestion: PdfMetadataSuggestion) => void;
};

function buildFirstPageLines(items: unknown[]) {
  const lines: string[] = [];
  let line = "";
  for (const item of items) {
    if (!item || typeof item !== "object" || !("str" in item)) continue;
    const text = String(item.str).trim();
    if (text) line += `${line ? " " : ""}${text}`;
    if ("hasEOL" in item && item.hasEOL) {
      if (line) lines.push(line);
      line = "";
    }
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
    const overlap = words.filter((word) => titleWords.has(word.toLowerCase())).length / words.length;
    if (overlap > 0.45) continue;
    const capitalized = words.filter((word) => /^[A-ZÀ-ÖØ-Þ]/.test(word)).length / words.length;
    let score = capitalized;
    if (/\band\b|&/.test(text)) score += 0.6;
    if (/,/.test(text)) score += 0.35;
    if (/\*|†|‡/.test(text)) score += 0.15;
    if (!best || score > best.score) best = { text, score };
  }
  return best && best.score >= 0.8 ? best.text.replace(/[\s*†‡]+$/g, "") : undefined;
}

function PdfPage({ document, pageNumber, zoom }: { document: PDFDocumentProxy; pageNumber: number; zoom: number }) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const textHostRef = useRef<HTMLDivElement>(null);
  const [nearViewport, setNearViewport] = useState(pageNumber <= 2);
  const [ratio, setRatio] = useState(11 / 8.5);

  useEffect(() => {
    const wrapper = wrapperRef.current;
    if (!wrapper || nearViewport) return;
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) { setNearViewport(true); observer.disconnect(); }
    }, { rootMargin: "900px 0px" });
    observer.observe(wrapper);
    return () => observer.disconnect();
  }, [nearViewport]);

  useEffect(() => {
    if (!nearViewport) return;
    let cancelled = false;
    let renderTask: RenderTask | null = null;
    let textLayer: InstanceType<(Awaited<typeof viewerModule>)["TextLayerBuilder"]> | null = null;
    const selectionController = new AbortController();
    void document.getPage(pageNumber).then(async (page) => {
      if (cancelled) return;
      const viewport = page.getViewport({ scale: zoom / 100 });
      setRatio(viewport.height / viewport.width);
      const canvas = canvasRef.current;
      const textHost = textHostRef.current;
      if (!canvas || !textHost) return;
      const outputScale = window.devicePixelRatio || 1;
      canvas.width = Math.floor(viewport.width * outputScale);
      canvas.height = Math.floor(viewport.height * outputScale);
      canvas.style.width = `${viewport.width}px`;
      canvas.style.height = `${viewport.height}px`;
      renderTask = page.render({ canvas, viewport, transform: outputScale === 1 ? undefined : [outputScale, 0, 0, outputScale, 0, 0] });
      const { TextLayerBuilder } = await viewerModule;
      if (cancelled) return;
      textLayer = new TextLayerBuilder({
        pdfPage: page,
        abortSignal: selectionController.signal,
        onAppend: (textContainer: HTMLDivElement) => {
          textContainer.style.width = `${viewport.width}px`;
          textContainer.style.height = `${viewport.height}px`;
          textContainer.style.setProperty("--total-scale-factor", String(viewport.scale));
          textContainer.setAttribute("aria-label", `Selectable text for page ${pageNumber}`);
          textHost.replaceChildren(textContainer);
        },
      });
      await Promise.all([renderTask.promise, textLayer.render({ viewport, images: undefined as never })]);
    }).catch(() => undefined);
    return () => { cancelled = true; selectionController.abort(); renderTask?.cancel(); textLayer?.cancel(); };
  }, [document, nearViewport, pageNumber, zoom]);

  const width = 612 * zoom / 100;
  return <section ref={wrapperRef} className="pdf-page" data-page-number={pageNumber} style={{ width, minHeight: width * ratio }} aria-label={`Page ${pageNumber}`}>
    <canvas ref={canvasRef} />
    <div ref={textHostRef} className="text-layer-host" />
    <span className="pdf-page-label">{pageNumber}</span>
  </section>;
}

export function PdfReader({ url, title, zoom, onMetadataSuggestion }: PdfReaderProps) {
  const [document, setDocument] = useState<PDFDocumentProxy | null>(null);
  const [error, setError] = useState("");
  const suggestionCallback = useRef(onMetadataSuggestion);
  useEffect(() => { suggestionCallback.current = onMetadataSuggestion; }, [onMetadataSuggestion]);

  useEffect(() => {
    let cancelled = false;
    let task: PDFDocumentLoadingTask | null = null;
    void fetch(url).then((response) => {
      if (!response.ok) throw new Error(`PDF request failed (${response.status})`);
      return response.arrayBuffer();
    }).then((data) => {
      if (cancelled) return;
      task = pdfjsLib.getDocument({ data: new Uint8Array(data) });
      return task.promise;
    }).then(async (loaded) => {
      if (!loaded || cancelled) return;
      setDocument(loaded);
      const [metadata, firstPage] = await Promise.all([
        loaded.getMetadata().catch(() => null),
        loaded.getPage(1).then((page) => page.getTextContent()).catch(() => null),
      ]);
      if (cancelled) return;
      const info = (metadata?.info ?? {}) as Record<string, unknown>;
      const metadataAuthor = typeof info.Author === "string" && info.Author.trim() ? info.Author.trim() : undefined;
      const dateSource = [info.CreationDate, info.ModDate].find((value) => typeof value === "string") as string | undefined;
      const metadataYear = Number(dateSource?.match(/(?:19|20)\d{2}/)?.[0]) || undefined;
      const lines = buildFirstPageLines(firstPage?.items ?? []);
      const pageYear = Number(lines.join(" ").match(/(?:19|20)\d{2}/)?.[0]) || undefined;
      suggestionCallback.current?.({ authors: metadataAuthor ?? likelyAuthorLine(lines, title), year: pageYear ?? metadataYear });
    }).catch(() => { if (!cancelled) setError("This PDF could not be rendered inside Lattice."); });
    return () => { cancelled = true; void task?.destroy(); };
  }, [title, url]);

  if (error) return <div className="pdf-load-state"><b>Could not open PDF</b><span>{error}</span></div>;
  if (!document) return <div className="pdf-load-state"><span className="pdf-spinner" />Loading {title}…</div>;
  return <div className="pdf-document" aria-label={title}>
    {Array.from({ length: document.numPages }, (_, index) => <PdfPage key={index + 1} document={document} pageNumber={index + 1} zoom={zoom} />)}
  </div>;
}
