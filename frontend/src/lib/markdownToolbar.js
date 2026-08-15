function clampPosition(value, position) {
  if (!Number.isInteger(position)) return value.length;
  return Math.max(0, Math.min(position, value.length));
}

function normalizedRange(value, start, end) {
  const safeStart = clampPosition(value, start);
  const safeEnd = clampPosition(value, end);
  return safeStart <= safeEnd ? [safeStart, safeEnd] : [safeEnd, safeStart];
}

function gapBefore(value) {
  if (!value || value.endsWith("\n\n")) return "";
  return value.endsWith("\n") ? "\n" : "\n\n";
}

function gapAfter(value) {
  if (!value || value.startsWith("\n\n")) return "";
  return value.startsWith("\n") ? "\n" : "\n\n";
}

function replaceInline(source, start, end, replacement, selectionStart, selectionEnd) {
  return {
    value: `${source.slice(0, start)}${replacement}${source.slice(end)}`,
    selectionStart: start + selectionStart,
    selectionEnd: start + selectionEnd,
  };
}

function replaceBlock(source, start, end, block, selectionStart, selectionEnd) {
  const before = source.slice(0, start);
  const after = source.slice(end);
  const prefix = gapBefore(before);
  const suffix = gapAfter(after);
  return {
    value: `${before}${prefix}${block}${suffix}${after}`,
    selectionStart: start + prefix.length + selectionStart,
    selectionEnd: start + prefix.length + selectionEnd,
  };
}

function prefixLines(value, prefix) {
  return value.split("\n").map((line) => (line ? `${prefix}${line}` : line)).join("\n");
}

function togglePrefixedLines(value, prefix) {
  const lines = value.split("\n");
  const contentLines = lines.filter(Boolean);
  const shouldRemove = contentLines.length > 0 && contentLines.every((line) => line.startsWith(prefix));

  return lines.map((line) => {
    if (!line) return line;
    if (shouldRemove) return line.slice(prefix.length);
    return line.startsWith(prefix) ? line : `${prefix}${line}`;
  }).join("\n");
}

function toggleOrderedLines(value) {
  const lines = value.split("\n");
  const orderedPrefix = /^\d+\.\s+/;
  const contentLines = lines.filter(Boolean);
  const shouldRemove = contentLines.length > 0 && contentLines.every((line) => orderedPrefix.test(line));
  let itemNumber = 0;

  return lines.map((line) => {
    if (!line) return line;
    if (shouldRemove) return line.replace(orderedPrefix, "");
    itemNumber += 1;
    return `${itemNumber}. ${line.replace(orderedPrefix, "")}`;
  }).join("\n");
}

function unwrapDelimitedSelection(source, start, end, marker) {
  if (
    start >= marker.length
    && source.slice(start - marker.length, start) === marker
    && source.slice(end, end + marker.length) === marker
  ) {
    const value = `${source.slice(0, start - marker.length)}${source.slice(start, end)}${source.slice(end + marker.length)}`;
    return {
      value,
      selectionStart: start - marker.length,
      selectionEnd: end - marker.length,
    };
  }

  return null;
}

