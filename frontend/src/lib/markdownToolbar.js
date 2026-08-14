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
  return value.split("\n").map((line) => `${prefix}${line}`).join("\n");
}

export function applyMarkdownShortcut(value, start, end, action) {
  const source = String(value || "");
  const [safeStart, safeEnd] = normalizedRange(source, start, end);
  const selected = source.slice(safeStart, safeEnd);

  if (action === "bold") {
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

  if (action === "heading" || action === "quote" || action === "list") {
    const fallback = action === "heading" ? "标题" : action === "quote" ? "引用内容" : "列表项";
    const prefix = action === "heading" ? "## " : action === "quote" ? "> " : "- ";
    const content = selected || fallback;
    const block = prefixLines(content, prefix);
    if (selected) {
      return replaceBlock(source, safeStart, safeEnd, block, 0, block.length);
    }
    return replaceBlock(source, safeStart, safeEnd, block, prefix.length, prefix.length + content.length);
  }

  if (action === "code") {
    const content = selected || "代码";
    const block = `\`\`\`\n${content}\n\`\`\``;
    return replaceBlock(source, safeStart, safeEnd, block, 4, 4 + content.length);
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
