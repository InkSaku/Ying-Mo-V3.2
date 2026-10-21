import diff from "fast-diff";

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
