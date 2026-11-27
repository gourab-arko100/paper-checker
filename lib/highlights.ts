import { scorePercent, detectionThreshold, type Scan } from "./results";
import type { Span } from "./text";
export const colors = {
  ai: [0.3, 0.72, 0.94],
  grammar: [1, 0.42, 0.48],
  writing: [0.98, 0.72, 0.24],
  academic: [0.68, 0.46, 0.94],
} as const;
export type Category = keyof typeof colors;
export type Hit = Span & { key: string; category: Category; label: string };
export function hits(scan: Scan): Hit[] {
  const scored =
    scan.ai?.source === "browser" ? scan.ai.passages : scan.ai?.sentences;
  return [
    ...(scored
      ?.filter((sentence) => sentence.score >= detectionThreshold(scan.ai))
      .map((item, index) => ({
        ...item,
        key: "ai-" + index,
        category: "ai" as const,
        label:
          (scan.ai?.source === "browser"
            ? "Passage estimate · "
            : "Historical estimate · ") + scorePercent(item.score, 100),
      })) ?? []),
    ...(scan.writing?.issues.flatMap((issue, index) =>
      issue.start === undefined || issue.end === undefined
        ? []
        : [
            {
              start: issue.start,
              end: issue.end,
              key: "issue-" + index,
              category: (["grammar", "spelling", "punctuation"].includes(
                issue.category,
              )
                ? "grammar"
                : ["tone", "clarity"].includes(issue.category)
                  ? "academic"
                  : "writing") as Category,
              label: issue.category + " · " + issue.severity,
            },
          ],
    ) ?? []),
  ];
}
