"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { Document, Page, pdfjs } from "react-pdf";
import {
  ChevronLeft,
  ChevronRight,
  Maximize2,
  Minus,
  Plus,
  X,
} from "lucide-react";
import type { DocumentData } from "@/lib/text";
import { mappedBoxes } from "@/lib/text";
import { colors, type Hit } from "@/lib/highlights";
pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  "pdfjs-dist/build/pdf.worker.min.mjs",
  import.meta.url,
).toString();

type Viewport = {
  width: number;
  height: number;
  convertToViewportPoint: (x: number, y: number) => number[];
};
export default function Viewer({
  source,
  markers,
  selected,
  onSelect,
}: {
  source: DocumentData;
  markers: Hit[];
  selected: Hit | null;
  onSelect: (hit: Hit) => void;
}) {
  const [page, setPage] = useState(1);
  const [zoom, setZoom] = useState(1);
  const [width, setWidth] = useState(540);
  const [viewport, setViewport] = useState<Viewport | null>(null);
  const [thumbnails, setThumbnails] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [search, setSearch] = useState("");
  const [found, setFound] = useState(0);
  const [renderError, setError] = useState(false);
  const reader = useRef<HTMLDivElement>(null);
  const docx = useRef<HTMLIFrameElement>(null);
  const count = source.pages ?? 1;
  const thumbnailCount = width < 500 ? 5 : 9;
  const pdfSource = useMemo(
    () =>
      source.type === "pdf" && source.bytes
        ? { data: new Uint8Array(source.bytes.slice(0)) }
        : null,
    [source],
  );
  const match = selected ? mappedBoxes(source.boxes, selected)[0] : undefined;
  useEffect(() => {
    const node = reader.current;
    if (!node) return;
    const observer = new ResizeObserver((entries) =>
      setWidth(Math.max(180, entries[0].contentRect.width - 24)),
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    if (source.type !== "docx" || !source.bytes || !docx.current) return;
    const frame = docx.current;
    let disposed = false;
    const render = async () => {
      const target = frame.contentDocument?.body;
      const head = frame.contentDocument?.head;
      if (!target || !head) return;
      const policy = frame.contentDocument!.createElement("meta");
      policy.httpEquiv = "Content-Security-Policy";
      policy.content =
        "default-src 'none'; img-src data:; style-src 'unsafe-inline'; font-src data:";
      head.append(policy);
      const { renderAsync } = await import("docx-preview");
      if (!disposed)
        await renderAsync(source.bytes!, target, head, {
          ignoreFonts: true,
          renderAltChunks: false,
          useBase64URL: true,
          breakPages: true,
        });
    };
    void render().catch(() => {
      if (!disposed) setError(true);
    });
    return () => {
      disposed = true;
    };
  }, [source]);
  useEffect(() => {
    if (!fullscreen) return;
    const handler = (event: KeyboardEvent) => {
      if (event.key === "Escape") setFullscreen(false);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [fullscreen]);
  const visiblePage = match?.page ?? page;
  function navigate(next: number) {
    if (selected) onSelect({ ...selected, key: "", start: -1, end: -1 });
    setPage(Math.min(count, Math.max(1, next)));
  }
  function findNext() {
    const lower = source.text.toLowerCase();
    const query = search.trim().toLowerCase();
    if (!query) return;
    const offset = lower.indexOf(query, found);
    const start = offset < 0 ? lower.indexOf(query) : offset;
    if (start < 0) {
      setFound(-1);
      return;
    }
    setFound(start + query.length);
    const box = source.boxes.find((box) => box.end > start);
    if (box) navigate(box.page);
  }
  if (source.type === "docx")
    return (
      <div className="docx-pane">
        {renderError ? (
          <p>Formatted preview is unavailable. Switch to Text view.</p>
        ) : (
          <iframe
            ref={docx}
            sandbox="allow-same-origin"
            title="Formatted Word document preview"
          />
        )}
      </div>
    );
  if (source.type !== "pdf") return null;
  const overlay = viewport
    ? markers.flatMap((hit) =>
        mappedBoxes(source.boxes, hit)
          .filter((box) => box.page === visiblePage)
          .map((box, index) => {
            const [x, y, right, , , top] = box.quad;
            const first = viewport.convertToViewportPoint(x, y),
              second = viewport.convertToViewportPoint(right, top);
            const [r, g, b] = colors[hit.category];
            return (
              <button
                key={hit.key + index}
                type="button"
                aria-label={hit.label}
                title={hit.label}
                onClick={() => onSelect(hit)}
                className="pdf-mark"
                style={{
                  left: Math.min(first[0], second[0]),
                  top: Math.min(first[1], second[1]),
                  width: Math.abs(first[0] - second[0]),
                  height: Math.abs(first[1] - second[1]),
                  backgroundColor:
                    "rgba(" +
                    [
                      r * 255,
                      g * 255,
                      b * 255,
                      selected?.key === hit.key ? 0.62 : 0.35,
                    ].join(",") +
                    ")",
                }}
              />
            );
          }),
      )
    : null;
  return (
    <div className={fullscreen ? "pdf-view fullscreen" : "pdf-view"}>
      <div className="reader-tools">
        <button
          type="button"
          aria-label="Previous page"
          disabled={visiblePage === 1}
          onClick={() => navigate(visiblePage - 1)}
        >
          <ChevronLeft size={17} />
        </button>
        <span>
          {visiblePage} / {count}
        </span>
        <button
          type="button"
          aria-label="Next page"
          disabled={visiblePage === count}
          onClick={() => navigate(visiblePage + 1)}
        >
          <ChevronRight size={17} />
        </button>
        <button
          type="button"
          aria-label="Zoom out"
          disabled={zoom <= 0.5}
          onClick={() => setZoom((value) => Math.max(0.5, value - 0.15))}
        >
          <Minus size={17} />
        </button>
        <button
          type="button"
          aria-label="Zoom in"
          disabled={zoom >= 2.5}
          onClick={() => setZoom((value) => Math.min(2.5, value + 0.15))}
        >
          <Plus size={17} />
        </button>
        <button type="button" onClick={() => setZoom(1)}>
          Fit width
        </button>
        <button
          type="button"
          aria-pressed={thumbnails}
          onClick={() => setThumbnails((value) => !value)}
        >
          Pages
        </button>
        <button
          type="button"
          aria-label={fullscreen ? "Exit fullscreen" : "Fullscreen"}
          onClick={() => setFullscreen((value) => !value)}
        >
          {fullscreen ? <X size={17} /> : <Maximize2 size={17} />}
        </button>
      </div>
      <div
        className="reader-tools"
        role="search"
        aria-label="Search in document"
      >
        <input
          aria-label="Search PDF text"
          placeholder="Search document"
          value={search}
          onChange={(event) => {
            setSearch(event.target.value);
            setFound(0);
          }}
          onKeyDown={(event) => {
            if (event.key !== "Enter" || event.nativeEvent.isComposing) return;
            event.preventDefault();
            findNext();
          }}
        />
        <button type="button" onClick={findNext}>
          Find next
        </button>
        {found < 0 && <span role="status">No matches</span>}
      </div>
      <div ref={reader} className="pdf-scroll">
        <Document
          file={pdfSource}
          options={pdfOptions}
          loading={<p>Rendering PDF…</p>}
          error={<p>PDF preview failed. Switch to Text view.</p>}
        >
          {thumbnails && (
            <div className="thumbnail-bar">
              {Array.from(
                { length: Math.min(thumbnailCount, count) },
                (_, index) =>
                  Math.min(
                    Math.max(1, visiblePage - Math.floor(thumbnailCount / 2)),
                    Math.max(1, count - thumbnailCount + 1),
                  ) + index,
              ).map((number) => (
                <button
                  type="button"
                  key={number}
                  aria-label={"Open page " + number}
                  aria-current={number === visiblePage ? "page" : undefined}
                  onClick={() => navigate(number)}
                >
                  <Page
                    pageNumber={number}
                    width={56}
                    devicePixelRatio={1}
                    renderAnnotationLayer={false}
                    renderTextLayer={false}
                  />
                  {number}
                </button>
              ))}
            </div>
          )}
          <div
            className="pdf-sheet"
            key={visiblePage + ":" + zoom + ":" + width}
          >
            <Page
              pageNumber={visiblePage}
              width={width}
              scale={zoom}
              devicePixelRatio={width < 500 ? Math.min(globalThis.devicePixelRatio || 1, 1.5) : undefined}
              renderAnnotationLayer={false}
              renderTextLayer={false}
              onRenderSuccess={(rendered) => {
                const rotated = rendered.getViewport({ scale: 1 });
                setViewport(
                  rendered.getViewport({
                    scale: (width / rotated.width) * zoom,
                  }),
                );
              }}
            />
            {overlay}
          </div>
        </Document>
      </div>
    </div>
  );
}
const pdfOptions = {
  isEvalSupported: false,
  enableXfa: false,
  useSystemFonts: true,
};
