"use client";
import { useEffect, useRef, useState } from "react";
import { Button } from "./ui/button";
import {
  browserResult,
  detectionErrors,
  type BrowserDetection,
  type Diagnostics,
  type DiagnosticMode,
} from "@/lib/browser-detection";

export function DetectorDiagnostics({ text }: { text: string }) {
  const [dtype, setDtype] = useState<DiagnosticMode>("auto");
  const [stage, setStage] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<
    BrowserDetection & { diagnostic: Diagnostics }
  >();
  const control = useRef<AbortController | null>(null);
  useEffect(() => () => control.current?.abort(), []);
  if (process.env.NODE_ENV !== "development") return null;
  async function run() {
    if (control.current) return;
    const abort = new AbortController();
    control.current = abort;
    setResult(undefined);
    setBusy(true);
    setStage("Starting diagnostic…");
    try {
      const { detectInBrowser } = await import("@/lib/detect-in-browser");
      const next = await detectInBrowser(text, setStage, abort.signal, dtype);
      if ("error" in next) setStage(detectionErrors[next.error]);
      else if (next.diagnostic) {
        setResult({ ...next, diagnostic: next.diagnostic });
        setStage("Diagnostic complete.");
      } else setStage("No diagnostic data returned.");
    } catch {
      setStage("The diagnostic could not run.");
    } finally {
      control.current = null;
      setBusy(false);
    }
  }
  const aggregate =
    result && browserResult(result.passages, text.length, result.exclusions, result.detector);
  return (
    <details className="card">
      <summary>Detector diagnostics · development only</summary>
      <p>
        Passage text and raw results stay on this device and are not saved to
        history.
      </p>
      <label>
        Weights{" "}
        <select
          disabled={busy}
          value={dtype}
          onChange={(event) => setDtype(event.target.value as DiagnosticMode)}
        >
          <option value="auto">Auto (same as analysis)</option>
          <option value="tmr-q8">TMR Q8</option>
          <option value="tmr-q4">TMR Q4</option>
          <option value="tmr-fp32">TMR FP32</option>
        </select>
      </label>{" "}
      <Button type="button" disabled={busy} onClick={run}>
        Inspect model outputs
      </Button>{" "}
      {busy && (
        <Button
          type="button"
          variant="outline"
          onClick={() => control.current?.abort()}
        >
          Cancel
        </Button>
      )}
      {stage && <p role="status">{stage}</p>}
      {result && aggregate && (
        <>
          <p>
            {aggregate.model} · {aggregate.revision} ·{" "}
            {result.diagnostic.dtype.toUpperCase()} ·{" "}
            {result.diagnostic.device.toUpperCase()}
          </p>
          <p>Raw label mapping {JSON.stringify(result.diagnostic.labels)}</p>
          <p>
            Document estimate ={" "}
            {result.passages
              .reduce((sum, p) => sum + p.score * (p.end - p.start), 0)
              .toFixed(6)}{" "}
            ÷ {aggregate.eligible} = {(aggregate.score * 100).toFixed(4)}%
          </p>
          {result.exclusions.map((item) => (
            <p key={item.start}>
              Excluded {item.reason} · offsets {item.start}–{item.end}
            </p>
          ))}
          {result.passages.map((passage, index) => {
            const raw = result.diagnostic.raw[index];
            return (
              <details key={passage.start}>
                <summary>
                  Passage {index + 1} · {raw.tokens} tokens · AI{" "}
                  {(raw.ai * 100).toFixed(4)}%
                </summary>
                <p>
                  Offsets {passage.start}–{passage.end} ·{" "}
                  {passage.end - passage.start} UTF-16 units
                </p>
                <p>
                  Raw logits {JSON.stringify(raw.logits)} · Human{" "}
                  {(raw.human * 100).toFixed(4)}% · AI{" "}
                  {(raw.ai * 100).toFixed(4)}%
                </p>
                <pre
                  style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}
                >
                  {text.slice(passage.start, passage.end)}
                </pre>
              </details>
            );
          })}
        </>
      )}
    </details>
  );
}
