import { z } from "zod";
import { desklibModel, desklibThreshold, type browserResult } from "./browser-detection";
export const rubric = {
  grammar: "Grammar",
  mechanics: "Spelling & punctuation",
  tone: "Academic tone",
  readability: "Readability",
  vocabulary: "Vocabulary",
  structure: "Sentence structure",
  coherence: "Coherence",
  organization: "Document structure",
} as const;
const grade = z.number().int().min(0).max(100);
export const writingSchema = z.object({
  scores: z.object({
    grammar: grade,
    mechanics: grade,
    tone: grade,
    readability: grade,
    vocabulary: grade,
    structure: grade,
    coherence: grade,
    organization: grade,
  }),
  summary: z.string().max(4000),
  strengths: z.array(z.string().max(800)).max(20),
  weaknesses: z.array(z.string().max(800)).max(20),
  recommendations: z.array(z.string().max(800)).max(20),
  issues: z
    .array(
      z.object({
        original: z.string().min(1).max(1500),
        correction: z.string().max(1500),
        explanation: z.string().max(1000),
        category: z.enum([
          "grammar",
          "spelling",
          "punctuation",
          "tone",
          "clarity",
          "structure",
          "citation",
          "style",
        ]),
        severity: z.enum(["minor", "moderate", "major"]),
        sentenceId: z.number().int().nullable(),
        start: z.number().int().nullable(),
        end: z.number().int().nullable(),
      }),
    )
    .max(80),
});
export type Writing = Omit<z.infer<typeof writingSchema>, "issues"> & {
  score: number;
  model: string;
  issues: (Omit<
    z.infer<typeof writingSchema>["issues"][number],
    "start" | "end"
  > & { start?: number; end?: number })[];
};
export type SavedWriting = Pick<Writing, "score" | "scores" | "model"> & {
  issues: Pick<
    Writing["issues"][number],
    "category" | "severity" | "start" | "end"
  >[];
};
type HistoricalDetection = {
  source?: undefined;
  score: number;
  parts: number;
  lowConfidence: boolean;
  sentences: { score: number; start: number; end: number; id?: number }[];
};
type BrowserResult = NonNullable<ReturnType<typeof browserResult>>;
export type Detection =
  | HistoricalDetection
  | (Omit<BrowserResult, "method" | "exclusions" | "eligible"> &
      Partial<Pick<BrowserResult, "method" | "exclusions" | "eligible">>);

export function needsBrowserDetection(ai: Detection | null | undefined) {
  return !ai || (ai.source === "browser" && !ai.method);
}

export function detectionThreshold(ai: Detection | null | undefined) {
  return ai?.source === "browser" && ai.model === desklibModel
    ? desklibThreshold
    : 0.7;
}
export type Scan = {
  id: string;
  document_name: string;
  document_type: string;
  document_hash: string;
  text_hash?: string;
  page_count: number | null;
  word_count: number;
  character_count: number;
  created_at: string;
  processing_duration: number;
  ai_score: number | null;
  writing_score: number | null;
  ai: Detection | null;
  writing: SavedWriting | Writing | null;
  ai_error: string | null;
  writing_error: string | null;
  status: "complete" | "processing" | "failed" | "partial";
};
export const isDetailed = (writing: Scan["writing"]): writing is Writing =>
  Boolean(writing && "summary" in writing);
export const scorePercent = (score: number | null, scale = 1) =>
  score === null ? "—" : Math.round(score * scale) + "%";
export function metadataWriting(writing: Scan["writing"]): SavedWriting | null {
  if (!writing) return null;
  return {
    score: writing.score,
    scores: writing.scores,
    model: writing.model,
    issues: writing.issues.map(({ category, severity, start, end }) => ({
      category,
      severity,
      start,
      end,
    })),
  };
}
