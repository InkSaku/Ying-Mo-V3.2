import { useEffect, useRef } from "react";
import { Link } from "react-router-dom";
import "../styles/favorite-control.css";

const starPath = "m16 5.5 3.25 6.6 7.25 1.05-5.25 5.12 1.24 7.23L16 22.08l-6.49 3.42 1.24-7.23-5.25-5.12 7.25-1.05L16 5.5Z";
const successEase = "cubic-bezier(0.23, 1, 0.32, 1)";

export function FavoriteButton({ favorited = false, ready = false, busy = false, celebration = 0, onToggle, rail = false }) {
  const star = useRef(null);
  const sparks = useRef(null);
  const played = useRef(celebration);

  useEffect(() => {
    if (busy || !favorited || !celebration || played.current === celebration) return undefined;
    played.current = celebration;
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const element = star.current;
    if (media.matches || !element?.animate) return undefined;
    const rect = element.getBoundingClientRect();
    if (rect.bottom < 0 || rect.top > window.innerHeight || rect.width === 0) return undefined;

    const animations = [element.animate([
      { transform: "rotate(0deg) scale(1)", offset: 0 },
      { transform: "rotate(-12deg) scale(.88)", offset: .2 },
      { transform: "rotate(8deg) scale(1.16)", offset: .55 },
      { transform: "rotate(0deg) scale(1)", offset: 1 },
    ], { duration: 280, easing: successEase })];
    if (sparks.current?.animate) animations.push(sparks.current.animate([
      { opacity: 0, transform: "scale(.9)", offset: 0 },
      { opacity: 1, transform: "scale(1)", offset: .35 },
      { opacity: 0, transform: "scale(1.12)", offset: 1 },
    ], { duration: 280, easing: successEase }));

    const stop = () => animations.forEach((animation) => animation.cancel());
    const onPreference = () => { if (media.matches) stop(); };
    const onVisibility = () => { if (document.hidden) stop(); };
    media.addEventListener("change", onPreference);
    document.addEventListener("visibilitychange", onVisibility);
    animations.forEach((animation) => { animation.finished.then(() => animation.cancel(), () => {}); });
    return () => {
      stop();
      media.removeEventListener("change", onPreference);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [busy, celebration, favorited]);

  const label = busy ? "处理中" : favorited ? "已收藏" : rail ? "收藏文章" : "收藏";
  return <button className={`favorite-toggle${rail ? " favorite-toggle-rail" : ""}`} type="button"
    disabled={!ready || busy} aria-pressed={favorited} aria-busy={busy || undefined}
    aria-label={busy ? "处理中，请稍候" : favorited ? "已收藏，取消收藏" : label}
    title={favorited ? "取消收藏" : label} onClick={onToggle}>
    <span ref={star} className="favorite-star" aria-hidden="true">
      <svg viewBox="0 0 32 32" fill="none" focusable="false">
        <g ref={sparks} className="favorite-star-sparks" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
          <path d="M16 1v2m11 3-1.5 1.5M31 18l-2-.5M4 26l1.5-1.5" />
        </g>
        <path className="favorite-star-fill" d={starPath} fill="currentColor" />
        <path d={starPath} stroke="currentColor" strokeWidth="1.65" strokeLinejoin="round" />
      </svg>
    </span>
    {label}
  </button>;
}

export function FavoriteLink({ rail = false }) {
  return <Link className={`favorite-library-link${rail ? " favorite-library-link-rail" : ""}`} to="/me/favorites">
    我的收藏
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false"><path d="m3 11 8-8M3 3h8v8" /></svg>
  </Link>;
}
