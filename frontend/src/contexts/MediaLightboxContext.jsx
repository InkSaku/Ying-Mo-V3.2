import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
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
import {
  clampPan,
  clampScale,
  edgeResistance,
  shouldCommitGesture,
  zoomAround,
} from "../lib/lightboxGesture";

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

function LivePhotoViewer({ item, imageRef, onMediaReady }) {
  const image = useProtectedMedia(mediaDisplayPath(item));
  const video = useProtectedMedia(item.video?.read_path || null);
  const videoRef = useRef(null);
  const [playing, setPlaying] = useState(false);
  const reducedMotion = useReducedMotion();

  useLayoutEffect(() => { if (image.src || video.src) onMediaReady(); }, [image.src, video.src, onMediaReady]);

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

  return <div className="media-lightbox-live">
    {image.loading ? <div className="media-lightbox-loading" role="status">正在读取影像…</div> : null}
    {image.error ? <div className="media-lightbox-error" role="status">静态照片暂时无法读取。</div> : null}
    {image.src ? <img
      ref={imageRef}
      src={image.src}
      alt={item.image?.alt_text || "Live Photo 静态照片"}
      draggable="false"
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

function ImageViewer({ item, imageRef, onMediaReady }) {
  const state = useProtectedMedia(mediaDisplayPath(item));
  useLayoutEffect(() => { if (state.src) onMediaReady(); }, [state.src, onMediaReady]);
  return <div className="media-lightbox-image">
    {state.loading ? <div className="media-lightbox-loading" role="status">正在读取图片…</div> : null}
    {state.error ? <div className="media-lightbox-error" role="status">图片暂时无法读取。</div> : null}
    {state.src ? <img
      ref={imageRef}
      src={state.src}
      alt={item.image?.alt_text || "媒体记忆"}
      draggable="false"
    /> : null}
  </div>;
}

function AdjacentImage({ item }) {
  const image = useProtectedMedia(mediaDisplayPath(item));
  return <div className="media-lightbox-adjacent" aria-hidden="true">
    {image.src ? <img src={image.src} alt="" draggable="false" /> : null}
  </div>;
}

function MediaViewer({ item, previousItem, nextItem, canPrevious, canNext, onPrevious, onNext, onClose, backdropRef }) {
  const viewportRef = useRef(null);
  const trackRef = useRef(null);
  const imageRef = useRef(null);
  const pointersRef = useRef(new Map());
  const gestureRef = useRef(null);
  const timerRef = useRef(null);
  const lastTapRef = useRef(null);
  const lastTouchZoomRef = useRef(0);
  const viewRef = useRef({ scale: 1, x: 0, y: 0, slideX: 0, slideY: 0 });
  const reducedMotion = useReducedMotion();

  const renderPosition = useCallback(() => {
    const view = viewRef.current;
    if (imageRef.current) imageRef.current.style.transform = `translate3d(${view.x}px, ${view.y}px, 0) scale(${view.scale})`;
    const video = viewportRef.current?.querySelector(".media-lightbox-slide-current video");
    if (video) video.style.transform = `translate3d(${view.x}px, ${view.y}px, 0) scale(${view.scale})`;
    if (trackRef.current) trackRef.current.style.transform = `translate3d(${view.slideX}px, ${view.slideY}px, 0)`;
    if (viewportRef.current) viewportRef.current.dataset.zoomed = view.scale > 1 ? "true" : "false";
    backdropRef.current?.style.setProperty("--lightbox-backdrop-opacity", String(0.96 - Math.min(0.55, Math.abs(view.slideY) / Math.max(1, viewportRef.current?.clientHeight || 1))));
  }, [backdropRef]);

  const boundView = useCallback((candidate) => {
    const image = imageRef.current;
    const viewport = viewportRef.current;
    if (!image || !viewport) return { ...candidate, x: 0, y: 0 };
    return {
      ...candidate,
      x: clampPan(candidate.x, image.offsetWidth, viewport.clientWidth, candidate.scale),
      y: clampPan(candidate.y, image.offsetHeight, viewport.clientHeight, candidate.scale),
    };
  }, []);

  const cancelSettle = useCallback(() => {
    window.clearTimeout(timerRef.current);
    viewportRef.current?.classList.remove("is-settling");
    backdropRef.current?.classList.remove("is-settling");
  }, [backdropRef]);

  const settle = useCallback((action = null) => {
    cancelSettle();
    if (!reducedMotion) {
      viewportRef.current?.classList.add("is-settling");
      backdropRef.current?.classList.add("is-settling");
    }
    renderPosition();
    timerRef.current = window.setTimeout(() => {
      viewportRef.current?.classList.remove("is-settling");
      backdropRef.current?.classList.remove("is-settling");
      if (action) void action();
    }, reducedMotion ? 0 : 180);
  }, [backdropRef, cancelSettle, reducedMotion, renderPosition]);

  useLayoutEffect(() => {
    cancelSettle();
    pointersRef.current.clear();
    gestureRef.current = null;
    lastTapRef.current = null;
    lastTouchZoomRef.current = 0;
    viewRef.current = { scale: 1, x: 0, y: 0, slideX: 0, slideY: 0 };
    renderPosition();
  }, [item.id, cancelSettle, renderPosition]);

  useEffect(() => () => {
    window.clearTimeout(timerRef.current);
    backdropRef.current?.style.removeProperty("--lightbox-backdrop-opacity");
    backdropRef.current?.classList.remove("is-settling");
  }, [backdropRef]);

  useEffect(() => {
    const resize = () => {
      viewRef.current = boundView(viewRef.current);
      renderPosition();
    };
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, [boundView, renderPosition]);

  const toggleZoom = useCallback((event) => {
    if (!imageRef.current) return;
    const rect = viewportRef.current.getBoundingClientRect();
    const origin = { x: (event?.clientX ?? rect.left + rect.width / 2) - rect.left - rect.width / 2,
      y: (event?.clientY ?? rect.top + rect.height / 2) - rect.top - rect.height / 2 };
    const view = viewRef.current;
    const next = view.scale > 1 ? { ...view, scale: 1, x: 0, y: 0 } : boundView({ ...view, ...zoomAround(view, 2.5, origin) });
    viewRef.current = next;
    settle();
  }, [boundView, settle]);

  const beginSingle = (pointer) => {
    const view = viewRef.current;
    gestureRef.current = { kind: "single", mode: null, startX: pointer.x, startY: pointer.y,
      baseX: view.x, baseY: view.y, lastX: pointer.x, lastY: pointer.y, lastTime: performance.now(), velocityX: 0, velocityY: 0 };
  };

  const beginPinch = () => {
    const [first, second] = [...pointersRef.current.values()];
    if (!first || !second) return;
    const rect = viewportRef.current.getBoundingClientRect();
    gestureRef.current = { kind: "pinch", distance: Math.hypot(first.x - second.x, first.y - second.y),
      scale: viewRef.current.scale, x: viewRef.current.x, y: viewRef.current.y,
      origin: { x: (first.x + second.x) / 2 - rect.left - rect.width / 2,
        y: (first.y + second.y) / 2 - rect.top - rect.height / 2 } };
    viewRef.current.slideX = 0;
    viewRef.current.slideY = 0;
    renderPosition();
  };

  const onPointerDown = (event) => {
    if (event.target.closest("button, a") || (event.pointerType === "mouse" && event.button !== 0)) return;
    cancelSettle();
    if (viewRef.current.slideX || viewRef.current.slideY) {
      viewRef.current.slideX = 0;
      viewRef.current.slideY = 0;
      renderPosition();
    }
    event.currentTarget.setPointerCapture(event.pointerId);
    pointersRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (pointersRef.current.size === 2) beginPinch();
    else if (pointersRef.current.size === 1) beginSingle({ x: event.clientX, y: event.clientY });
  };

  const onPointerMove = (event) => {
    if (!pointersRef.current.has(event.pointerId)) return;
    pointersRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    const gesture = gestureRef.current;
    if (pointersRef.current.size === 2 && gesture?.kind === "pinch") {
      const [first, second] = [...pointersRef.current.values()];
      const rect = viewportRef.current.getBoundingClientRect();
      const target = { x: (first.x + second.x) / 2 - rect.left - rect.width / 2,
        y: (first.y + second.y) / 2 - rect.top - rect.height / 2 };
      const next = zoomAround(gesture, gesture.scale * Math.hypot(first.x - second.x, first.y - second.y) / Math.max(1, gesture.distance), gesture.origin, target);
      viewRef.current = boundView({ ...viewRef.current, ...next });
      renderPosition();
      return;
    }
    if (gesture?.kind !== "single") return;
    const dx = event.clientX - gesture.startX;
    const dy = event.clientY - gesture.startY;
    const now = performance.now();
    const elapsed = Math.max(1, now - gesture.lastTime);
    gesture.velocityX = (event.clientX - gesture.lastX) / elapsed;
    gesture.velocityY = (event.clientY - gesture.lastY) / elapsed;
    gesture.lastX = event.clientX;
    gesture.lastY = event.clientY;
    gesture.lastTime = now;
    if (viewRef.current.scale > 1) {
      viewRef.current = boundView({ ...viewRef.current, x: gesture.baseX + dx, y: gesture.baseY + dy });
    } else {
      if (!gesture.mode && Math.hypot(dx, dy) > 8) gesture.mode = Math.abs(dx) >= Math.abs(dy) ? "horizontal" : "vertical";
      if (gesture.mode === "horizontal") {
        viewRef.current.slideX = (dx < 0 && !canNext) || (dx > 0 && !canPrevious) ? edgeResistance(dx) : dx;
      } else if (gesture.mode === "vertical") {
        viewRef.current.slideY = dy;
      }
    }
    renderPosition();
  };

  const onPointerEnd = (event) => {
    if (!pointersRef.current.has(event.pointerId)) return;
    pointersRef.current.delete(event.pointerId);
    if (pointersRef.current.size === 1) {
      beginSingle([...pointersRef.current.values()][0]);
      return;
    }
    const gesture = gestureRef.current;
    gestureRef.current = null;
    if (gesture?.kind === "single" && performance.now() - gesture.lastTime > 80) {
      gesture.velocityX = 0;
      gesture.velocityY = 0;
    }
    if (event.type === "pointercancel") {
      viewRef.current.slideX = 0;
      viewRef.current.slideY = 0;
      settle();
      return;
    }
    if (gesture?.kind === "single" && viewRef.current.scale === 1 && gesture.mode === "horizontal") {
      const dx = viewRef.current.slideX;
      const available = dx < 0 ? canNext : canPrevious;
      if (available && shouldCommitGesture(dx, gesture.velocityX, viewportRef.current.clientWidth)) {
        viewRef.current.slideX = Math.sign(dx) * viewportRef.current.clientWidth;
        settle(dx < 0 ? onNext : onPrevious);
        return;
      }
    }
    if (gesture?.kind === "single" && viewRef.current.scale === 1 && gesture.mode === "vertical") {
      const dy = viewRef.current.slideY;
      if (shouldCommitGesture(dy, gesture.velocityY, viewportRef.current.clientHeight)) {
        viewRef.current.slideY = Math.sign(dy) * viewportRef.current.clientHeight;
        settle(onClose);
        return;
      }
    }
    viewRef.current.slideX = 0;
    viewRef.current.slideY = 0;
    settle();
    if (event.pointerType === "touch" && gesture?.kind === "single" && !gesture.mode) {
      const previous = lastTapRef.current;
      const now = performance.now();
      if (previous && now - previous.time < 300 && Math.hypot(previous.x - event.clientX, previous.y - event.clientY) < 32) {
        lastTapRef.current = null;
        lastTouchZoomRef.current = now;
        toggleZoom(event);
      } else lastTapRef.current = { x: event.clientX, y: event.clientY, time: now };
    }
  };

  const onWheel = (event) => {
    if (!imageRef.current) return;
    if (event.ctrlKey || event.metaKey) {
      event.preventDefault();
      const rect = viewportRef.current.getBoundingClientRect();
      const origin = { x: event.clientX - rect.left - rect.width / 2, y: event.clientY - rect.top - rect.height / 2 };
      viewRef.current = boundView({ ...viewRef.current, ...zoomAround(viewRef.current, clampScale(viewRef.current.scale * Math.exp(-event.deltaY * 0.008)), origin) });
      renderPosition();
    } else if (viewRef.current.scale > 1) {
      event.preventDefault();
      viewRef.current = boundView({ ...viewRef.current, x: viewRef.current.x - event.deltaX, y: viewRef.current.y - event.deltaY });
      renderPosition();
    }
  };

  return <div className="media-lightbox-viewport" ref={viewportRef} data-zoomed="false"
    onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerEnd} onPointerCancel={onPointerEnd} onWheel={onWheel}
    onDoubleClick={(event) => { if (!event.target.closest("button, a") && performance.now() - lastTouchZoomRef.current > 400) toggleZoom(event); }}>
    <div className="media-lightbox-track" ref={trackRef}>
      <div className="media-lightbox-slide media-lightbox-slide-previous">{previousItem ? <AdjacentImage item={previousItem} /> : null}</div>
      <div className="media-lightbox-slide media-lightbox-slide-current">
        {item.kind === "live_photo" ? <LivePhotoViewer item={item} imageRef={imageRef} onMediaReady={renderPosition} /> : <ImageViewer item={item} imageRef={imageRef} onMediaReady={renderPosition} />}
      </div>
      <div className="media-lightbox-slide media-lightbox-slide-next">{nextItem ? <AdjacentImage item={nextItem} /> : null}</div>
    </div>
  </div>;
}

function Lightbox({ gallery, close, move, download }) {
  const item = gallery.items[gallery.index] || null;
  const dialogRef = useRef(null);
  const backdropRef = useRef(null);
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
    <div className="media-lightbox-backdrop" ref={backdropRef} onClick={(event) => { if (event.target === event.currentTarget) close(); }}>
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
          <MediaViewer item={item} previousItem={gallery.items[gallery.index - 1]} nextItem={gallery.items[gallery.index + 1]}
            canPrevious={canPrevious && !gallery.loadingEdge} canNext={canNext && !gallery.loadingEdge}
            onPrevious={() => move(-1)} onNext={() => move(1)} onClose={close} backdropRef={backdropRef} />
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
