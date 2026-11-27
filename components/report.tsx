"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { Download, FileText } from "lucide-react";
import { toast } from "sonner";
import { Button } from "./ui/button";
import { hits, type Category, type Hit } from "@/lib/highlights";
import { desklibModel, desklibThreshold } from "@/lib/browser-detection";
import { detectionThreshold, isDetailed, rubric, scorePercent, type Scan } from "@/lib/results";
import { mappedBoxes, type DocumentData } from "@/lib/text";
const Viewer = dynamic(() => import("./document-viewer"), {
  ssr: false,
  loading: () => <p className="card">Preparing document viewer…</p>,
});
const tabs = [
  "Overview",
  "AI Detection",
  "Writing Quality",
  "Grammar & Spelling",
  "Academic Feedback",
  "Summary",
] as const;
const labels: Record<Category, string> = {
  ai: "AI detection",
  grammar: "Grammar & spelling",
  writing: "Writing suggestions",
  academic: "Tone & clarity",
};

function TextView({
  text,
  markers,
  selected,
  onSelect,
}: {
  text: string;
  markers: Hit[];
  selected: Hit | null;
  onSelect: (hit: Hit) => void;
}) {
  const root = useRef<HTMLDivElement>(null);
  const segments = useMemo(() => {
    const sorted = markers
      .filter(
        (item) =>
          item.start >= 0 && item.end <= text.length && item.end > item.start,
      )
      .toSorted((a, b) => a.start - b.start);
    const points = Array.from(
      new Set([
        0,
        text.length,
        ...sorted.flatMap((item) => [item.start, item.end]),
      ]),
    ).sort((a, b) => a - b);
    let active: Hit[] = [],
      index = 0;
    const result: { start: number; text: string; markers: Hit[] }[] = [];
    for (let i = 0; i < points.length - 1; i++) {
      const start = points[i];
      active = active.filter((item) => item.end > start);
      while (index < sorted.length && sorted[index].start <= start)
        active.push(sorted[index++]);
      result.push({
        start,
        text: text.slice(start, points[i + 1]),
        markers: active,
      });
    }
    return result;
  }, [text, markers]);
  useEffect(() => {
    if (selected)
      root.current
        ?.querySelector('[data-passage="' + selected.key + '"]')
        ?.scrollIntoView({ block: "nearest" });
  }, [selected]);
  return (
    <div className="text-document" ref={root}>
      {segments.map((part) => {
        const item =
          part.markers.find((marker) => marker.key === selected?.key) ??
          part.markers[0];
        return item ? (
          <button
            className={"text-mark " + item.category}
            key={part.start}
            data-passage={item.key}
            aria-label={item.label + ": " + part.text}
            onClick={() => onSelect(item)}
          >
            {part.text}
          </button>
        ) : (
          <span key={part.start}>{part.text.replaceAll("\f", "")}</span>
        );
      })}
    </div>
  );
}

