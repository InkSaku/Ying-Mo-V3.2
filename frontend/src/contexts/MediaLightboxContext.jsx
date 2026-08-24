import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "./AuthContext";
import { useProtectedMedia } from "../hooks/useProtectedMedia";
import { api } from "../lib/api";
import { preloadProtectedMedia } from "../lib/protectedMedia";
import {
  galleryPosition,
  mediaDisplayPath,
  mergeMediaItems,
  withMediaParam,
} from "../lib/mediaGallery";
import { formatDate, postHref } from "../lib/format";

const MediaLightboxContext = createContext(null);

function useReducedMotion() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduced(query.matches);
    update();
    query.addEventListener?.("change", update);
    return () => query.removeEventListener?.("change", update);
  }, []);
  return reduced;
}

function LivePhotoViewer({ item, scale, onToggleZoom, gestureProps }) {
  const image = useProtectedMedia(mediaDisplayPath(item));
  const video = useProtectedMedia(item.video?.read_path || null);
  const videoRef = useRef(null);
  const [playing, setPlaying] = useState(false);
  const reducedMotion = useReducedMotion();

  useEffect(() => {
    setPlaying(false);
    if (videoRef.current) {
      videoRef.current.pause();
      videoRef.current.currentTime = 0;
    }
  }, [item.id]);

  const play = async () => {
    if (!videoRef.current || !video.src) return;
    try {
      videoRef.current.currentTime = 0;
      await videoRef.current.play();
      setPlaying(true);
    } catch {
      setPlaying(false);
    }
  };
  const stop = () => {
    if (!videoRef.current) return;
    videoRef.current.pause();
    videoRef.current.currentTime = 0;
    setPlaying(false);
  };
  const toggle = () => { if (playing) stop(); else void play(); };

  return <div className="media-lightbox-live" {...gestureProps}>
    {image.loading ? <div className="media-lightbox-loading" role="status">正在读取影像…</div> : null}
    {image.error ? <div className="media-lightbox-error" role="status">静态照片暂时无法读取。</div> : null}
    {image.src ? <img
      src={image.src}
      alt={item.image?.alt_text || "Live Photo 静态照片"}
      draggable="false"
      onDoubleClick={onToggleZoom}
      style={{ transform: `scale(${scale})` }}
    /> : null}
    {video.src ? <video
      ref={videoRef}
      className={playing ? "active" : ""}
      src={video.src}
      muted
      playsInline
      preload="auto"
      aria-label="Live Photo 动态片段"
      onEnded={stop}
    /> : null}
    <span className="media-lightbox-live-badge">LIVE</span>
    <button
      type="button"
      className="media-lightbox-play"
      disabled={!video.src}
      onClick={toggle}
      onPointerDown={(event) => {
        if (event.pointerType === "touch" && !reducedMotion) void play();
      }}
      onPointerUp={(event) => { if (event.pointerType === "touch") stop(); }}
      onPointerCancel={stop}
    >{playing ? "停止动态" : "播放 Live Photo"}</button>
    {video.error ? <small className="media-lightbox-video-error">动态片段不可用，静态照片仍可查看。</small> : null}
  </div>;
}

function ImageViewer({ item, scale, onToggleZoom, gestureProps }) {
  const state = useProtectedMedia(mediaDisplayPath(item));
  return <div className="media-lightbox-image" {...gestureProps}>
    {state.loading ? <div className="media-lightbox-loading" role="status">正在读取图片…</div> : null}
    {state.error ? <div className="media-lightbox-error" role="status">图片暂时无法读取。</div> : null}
    {state.src ? <img
      src={state.src}
      alt={item.image?.alt_text || "媒体记忆"}
      draggable="false"
      onDoubleClick={onToggleZoom}
      style={{ transform: `scale(${scale})` }}
    /> : null}
  </div>;
}

