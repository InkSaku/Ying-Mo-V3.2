const MEDIA_TOKEN_RE = /\[\[ym-media:(\d+)\]\]/g;

function codeRanges(source) {
  const ranges = [];
  let cursor = 0; let fence = null;
  for (const line of source.split(/(?<=\n)/)) {
    const match = line.match(/^ {0,3}(`{3,}|~{3,})/);
    if (match) {
      if (!fence) fence = { start: cursor, marker: match[1] };
      else if (match[1][0] === fence.marker[0] && match[1].length >= fence.marker.length && !line.slice(match[0].length).trim()) {
        ranges.push([fence.start, cursor + line.length]); fence = null;
      }
    }
    cursor += line.length;
  }
  if (fence) ranges.push([fence.start, source.length]);
  for (const match of source.matchAll(/(`+)(?!`)([^\n]*?)\1(?!`)/g)) ranges.push([match.index, match.index + match[0].length]);
  return ranges;
}

export function visualMarkdownBlocks(value) {
  const source = String(value || "");
  const blocks = [];
  let cursor = 0;
  let textIndex = 0;
  let mediaIndex = 0;
  const protectedRanges = codeRanges(source);
  MEDIA_TOKEN_RE.lastIndex = 0;
  let match;
  while ((match = MEDIA_TOKEN_RE.exec(source))) {
    if (protectedRanges.some(([start, end]) => match.index >= start && match.index < end)) continue;
    blocks.push({
      type: "text",
      key: `text-${textIndex++}`,
      start: cursor,
      end: match.index,
      value: source.slice(cursor, match.index),
    });
    blocks.push({
      type: "media",
      key: `media-${mediaIndex++}-${match[1]}`,
      start: match.index,
      end: MEDIA_TOKEN_RE.lastIndex,
      mediaId: Number(match[1]),
      token: match[0],
    });
    cursor = MEDIA_TOKEN_RE.lastIndex;
  }
  MEDIA_TOKEN_RE.lastIndex = 0;
  blocks.push({
    type: "text",
    key: `text-${textIndex}`,
    start: cursor,
    end: source.length,
    value: source.slice(cursor),
  });
  return blocks;
}

export function replaceVisualTextBlock(value, block, nextText) {
  const source = String(value || "");
  return `${source.slice(0, block.start)}${nextText}${source.slice(block.end)}`;
}

export function reorderMediaPlaceholders(value, sourceMediaId, targetMediaId) {
  const source = String(value || "");
  const sourceId = Number(sourceMediaId);
  const targetId = Number(targetMediaId);
  if (!Number.isInteger(sourceId) || !Number.isInteger(targetId) || sourceId === targetId) return source;

  const blocks = visualMarkdownBlocks(source).filter((block) => block.type === "media");
  const from = blocks.find((block) => block.mediaId === sourceId);
  const to = blocks.find((block) => block.mediaId === targetId);
  if (!from || !to) return source;

  const first = from.start < to.start ? from : to;
  const second = from.start < to.start ? to : from;
  return [
    source.slice(0, first.start),
    second.token,
    source.slice(first.end, second.start),
    first.token,
    source.slice(second.end),
  ].join("");
}

export function mediaOrder(value) {
  return visualMarkdownBlocks(value)
    .filter((block) => block.type === "media")
    .map((block) => block.mediaId);
}