function codeFenceFor(content) {
  const runs = String(content).match(/`+/g) || [];
  const longestRun = runs.reduce((longest, run) => Math.max(longest, run.length), 0);
  return "`".repeat(Math.max(3, longestRun + 1));
}

function nextFootnoteId(source) {
  let nextId = 1;
  for (const match of source.matchAll(/\[\^(\d+)\]/g)) {
    nextId = Math.max(nextId, Number(match[1]) + 1);
  }
  return String(nextId);
}

function unwrapCodeSelection(source, start, end, selected) {
  const selectedFence = selected.match(/^(`{3,})\n([\s\S]*)\n\1$/);
  if (selectedFence) {
    return replaceInline(
      source,
      start,
      end,
      selectedFence[2],
      0,
      selectedFence[2].length,
    );
  }

  const openingFence = source.slice(0, start).match(/(`{3,})\n$/)?.[1];
  if (!openingFence || !source.slice(end).startsWith(`\n${openingFence}`)) return null;

  return replaceInline(
    source,
    start - openingFence.length - 1,
    end + openingFence.length + 1,
    selected,
    0,
    selected.length,
  );
}

export function markdownActionForKeyEvent(event) {
  if (!event || event.isComposing || event.repeat || event.altKey) return null;
  if (!event.metaKey && !event.ctrlKey) return null;

  const key = String(event.key || "").toLowerCase();
  const code = String(event.code || "");
  if (event.shiftKey && code === "Digit7") return "orderedList";
  if (event.shiftKey && code === "Digit8") return "list";
  if (event.shiftKey) return null;
  if (key === "b") return "bold";
  if (key === "k") return "link";
  return null;
}

export function applyMarkdownShortcut(value, start, end, action) {
  const source = String(value || "");
  const [safeStart, safeEnd] = normalizedRange(source, start, end);
  const selected = source.slice(safeStart, safeEnd);

  if (action === "bold") {
    const unwrapped = unwrapDelimitedSelection(source, safeStart, safeEnd, "**");
    if (unwrapped) return unwrapped;
    if (selected.startsWith("**") && selected.endsWith("**") && selected.length >= 4) {
      const content = selected.slice(2, -2);
      return replaceInline(source, safeStart, safeEnd, content, 0, content.length);
    }

    const content = selected || "加粗文字";
    return replaceInline(
      source,
      safeStart,
      safeEnd,
      `**${content}**`,
      2,
      2 + content.length,
    );
  }

  if (action === "link") {
    const label = selected || "链接文字";
    const replacement = `[${label}](https://)`;
    const urlStart = label.length + 3;
    return replaceInline(
      source,
      safeStart,
      safeEnd,
      replacement,
      selected ? urlStart : 1,
      selected ? urlStart + "https://".length : 1 + label.length,
    );
  }

  if (action === "footnote") {
    const footnoteId = nextFootnoteId(source);
    const marker = `[^${footnoteId}]`;
    const referenceText = selected || "脚注引用";
    const annotated = `${source.slice(0, safeStart)}${referenceText}${marker}${source.slice(safeEnd)}`;
    const separator = gapBefore(annotated);
    const definitionPrefix = `[^${footnoteId}]: `;
    const definitionText = "脚注内容";
    const valueWithFootnote = `${annotated}${separator}${definitionPrefix}${definitionText}`;
    const definitionStart = annotated.length + separator.length + definitionPrefix.length;
    return {
      value: valueWithFootnote,
      selectionStart: definitionStart,
      selectionEnd: definitionStart + definitionText.length,
    };
  }

  if (action === "inlineMath") {
    const unwrapped = unwrapDelimitedSelection(source, safeStart, safeEnd, "$");
    if (unwrapped) return unwrapped;
    if (selected.startsWith("$") && selected.endsWith("$") && selected.length >= 3) {
      const content = selected.slice(1, -1);
      return replaceInline(source, safeStart, safeEnd, content, 0, content.length);
    }
    const content = selected || "E = mc^2";
    return replaceInline(source, safeStart, safeEnd, `$${content}$`, 1, 1 + content.length);
  }

  if (action === "mathBlock") {
    const selectedBlock = selected.match(/^\$\$\n([\s\S]*)\n\$\$$/);
    if (selectedBlock) {
      return replaceInline(source, safeStart, safeEnd, selectedBlock[1], 0, selectedBlock[1].length);
    }
    const beforeMarker = source.slice(0, safeStart).endsWith("$$\n");
    const afterMarker = source.slice(safeEnd).startsWith("\n$$");
    if (beforeMarker && afterMarker) {
      return replaceInline(source, safeStart - 3, safeEnd + 3, selected, 0, selected.length);
    }
    const content = selected || "\\frac{a}{b}";
    const block = `$$\n${content}\n$$`;
    return replaceBlock(source, safeStart, safeEnd, block, 3, 3 + content.length);
  }

  if (action === "heading" || action === "quote" || action === "list" || action === "orderedList") {
    const fallback = action === "heading" ? "标题" : action === "quote" ? "引用内容" : "列表项";
    const prefix = action === "heading" ? "## " : action === "quote" ? "> " : action === "list" ? "- " : "1. ";
    const content = selected || fallback;
    const block = selected
      ? action === "orderedList" ? toggleOrderedLines(content) : togglePrefixedLines(content, prefix)
      : prefixLines(content, prefix);
    if (selected) {
      return replaceBlock(source, safeStart, safeEnd, block, 0, block.length);
    }
    return replaceBlock(source, safeStart, safeEnd, block, prefix.length, prefix.length + content.length);
  }

  if (action === "code") {
    const unwrapped = unwrapCodeSelection(source, safeStart, safeEnd, selected);
    if (unwrapped) return unwrapped;

    const content = selected || "代码";
    const fence = codeFenceFor(content);
    const block = `${fence}\n${content}\n${fence}`;
    const contentStart = fence.length + 1;
    return replaceBlock(source, safeStart, safeEnd, block, contentStart, contentStart + content.length);
  }

  if (action === "table") {
    const firstHeader = (selected || "列 1").replace(/\|/g, "\\|").replace(/\s*\n\s*/g, " ");
    const block = `| ${firstHeader} | 列 2 |\n| --- | --- |\n| 内容 1 | 内容 2 |`;
    const headerStart = 2;
    return replaceBlock(
      source,
      safeStart,
      safeEnd,
      block,
      headerStart,
      headerStart + firstHeader.length,
    );
  }

  throw new TypeError(`Unsupported Markdown shortcut: ${action}`);
}
