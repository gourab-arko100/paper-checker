"use client";
import { useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import {
  FileText,
  UploadCloud,
  X,
  ShieldCheck,
  LoaderCircle,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "./ui/button";
import { DetectorDiagnostics } from "./detector-diagnostics";
import { Report } from "./report";
import type { DocumentData } from "@/lib/text";
import { words } from "@/lib/text";
import { isDetailed, needsBrowserDetection, type Scan } from "@/lib/results";
import type { extract } from "@/lib/browser-document";

async function open(file: File, progress?: (stage: string) => void) {
  const lib = await import("@/lib/browser-document");
  return lib.extract(file, progress);
}
const UploadViewer = dynamic(() => import("./document-viewer"), {
  ssr: false,
  loading: () => <p>Preparing document viewer…</p>,
});
type AnalysisResponse = { scan?: Scan; error?: string; warning?: string };
async function runWriting(
  source: DocumentData,
  retry?: string,
  onStage?: (stage: string) => void,
) {
  const response = await fetch("/api/analyze", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/x-ndjson",
    },
    body: JSON.stringify({
      name: source.name,
      type: source.type,
      text: source.text,
      hash: source.hash,
      pages: source.pages,
      consent: true,
      retry,
    }),
  });
  if (
    !response.body ||
    !response.headers.get("content-type")?.includes("application/x-ndjson")
  ) {
    const data = (await response
      .json()
      .catch(() => null)) as AnalysisResponse | null;
    throw new Error(data?.error ?? "Analysis could not be started.");
  }
  const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
  let buffer = "";
  let data: AnalysisResponse | undefined;
  while (true) {
    const part = await reader.read();
    if (part.done) break;
    buffer += part.value;
    const rows = buffer.split("\n");
    buffer = rows.pop() ?? "";
    for (const row of rows) {
      const message = JSON.parse(row) as {
        stage?: string;
        data?: AnalysisResponse;
      };
      if (message.stage) onStage?.(message.stage);
      if (message.data) data = message.data;
    }
  }
  if (!data?.scan)
    throw new Error(
      data?.error ??
        "The analysis connection ended before a report was received. Check scan history.",
    );
  return { scan: data.scan, warning: data.warning };
}
async function run(
  source: DocumentData,
  previous?: Scan,
  onStage: (stage: string) => void = () => {},
  cancel?: AbortSignal,
  deferDetection = false,
) {
  const controller = new AbortController();
  const stop = () => controller.abort();
  if (cancel?.aborted) stop();
  cancel?.addEventListener("abort", stop, { once: true });
  try {
    const detection = !needsBrowserDetection(previous?.ai)
      ? Promise.resolve(null)
      : deferDetection
        ? Promise.resolve({ error: "mobile_deferred" as const })
        : import("@/lib/detect-in-browser")
            .then(({ detectInBrowser }) =>
              detectInBrowser(source.text, onStage, controller.signal),
            )
            .catch(() => ({ error: "unavailable" as const }));
    const report = await runWriting(source, previous?.id, onStage);
    if (!needsBrowserDetection(report.scan.ai)) return report;
    const result = await detection;
    if (!result) return report;
    const response = await fetch("/api/analyze", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        scanId: report.scan.id,
        textHash: report.scan.text_hash,
        result:
          "passages" in result
            ? { detector: result.detector, passages: result.passages, exclusions: result.exclusions }
            : result,
      }),
    }).catch(() => null);
    if (response?.ok) {
      const saved = (await response.json()) as Pick<
        Scan,
        "ai" | "ai_score" | "ai_error" | "status"
      >;
      return { ...report, scan: { ...report.scan, ...saved } };
    }
    const { browserResult, detectionErrors } = await import(
      "@/lib/browser-detection"
    );
    const ai =
      "passages" in result
        ? browserResult(result.passages, source.text.length, result.exclusions, result.detector)
        : null;
    return {
      warning:
        "The browser result could not be added to scan history. Download the report to keep any results shown here.",
      scan: {
        ...report.scan,
        ai,
        ai_score: ai?.score ?? null,
        ai_error: "error" in result ? detectionErrors[result.error] : null,
        status:
          ai && report.scan.writing
            ? ("complete" as const)
            : ai || report.scan.writing
              ? ("partial" as const)
              : ("failed" as const),
      },
    };
  } finally {
    stop();
    cancel?.removeEventListener("abort", stop);
  }
}
export function NewAnalysis({ retains }: { retains: boolean }) {
  const [tab, setTab] = useState("file");
  const [text, setText] = useState("");
  const [source, setSource] = useState<DocumentData>();
  const [scan, setScan] = useState<Scan>();
  const [warning, setWarning] = useState<string>();
  const [consent, setConsent] = useState(false);
  const [mobileDetection, setMobileDetection] = useState(false);
  const [drag, setDrag] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const fileInput = useRef<HTMLInputElement>(null);
  const pending = useRef(false);
  const detectionCancel = useRef<AbortController | null>(null);
  const [canCancel, setCanCancel] = useState(false);
  useEffect(() => () => detectionCancel.current?.abort(), []);
  async function choose(file: File) {
    if (pending.current) return;
    pending.current = true;
    setError("");
    setBusy("Preparing document");
    setSource(undefined);
    setShowPreview(false);
    try {
      setSource(await open(file, setBusy));
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "This document could not be opened.",
      );
    } finally {
      pending.current = false;
      setBusy("");
    }
  }
  async function analyze(retry?: string) {
    if (pending.current) return;
    pending.current = true;
    setError("");
    setBusy("Preparing document");
    try {
      const working =
        tab === "text"
          ? await (await import("@/lib/browser-document")).fromPaste(text)
          : source;
      if (!working) throw new Error("Add a document before starting analysis.");
      setSource(working);
      setBusy(retry ? "Retrying failed analysis" : "Starting analysis");
      const cancel = new AbortController();
      detectionCancel.current = cancel;
      const deferDetection =
        !retry &&
        !mobileDetection &&
        window.matchMedia(
          "(max-width: 700px), (max-width: 950px) and (pointer: coarse)",
        ).matches;
      setCanCancel(!deferDetection && needsBrowserDetection(scan?.ai));
      const result = await run(
        working,
        retry ? scan : undefined,
        setBusy,
        cancel.signal,
        deferDetection,
      );
      setBusy("Opening report");
      const incoming = result.scan;
      setScan(
        scan && isDetailed(scan.writing) && !isDetailed(incoming.writing)
          ? { ...incoming, writing: scan.writing }
          : incoming,
      );
      setWarning(result.warning);
      if (incoming.status === "complete") toast.success("Analysis complete");
    } catch (cause) {
      const message =
        cause instanceof Error ? cause.message : "The analysis failed.";
      setError(message);
      toast.error(message);
    } finally {
      detectionCancel.current = null;
      setCanCancel(false);
      pending.current = false;
      setBusy("");
    }
  }
  if (scan)
    return (
      <>
        <div className="report-back">
          <Button
            variant="ghost"
            disabled={Boolean(busy)}
            onClick={() => {
              setScan(undefined);
              setSource(undefined);
              setText("");
              setTab("file");
              setConsent(false);
              setMobileDetection(false);
              setError("");
            }}
          >
            New analysis
          </Button>
          {busy && <span role="status">{busy}</span>}
          {busy && canCancel && (
            <Button
              variant="outline"
              onClick={() => {
                detectionCancel.current?.abort();
                setCanCancel(false);
              }}
            >
              Cancel detection
            </Button>
          )}
          {error && <p role="alert">{error}</p>}
        </div>
        {process.env.NODE_ENV === "development" && source && (
          <DetectorDiagnostics text={source.text} />
        )}
        <Report
          source={source}
          scan={scan}
          warning={warning}
          busy={Boolean(busy)}
          onRetry={
            scan.status === "failed" || scan.status === "partial"
              ? () => analyze(scan.id)
              : undefined
          }
        />
      </>
    );
  return (
    <div className="stack narrow">
      <div className="workspace-title">
        <div>
          <h1>New analysis</h1>
          <p>Review AI detection and academic writing quality in one report.</p>
        </div>
      </div>
      <form
        className="card stack"
        onSubmit={(event) => {
          event.preventDefault();
          void analyze();
        }}
      >
        <div className="mini-tabs">
          <button
            type="button"
            aria-pressed={tab === "file"}
            disabled={Boolean(busy)}
            onClick={() => setTab("file")}
          >
            Upload file
          </button>
          <button
            type="button"
            aria-pressed={tab === "text"}
            disabled={Boolean(busy)}
            onClick={() => setTab("text")}
          >
            Paste text
          </button>
        </div>
        {tab === "file" ? (
          <>
            <input
              ref={fileInput}
              hidden
              type="file"
              accept=".pdf,.docx,.txt"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) void choose(file);
                event.target.value = "";
              }}
            />
            <div
              className={drag ? "drop drag" : "drop"}
              onDragOver={(event) => {
                event.preventDefault();
                setDrag(true);
              }}
              onDragLeave={() => setDrag(false)}
              onDrop={(event) => {
                event.preventDefault();
                setDrag(false);
                const file = event.dataTransfer.files[0];
                if (file) void choose(file);
              }}
            >
              <UploadCloud size={30} />
              <h3>Drop your document here</h3>
              <p>PDF, DOCX or TXT · up to 32 MiB</p>
              <Button
                type="button"
                variant="outline"
                disabled={Boolean(busy)}
                onClick={() => fileInput.current?.click()}
              >
                {source ? "Replace file" : "Browse files"}
              </Button>
            </div>
            {source && (
              <div className="staged">
                <FileText size={23} />
                <div>
                  <strong>{source.name}</strong>
                  <p>
                    {(source.bytes!.byteLength / 1024).toFixed(1)} KiB ·{" "}
                    {words(source.text)} words · {source.text.length} characters
                    {source.pages ? " · " + source.pages + " pages" : ""}
                  </p>
                </div>
                <button
                  type="button"
                  aria-label="Remove document"
                  disabled={Boolean(busy)}
                  onClick={() => setSource(undefined)}
                >
                  <X size={19} />
                </button>
              </div>
            )}
            {source && (
              <details
                onToggle={(event) => setShowPreview(event.currentTarget.open)}
              >
                <summary>Preview document</summary>
                {showPreview &&
                  (source.type === "pdf" || source.type === "docx" ? (
                    <UploadViewer
                      source={source}
                      markers={[]}
                      selected={null}
                      onSelect={() => {}}
                    />
                  ) : (
                    <pre className="upload-preview">
                      {source.text.slice(0, 5000)}
                    </pre>
                  ))}
              </details>
            )}
          </>
        ) : (
          <label className="field">
            Document text
            <textarea
              rows={10}
              value={text}
              onChange={(event) => setText(event.target.value)}
              placeholder="Paste the text of your document"
              disabled={Boolean(busy)}
            />
            <small>
              {words(text).toLocaleString()} words ·{" "}
              {text.length.toLocaleString()} characters
            </small>
          </label>
        )}
        <div className="notice">
          <ShieldCheck size={20} />
          <div>
            <strong>Your privacy settings</strong>
            <p>
              Original files stay in this browser.{" "}
              {retains
                ? "Extracted text and detailed results are saved in your history."
                : "History saves metadata and numerical results. Download the full report before leaving this page."}
            </p>
            <label className="consent">
              <input
                type="checkbox"
                required
                checked={consent}
                onChange={(event) => setConsent(event.target.checked)}
              />{" "}
              <span>
                I agree to send extracted text to Google Gemini. AI detection
                runs in this browser.{" "}
                <Link
                  className="policy-link"
                  href="/privacy"
                  target="_blank"
                  rel="noreferrer"
                >
                  Read the privacy policy
                </Link>{" "}
                before submitting.
              </span>
            </label>
          </div>
        </div>
        <label className="consent mobile-detection">
          <input
            type="checkbox"
            checked={mobileDetection}
            disabled={Boolean(busy)}
            onChange={(event) => setMobileDetection(event.target.checked)}
          />
          <span>Run on-device AI detection (first use downloads about 485 MB). Writing analysis runs either way.</span>
        </label>
        {error && (
          <p role="alert" className="error">
            {error}
          </p>
        )}
        {busy && (
          <p className="busy" role="status">
            <LoaderCircle size={16} />
            {busy}
          </p>
        )}
        <div>
          {busy && canCancel && (
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                detectionCancel.current?.abort();
                setCanCancel(false);
              }}
            >
              Cancel detection
            </Button>
          )}
          <Button
            disabled={
              !consent ||
              Boolean(busy) ||
              !(tab === "file" ? source : text.trim())
            }
          >
            Analyze Document
          </Button>
        </div>
      </form>
    </div>
  );
}
export function SavedReport({
  scan: initial,
  text,
}: {
  scan: Scan;
  text?: string;
}) {
  const [scan, setScan] = useState(initial);
  const [source, setSource] = useState<DocumentData>();
  const [busy, setBusy] = useState(false);
  const [stage, setStage] = useState("");
  const detectionCancel = useRef<AbortController | null>(null);
  const [canCancel, setCanCancel] = useState(false);
  useEffect(() => () => detectionCancel.current?.abort(), []);
  const [warning, setWarning] = useState<string>();
  const [consent, setConsent] = useState(false);
  const recheck =
    scan.ai?.source === "browser" && !scan.ai.method && Boolean(scan.writing);
  const retryable =
    recheck ||
    scan.status === "partial" ||
    scan.status === "failed" ||
    scan.status === "processing";
  async function restore(file: Parameters<typeof extract>[0]) {
    setBusy(true);
    try {
      const document = await open(file);
      const { sha256 } = await import("@/lib/browser-document");
      if (
        document.hash !== scan.document_hash ||
        (await sha256(document.text)) !== scan.text_hash
      )
        throw new Error(
          "This file or its extracted text does not match the saved scan.",
        );
      setSource(document);
      toast.success("Original document restored");
    } catch (cause) {
      toast.error(
        cause instanceof Error
          ? cause.message
          : "The original document could not be restored.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function retry() {
    setBusy(true);
    try {
      const working =
        source ??
        (await (await import("@/lib/browser-document")).fromPaste(text ?? ""));
      const cancel = new AbortController();
      detectionCancel.current = cancel;
      setCanCancel(needsBrowserDetection(scan?.ai));
      setStage("Retrying analysis…");
      const result = await run(working, scan, setStage, cancel.signal);
      setScan(result.scan);
      setWarning(result.warning);
    } catch (cause) {
      toast.error(
        cause instanceof Error ? cause.message : "The retry could not start.",
      );
    } finally {
      detectionCancel.current = null;
      setCanCancel(false);
      setStage("");
      setBusy(false);
    }
  }
  return (
    <div className="stack">
      {stage && <p role="status">{stage}</p>}
      {stage && canCancel && (
        <Button
          variant="outline"
          onClick={() => {
            detectionCancel.current?.abort();
            setCanCancel(false);
          }}
        >
          Cancel detection
        </Button>
      )}
      {retryable &&
        !recheck &&
        (source || (scan.document_type === "paste" && text)) && (
          <label className="consent">
            <input
              type="checkbox"
              checked={consent}
              onChange={(event) => setConsent(event.target.checked)}
            />{" "}
            I agree to resend extracted text to Gemini if writing analysis needs
            to be retried.
          </label>
        )}
      {process.env.NODE_ENV === "development" && (source?.text || text) && (
        <DetectorDiagnostics text={source?.text ?? text ?? ""} />
      )}
      <Report
        scan={scan}
        text={text}
        source={source}
        warning={warning}
        onRestore={busy ? undefined : restore}
        onRetry={
          retryable &&
          (consent || recheck) &&
          (source || (scan.document_type === "paste" && text))
            ? retry
            : undefined
        }
        busy={busy}
      />
    </div>
  );
}
