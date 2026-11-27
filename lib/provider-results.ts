import type { Scan } from "./results";

type Result<T> = { value: T | null; message: string | null };
type Job<T> = () => Promise<Result<T>>;

export function resolveAnalysisResults(
  existing: Pick<Scan, "ai" | "writing">,
  detect: Job<NonNullable<Scan["ai"]>>,
  assess: Job<NonNullable<Scan["writing"]>>,
) {
  return Promise.all([
    existing.ai ? { value: existing.ai, message: null } : detect(),
    existing.writing ? { value: existing.writing, message: null } : assess(),
  ] as const);
}
