import Heading from "@tiptap/extension-heading";
import { Plugin } from "@tiptap/pm/state";
import { Mapping } from "@tiptap/pm/transform";
import { newHeadingAnchor, splitHeadingAnchor } from "./headingAnchors.js";

const validAnchor = (value) => typeof value === "string" && /^ym-h-[a-zA-Z0-9-]+$/.test(value);

export const AnchoredHeading = Heading.extend({
  addAttributes() {
    return { ...this.parent?.(), anchorId: {
      default: null,
      parseHTML: (element) => {
        const id = element.getAttribute("data-heading-anchor") || element.id;
        return validAnchor(id) ? id : null;
      },
      renderHTML: (attributes) => validAnchor(attributes.anchorId) ? { "data-heading-anchor": attributes.anchorId } : {},
    } };
  },
  parseMarkdown(token, helpers) {
    const { text, anchorId } = splitHeadingAnchor(token.text);
    return helpers.createNode("heading", { level: token.depth || 1, anchorId }, helpers.parseInline(helpers.tokenizeInline(text)));
  },
  renderMarkdown(node, helpers) {
    const text = helpers.renderChildren(node.content || []);
    return `${"#".repeat(node.attrs.level)} ${text}${node.attrs.anchorId ? ` {#${node.attrs.anchorId}}` : ""}`;
  },
  addProseMirrorPlugins() {
    return [new Plugin({
      appendTransaction(transactions, oldState, newState) {
        if (!transactions.some((transaction) => transaction.docChanged)) return null;
        const mapping = new Mapping();
        transactions.forEach((transaction) => mapping.appendMapping(transaction.mapping));
        const owners = new Map();
        oldState.doc.descendants((node, position) => {
          if (node.type.name !== "heading" || !node.attrs.anchorId) return;
          const mapped = mapping.mapResult(position, 1);
          if (!mapped.deleted && newState.doc.nodeAt(mapped.pos)?.attrs.anchorId === node.attrs.anchorId) owners.set(node.attrs.anchorId, mapped.pos);
        });
        const seen = new Set();
        const tr = newState.tr;
        newState.doc.descendants((node, position) => {
          if (node.type.name !== "heading" || !node.attrs.anchorId) return;
          const id = node.attrs.anchorId;
          const duplicate = owners.has(id) ? owners.get(id) !== position : seen.has(id);
          if (duplicate) tr.setNodeMarkup(position, undefined, { ...node.attrs, anchorId: newHeadingAnchor() });
          seen.add(id);
        });
        return tr.docChanged ? tr : null;
      },
    })];
  },
});
