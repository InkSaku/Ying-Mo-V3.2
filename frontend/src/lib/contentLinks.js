// Keep stored links portable across deployments; routing and animation use the
// current origin only. Protocol-relative URLs remain ordinary external links.
export function internalLinkPath(href) {
  if (!href || href.startsWith("#") || href.startsWith("//")) return null;
  try {
    const url = new URL(href, window.location.href);
    if (url.origin !== window.location.origin || !/^https?:$/.test(url.protocol)) return null;
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return null;
  }
}

export function validLinkHref(href) {
  if (!href || Array.from(href).some((character) => character.charCodeAt(0) <= 32) || /[<>\\]/.test(href)) return false;
  if (/^\/(?!\/)/.test(href) || href.startsWith("#")) return true;
  try {
    const url = new URL(href);
    return (/^https?:$/.test(url.protocol) && Boolean(url.hostname))
      || (url.protocol === "mailto:" && Boolean(url.pathname));
  } catch {
    return false;
  }
}

export function escapeLinkText(text) {
  return text.replace(/[\\[\]`*_]/g, "\\$&").replace(/\r?\n/g, " ");
}

export function sourceLinkSelection(source, start, end) {
  const links = source.matchAll(/(?<!!)\[((?:\\.|[^\]\\\n])*)\]\(/g);
  for (const match of links) {
    const destinationStart = match.index + match[0].length;
    let depth = 1;
    let cursor = destinationStart;
    for (; cursor < source.length && depth > 0; cursor += 1) {
      if (source[cursor] === "\\") cursor += 1;
      else if (source[cursor] === "(") depth += 1;
      else if (source[cursor] === ")") depth -= 1;
      else if (/\s/.test(source[cursor])) break;
    }
    if (depth === 0 && start >= match.index && end <= cursor) {
      return { start: match.index, end: cursor, text: match[1].replace(/\\(.)/g, "$1"), href: source.slice(destinationStart, cursor - 1).replace(/\\(.)/g, "$1") };
    }
  }
  return { start, end, text: source.slice(start, end), href: "" };
}
