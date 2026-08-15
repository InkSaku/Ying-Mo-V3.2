import { createElement, lazy, Suspense, useMemo } from "react";
import { isIgnorableMarkdownWhitespace } from "../lib/markdownRender";
import { ProtectedImage } from "./ProtectedImage";
import { ProtectedVideo } from "./ProtectedVideo";

const ProtectedMath = lazy(() => import("./ProtectedMath").then((module) => ({
  default: module.ProtectedMath,
})));
const ProtectedCodeBlock = lazy(() => import("./ProtectedCodeBlock").then((module) => ({
  default: module.ProtectedCodeBlock,
})));

const ELEMENT_NODE = 1;
const TEXT_NODE = 3;
const SAFE_TAGS = new Set([
  "a", "blockquote", "br", "code", "del", "div", "em", "h1", "h2", "h3", "h4", "h5", "h6",
  "hr", "img", "li", "ol", "p", "pre", "span", "strong", "sup", "table", "tbody", "td", "th",
  "thead", "tr", "ul",
]);

function mediaIndex(media) {
  const byId = new Map();
  const pairs = new Map();

  for (const item of media || []) {
    if (item.live_photo_pair_id) {
      const pair = pairs.get(item.live_photo_pair_id) || [];
      pair.push(item);
      pairs.set(item.live_photo_pair_id, pair);
    }
  }

  for (const item of media || []) {
    if (!item.live_photo_pair_id) {
      byId.set(Number(item.id), { kind: "image", image: item, items: [item] });
      continue;
    }
    const pair = pairs.get(item.live_photo_pair_id) || [];
    const image = pair.find((candidate) => candidate.kind === "live_photo_image");
    const video = pair.find((candidate) => candidate.kind === "live_photo_video");
    const group = { kind: "live_photo", image, video, items: pair };
    for (const candidate of pair) byId.set(Number(candidate.id), group);
  }

  return byId;
}

function imagePath(item, management) {
  if (!item) return null;
  return management
    ? item.manage_path || item.read_path
    : item.read_path;
}

function videoPath(item, management) {
  if (!item) return null;
  return management
    ? item.manage_path || item.read_path
    : item.read_path;
}

function InlineProtectedMedia({ mediaId, index, management }) {
  const group = index.get(Number(mediaId));
  if (!group?.image) {
    return <span className="inline-media-missing" role="status">这项媒体当前不可用。</span>;
  }

  if (group.kind === "live_photo") {
    return (
      <figure className="inline-protected-media inline-live-photo">
        <ProtectedImage
          path={imagePath(group.image, management)}
          alt="正文中的 Live Photo 静态画面"
          className="inline-protected-image"
        />
        <ProtectedVideo
          path={videoPath(group.video, management)}
          label="正文中的 Live Photo 动态片段"
          className="inline-protected-video"
        />
        <figcaption>Live Photo</figcaption>
      </figure>
    );
  }

  return (
    <figure className="inline-protected-media">
      <ProtectedImage
        path={imagePath(group.image, management)}
        alt="正文图片"
        className="inline-protected-image"
      />
    </figure>
  );
}

function renderNode(node, key, index, management, parentTag = "") {
  if (node.nodeType === TEXT_NODE) {
    if (isIgnorableMarkdownWhitespace(node.textContent, parentTag)) return null;
    return node.textContent;
  }
  if (node.nodeType !== ELEMENT_NODE) return null;

  const tag = node.tagName.toLowerCase();
  if (!SAFE_TAGS.has(tag)) {
    return Array.from(node.childNodes).map((child, childIndex) => (
      renderNode(child, `${key}-${childIndex}`, index, management, parentTag)
    ));
  }

  if (tag === "img" && node.hasAttribute("data-media-id")) {
    return (
      <InlineProtectedMedia
        key={key}
        mediaId={node.getAttribute("data-media-id")}
        index={index}
        management={management}
      />
    );
  }

  const mathClass = node.getAttribute("class");
  if (
    node.hasAttribute("data-math")
    && ((tag === "span" && mathClass === "math-inline") || (tag === "div" && mathClass === "math-block"))
  ) {
    return (
      <Suspense
        key={key}
        fallback={createElement(
          tag,
          { className: `math-loading ${tag === "div" ? "math-block" : "math-inline"}` },
          node.getAttribute("data-math"),
        )}
      >
        <ProtectedMath
          expression={node.getAttribute("data-math")}
          displayMode={tag === "div"}
        />
      </Suspense>
    );
  }

  if (tag === "p") {
    const meaningfulChildren = Array.from(node.childNodes).filter((child) => (
      child.nodeType !== TEXT_NODE || child.textContent.trim()
    ));
    const onlyChild = meaningfulChildren.length === 1 ? meaningfulChildren[0] : null;
    if (onlyChild?.nodeType === ELEMENT_NODE && onlyChild.tagName.toLowerCase() === "img" && onlyChild.hasAttribute("data-media-id")) {
      return (
        <InlineProtectedMedia
          key={key}
          mediaId={onlyChild.getAttribute("data-media-id")}
          index={index}
          management={management}
        />
      );
    }
  }

  if (tag === "pre") {
    const meaningfulChildren = Array.from(node.childNodes).filter((child) => (
      child.nodeType !== TEXT_NODE || child.textContent.trim()
    ));
    const onlyChild = meaningfulChildren.length === 1 ? meaningfulChildren[0] : null;
    if (onlyChild?.nodeType === ELEMENT_NODE && onlyChild.tagName.toLowerCase() === "code") {
      const className = onlyChild.getAttribute("class") || "";
      const code = onlyChild.textContent || "";
      return (
        <Suspense key={key} fallback={<pre><code className={className}>{code}</code></pre>}>
          <ProtectedCodeBlock code={code} className={className} />
        </Suspense>
      );
    }
  }

  const props = { key };
  if (tag === "a") {
    if (node.hasAttribute("href")) props.href = node.getAttribute("href");
    if (node.hasAttribute("title")) props.title = node.getAttribute("title");
    if (node.hasAttribute("class")) props.className = node.getAttribute("class");
  } else if (tag === "img") {
    if (!node.hasAttribute("src")) return null;
    props.src = node.getAttribute("src");
    props.alt = node.getAttribute("alt") || "";
    if (node.hasAttribute("title")) props.title = node.getAttribute("title");
  } else if (tag === "code" && node.hasAttribute("class")) {
    props.className = node.getAttribute("class");
  } else if (tag === "div" && node.hasAttribute("class")) {
    props.className = node.getAttribute("class");
  } else if ((tag === "li" || tag === "sup") && node.hasAttribute("id")) {
    props.id = node.getAttribute("id");
  } else if (/^h[1-6]$/.test(tag) && node.hasAttribute("id")) {
    props.id = node.getAttribute("id");
  }

  const children = Array.from(node.childNodes).map((child, childIndex) => (
    renderNode(child, `${key}-${childIndex}`, index, management, tag)
  ));

  return createElement(tag, props, ...children);
}

export function ProtectedMarkdown({ html, media = [], management = false, className = "prose" }) {
  const index = useMemo(() => mediaIndex(media), [media]);
  const content = useMemo(() => {
    if (!html || typeof DOMParser === "undefined") return [];
    const documentNode = new DOMParser().parseFromString(`<body>${html}</body>`, "text/html");
    return Array.from(documentNode.body.childNodes).map((node, nodeIndex) => (
      renderNode(node, `markdown-${nodeIndex}`, index, management)
    ));
  }, [html, index, management]);

  return <div className={className}>{content}</div>;
}
