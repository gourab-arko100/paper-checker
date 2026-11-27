import type { Box, DocumentData } from "./text";
import { layoutPage } from "./pdf-layout";
const MAX_FILE_BYTES = 32 * 1024 * 1024;
const MAX_EXPANDED_DOCX = 64 * 1024 * 1024;
const MAX_TEXT = 2_000_000;
export async function sha256(data: ArrayBuffer | string) {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    typeof data === "string" ? new TextEncoder().encode(data) : data,
  );
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}
function validateDocx(buffer: ArrayBuffer) {
  if (buffer.byteLength < 22)
    throw new Error("The Word package is incomplete.");
  const data = new DataView(buffer);
  const bytes = new Uint8Array(buffer);
  let index = buffer.byteLength - 22;
  while (
    index >= Math.max(0, buffer.byteLength - 65557) &&
    data.getUint32(index, true) !== 0x06054b50
  )
    index--;
  if (index < 0 || data.getUint32(index, true) !== 0x06054b50)
    throw new Error("The Word package is incomplete.");
  const entries = data.getUint16(index + 10, true);
  let cursor = data.getUint32(index + 16, true),
    total = 0;
  const names = new Set<string>();
  for (let i = 0; i < entries; i++) {
    if (cursor + 46 > index || data.getUint32(cursor, true) !== 0x02014b50)
      throw new Error("The Word package is malformed.");
    total += data.getUint32(cursor + 24, true);
    const nameLength = data.getUint16(cursor + 28, true);
    const name = new TextDecoder().decode(
      bytes.subarray(cursor + 46, cursor + 46 + nameLength),
    );
    if (
      name.split("/").includes("..") ||
      name.startsWith("/") ||
      name.includes("\\") ||
      data.getUint16(cursor + 8, true) & 1
    )
      throw new Error("The Word package contains unsupported entries.");
    names.add(name);
    cursor +=
      46 +
      nameLength +
      data.getUint16(cursor + 30, true) +
      data.getUint16(cursor + 32, true);
  }
  if (total > MAX_EXPANDED_DOCX)
    throw new Error(
      "This Word file expands beyond the browser processing limit.",
    );
  if (!names.has("[Content_Types].xml") || !names.has("word/document.xml"))
    throw new Error("Choose a valid .docx document.");
}
function validateText(text: string) {
  if (!text.trim() || !/\p{L}|\p{N}/u.test(text))
    throw new Error("No usable text was found in this document.");
  if (text.length > MAX_TEXT)
    throw new Error(
      "This document exceeds the current text processing capacity.",
    );
}
export async function fromPaste(text: string): Promise<DocumentData> {
  validateText(text);
  return {
    name: "Pasted text",
    type: "paste",
    text,
    hash: await sha256(text),
    boxes: [],
  };
}
export async function extract(
  file: File,
  onProgress?: (message: string) => void,
): Promise<DocumentData> {
  if (!file.size || file.size > MAX_FILE_BYTES)
    throw new Error("Choose a non-empty document no larger than 32 MiB.");
  const bytes = await file.arrayBuffer();
  const signature = new Uint8Array(bytes, 0, Math.min(1024, bytes.byteLength));
  const header = new TextDecoder().decode(signature);
  const suffix = file.name.toLowerCase().split(".").at(-1);
  const hash = await sha256(bytes);
  const boxes: Box[] = [];
  if (suffix === "pdf") {
    if (
      !header.startsWith("%PDF-") ||
      (file.type &&
        !["application/pdf", "application/octet-stream"].includes(file.type))
    )
      throw new Error("The file signature or content type is invalid for PDF.");
    const { pdfjs } = await import("react-pdf");
    pdfjs.GlobalWorkerOptions.workerSrc = new URL(
      "pdfjs-dist/build/pdf.worker.min.mjs",
      import.meta.url,
    ).toString();
    const task = pdfjs.getDocument({
      data: new Uint8Array(bytes.slice(0)),
      isEvalSupported: false,
      useSystemFonts: true,
      enableXfa: false,
    });
    try {
      const pdf = await task.promise;
      let text = "";
      for (let page = 1; page <= pdf.numPages; page++) {
        onProgress?.("Extracting page " + page + " of " + pdf.numPages);
        const source = await pdf.getPage(page);
        const content = await source.getTextContent();
        const result = layoutPage(
          content.items.filter((item) => "str" in item),
          page,
          source.view[2] - source.view[0],
          text.length,
          content.styles,
        );
        text += result.text;
        boxes.push(...result.boxes);
        if (page < pdf.numPages) text += "\n\n\f\n\n";
        if (text.length > MAX_TEXT) validateText(text);
        source.cleanup();
      }
      if (!/\p{L}|\p{N}/u.test(text))
        throw new Error(
          "This PDF has no usable text layer. Use a searchable PDF or paste text extracted with OCR.",
        );
      validateText(text);
      return {
        type: "pdf",
        name: file.name,
        bytes,
        hash,
        pages: pdf.numPages,
        text,
        boxes,
      };
    } catch (error) {
      if (error instanceof Error && error.name === "PasswordException")
        throw new Error("Unlock the PDF before uploading it.");
      if (error instanceof Error && error.name === "InvalidPDFException")
        throw new Error("This PDF appears to be corrupted.");
      throw error;
    } finally {
      await task.destroy();
    }
  }
  if (suffix === "docx") {
    if (
      signature[0] !== 0x50 ||
      signature[1] !== 0x4b ||
      (file.type &&
        ![
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
          "application/octet-stream",
          "application/zip",
        ].includes(file.type))
    )
      throw new Error(
        "The file signature or content type is invalid for DOCX.",
      );
    validateDocx(bytes);
    const mammoth = await import("mammoth");
    const { value: text } = await mammoth.extractRawText({
      arrayBuffer: bytes,
    });
    validateText(text);
    return { type: "docx", name: file.name, bytes, hash, text, boxes };
  }
  if (suffix === "txt") {
    if (
      file.type &&
      !["text/plain", "application/octet-stream"].includes(file.type)
    )
      throw new Error("The file content type is invalid for TXT.");
    let text: string;
    try {
      text = new TextDecoder("utf-8", { fatal: true })
        .decode(bytes)
        .replace(/\r\n?/g, "\n");
    } catch {
      throw new Error("Save the text file as UTF-8 and try again.");
    }
    if (/[\x00-\x08\x0B\x0E-\x1F]/.test(text))
      throw new Error("The file contains binary data.");
    validateText(text);
    return { type: "txt", name: file.name, bytes, hash, text, boxes };
  }
  throw new Error("Choose a PDF, DOCX or TXT file.");
}