export function Report({
  scan,
  source,
  text,
  onRestore,
  onRetry,
  busy,
  warning,
}: {
  scan: Scan;
  source?: DocumentData;
  text?: string;
  onRestore?: (file: File) => void;
  onRetry?: () => void;
  busy?: boolean;
  warning?: string;
}) {
  const [tab, setTab] = useState<(typeof tabs)[number]>("Overview");
  const [mode, setMode] = useState<"original" | "text">("original");
  const [selected, setSelected] = useState<Hit | null>(null);
  const [filters, setFilters] = useState<Category[]>([
    "ai",
    "grammar",
    "writing",
    "academic",
  ]);
  const [exporting, setExporting] = useState(false);
  const markers = useMemo(() => hits(scan), [scan]);
  const shown = useMemo(
    () => markers.filter((item) => filters.includes(item.category)),
    [markers, filters],
  );
  const readable = source?.text ?? text;
  const hasOriginal = Boolean(
    source?.bytes && (source.type === "pdf" || source.type === "docx"),
  );
  const detailed = isDetailed(scan.writing) ? scan.writing : null;
  const currentIssue = selected?.key.startsWith("issue-")
    ? detailed?.issues[Number(selected.key.slice(6))]
    : undefined;
  function select(hit: Hit) {
    if (!hit.key) {
      setSelected(null);
      return;
    }
    setSelected(hit);
    if (!filters.includes(hit.category))
      setFilters((value) => [...value, hit.category]);
    if (source?.type !== "pdf" || !mappedBoxes(source.boxes, hit).length)
      setMode("text");
  }
  async function exportReport(highlighted = false) {
    setExporting(true);
    try {
      const { download, summaryPdf, highlightedPdf } = await import(
        "@/lib/reports"
      );
      const bytes =
        highlighted && source
          ? await highlightedPdf(source, shown)
          : await summaryPdf(scan);
      download(
        bytes,
        "Paper Checker-" + (highlighted ? "highlighted" : "summary") + ".pdf",
      );
    } catch {
      toast.error("The PDF report could not be generated.");
    } finally {
      setExporting(false);
    }
  }
  return (
    <div className="stack">
      <div className="workspace-title">
        <div>
          <p className="eyebrow">Analysis report</p>
          <h1>{scan.document_name}</h1>
          <p>
            {new Date(scan.created_at).toLocaleString()} ·{" "}
            {(scan.processing_duration / 1000).toFixed(1)} seconds
          </p>
        </div>
        <div className="actions">
          <Button disabled={exporting} onClick={() => exportReport()}>
            <Download size={16} /> Summary PDF
          </Button>
          {source?.type === "pdf" && (
            <Button
              variant="outline"
              disabled={exporting || !shown.length}
              onClick={() => exportReport(true)}
            >
              Highlighted PDF
            </Button>
          )}
        </div>
      </div>
      {warning && (
        <div role="status" className="notice">
          {warning}
        </div>
      )}
      <div className="report-grid">
        <section className="card reader">
          <div className="reader-head">
            <h2>Document</h2>
            {hasOriginal && (
              <div className="mini-tabs">
                <button
                  aria-pressed={mode === "original"}
                  onClick={() => setMode("original")}
                >
                  Document view
                </button>
                <button
                  aria-pressed={mode === "text"}
                  onClick={() => setMode("text")}
                >
                  Text view
                </button>
              </div>
            )}
          </div>
          <div className="legend">
            {Object.entries(labels).map(([key, label]) => (
              <label key={key}>
                <input
                  type="checkbox"
                  checked={filters.includes(key as Category)}
                  onChange={(event) =>
                    setFilters((value) =>
                      event.target.checked
                        ? [...value, key as Category]
                        : value.filter((item) => item !== key),
                    )
                  }
                />
                <span className={"legend-dot " + key} />
                {label}
              </label>
            ))}
          </div>
          {hasOriginal && mode === "original" && source ? (
            <Viewer
              source={source}
              markers={shown}
              selected={selected}
              onSelect={select}
            />
          ) : readable ? (
            <TextView
              text={readable}
              markers={shown}
              selected={selected}
              onSelect={select}
            />
          ) : (
            <div className="empty">
              <FileText size={28} />
              <h3>Original document unavailable</h3>
              <p>
                Restore the matching original to preview the document and
                highlight verified passages.
              </p>
            </div>
          )}
          {!source && onRestore && scan.document_type !== "paste" && (
            <label className="restore">
              Restore matching original{" "}
              <input
                type="file"
                accept=".pdf,.docx,.txt"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) onRestore(file);
                  event.target.value = "";
                }}
              />
            </label>
          )}
        </section>
        <section className="card report-data">
          <div className="report-tabs" aria-label="Report sections">
            {tabs.map((value) => (
              <button
                key={value}
                aria-pressed={tab === value}
                onClick={() => setTab(value)}
              >
                {value}
              </button>
            ))}
          </div>
          {(onRetry ||
            scan.ai_error ||
            scan.writing_error ||
            scan.status === "processing") && (
            <div className="notice" role="status">
              {scan.status === "processing" && (
                <p>
                  This scan is processing or was interrupted. Refresh for its
                  latest status.
                </p>
              )}
              {scan.ai_error && <p>{scan.ai_error}</p>}
              {scan.writing_error && <p>{scan.writing_error}</p>}
              {onRetry && (
                <Button variant="outline" disabled={busy} onClick={onRetry}>
                  {busy
                    ? "Retrying…"
                    : scan.ai?.source === "browser" && !scan.ai.method
                      ? "Recheck detection"
                      : "Retry failed analysis"}
                </Button>
              )}
            </div>
          )}
          {selected && (
            <div className="selected-passage">
              <div className="workspace-title">
                <strong>{selected.label}</strong>
                <button
                  onClick={() => setSelected(null)}
                  aria-label="Close selected passage"
                >
                  ×
                </button>
              </div>
              {readable && (
                <p>{readable.slice(selected.start, selected.end)}</p>
              )}
              {currentIssue && (
                <>
                  <p>
                    <strong>Suggested revision</strong>{" "}
                    {currentIssue.correction}
                  </p>
                  <p>{currentIssue.explanation}</p>
                </>
              )}
            </div>
          )}
          {tab === "Overview" && (
            <>
              <div className="metrics compact">
                <div>
                  <p>AI detection estimate</p>
                  <strong>{scorePercent(scan.ai_score, 100)}</strong>
                </div>
                <div>
                  <p>Writing quality</p>
                  <strong>{scorePercent(scan.writing_score)}</strong>
                </div>
              </div>
              <dl className="stats">
                <div>
                  <dt>Words</dt>
                  <dd>{scan.word_count.toLocaleString()}</dd>
                </div>
                <div>
                  <dt>Characters</dt>
                  <dd>{scan.character_count.toLocaleString()}</dd>
                </div>
                <div>
                  <dt>Pages</dt>
                  <dd>{scan.page_count ?? "—"}</dd>
                </div>
                <div>
                  <dt>Status</dt>
                  <dd>{scan.status}</dd>
                </div>
                <div>
                  <dt>AI detection</dt>
                  <dd>
                    {scan.ai
                      ? scan.ai.source === "browser"
                        ? "Browser-generated"
                        : "Historical result"
                      : scan.ai_error
                        ? "Failed"
                        : "Pending"}
                  </dd>
                </div>
                <div>
                  <dt>Gemini</dt>
                  <dd>
                    {scan.writing
                      ? "Complete"
                      : scan.writing_error
                        ? "Failed"
                        : "Pending"}
                  </dd>
                </div>
              </dl>
              <p className="muted">
                Detection is probabilistic. Use these results as one part of a
                human review.
              </p>
            </>
          )}
          {tab === "AI Detection" && (
            <>
              <h3>AI detection · {scorePercent(scan.ai_score, 100)}</h3>
              {scan.ai?.source === "browser" ? (
                <p>
                  Browser-generated estimate across {scan.ai.parts} passages,
                  weighted by character count.{" "}
                  {scan.ai.method
                    ? `Identified front matter and references were excluded (${scan.ai.exclusions?.length ?? 0} ranges).`
                    : "This estimate predates front-matter and reference exclusions."}{" "}
                  The server does not independently verify these scores.
                  Highlights mark passages at or above the{" "}
                  {detectionThreshold(scan.ai).toFixed(2)} review cutoff.
                </p>
              ) : scan.ai ? (
                <p>
                  Historical API result. Highlights show saved sentence matches.{" "}
                  {scan.ai.lowConfidence &&
                    "The provider marked this result low confidence."}
                </p>
              ) : (
                <p>No detection score is available for this scan.</p>
              )}
              {scan.ai?.source === "browser" && scan.ai.model === desklibModel && (
                <p>
                  Desklib INT8 pilot ·{" "}
                  {scan.ai.score >= desklibThreshold ? "Flagged for review" : "Below review cutoff"}
                  {" "}at a document cutoff of {desklibThreshold}.
                </p>
              )}
              <p>Detection scores are model estimates. They do not measure the share of AI-written text or establish authorship.</p>
              <div className="issue-list">
                {markers
                  .filter((item) => item.category === "ai")
                  .map((item) => (
                    <button
                      className="issue"
                      key={item.key}
                      onClick={() => select(item)}
                    >
                      <strong>{item.label}</strong>
                      {readable && (
                        <span>{readable.slice(item.start, item.end)}</span>
                      )}
                    </button>
                  ))}
              </div>
            </>
          )}
          {tab === "Writing Quality" && (
            <>
              <h3>Academic writing rubric</h3>
              {scan.writing ? (
                <dl className="rubric">
                  {Object.entries(rubric).map(([key, label]) => (
                    <div key={key}>
                      <dt>{label}</dt>
                      <dd>
                        <progress
                          value={
                            scan.writing!.scores[key as keyof typeof rubric]
                          }
                          max={100}
                        />
                        {scan.writing!.scores[key as keyof typeof rubric]}/100
                      </dd>
                    </div>
                  ))}
                </dl>
              ) : (
                <p>Writing scores are unavailable.</p>
              )}
            </>
          )}
          {(tab === "Grammar & Spelling" || tab === "Academic Feedback") && (
            <>
              <h3>{tab}</h3>
              {!detailed && (
                <p>
                  Detailed feedback is available during the original session or
                  when text retention was enabled.
                </p>
              )}
              <div className="issue-list">
                {markers
                  .filter(
                    (item) =>
                      item.category !== "ai" &&
                      (tab === "Grammar & Spelling"
                        ? item.category === "grammar"
                        : item.category !== "grammar"),
                  )
                  .map((item) => (
                    <button
                      className="issue"
                      key={item.key}
                      onClick={() => select(item)}
                    >
                      <strong>{item.label}</strong>
                      {readable && (
                        <span>{readable.slice(item.start, item.end)}</span>
                      )}
                    </button>
                  ))}
              </div>
              {detailed && tab === "Academic Feedback" && (
                <Feedback
                  title="Recommended revisions"
                  items={detailed.recommendations}
                />
              )}
            </>
          )}
          {tab === "Summary" && (
            <>
              <h3>Document summary</h3>
              <p>
                {detailed?.summary ??
                  "A detailed summary is unavailable in this report."}
              </p>
              {detailed && (
                <>
                  <Feedback title="Strengths" items={detailed.strengths} />
                  <Feedback
                    title="Areas for improvement"
                    items={detailed.weaknesses}
                  />
                </>
              )}
            </>
          )}
        </section>
      </div>
    </div>
  );
}
function Feedback({ title, items }: { title: string; items: string[] }) {
  return (
    <section className="feedback">
      <h3>{title}</h3>
      <ul>
        {items.map((item, index) => (
          <li key={index}>{item}</li>
        ))}
      </ul>
    </section>
  );
}
