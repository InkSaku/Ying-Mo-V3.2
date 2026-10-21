import { marked } from "marked";
import { mapTextOffset } from "./textOffset.js";

const suffix = /[ \t]+\{#(ym-h-[a-zA-Z0-9-]+)\}[ \t]*$/;

export function splitHeadingAnchor(text) {
  const match = String(text).match(suffix);
  return { text: match ? text.slice(0, match.index) : text, anchorId: match?.[1] || null };
}

export function newHeadingAnchor() { return `ym-h-${crypto.randomUUID()}`; }

function inlineText(tokens) {
  return (tokens || []).map((token) => token.tokens ? inlineText(token.tokens) : token.text || "").join("");
}

// Use the same Markdown lexer as the editor: code fences and raw HTML never
// become heading candidates. Offset maps retain quote/list prefixes and CRLF.
export function sourceHeadingInfo(source) {
  const normalized = source.replace(/\r\n?/g, "\n");
  const tokens = marked.lexer(normalized);
  const headings = [];
  const walk = (rows, container, map) => {
    let cursor = 0;
    for (const token of rows) {
      const start = container.indexOf(token.raw, cursor);
      if (start < 0) continue;
      cursor = start + token.raw.length;
      if (token.type === "heading") {
        const { text, anchorId } = splitHeadingAnchor(token.text);
        const setext = token.raw.match(/\n[ \t]*(?:=+|-+)[ \t]*\n*$/);
        const closing = token.raw.match(/[ \t]+#+[ \t]*\n*$/);
        const insertion = setext?.index ?? closing?.index ?? token.raw.trimEnd().length;
        headings.push({
          id: anchorId || newHeadingAnchor(), anchorId, level: token.depth,
          title: inlineText(marked.lexer(text, { gfm: true })[0]?.tokens) || text,
          start: map(start), anchorOffset: map(start + insertion),
        });
      } else if (token.type === "blockquote") {
        walk(token.tokens, token.text, (offset) => map(start + mapTextOffset(token.text, token.raw, offset)));
      } else if (token.type === "list") {
        let itemCursor = 0;
        for (const item of token.items) {
          const itemStart = token.raw.indexOf(item.raw, itemCursor);
          if (itemStart < 0) continue;
          itemCursor = itemStart + item.raw.length;
          walk(item.tokens, item.text, (offset) => map(start + itemStart + mapTextOffset(item.text, item.raw, offset)));
        }
      }
    }
  };
  walk(tokens, normalized, (offset) => mapTextOffset(normalized, source, offset));
  const ids = new Set(headings.map((heading) => heading.anchorId).filter(Boolean));
  const missing = [];
  marked.walkTokens(tokens, (token) => {
    if (token.type === "link" && /^#ym-h-/.test(token.href)) {
      let id;
      try { id = decodeURIComponent(token.href.slice(1)); } catch { return; }
      if (!ids.has(id)) missing.push({ text: inlineText(token.tokens) || token.text, href: token.href });
    }
  });
  return { headings, missing };
}