function MediaViewer({ item, onPrevious, onNext }) {
  const [scale, setScale] = useState(1);
  const touchRef = useRef(null);
  useEffect(() => setScale(1), [item.id]);
  const distance = (touches) => Math.hypot(
    touches[0].clientX - touches[1].clientX,
    touches[0].clientY - touches[1].clientY,
  );
  const gestureProps = {
    onTouchStart: (event) => {
      if (event.touches.length === 2) {
        touchRef.current = { kind: "pinch", distance: distance(event.touches), scale };
      } else if (event.touches.length === 1) {
        touchRef.current = { kind: "swipe", x: event.touches[0].clientX, y: event.touches[0].clientY };
      }
    },
    onTouchMove: (event) => {
      if (event.touches.length === 2 && touchRef.current?.kind === "pinch") {
        const ratio = distance(event.touches) / Math.max(1, touchRef.current.distance);
        setScale(Math.min(4, Math.max(1, touchRef.current.scale * ratio)));
      }
    },
    onTouchEnd: (event) => {
      if (touchRef.current?.kind === "swipe" && scale === 1 && event.changedTouches.length) {
        const deltaX = event.changedTouches[0].clientX - touchRef.current.x;
        const deltaY = event.changedTouches[0].clientY - touchRef.current.y;
        if (Math.abs(deltaX) > 56 && Math.abs(deltaX) > Math.abs(deltaY) * 1.25) {
          if (deltaX < 0) void onNext(); else void onPrevious();
        }
      }
      touchRef.current = null;
    },
  };
  const props = { item, scale, gestureProps, onToggleZoom: () => setScale((value) => value > 1 ? 1 : 2.5) };
  return item.kind === "live_photo" ? <LivePhotoViewer {...props} /> : <ImageViewer {...props} />;
}

