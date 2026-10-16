import assert from "node:assert/strict";
import test from "node:test";
import { getSchema } from "@tiptap/core";
import { MarkdownManager } from "@tiptap/markdown";
import { richMarkdownExtensions, mapTextOffset, preserveMarkdownBoundary } from "../src/lib/richMarkdown.js";
import { visualMarkdownBlocks } from "../src/lib/visualMarkdown.js";

const manager = () => new MarkdownManager({ extensions: richMarkdownExtensions() });
test("rich Markdown parses headings, marks, lists, code and tables as editable nodes", () => {
  const markdown = "# test\n\n**加粗** 与 *倾斜*\n\n- 第一项\n- 第二项\n\n> 引用\n\n```js\nconst x = 1;\n```\n\n| 名称 | 数量 |\n| --- | --- |\n| 书 | 2 |";
  const engine = manager(); const doc = engine.parse(markdown);
  const types = JSON.stringify(doc);
  for (const name of ["heading", "bold", "italic", "bulletList", "blockquote", "codeBlock", "table"]) assert.ok(types.includes(`"${name}"`), name);
  const result = engine.serialize(doc);
  assert.match(result, /# test/); assert.match(result, /const x = 1;/); assert.match(result, /名称/);
});
test("advanced Markdown survives a rich parse and serialize round trip", () => {
  const markdown = "## 公式与脚注\n\n正文 $E=mc^2$ 和注释[^1]。\n\n$$\n\\frac{a}{b}\n$$\n\n[^1]: 不要丢失这段脚注。\n\n<div data-test=\"keep\">原始 HTML</div>\n\n![外链](https://example.com/photo.png)";
  const engine = manager(); const result = engine.serialize(engine.parse(markdown));
  for (const text of ["$E=mc^2$", "[^1]", "\\frac{a}{b}", "[^1]: 不要丢失这段脚注。", '<div data-test="keep">原始 HTML</div>', "![外链](https://example.com/photo.png)"]) assert.ok(result.includes(text), `${text}\n${result}`);
});
test("image splitting keeps tokens inside fenced and inline code as text", () => {
  const markdown = "```text\n[[ym-media:1]]\n```\n\n`[[ym-media:2]]`\n\n[[ym-media:3]]\n\n最后一段";
  const blocks = visualMarkdownBlocks(markdown);
  assert.deepEqual(blocks.filter((block) => block.type === "media").map((block) => block.mediaId), [3]);
  assert.equal(blocks.map((block) => block.value ?? block.token).join(""), markdown);
});
test("selection mapping and image-boundary whitespace preserve insertion positions", () => {
  assert.equal(mapTextOffset("## 标题", "\n\n## 标题\n\n", 3), 5);
  assert.equal(mapTextOffset("abc", "aXYZbc", 2), 5);
  assert.equal(preserveMarkdownBoundary("\n\n旧段落\n\n", "新段落"), "\n\n新段落\n\n");
});

test("a new rich document starts with an editable paragraph", () => {
  const document = getSchema(richMarkdownExtensions()).nodes.doc.createAndFill();
  assert.equal(document.firstChild.type.name, "paragraph");
});

test("code samples containing backtick fences remain one intact code block", () => {
  const engine = manager();
  const markdown = "````markdown\n```js\nconst x = 1;\n```\n````";
  const first = engine.parse(markdown);
  const serialized = engine.serialize(first);
  const second = engine.parse(serialized);
  assert.equal(second.content[0].type, "codeBlock");
  assert.deepEqual(second.content[0].content, first.content[0].content);
});

test("media and text share one document without spacer paragraphs", () => {
  const engine = manager();
  const source = "开头\n\n[[ym-media:7]]\n\n[[ym-media:8]]\n\n结尾";
  const doc = engine.parse(source);
  assert.deepEqual(doc.content.map((node) => node.type), ["paragraph", "internalMedia", "internalMedia", "paragraph"]);
  assert.equal(engine.serialize(doc), source);
  // Older documents can have media tokens without paragraph separators.
  assert.deepEqual(engine.parse("甲[[ym-media:7]]乙").content.map((node) => node.type), ["paragraph", "internalMedia", "paragraph"]);
  getSchema(richMarkdownExtensions()).nodeFromJSON(doc).check();
});

test("real media nodes leave code examples and advanced Markdown intact", () => {
  const engine = manager();
  const source = "`text [[ym-media:1]]`\n\n````md\n```\n[[ym-media:2]]\n```\n````\n\n[[ym-media:3]]\n\n正文 $x^2$。";
  const doc = engine.parse(source);
  assert.deepEqual(doc.content.filter((node) => node.type === "internalMedia").map((node) => node.attrs.mediaId), [3]);
  assert.equal(engine.serialize(doc), source);
  getSchema(richMarkdownExtensions()).nodeFromJSON(doc).check();
});
