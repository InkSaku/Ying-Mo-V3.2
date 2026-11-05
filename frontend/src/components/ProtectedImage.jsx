import { useNearViewport } from "../hooks/useNearViewport";
import { useProtectedMedia } from "../hooks/useProtectedMedia";
import { peekProtectedMediaUrl } from "../lib/protectedMedia";

export function ProtectedImage({
  media,
  path,
  useOriginal = false,
  alt = null,
  className = "",
  fallback = null,
  eager = false,
}) {
  const sourcePath = path || (useOriginal ? media?.read_path : media?.thumbnail_path || media?.read_path);
  const [placeholderRef, near] = useNearViewport(eager || !sourcePath || Boolean(peekProtectedMediaUrl(sourcePath)));
  const state = useProtectedMedia(sourcePath, { defer: !near });

  if (!sourcePath) return fallback;
  if (!near || state.loading) {
    return <div ref={placeholderRef} className={`protected-image-placeholder ${className}`} role="status"><span className="sr-only">正在读取图片</span></div>;
  }
  if (state.error || !state.src) return fallback;

  return <img className={`protected-image ${className}`} src={state.src} alt={alt ?? media?.alt_text ?? ""} />;
}
