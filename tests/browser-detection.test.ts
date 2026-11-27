import {
  detectionScope,
  detectorProbabilities,
  includedRanges,
} from "../lib/detection-scope";
import test from "node:test";
import assert from "node:assert/strict";
import {
  browserPassages,
  browserResult,
  nextPassage,
  detectorTokenLimit,
  desklibModel,
  desklibProbabilities,
  detectorModel,
} from "../lib/browser-detection";
import { hits } from "../lib/highlights";
import type { Scan } from "../lib/results";

test("token-aware passage splitting covers the entire source without cutting surrogate pairs", () => {
  const text =
    "An academic sentence has many words and a Unicode character. ".repeat(
      400,
    ) + "😀".repeat(2200);
  const count = (part: string) => [...part].length + 2;
  const slices: string[] = [];
  for (let start = 0; start < text.length; ) {
    const end = nextPassage(text, start, count);
    const part = text.slice(start, end);
    assert.ok(count(part) <= detectorTokenLimit);
    assert.doesNotMatch(part, /^[\uDC00-\uDFFF]|[\uD800-\uDBFF]$/);
    slices.push(part);
    start = end;
  }
  assert.equal(slices.join(""), text);
});

test("browser score is weighted, provenance is explicit, and passage highlights retain offsets", () => {
  const passages = [
    { start: 0, end: 3, score: 1 },
    { start: 3, end: 15, score: 0 },
  ];
  const ai = browserResult(passages, 15);
  assert.equal(ai?.source, "browser");
  assert.equal(ai?.score, 0.2);
  assert.deepEqual(
    hits({ ai, writing: null } as Scan).map(({ start, end, label }) => ({
      start,
      end,
      label,
    })),
    [{ start: 0, end: 3, label: "Passage estimate · 100%" }],
  );
  assert.equal(browserResult([{ start: 1, end: 15, score: 0.9 }], 15), null);
  assert.equal(browserResult([{ start: 0, end: 14, score: 0.9 }], 15), null);
  assert.equal(
    browserPassages.safeParse([{ start: 0, end: 1, score: 2 }]).success,
    false,
  );
});

test("raw TMR softmax uses index 1 for AI and rejects reversed labels", () => {
  const labels = { "0": "human", "1": "ai" };
  const logits = [-1.4669549465179443, 1.2581185102462769];
  const probabilities = detectorProbabilities(logits, labels);
  assert.ok(Math.abs(probabilities.ai - 0.9384900588415226) < 1e-12);
  assert.equal(probabilities.human + probabilities.ai, 1);
  assert.deepEqual(detectorProbabilities([1000, -1000], labels), {
    human: 1,
    ai: 0,
  });
  assert.throws(() =>
    detectorProbabilities(logits, { "0": "ai", "1": "human" }),
  );
});

test("body scope removes cover metadata, contents and references while retaining body and appendix offsets", () => {
  const body =
    "Introduction\nActual body text.\nStudent ID: 00001\nMore useful body text.\n";
  const appendix = "Appendix A\nAn appendix that contains substantive prose.";
  const text =
    "Paper proposal\nName: Student\nID: 00001\nCourse: Project\n\f\nTable of Contents\nIntroduction ..... 3\nReferences ..... 10\n\f\n" +
    body +
    "References\nExample Citation. 2020.\n" +
    appendix;
  const exclusions = detectionScope(text);
  assert.deepEqual(
    exclusions.map((item) => item.reason),
    ["cover page", "contents", "student information", "references"],
  );
  const included = includedRanges(text.length, exclusions)!;
  const kept = included
    .map((range) => text.slice(range.start, range.end))
    .join("");
  assert.ok(kept.includes("Actual body text.") && kept.includes(appendix));
  assert.doesNotMatch(kept, /00001|Example Citation|\.\.\.\.\./);
  const passages = included.map((range) => ({ ...range, score: 0.8 }));
  const result = browserResult(passages, text.length, exclusions);
  assert.equal(result?.eligible, kept.length);
  assert.deepEqual(
    hits({ ai: result, writing: null } as Scan).map(({ start, end }) =>
      text.slice(start, end),
    ),
    included.map(({ start, end }) => text.slice(start, end)),
  );
  assert.equal(browserResult([passages[0]], text.length, exclusions), null);
});

test("unlabeled prose on a short first page is retained", () => {
  const text =
    "Title only\nAn ordinary sentence about course design.\n\f\nMethodology\nThe body continues.";
  assert.deepEqual(detectionScope(text), []);
});


test("Desklib uses one sigmoid and rejects an invalid output", () => {
  assert.deepEqual(desklibProbabilities([0]), { ai: 0.5, human: 0.5 });
  assert.ok(desklibProbabilities([2]).ai > 0.85);
  assert.ok(desklibProbabilities([-2]).ai < 0.15);
  assert.throws(() => desklibProbabilities([0, 1]));
  assert.throws(() => desklibProbabilities([NaN]));
});

test("Desklib passage cutoff does not alter historical TMR highlighting", () => {
  const passages = [
    { start: 0, end: 4, score: 0.149 },
    { start: 4, end: 8, score: 0.15 },
    { start: 8, end: 12, score: 0.7 },
  ];
  const pilot = browserResult(passages, 12, [], "desklib");
  const tmr = browserResult(passages, 12, [], "tmr");
  assert.equal(pilot?.model, desklibModel);
  assert.equal(tmr?.model, detectorModel);
  assert.deepEqual(hits({ ai: pilot, writing: null } as Scan).map(({ start }) => start), [4, 8]);
  assert.deepEqual(hits({ ai: tmr, writing: null } as Scan).map(({ start }) => start), [8]);
});
