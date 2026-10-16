import { Node } from "@tiptap/core";
import { NodeSelection, TextSelection } from "@tiptap/pm/state";
import { visualMarkdownBlocks } from "./visualMarkdown.js";

export function writeBesideMedia(editor, position, before = false) {
  if (!Number.isInteger(position)) return false;
  const node = editor.state.doc.nodeAt(position);
  if (node?.type.name !== "internalMedia") return false;
  const insertion = before ? position : position + node.nodeSize;
  const paragraph = editor.schema.nodes.paragraph.create();
  const transaction = editor.state.tr.insert(insertion, paragraph);
  transaction.setSelection(TextSelection.create(transaction.doc, insertion + 1));
  editor.view.dispatch(transaction.scrollIntoView());
  editor.view.focus();
  return true;
}

// Only the stable media ID enters HTML/Markdown clipboard data. Protected URLs
// and presentation settings continue to come from the current post's media.
export const InternalMedia = Node.create({
  name: "internalMedia",
  group: "block",
  atom: true,
  selectable: true,
  draggable: true,
  addAttributes: () => ({ mediaId: { default: null } }),
  parseHTML: () => [{
    tag: "figure[data-ym-media]",
    getAttrs: (element) => {
      const mediaId = Number(element.getAttribute("data-ym-media"));
      return Number.isSafeInteger(mediaId) && mediaId > 0 ? { mediaId } : false;
    },
  }],
  renderHTML: ({ node }) => ["figure", { "data-ym-media": node.attrs.mediaId }, `[[ym-media:${node.attrs.mediaId}]]`],
  markdownTokenName: "internalMedia",
  parseMarkdown: (token, helpers) => [
    ...helpers.parseBlockChildren(token.tokens || []),
    { type: "internalMedia", attrs: { mediaId: Number(token.mediaId) } },
  ],
  renderMarkdown: (node) => `[[ym-media:${node.attrs.mediaId}]]`,
  markdownTokenizer: {
    name: "internalMedia", level: "block",
    // Marked calls `start` with the first character removed. Looking for media
    // there would mistake a token inside a leading code span for an image.
    // Scan the intact block instead, then let Marked parse its text prefix.
    start: () => -1,
    tokenize: (source, _tokens, helpers) => {
      if (!source.includes("[[ym-media:")) return undefined;
      const media = visualMarkdownBlocks(source).find((block) => block.type === "media");
      if (!media) return undefined;
      const prefix = source.slice(0, media.start).replace(/\n{1,2}$/, "");
      return {
        type: "internalMedia", raw: source.slice(0, media.end), mediaId: media.mediaId,
        tokens: prefix ? helpers.blockTokens(prefix) : [],
      };
    },
  },
  addKeyboardShortcuts() {
    const write = (before) => {
      const { selection } = this.editor.state;
      if (!(selection instanceof NodeSelection) || selection.node.type.name !== this.name) return false;
      return writeBesideMedia(this.editor, selection.from, before);
    };
    return { Enter: () => write(false), "Shift-Enter": () => write(true) };
  },
});
