import { AutoTokenizer } from "@huggingface/transformers";
import { InferenceSession, Tensor, env } from "onnxruntime-web/wasm";
import {
  desklibExport,
  desklibProbabilities,
  desklibRevision,
  detectorTokenLimit,
  nextPassage,
  type BrowserPassage,
  type DetectionProgress,
  type Diagnostics,
} from "./browser-detection";

const assetBytes = 476_838_170;
const weightsUrl = `https://huggingface.co/${desklibExport}/resolve/${desklibRevision}/onnx/model_quantized.onnx`;
const cacheFile = `paper-checker-desklib-${desklibRevision}.onnx`;
type Progress = (reply: DetectionProgress) => void;

export class DesklibStorageError extends Error {}

async function downloadWeights(progress: Progress) {
  progress({ kind: "progress", message: "Downloading Desklib weights (477 MB)…" });
  const response = await fetch(weightsUrl);
  if (!response.ok || !response.body) throw new Error("Model download failed.");
  let loaded = 0;
  let last = -1;
  return response.body.pipeThrough(new TransformStream<Uint8Array, Uint8Array>({
    transform(chunk, controller) {
      loaded += chunk.length;
      const percent = Math.min(100, Math.floor(loaded / assetBytes * 100));
      if (last !== percent) {
        last = percent;
        progress({ kind: "progress", message: `Downloading Desklib weights ${percent}%` });
      }
      controller.enqueue(chunk);
    },
    flush() {
      if (loaded !== assetBytes) throw new Error("Incomplete model download.");
    },
  }));
}

async function modelBytes(progress: Progress) {
  const root = await navigator.storage?.getDirectory?.().catch(() => undefined);
  if (!root) {
    progress({ kind: "progress", message: "Persistent model storage is unavailable in this browser." });
    return new Response(await downloadWeights(progress)).arrayBuffer();
  }

  // Write to the origin-private filesystem without buffering a second copy.
  // The browser commits the file only after the complete stream closes.
  const getModelFile = async () => {
    const handle = await root.getFileHandle(cacheFile, { create: true })
      .catch(() => { throw new DesklibStorageError(); });
    const stored = await handle.getFile();
    if (stored.size === assetBytes) {
      progress({ kind: "progress", message: "Reading cached Desklib model…" });
      return stored;
    }
    const stream = await downloadWeights(progress);
    const writer = await handle.createWritable().catch(async () => {
      await stream.cancel();
      throw new DesklibStorageError();
    });
    try {
      await stream.pipeTo(writer);
    } catch (error) {
      if (error instanceof DOMException && error.name === "QuotaExceededError")
        throw new DesklibStorageError();
      throw error;
    }
    return handle.getFile();
  };
  const file = navigator.locks
    ? await navigator.locks.request(cacheFile, getModelFile)
    : await getModelFile();
  return file.arrayBuffer();
}

async function loadSession(progress: Progress) {
  const bytes = await modelBytes(progress);
  progress({ kind: "progress", message: "Initializing Desklib in the browser…" });
  env.wasm.numThreads = 1;
  env.wasm.wasmPaths = "https://cdn.jsdelivr.net/npm/onnxruntime-web@1.31.1/dist/";
  return InferenceSession.create(bytes, {
    executionProviders: ["wasm"],
    graphOptimizationLevel: "disabled",
    enableCpuMemArena: false,
    enableMemPattern: false,
  });
}

export async function inferDesklib(
  text: string,
  ranges: { start: number; end: number }[],
  debug: boolean,
  progress: Progress,
) {
  const tokenizer = await AutoTokenizer.from_pretrained(desklibExport, {
    revision: desklibRevision,
  });
  const session = await loadSession(progress);
  try {
    const passages: BrowserPassage[] = [];
    const raw: Diagnostics["raw"] = [];
    const total = ranges.reduce((sum, range) => sum + range.end - range.start, 0);
    let checked = 0;
    for (const range of ranges) {
      const segment = text.slice(range.start, range.end);
      for (let at = 0; at < segment.length;) {
        const stop = nextPassage(segment, at, (part) =>
          tokenizer.encode(part, { add_special_tokens: true }).length);
        const inputs = tokenizer(segment.slice(at, stop), { truncation: false });
        const tokens = inputs.input_ids.dims.at(-1) ?? 0;
        if (!tokens || tokens > detectorTokenLimit) throw new Error("Unexpected token count.");
        const feeds = Object.fromEntries(session.inputNames.map((name) => {
          const input = inputs[name];
          if (!input || !(input.data instanceof BigInt64Array))
            throw new Error("Unexpected model input.");
          return [name, new Tensor("int64", input.data, input.dims)];
        }));
        try {
          const outputs = await session.run(feeds);
          try {
            const logits = Array.from(outputs[session.outputNames[0]].data, Number);
            const probability = desklibProbabilities(logits);
            passages.push({ start: range.start + at, end: range.start + stop, score: probability.ai });
            if (debug) raw.push({ logits, ...probability, tokens });
          } finally {
            Object.values(outputs).forEach((output) => output.dispose());
          }
        } finally {
          Object.values(feeds).forEach((input) => input.dispose());
        }
        checked += stop - at;
        at = stop;
        progress({ kind: "progress", message: `Checking passages ${Math.floor(checked / total * 100)}%` });
      }
    }
    const diagnostic: Diagnostics | undefined = debug
      ? { labels: { "0": "single AI logit (apply sigmoid)" }, device: "wasm", dtype: "q8", raw }
      : undefined;
    return { passages, diagnostic };
  } finally {
    await session.release();
  }
}
