import { useLayoutEffect, useState } from "react";
import { useNearViewport } from "../hooks/useNearViewport";
import { useProtectedMedia } from "../hooks/useProtectedMedia";
import { peekProtectedMediaUrl } from "../lib/protectedMedia";

// 上传时生成的缩略图长边为 640px（backend encode_image_derivatives）。
const THUMBNAIL_EDGE = 640;
// 缩略图最多放大到 1.5 倍仍可接受；超过就改用展示图，避免大位置发糊。
const MAX_THUMBNAIL_UPSCALE = 1.5;

function thumbnailIsEnough(element, media) {
  if (!element || !media?.width || !media?.height) return true;
  const box = element.getBoundingClientRect();
  if (!box.width || !box.height) return true;
  const ratio = Math.min(1, THUMBNAIL_EDGE / Math.max(media.width, media.height));
  const scale = Math.max(box.width / (media.width * ratio), box.height / (media.height * ratio));
  return scale * (window.devicePixelRatio || 1) <= MAX_THUMBNAIL_UPSCALE;
}

export function ProtectedImage({
  media,
  path,
  useOriginal = false,
  // adaptive：同时有缩略图和展示图时，按占位框的实际尺寸和屏幕像素密度选一张；
  // 小位置不下载大图，大位置不把缩略图拉糊。
  adaptive = false,
  alt = null,
  className = "",
  fallback = null,
  eager = false,
}) {
  const thumbnailPath = media?.thumbnail_path || null;
  const displayPath = media?.read_path || null;
  const adapt = adaptive && !path && Boolean(thumbnailPath && displayPath);
  const basePath = path || (useOriginal ? displayPath : thumbnailPath || displayPath);
  const [choice, setChoice] = useState(() => (adapt && peekProtectedMediaUrl(displayPath) ? displayPath : null));
  const chosen = choice === thumbnailPath || choice === displayPath ? choice : null;
  const sourcePath = adapt ? chosen : basePath;
  const [placeholderRef, near] = useNearViewport(eager || !basePath || Boolean(peekProtectedMediaUrl(sourcePath || basePath)));
  const state = useProtectedMedia(sourcePath, { defer: !near });

  useLayoutEffect(() => {
    if (!adapt || chosen || !near) return;
    setChoice(thumbnailIsEnough(placeholderRef.current, media) ? thumbnailPath : displayPath);
  }, [adapt, chosen, near, media, thumbnailPath, displayPath, placeholderRef]);

  if (!basePath) return fallback;
  if (!near || !sourcePath || state.loading) {
    return <div ref={placeholderRef} className={`protected-image-placeholder ${className}`} role="status"><span className="sr-only">正在读取图片</span></div>;
  }
  if (state.error || !state.src) return fallback;

  return <img className={`protected-image ${className}`} src={state.src} alt={alt ?? media?.alt_text ?? ""} />;
}
