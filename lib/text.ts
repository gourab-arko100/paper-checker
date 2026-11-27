export type Span = { start: number; end: number };
export type Sentence = Span & { id: number; text: string };
export type Box = Span & { page: number; quad: number[] };
export type DocumentData = {
  name: string;
  type: "pdf" | "docx" | "txt" | "paste";
  text: string;
  hash: string;
  pages?: number;
  bytes?: ArrayBuffer;
  boxes: Box[];
};
export function sentences(text: string): Sentence[] {
  return Array.from(
    new Intl.Segmenter(undefined, { granularity: "sentence" }).segment(text),
    (part, id) => {
      const trimmed = part.segment.trim();
      const start = part.index + part.segment.indexOf(trimmed);
      return { id, start, end: start + trimmed.length, text: trimmed };
    },
  ).filter((part) => part.text);
}
export function words(text: string) {
  return (text.match(/\p{L}[\p{L}\p{M}\p{N}'’-]*|\p{N}+/gu) ?? []).length;
}
export function chunks(text: string, max: number) {
  if (text.length <= max) return text ? [{ text, offset: 0 }] : [];
  const result: { text: string; offset: number }[] = [];
  const boundaries = sentences(text).map((s) => s.end);
  let offset = 0,
    index = 0;
  while (offset < text.length) {
    let end = offset + max;
    if (end >= text.length) end = text.length;
    else {
      while (index < boundaries.length && boundaries[index] <= end) index++;
      const candidate = boundaries[index - 1] ?? 0;
      if (candidate > offset) end = candidate;
      else if (/[\uDC00-\uDFFF]/.test(text[end])) end--;
    }
    result.push({ text: text.slice(offset, end), offset });
    offset = end;
  }
  return result;
}
export function weightedScore(parts: { score: number; length: number }[]) {
  return (
    parts.reduce((sum, p) => sum + p.score * p.length, 0) /
    parts.reduce((sum, p) => sum + p.length, 0)
  );
}
export function locate(
  text: string,
  quote: string,
  start?: number,
  end?: number,
): Span | null {
  if (!quote) return null;
  if (
    start !== undefined &&
    end !== undefined &&
    start >= 0 &&
    end <= text.length &&
    text.slice(start, end) === quote
  )
    return { start, end };
  const first = text.indexOf(quote);
  if (first < 0 || text.indexOf(quote, first + 1) >= 0) return null;
  return { start: first, end: first + quote.length };
}
export function mappedBoxes(boxes: Box[], span: Span) {
  let low = 0,
    high = boxes.length;
  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    if (boxes[middle].start < span.start) low = middle + 1;
    else high = middle;
  }
  const matches: Box[] = [];
  for (
    let index = low;
    index < boxes.length && boxes[index].start < span.end;
    index++
  ) {
    if (boxes[index].end <= span.end) matches.push(boxes[index]);
  }
  return matches;
}
