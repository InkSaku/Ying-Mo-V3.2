import { internalLinkPath } from "./contentLinks";

// 与 backend/app/posts/links.py 的 COMMENT_LINK_RE 一致：评论是纯文本，网址只取 ASCII 字符，
// 紧跟的中文和中文标点不算进链接；后端据此给出 link_card.href，前端用同一段文字定位。
const COMMENT_LINK_RE = /https?:\/\/[A-Za-z0-9.-]+(?::\d+)?(?:\/[A-Za-z0-9\-._~/%?#=&+]*)?|(?<![A-Za-z0-9_/.])\/(?:articles|notes)\/[A-Za-z0-9\-_/]+/g;
const TRAILING_PUNCTUATION = /[.,;:!?]+$/;
const POST_PATH_RE = /^\/(?:articles\/[a-z0-9]+(?:-[a-z0-9]+)*|notes\/\d{1,18})\/?$/;

export function commentLinks(body) {
  const links = [];
  for (const match of String(body || "").matchAll(COMMENT_LINK_RE)) {
    const href = match[0].replace(TRAILING_PUNCTUATION, "");
    if (href) links.push({ start: match.index, end: match.index + href.length, href });
  }
  return links;
}

// 站内文章或随记的路径（不带查询和锚点）；外站和其他站内页面返回 null。
export function postLinkPath(href) {
  const path = internalLinkPath(href);
  if (!path) return null;
  const pathname = path.split(/[?#]/)[0];
  return POST_PATH_RE.test(pathname) ? pathname : null;
}

export function firstPostLink(body) {
  return commentLinks(body).find((link) => postLinkPath(link.href)) || null;
}
