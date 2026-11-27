import type {
  DetectionError,
  DetectionReply,
  BrowserDetection,
  Diagnostics,
  DiagnosticMode,
} from "./browser-detection";

export function detectInBrowser(
  text: string,
  onStage: (message: string) => void,
  signal?: AbortSignal,
  diagnostic?: DiagnosticMode,
): Promise<
  (BrowserDetection & { diagnostic?: Diagnostics }) | { error: DetectionError }
> {
  return new Promise((resolve) => {
    if (signal?.aborted) {
      resolve({ error: "cancelled" });
      return;
    }
    if (typeof Worker === "undefined" || typeof WebAssembly === "undefined") {
      resolve({ error: "unsupported" });
      return;
    }
    let worker: Worker;
    try {
      worker = new Worker(new URL("./detector.worker.ts", import.meta.url), {
        type: "module",
      });
    } catch {
      resolve({ error: "unsupported" });
      return;
    }
    const finish = (
      result:
        | (BrowserDetection & { diagnostic?: Diagnostics })
        | { error: DetectionError },
    ) => {
      signal?.removeEventListener("abort", cancel);
      worker.terminate();
      resolve(result);
    };
    const cancel = () => finish({ error: "cancelled" });
    signal?.addEventListener("abort", cancel, { once: true });
    worker.onmessage = ({ data }: MessageEvent<DetectionReply>) => {
      if (data.kind === "progress") onStage(data.message);
      else if (data.kind === "success") finish(data);
      else finish({ error: data.code });
    };
    worker.onerror = () => finish({ error: "unavailable" });
    worker.onmessageerror = () => finish({ error: "unavailable" });
    worker.postMessage({ text, diagnostic });
  });
}
