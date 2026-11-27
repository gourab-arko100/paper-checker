import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { isDetailed, rubric, scorePercent, type Scan } from "./results";
import { colors, type Hit } from "./highlights";
import { mappedBoxes, type DocumentData } from "./text";
export async function summaryPdf(scan: Scan) {
  const document = await PDFDocument.create();
  const font = await document.embedFont(StandardFonts.Helvetica);
  const bold = await document.embedFont(StandardFonts.HelveticaBold);
  const safe = (text: string) =>
    Array.from(text, (char) => {
      try {
        font.encodeText(char);
        return char;
      } catch {
        return "?";
      }
    }).join("");
  let page = document.addPage([595, 842]),
    y = 782;
  function append(line: string, size = 11, heading = false) {
    const face = heading ? bold : font;
    const segments = safe(line).match(/\S+\s*|\s+/g) ?? [""];
    let row = "";
    const draw = (value: string) => {
      if (y < 58) {
        page = document.addPage([595, 842]);
        y = 782;
      }
      page.drawText(value, {
        x: 49,
        y,
        size,
        font: face,
        color: heading ? rgb(0.04, 0.39, 0.25) : rgb(0.11, 0.17, 0.14),
      });
      y -= size + 6;
    };
    for (const segment of segments) {
      if (face.widthOfTextAtSize(row + segment, size) > 490 && row) {
        draw(row.trimEnd());
        row = "";
      }
      if (face.widthOfTextAtSize(segment, size) > 490) {
        for (const char of segment) {
          if (face.widthOfTextAtSize(row + char, size) > 490) {
            draw(row);
            row = "";
          }
          row += char;
        }
      } else row += segment;
    }
    draw(row.trimEnd());
  }
  append("Paper Checker", 27, true);
  append("Academic writing analysis", 16, true);
  append(scan.document_name, 14, true);
  append(
    new Date(scan.created_at).toLocaleDateString("en", {
      dateStyle: "long",
      timeZone: "UTC",
    }),
  );
  append(
    scan.word_count +
      " words · " +
      scan.character_count +
      " characters · " +
      (scan.page_count ?? "Unknown") +
      " pages",
  );
  append("");
  append("AI detection estimate: " + scorePercent(scan.ai_score, 100), 14, true);
  if (scan.ai_error) append(scan.ai_error);
  if (scan.ai?.source === "browser") {
    append("Browser-generated and not independently verified by the server.");
    append(
      "Character-weighted estimate across " + scan.ai.parts + " passages.",
    );
  } else if (scan.ai) {
    append("Historical API result.");
    if (scan.ai.lowConfidence)
      append("The historical provider indicated low confidence.");
  }
  append("Writing quality: " + scorePercent(scan.writing_score), 14, true);
  if (scan.writing_error) append(scan.writing_error);
  if (scan.writing) {
    for (const [key, label] of Object.entries(rubric))
      append(
        label + ": " + scan.writing.scores[key as keyof typeof rubric] + "/100",
      );
    if (isDetailed(scan.writing)) {
      append("Summary", 14, true);
      append(scan.writing.summary);
      for (const [heading, items] of [
        ["Strengths", scan.writing.strengths],
        ["Weaknesses", scan.writing.weaknesses],
        ["Recommendations", scan.writing.recommendations],
      ] as const) {
        append(heading, 14, true);
        items.forEach((item) => append("• " + item));
      }
      append("Verified writing issues", 14, true);
      scan.writing.issues.forEach((issue) => {
        append(issue.category + " · " + issue.severity, 11, true);
        append("Original: " + issue.original);
        append("Suggested revision: " + issue.correction);
        append(issue.explanation);
      });
    } else append("Detailed feedback is unavailable in this saved report.");
  }
  append("Methodology and limitations", 14, true);
  append(
    "AI detection produces a probabilistic estimate. It does not measure the share of AI-written text. Human writing can be flagged and AI writing can be missed. Do not use the score as the sole basis for academic penalties.",
  );
  append(
    "Gemini scores writing against an academic rubric. The writing score is the average of the rubric scores and is independent of detection.",
  );
  return document.save();
}
export async function highlightedPdf(source: DocumentData, markers: Hit[]) {
  if (source.type !== "pdf" || !source.bytes)
    throw new Error("The original PDF is unavailable.");
  const doc = await PDFDocument.load(source.bytes);
  const pages = doc.getPages();
  for (const marker of markers) {
    const [r, g, b] = colors[marker.category];
    for (const box of mappedBoxes(source.boxes, marker)) {
      const [x, y, right, , , top] = box.quad;
      pages[box.page - 1]?.drawRectangle({
        x,
        y,
        width: right - x,
        height: top - y,
        color: rgb(r, g, b),
        opacity: 0.28,
      });
    }
  }
  return doc.save();
}
export function download(bytes: Uint8Array, name: string) {
  const url = URL.createObjectURL(
    new Blob([new Uint8Array(bytes)], { type: "application/pdf" }),
  );
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 2000);
}
