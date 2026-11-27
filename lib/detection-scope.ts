import { z } from "zod";

export const exclusionSchema = z.object({
  start: z.number().int().nonnegative(),
  end: z.number().int().positive(),
  reason: z.enum([
    "cover page",
    "student information",
    "contents",
    "references",
  ]),
});
export type Exclusion = z.infer<typeof exclusionSchema>;

const coverSignal =
  /^(?:submitted (?:by|to)|student (?:id|name|number)|course (?:code|name)|instructor|supervisor|registration number|name|id|course|facilitated by)\s*[:#]/i;
const studentLine =
  /^(?:student (?:id|name|number)|registration number|matriculation number|submitted by)\s*[:#]\s*\S/i;
const bodyHeading =
  /^(?:\d+(?:\.\d+)*[.)]?\s+)?(?:abstract|introduction|background|literature review|methodology|methods|results|discussion|conclusion|appendix(?:\s+[a-z\d]+)?)\s*[:.]?$/i;
const contentsHeading = /^(?:table of contents|contents)\s*[:.]?$/i;
const referencesHeading =
  /^(?:references(?: cited)?|bibliography|works cited|literature cited|reference list)\s*[:.]?$/i;

export function detectionScope(text: string): Exclusion[] {
  const exclusions: Exclusion[] = [];
  const firstBreak = text.indexOf("\f");
  const firstPage = firstBreak < 0 ? "" : text.slice(0, firstBreak);
  const firstLines = firstPage
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const signals = firstLines.filter((line) => coverSignal.test(line)).length;
  if (
    firstLines.length > 0 &&
    firstLines.length <= 24 &&
    signals >= 2 &&
    firstPage.length <= 1800 &&
    !firstLines.some((line) =>
      /^(?:abstract|introduction|background)\b/i.test(line),
    )
  ) {
    exclusions.push({ start: 0, end: firstBreak + 1, reason: "cover page" });
  }

  let section: Exclusion | undefined;
  let contentsPageEnd = -1;
  for (const match of text.matchAll(/[^\r\n\f]+(?:\r\n|\n|\r)?/g)) {
    const start = match.index;
    const end = start + match[0].length;
    if (
      start < (exclusions[0]?.reason === "cover page" ? exclusions[0].end : 0)
    )
      continue;
    const line = match[0].trim();
    const heading = contentsHeading.test(line)
      ? "contents"
      : referencesHeading.test(line)
        ? "references"
        : null;
    const contentsEnds =
      section?.reason === "contents" &&
      ((contentsPageEnd >= 0 && contentsPageEnd < start) ||
        (line.length >= 90 && /[.!?]$/.test(line)));
    if (section && (heading || bodyHeading.test(line) || contentsEnds)) {
      exclusions.push({ ...section, end: start });
      section = undefined;
    }
    if (heading) {
      section = { start, end, reason: heading };
      if (heading === "contents") contentsPageEnd = text.indexOf("\f", start);
    } else if (!section && studentLine.test(line)) {
      exclusions.push({ start, end, reason: "student information" });
    }
  }
  if (section) exclusions.push({ ...section, end: text.length });
  // Avoid scoring an isolated separator between two excluded blocks.
  for (let i = 0; i < exclusions.length; i++) {
    const entry = exclusions[i];
    const before = exclusions[i - 1]?.end ?? 0;
    const after = exclusions[i + 1]?.start ?? text.length;
    while (entry.start > before && /\s/.test(text[entry.start - 1]))
      entry.start--;
    while (entry.end < after && /\s/.test(text[entry.end])) entry.end++;
  }
  return exclusions;
}

export function includedRanges(length: number, exclusions: Exclusion[]) {
  const ranges: { start: number; end: number }[] = [];
  let cursor = 0;
  for (const exclusion of exclusions) {
    if (
      exclusion.start < cursor ||
      exclusion.end <= exclusion.start ||
      exclusion.end > length
    )
      return null;
    if (exclusion.start > cursor)
      ranges.push({ start: cursor, end: exclusion.start });
    cursor = exclusion.end;
  }
  if (cursor < length) ranges.push({ start: cursor, end: length });
  return ranges;
}

export function detectorProbabilities(
  logits: readonly number[],
  labels: Record<string, string> | undefined,
) {
  if (
    labels?.["0"] !== "human" ||
    labels["1"] !== "ai" ||
    logits.length !== 2 ||
    !logits.every(Number.isFinite)
  ) {
    throw new Error("Unexpected detector labels or logits.");
  }
  const peak = Math.max(logits[0], logits[1]);
  const human = Math.exp(logits[0] - peak);
  const ai = Math.exp(logits[1] - peak);
  return { human: human / (human + ai), ai: ai / (human + ai) };
}
