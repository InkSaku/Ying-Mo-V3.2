import { useProtectedMedia } from "../hooks/useProtectedMedia";

export function ProtectedVideo({ path, className = "", label = "受保护视频" }) {
  const state = useProtectedMedia(path);

  if (!path) return null;
  if (state.loading) {
    return <div className={`protected-image-placeholder protected-video-placeholder ${className}`} role="status"><span className="sr-only">正在读取视频</span></div>;
  }
  if (state.error || !state.src) {
    return <div className="media-inline-error" role="status">视频暂时无法读取。</div>;
  }

  return <video className={`protected-video ${className}`} src={state.src} controls playsInline preload="metadata" aria-label={label} />;
}
