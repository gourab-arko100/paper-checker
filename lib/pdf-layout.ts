import type { Box } from "./text";
export type PositionedRun = {
  str: string;
  transform: number[];
  width: number;
  height: number;
  dir: string;
  hasEOL: boolean;
  fontName?: string;
};
type Line = {
  runs: PositionedRun[];
  y: number;
  left: number;
  right: number;
  height: number;
};
function lines(runs: PositionedRun[]): Line[] {
  const rows: Line[] = [];
  for (const run of runs.toSorted(
    (a, b) =>
      b.transform[5] - a.transform[5] || a.transform[4] - b.transform[4],
  )) {
    const x = run.transform[4],
      y = run.transform[5];
    const row = rows.at(-1);
    if (row && Math.abs(row.y - y) <= Math.max(2, run.height * 0.31)) {
      row.runs.push(run);
      row.left = Math.min(row.left, x);
      row.right = Math.max(row.right, x + run.width);
      row.height = Math.max(row.height, run.height);
    } else
      rows.push({
        runs: [run],
        y,
        left: x,
        right: x + run.width,
        height: run.height,
      });
  }
  return rows;
}
export function layoutPage(
  runs: PositionedRun[],
  page: number,
  width: number,
  textOffset = 0,
  fonts: Record<string, { ascent: number; descent: number }> = {},
) {
  const visible = runs.filter((run) => run.str.trim());
  const middle = width * 0.51,
    gutter = width * 0.017;
  const left: PositionedRun[] = [],
    right: PositionedRun[] = [],
    spanning: PositionedRun[] = [];
  for (const run of visible) {
    if (run.transform[4] + run.width < middle - gutter) left.push(run);
    else if (run.transform[4] > middle + gutter) right.push(run);
    else spanning.push(run);
  }
  const leftRows = lines(left),
    rightRows = lines(right),
    spanningRows = lines(spanning);
  const sameColumnRange =
    leftRows.length > 0 &&
    rightRows.length > 0 &&
    Math.min(leftRows[0].y, rightRows[0].y) >
      Math.max(leftRows.at(-1)!.y, rightRows.at(-1)!.y);
  const twoColumns =
    sameColumnRange &&
    leftRows.length >= 5 &&
    rightRows.length >= 5 &&
    spanningRows.length < Math.min(leftRows.length, rightRows.length) / 2;
  const columns: Line[][] = twoColumns ? [] : [lines(visible)];
  if (twoColumns) {
    let ceiling = Infinity;
    for (const separator of spanningRows) {
      columns.push(
        leftRows.filter((row) => row.y <= ceiling && row.y > separator.y + 2),
        rightRows.filter((row) => row.y <= ceiling && row.y > separator.y + 2),
        [separator],
      );
      ceiling = separator.y + 2;
    }
    columns.push(
      leftRows.filter((row) => row.y <= ceiling),
      rightRows.filter((row) => row.y <= ceiling),
    );
  }
  let text = "";
  const boxes: Box[] = [];
  for (const column of columns.filter((column) => column.length)) {
    if (text) text += "\n\n";
    let previous: Line | undefined;
    for (const line of column) {
      if (previous)
        text +=
          previous.y - line.y > Math.max(line.height, previous.height) * 1.65 ||
          Math.abs(previous.height - line.height) > 3
            ? "\n\n"
            : "\n";
      const rtl =
        line.runs.filter((run) => run.dir === "rtl").length >
        line.runs.length / 2;
      const ordered = line.runs.toSorted(
        (a, b) => (a.transform[4] - b.transform[4]) * (rtl ? -1 : 1),
      );
      let prior: PositionedRun | undefined;
      for (const run of ordered) {
        const [a, b, c, d, x, y] = run.transform;
        const gap = prior
          ? rtl
            ? prior.transform[4] - x - run.width
            : x - prior.transform[4] - prior.width
          : 0;
        if (
          prior &&
          (/\s$/.test(prior.str) ||
            /^\s/.test(run.str) ||
            gap > Math.max(0.7, run.height * 0.11))
        )
          text += " ";
        const start = textOffset + text.length;
        text += run.str.trim();
        if (
          !rtl &&
          a > 0 &&
          Math.abs(b) < 0.01 &&
          Math.abs(c) < 0.01 &&
          d > 0 &&
          run.width > 0 &&
          run.height > 0 &&
          run.str === run.str.trim()
        ) {
          const font = run.fontName ? fonts[run.fontName] : undefined;
          const ascent =
            font && Number.isFinite(font.ascent) && font.ascent > 0
              ? font.ascent
              : 0.81;
          const descent =
            font && Number.isFinite(font.descent) && font.descent <= 0
              ? font.descent
              : -0.19;
          const low = y + run.height * descent,
            high = y + run.height * ascent;
          boxes.push({
            page,
            start,
            end: textOffset + text.length,
            quad: [x, low, x + run.width, low, x + run.width, high, x, high],
          });
        }
        prior = run;
      }
      previous = line;
    }
  }
  return { text, boxes };
}
