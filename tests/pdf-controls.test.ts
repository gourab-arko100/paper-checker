import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

test("embedded PDF reader has no nested form or implicit submit buttons", async () => {
  const file = new URL("../components/document-viewer.tsx", import.meta.url);
  const code = await readFile(file, "utf8");
  const source = ts.createSourceFile(
    "document-viewer.tsx",
    code,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
  let buttons = 0;
  let searchInput = false;
  function walk(node: ts.Node) {
    if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
      const tag = node.tagName.getText(source);
      assert.notEqual(tag, "form");
      const attributes = node.attributes.properties.filter(ts.isJsxAttribute);
      const get = (name: string) =>
        attributes.find((attribute) => attribute.name.getText(source) === name)
          ?.initializer;
      if (tag === "button") {
        buttons++;
        const type = get("type");
        assert.ok(type && ts.isStringLiteral(type) && type.text === "button");
      }
      if (
        tag === "input" &&
        get("aria-label")?.getText(source) === '"Search PDF text"'
      ) {
        searchInput = true;
        const keyHandler = get("onKeyDown")?.getText(source) ?? "";
        assert.match(keyHandler, /event.key !== "Enter"/);
        assert.match(keyHandler, /event.preventDefault\(\)[\s\S]*findNext\(\)/);
      }
    }
    ts.forEachChild(node, walk);
  }
  walk(source);
  assert.ok(buttons >= 9 && searchInput);
});
