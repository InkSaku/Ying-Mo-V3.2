import { useProtectedMedia } from "../hooks/useProtectedMedia";

export function ProtectedImage({
  media,
  path,
  useOriginal = false,
  alt = "",
  className = "",
  fallback = null,
}) {
  const sourcePath = path || (useOriginal ? media?.read_path : media?.thumbnail_path || media?.read_path);
  const state = useProtectedMedia(sourcePath);

  if (!sourcePath) return fallback;
  if (state.loading) {
    return <div className={`protected-image-placeholder ${className}`} role="status"><span className="sr-only">正在读取图片</span></div>;
  }
  if (state.error || !state.src) return fallback;

  return <img className={`protected-image ${className}`} src={state.src} alt={alt} />;
}
