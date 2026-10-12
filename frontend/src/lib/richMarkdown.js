import { Node } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import CodeBlock from "@tiptap/extension-code-block";
import { Markdown } from "@tiptap/markdown";
import { TableKit } from "@tiptap/extension-table";
import TaskList from "@tiptap/extension-task-list";
import TaskItem from "@tiptap/extension-task-item";
import diff from "fast-diff";

const RawBlock = Node.create({
  name: "rawMarkdownBlock", group: "block", atom: true, priority: 50,
  addAttributes: () => ({ source: { default: "" } }),
  parseHTML: () => [{ tag: "pre[data-raw-markdown]", getAttrs: (element) => ({ source: element.textContent }) }],
  renderHTML: ({ node }) => ["pre", { "data-raw-markdown": "", class: "rich-raw-block", title: "可在 Markdown 源码中编辑此内容" }, ["code", {}, node.attrs.source]],
  markdownTokenName: "rawMarkdownBlock",
  parseMarkdown: (token) => ({ type: "rawMarkdownBlock", attrs: { source: token.text } }),
  renderMarkdown: (node) => node.attrs.source,
  markdownTokenizer: {
    name: "rawMarkdownBlock", level: "block",
    start: (src) => src.search(/^(?:\$\$|\\\[|\[\^[^\]\n]+\]:|[ \t]*<(?=[\w/!]))/m),
    tokenize: (src) => {
      const match = src.match(/^(?:\$\$[\s\S]*?\$\$|\\\[[\s\S]*?\\\])(?:\n|$)/)
        || src.match(/^\[\^[^\]\n]+\]:[^\n]*(?:\n(?:[ \t]{2,}[^\n]*|[ \t]*$))*/)
        || src.match(/^[ \t]*<(?:[\w/!][\s\S]*?)(?:\n\s*\n|$)/);
      return match ? { type: "rawMarkdownBlock", raw: match[0], text: match[0].trimEnd() } : undefined;
    },
  },
});
const RawInline = Node.create({
  name: "rawMarkdownInline", group: "inline", inline: true, atom: true, priority: 1100,
  addAttributes: () => ({ source: { default: "" } }),
  parseHTML: () => [{ tag: "span[data-raw-markdown]", getAttrs: (element) => ({ source: element.textContent }) }],
  renderHTML: ({ node }) => ["span", { "data-raw-markdown": "", class: "rich-raw-inline", title: "可在 Markdown 源码中编辑此内容" }, node.attrs.source],
  markdownTokenName: "rawMarkdownInline",
  parseMarkdown: (token) => ({ type: "rawMarkdownInline", attrs: { source: token.text } }),
  renderMarkdown: (node) => node.attrs.source,
  markdownTokenizer: {
    name: "rawMarkdownInline", level: "inline",
    start: (src) => src.search(/\$|\[\^|\\\(|<(?=[\w/!])/),
    tokenize: (src) => {
      const match = src.match(/^(?:\$(?!\$)(?:\\.|[^$\n])+?\$|\[\^[^\]\n]+\]|\\\([\s\S]*?\\\)|<[^>\n]+>)/);
      return match ? { type: "rawMarkdownInline", raw: match[0], text: match[0] } : undefined;
    },
  },
});
const ExternalImage = Node.create({
  name: "markdownImage", group: "inline", inline: true, atom: true,
  addAttributes: () => ({ source: { default: "" } }),
  parseHTML: () => [{ tag: "span[data-markdown-image]", getAttrs: (element) => ({ source: element.textContent }) }],
  renderHTML: ({ node }) => ["span", { "data-markdown-image": "", class: "rich-raw-inline", title: "外链图片：可在源码中编辑" }, node.attrs.source],
  markdownTokenName: "image",
  parseMarkdown: (token) => ({ type: "markdownImage", attrs: { source: token.raw || `![${token.text || ""}](${token.href || ""})` } }),
  renderMarkdown: (node) => node.attrs.source,
});

const SafeCodeBlock = CodeBlock.extend({
  renderMarkdown(node, helpers) {
    const content = helpers.renderChildren(node.content || []);
    const longest = (content.match(/`+/g) || []).reduce((length, run) => Math.max(length, run.length), 0);
    const fence = "`".repeat(Math.max(3, longest + 1));
    return `${fence}${node.attrs?.language || ""}\n${content}\n${fence}`;
  },
});

export function richMarkdownExtensions() {
  return [
    StarterKit.configure({ heading: { levels: [1, 2, 3, 4, 5, 6] }, link: { openOnClick: false, autolink: false }, underline: false, codeBlock: false }), SafeCodeBlock,
    TableKit.configure({ table: { resizable: false, renderWrapper: true } }), TaskList, TaskItem.configure({ nested: true }),
    RawBlock, RawInline, ExternalImage, Markdown,
  ];
}

export function mapTextOffset(from, to, offset) {
  const position = Math.max(0, Math.min(Number(offset) || 0, from.length));
  if (from === to) return position;
  let oldIndex = 0; let newIndex = 0;
  for (const [kind, text] of diff(from, to)) {
    if (kind === 1) { newIndex += text.length; continue; }
    if (position <= oldIndex + text.length) return newIndex + (kind === 0 ? position - oldIndex : 0);
    oldIndex += text.length;
    if (kind === 0) newIndex += text.length;
  }
  return to.length;
}

const cursorMarker = "YMEDITORCURSOR9Q7Z";
export function markdownPosition(editor, position, markdown = editor.getMarkdown()) {
  try {
    let marker = cursorMarker;
    while (markdown.includes(marker)) marker += "Q";
    const doc = editor.state.tr.insertText(marker, position).doc;
    const serialized = editor.markdown.serialize(doc.toJSON());
    const offset = serialized.indexOf(marker);
    return Math.max(0, offset);
  } catch { return editor.getMarkdown().length; }
}

export function editorPosition(editor, markdownOffset) {
  let low = 0; let high = editor.state.doc.content.size;
  const markdown = editor.getMarkdown();
  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    if (markdownPosition(editor, middle, markdown) < markdownOffset) low = middle + 1;
    else high = middle;
  }
  return low;
}

export function preserveMarkdownBoundary(source, markdown) {
  const prefix = source.match(/^\s*\n/)?.[0] || "";
  const suffix = source.match(/\n\s*$/)?.[0] || "";
  return `${prefix}${markdown}${suffix}`;
}