function Lightbox({ gallery, close, move, download }) {
  const item = gallery.items[gallery.index] || null;
  const dialogRef = useRef(null);
  const first = gallery.firstPosition || 0;
  const position = galleryPosition(first, gallery.index);
  const total = gallery.total || gallery.items.length;
  const canPrevious = gallery.index > 0 || gallery.minPage > 1;
  const canNext = gallery.index < gallery.items.length - 1 || gallery.maxPage < gallery.totalPages;

  useEffect(() => {
    const controller = new AbortController();
    const paths = [gallery.items[gallery.index - 1], gallery.items[gallery.index + 1]]
      .map(mediaDisplayPath)
      .filter(Boolean);
    paths.forEach((path) => {
      void preloadProtectedMedia(path, { signal: controller.signal }).catch(() => undefined);
    });
    return () => controller.abort();
  }, [gallery.index, gallery.items]);

  useEffect(() => {
    dialogRef.current?.focus();
    const handler = (event) => {
      if (event.key === "Escape") close();
      if (event.key === "ArrowLeft") void move(-1);
      if (event.key === "ArrowRight") void move(1);
      if (event.key === "Tab" && dialogRef.current) {
        const focusable = [...dialogRef.current.querySelectorAll("button:not([disabled]), a[href]")];
        if (!focusable.length) return;
        const firstNode = focusable[0];
        const lastNode = focusable[focusable.length - 1];
        if (event.shiftKey && document.activeElement === firstNode) {
          event.preventDefault(); lastNode.focus();
        } else if (!event.shiftKey && document.activeElement === lastNode) {
          event.preventDefault(); firstNode.focus();
        }
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [close, move]);

  return createPortal(
    <div className="media-lightbox-backdrop" onClick={(event) => { if (event.target === event.currentTarget) close(); }}>
      <section
        ref={dialogRef}
        className="media-lightbox"
        role="dialog"
        aria-modal="true"
        aria-label="媒体灯箱"
        tabIndex={-1}
        onClick={(event) => event.stopPropagation()}
      >
        <header className="media-lightbox-toolbar">
          <button type="button" className="media-lightbox-close" onClick={close} aria-label="关闭媒体灯箱">关闭</button>
          <p className="tabular" aria-live="polite">{item ? `${position} / ${total}` : "媒体不可用"}</p>
          <div>
            {item?.permissions?.can_download_original ? <button type="button" onClick={() => void download(item)}>下载原件</button> : null}
          </div>
        </header>
        {gallery.error ? <div className="media-lightbox-resolve-error" role="alert"><h2>媒体不存在</h2><p>它可能已被移除，或者你已无权访问。</p></div> : null}
        {item ? <div className="media-lightbox-stage">
          <button type="button" className="media-lightbox-nav previous" disabled={!canPrevious || gallery.loadingEdge} onClick={() => void move(-1)} aria-label="上一张">‹</button>
          <MediaViewer item={item} onPrevious={() => move(-1)} onNext={() => move(1)} />
          <button type="button" className="media-lightbox-nav next" disabled={!canNext || gallery.loadingEdge} onClick={() => void move(1)} aria-label="下一张">›</button>
        </div> : null}
        {item ? <footer className="media-lightbox-caption">
          <div><strong>{formatDate(item.occurred_at)}</strong>{item.location ? <span> · {item.location}</span> : null}</div>
          <div>{item.post ? <>来自 <Link to={postHref(item.post)} onClick={close}>《{item.post.title || "一则随记"}》</Link></> : "未绑定媒体"}{item.author ? <span> · {item.author.nickname}</span> : null}</div>
        </footer> : null}
      </section>
    </div>,
    document.body,
  );
}

export function MediaLightboxProvider({ children }) {
  const { status, user } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [gallery, setGallery] = useState(null);
  const galleryRef = useRef(null);
  const openerRef = useRef(null);
  galleryRef.current = gallery;
  const urlMediaId = useMemo(() => new URLSearchParams(location.search).get("media"), [location.search]);

  const restoreFocus = useCallback(() => {
    const target = openerRef.current?.isConnected ? openerRef.current : document.querySelector("h1");
    window.setTimeout(() => target?.focus?.(), 0);
    openerRef.current = null;
  }, []);

  const removeMediaParam = useCallback((replace = true) => {
    navigate({ pathname: location.pathname, search: withMediaParam(location.search, null), hash: location.hash }, { replace });
  }, [location.hash, location.pathname, location.search, navigate]);

  const close = useCallback(() => {
    if (location.state?.mediaLightbox) navigate(-1);
    else removeMediaParam(true);
  }, [location.state, navigate, removeMediaParam]);

  const openGallery = useCallback((options) => {
    const items = mergeMediaItems([], options.items || []);
    const index = Math.max(0, items.findIndex((item) => item.id === options.initialMediaId));
    if (!items.length) return;
    openerRef.current = options.opener || document.activeElement;
    setGallery({
      items,
      index,
      context: options.context || "media",
      firstPosition: options.pagination ? (options.pagination.page - 1) * options.pagination.pageSize : 0,
      total: options.pagination?.total || items.length,
      minPage: options.pagination?.page || 1,
      maxPage: options.pagination?.page || 1,
      totalPages: options.pagination?.totalPages || 1,
      loadPage: options.pagination?.loadPage || null,
      loadingEdge: false,
      error: null,
    });
    navigate({ pathname: location.pathname, search: withMediaParam(location.search, items[index].id), hash: location.hash }, { state: { ...(location.state || {}), mediaLightbox: true } });
    api.get(`/uploads/gallery/${encodeURIComponent(items[index].id)}`).then((result) => {
      setGallery((current) => {
        if (!current) return current;
        const target = current.items.findIndex((item) => item.id === result.data.id);
        if (target < 0) return current;
        const nextItems = [...current.items];
        nextItems[target] = result.data;
        return { ...current, items: nextItems };
      });
    }).catch(() => undefined);
  }, [location.hash, location.pathname, location.search, location.state, navigate]);

  const hydrateGallery = useCallback((options) => {
    if (!urlMediaId) return;
    const items = mergeMediaItems([], options.items || []);
    const index = items.findIndex((item) => item.id === urlMediaId);
    if (index < 0) return;
    setGallery((current) => {
      if (current?.context === options.context && current.items.length === items.length && current.items[current.index]?.id === urlMediaId) return current;
      return {
        items,
        index,
        context: options.context || "media",
        firstPosition: options.pagination ? (options.pagination.page - 1) * options.pagination.pageSize : 0,
        total: options.pagination?.total || items.length,
        minPage: options.pagination?.page || 1,
        maxPage: options.pagination?.page || 1,
        totalPages: options.pagination?.totalPages || 1,
        loadPage: options.pagination?.loadPage || null,
        loadingEdge: false,
        error: null,
      };
    });
  }, [urlMediaId]);

  const move = useCallback(async (delta) => {
    const current = galleryRef.current;
    if (!current || current.loadingEdge || !current.items.length) return;
    const target = current.index + delta;
    if (target >= 0 && target < current.items.length) {
      const item = current.items[target];
      setGallery({ ...current, index: target });
      navigate({ pathname: location.pathname, search: withMediaParam(location.search, item.id), hash: location.hash }, { replace: true, state: location.state });
      return;
    }
    const nextPage = delta > 0 ? current.maxPage + 1 : current.minPage - 1;
    if (!current.loadPage || nextPage < 1 || nextPage > current.totalPages) return;
    setGallery({ ...current, loadingEdge: true });
    try {
      const result = await current.loadPage(nextPage);
      const incoming = result?.items || [];
      if (!incoming.length) {
        setGallery({ ...current, loadingEdge: false });
        return;
      }
      if (delta > 0) {
        const items = mergeMediaItems(current.items, incoming);
        const index = current.items.length;
        const next = { ...current, items, index, maxPage: nextPage, loadingEdge: false };
        setGallery(next);
        navigate({ pathname: location.pathname, search: withMediaParam(location.search, items[index].id), hash: location.hash }, { replace: true, state: location.state });
      } else {
        const items = mergeMediaItems(current.items, incoming, { prepend: true });
        const index = Math.max(0, incoming.length - 1);
        const next = { ...current, items, index, minPage: nextPage, firstPosition: Math.max(0, current.firstPosition - incoming.length), loadingEdge: false };
        setGallery(next);
        navigate({ pathname: location.pathname, search: withMediaParam(location.search, items[index].id), hash: location.hash }, { replace: true, state: location.state });
      }
    } catch {
      setGallery({ ...current, loadingEdge: false });
    }
  }, [location.hash, location.pathname, location.search, location.state, navigate]);

  const download = useCallback(async (item) => {
    const target = item.downloads?.[0] || (item.image?.original_download_path ? { path: item.image.original_download_path } : null);
    if (!target?.path) return;
    const result = await api.blob(target.path);
    const url = URL.createObjectURL(result.data);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = target.filename || `media-${item.id}`;
    anchor.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }, []);

  useEffect(() => {
    if (status !== "authenticated" || !urlMediaId) return;
    const current = galleryRef.current;
    if (current?.items[current.index]?.id === urlMediaId) return;
    let active = true;
    api.get(`/uploads/gallery/${encodeURIComponent(urlMediaId)}`).then((result) => {
      if (!active) return;
      setGallery({ items: [result.data], index: 0, context: "direct", firstPosition: 0, total: 1, minPage: 1, maxPage: 1, totalPages: 1, loadPage: null, loadingEdge: false, error: null });
    }).catch(() => {
      if (active) setGallery({ items: [], index: 0, context: "direct", firstPosition: 0, total: 0, minPage: 1, maxPage: 1, totalPages: 1, loadPage: null, loadingEdge: false, error: true });
    });
    return () => { active = false; };
  }, [status, urlMediaId]);

  useEffect(() => {
    if (urlMediaId || !galleryRef.current) return;
    setGallery(null);
    restoreFocus();
  }, [restoreFocus, urlMediaId]);

  useEffect(() => {
    if (!gallery) return undefined;
    const root = document.getElementById("root");
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    root?.setAttribute("inert", "");
    root?.setAttribute("aria-hidden", "true");
    return () => {
      document.body.style.overflow = previousOverflow;
      root?.removeAttribute("inert");
      root?.removeAttribute("aria-hidden");
    };
  }, [gallery]);

  useEffect(() => {
    if (status === "authenticated") return;
    setGallery(null);
  }, [status, user?.id]);

  const value = useMemo(() => ({ openGallery, hydrateGallery, closeGallery: close }), [close, hydrateGallery, openGallery]);
  return <MediaLightboxContext.Provider value={value}>
    {children}
    {gallery ? <Lightbox gallery={gallery} close={close} move={move} download={download} /> : null}
  </MediaLightboxContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useMediaLightbox() {
  const value = useContext(MediaLightboxContext);
  if (!value) throw new Error("useMediaLightbox 必须在 MediaLightboxProvider 中使用");
  return value;
}
