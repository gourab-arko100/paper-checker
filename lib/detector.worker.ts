import {
  env,
  pipeline,
  type TextClassificationPipeline,
} from "@huggingface/transformers";
import { DesklibStorageError, inferDesklib } from "./desklib.worker-runtime";
import {
  detectorModel,
  detectorRevision,
  nextPassage,
  type BrowserPassage,
  type DetectionReply,
  type Diagnostics,
  type DiagnosticMode,
} from "./browser-detection";

import {
  detectionScope,
  detectorProbabilities,
  includedRanges,
} from "./detection-scope";

env.allowLocalModels = false;
env.useBrowserCache = true;
// A dedicated worker already keeps the UI responsive. Avoid nested ORT worker threads.
if (env.backends.onnx.wasm) env.backends.onnx.wasm.numThreads = 1;

function send(reply: DetectionReply) {
  self.postMessage(reply);
}
async function load(device: "webgpu" | "wasm", dtype: Diagnostics["dtype"]) {
  send({
    kind: "progress",
    message: "Loading browser detector (" + device.toUpperCase() + ")…",
  });
  return pipeline("text-classification", detectorModel, {
    revision: detectorRevision,
    device,
    dtype,
    progress_callback: (event) => {
      if (
        event.status === "progress" &&
        event.file.endsWith(".onnx") &&
        Number.isFinite(event.progress)
      ) {
        send({
          kind: "progress",
          message:
            "Downloading model weights " + Math.round(event.progress) + "%",
        });
      }
    },
  });
}

let classifier: TextClassificationPipeline | undefined;
let active = false;
self.addEventListener(
  "message",
  async ({
    data,
  }: MessageEvent<{ text: string; diagnostic?: DiagnosticMode }>) => {
    if (active) return;
    active = true;
    try {
      if (typeof WebAssembly === "undefined") {
        send({ kind: "error", code: "unsupported" });
        return;
      }
      const text = data.text;
      const debug =
        process.env.NODE_ENV === "development" ? data.diagnostic : undefined;
      const exclusions = detectionScope(text);
      const ranges = includedRanges(text.length, exclusions) ?? [];
      if (
        !ranges.some((range) =>
          /[\p{L}\p{N}]/u.test(text.slice(range.start, range.end)),
        )
      ) {
        send({ kind: "error", code: "no_prose" });
        return;
      }
      if (!debug || debug === "auto") {
        const memory = (navigator as Navigator & { deviceMemory?: number }).deviceMemory;
        if (memory !== undefined && memory < 4) {
          send({ kind: "error", code: "low_memory" });
          return;
        }
        const result = await inferDesklib(text, ranges, Boolean(debug), send);
        send({ kind: "success", detector: "desklib", exclusions, ...result });
        return;
      }
      const device = "wasm" as const;
      const dtype: Diagnostics["dtype"] =
        debug === "tmr-q4" ? "q4" : debug === "tmr-fp32" ? "fp32" : "q8";
      const infer = async (model: TextClassificationPipeline) => {
        const passages: BrowserPassage[] = [];
        const raw: Diagnostics["raw"] = [];
        const config = model.model.config as {
          id2label?: Record<string, string>;
        };
        const labels = config.id2label;
        for (const range of ranges) {
          const segment = text.slice(range.start, range.end);
          for (let at = 0; at < segment.length; ) {
            const stop = nextPassage(
              segment,
              at,
              (part) =>
                model.tokenizer.encode(part, { add_special_tokens: true })
                  .length,
            );
            const inputs = model.tokenizer(segment.slice(at, stop), {
              truncation: false,
            });
            const tokens = inputs.input_ids.dims.at(-1) ?? 0;
            if (!tokens || tokens > 512)
              throw new Error("Unexpected token count.");
            const output = await model.model(inputs);
            const logits = Array.from(output.logits.data, Number);
            const probability = detectorProbabilities(logits, labels);
            passages.push({
              start: range.start + at,
              end: range.start + stop,
              score: probability.ai,
            });
            if (debug) raw.push({ logits, ...probability, tokens });
            at = stop;
            send({
              kind: "progress",
              message:
                "Checking passages " +
                Math.floor(((range.start + stop) / text.length) * 100) +
                "%",
            });
          }
        }
        const diagnostic =
          debug && labels ? { labels, device, dtype, raw } : undefined;
        return { passages, diagnostic };
      };
      classifier = await load(device, dtype);
      const result = await infer(classifier);
      send({ kind: "success", detector: "tmr", exclusions, ...result });
    } catch (error) {
      const code = error instanceof DesklibStorageError ? "storage"
        : error instanceof RangeError && /memory|allocation|array buffer/i.test(error.message) ? "low_memory"
        : "unavailable";
      send({ kind: "error", code });
    } finally {
      await classifier?.dispose().catch(() => undefined);
      classifier = undefined;
      active = false;
    }
  },
);
