import { useEffect, useRef, useState } from "react";
import { getDocument, GlobalWorkerOptions, TextLayer } from "pdfjs-dist";
import type { PDFDocumentLoadingTask, PDFDocumentProxy, RenderTask } from "pdfjs-dist";
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";

GlobalWorkerOptions.workerSrc = workerUrl;

type PdfReaderProps = {
  url: string;
  title: string;
  zoom: number;
};

function PdfPage({ document, pageNumber, zoom }: { document: PDFDocumentProxy; pageNumber: number; zoom: number }) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const textRef = useRef<HTMLDivElement>(null);
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
    let textLayer: TextLayer | null = null;
    void document.getPage(pageNumber).then(async (page) => {
      if (cancelled) return;
      const viewport = page.getViewport({ scale: zoom / 100 });
      setRatio(viewport.height / viewport.width);
      const canvas = canvasRef.current;
      const textContainer = textRef.current;
      if (!canvas || !textContainer) return;

      const outputScale = window.devicePixelRatio || 1;
      canvas.width = Math.floor(viewport.width * outputScale);
      canvas.height = Math.floor(viewport.height * outputScale);
      canvas.style.width = `${viewport.width}px`;
      canvas.style.height = `${viewport.height}px`;
      renderTask = page.render({ canvas, viewport, transform: outputScale === 1 ? undefined : [outputScale, 0, 0, outputScale, 0, 0] });

      textContainer.replaceChildren();
      textContainer.style.width = `${viewport.width}px`;
      textContainer.style.height = `${viewport.height}px`;
      textContainer.style.setProperty("--total-scale-factor", String(viewport.scale));
      textLayer = new TextLayer({ textContentSource: await page.getTextContent(), container: textContainer, viewport });
      await Promise.all([renderTask.promise, textLayer.render()]);
    }).catch(() => undefined);
    return () => { cancelled = true; renderTask?.cancel(); textLayer?.cancel(); };
  }, [document, nearViewport, pageNumber, zoom]);

  const width = 612 * zoom / 100;
  return <section ref={wrapperRef} className="pdf-page" data-page-number={pageNumber} style={{ width, minHeight: width * ratio }} aria-label={`Page ${pageNumber}`}>
    <canvas ref={canvasRef} />
    <div ref={textRef} className="textLayer" />
    <span className="pdf-page-label">{pageNumber}</span>
  </section>;
}

export function PdfReader({ url, title, zoom }: PdfReaderProps) {
  const [document, setDocument] = useState<PDFDocumentProxy | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    let task: PDFDocumentLoadingTask | null = null;
    void fetch(url).then((response) => {
      if (!response.ok) throw new Error(`PDF request failed (${response.status})`);
      return response.arrayBuffer();
    }).then((data) => {
      if (cancelled) return;
      task = getDocument({ data: new Uint8Array(data) });
      return task.promise;
    }).then((loaded) => { if (loaded && !cancelled) setDocument(loaded); })
      .catch(() => { if (!cancelled) setError("This PDF could not be rendered inside Lattice."); });
    return () => { cancelled = true; void task?.destroy(); };
  }, [url]);

  if (error) return <div className="pdf-load-state"><b>Could not open PDF</b><span>{error}</span></div>;
  if (!document) return <div className="pdf-load-state"><span className="pdf-spinner" />Loading {title}…</div>;
  return <div className="pdf-document" aria-label={title}>
    {Array.from({ length: document.numPages }, (_, index) => <PdfPage key={index + 1} document={document} pageNumber={index + 1} zoom={zoom} />)}
  </div>;
}
