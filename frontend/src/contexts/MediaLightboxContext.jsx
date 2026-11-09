import {
  createContext,
  lazy,
  Suspense,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { animatePhoto, cancelPhotoContinuity, photoThumbnail } from "../lib/photoContinuity";
import { useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "./AuthContext";
import { api } from "../lib/api";
import { mergeMediaItems, withMediaParam } from "../lib/mediaGallery";

const MediaLightboxContext = createContext(null);
// 灯箱界面按需加载；main.jsx 在应用空闲时调用 preloadMediaLightbox 提前取，点开图片时通常已就绪。
const loadLightbox = () => import("../components/MediaLightbox");
const Lightbox = lazy(() => loadLightbox().then((module) => ({ default: module.Lightbox })));

// eslint-disable-next-line react-refresh/only-export-components
export function preloadMediaLightbox() {
  return loadLightbox();
}

export function MediaLightboxProvider({ children }) {
  const { status, user } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [gallery, setGallery] = useState(null);
  const lightboxOpen = Boolean(gallery);
  const galleryRef = useRef(null);
  const openerRef = useRef(null);
  const resolvedRef = useRef(new Set());
  galleryRef.current = gallery;
  const urlMediaId = useMemo(() => new URLSearchParams(location.search).get("media"), [location.search]);

  const restoreFocus = useCallback(() => {
    const target = openerRef.current?.isConnected ? openerRef.current : document.querySelector("h1");
    if (target && !target.hasAttribute("tabindex") && target.tagName === "H1") target.tabIndex = -1;
    target?.focus?.({ preventScroll: true });
    openerRef.current = null;
  }, []);

  const removeMediaParam = useCallback((replace = true) => {
    navigate({ pathname: location.pathname, search: withMediaParam(location.search, null), hash: location.hash }, { replace });
  }, [location.hash, location.pathname, location.search, navigate]);

  const close = useCallback(() => {
    if (location.state?.mediaLightbox) navigate(-1);
    else removeMediaParam(true);
  }, [location.state, navigate, removeMediaParam]);

  // 列表或正文给的是简版条目；翻到哪一张，再向 /uploads/gallery 取它的完整信息（原件下载、Live Photo 视频），每张只取一次。
  const resolveItem = useCallback((mediaId) => {
    if (!mediaId || resolvedRef.current.has(mediaId)) return;
    resolvedRef.current.add(mediaId);
    api.get(`/uploads/gallery/${encodeURIComponent(mediaId)}`).then((result) => {
      setGallery((current) => {
        if (!current) return current;
        const target = current.items.findIndex((item) => item.id === result.data.id);
        if (target < 0) return current;
        const nextItems = [...current.items];
        nextItems[target] = result.data;
        return { ...current, items: nextItems };
      });
    }).catch(() => { resolvedRef.current.delete(mediaId); });
  }, []);

  const openGallery = useCallback((options) => {
    const items = mergeMediaItems([], options.items || []);
    const index = Math.max(0, items.findIndex((item) => item.id === options.initialMediaId));
    if (!items.length) return;
    cancelPhotoContinuity();
    openerRef.current = options.opener || document.activeElement;
    if (openerRef.current) openerRef.current.dataset.galleryPath = location.pathname;
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
    resolvedRef.current = new Set();
    resolveItem(items[index].id);
  }, [location.hash, location.pathname, location.search, location.state, navigate, resolveItem]);

  const hydrateGallery = useCallback((options) => {
    if (!urlMediaId) return;
    const items = mergeMediaItems([], options.items || []);
    const index = items.findIndex((item) => item.id === urlMediaId);
    if (index < 0) return;
    const current = galleryRef.current;
    if (current?.context === options.context && current.items.length === items.length && current.items[current.index]?.id === urlMediaId) return;
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
    // 直接打开带 ?media= 的链接时，当前这张也要取完整信息（原件下载、Live Photo 视频）。
    resolvedRef.current = new Set();
    resolveItem(urlMediaId);
  }, [resolveItem, urlMediaId]);

  const move = useCallback(async (delta) => {
    cancelPhotoContinuity();
    const current = galleryRef.current;
    if (!current || current.loadingEdge || !current.items.length) return;
    const target = current.index + delta;
    if (target >= 0 && target < current.items.length) {
      const item = current.items[target];
      setGallery({ ...current, index: target });
      navigate({ pathname: location.pathname, search: withMediaParam(location.search, item.id), hash: location.hash }, { replace: true, state: location.state });
      resolveItem(item.id);
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
  }, [location.hash, location.pathname, location.search, location.state, navigate, resolveItem]);

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
      // 页面已经用完整序列接管了这张图（详情页、合集影像墙），不再用单张覆盖。
      if (!active || galleryRef.current?.items[galleryRef.current.index]?.id === urlMediaId) return;
      setGallery({ items: [result.data], index: 0, context: "direct", firstPosition: 0, total: 1, minPage: 1, maxPage: 1, totalPages: 1, loadPage: null, loadingEdge: false, error: null });
    }).catch(() => {
      if (active) setGallery({ items: [], index: 0, context: "direct", firstPosition: 0, total: 0, minPage: 1, maxPage: 1, totalPages: 1, loadPage: null, loadingEdge: false, error: true });
    });
    return () => { active = false; };
  }, [status, urlMediaId]);

  useLayoutEffect(() => {
    if (urlMediaId || !galleryRef.current) return;
    const currentItem = galleryRef.current.items[galleryRef.current.index];
    const image = document.querySelector(".media-lightbox-slide-current img");
    const thumbnail = photoThumbnail(currentItem?.id, openerRef.current);
    if (location.pathname === openerRef.current?.dataset.galleryPath) animatePhoto(image, thumbnail, true);
    else cancelPhotoContinuity();
    setGallery(null);
  }, [location.pathname, urlMediaId]);

  useEffect(() => {
    if (!lightboxOpen) return undefined;
    const root = document.getElementById("root");
    root?.setAttribute("inert", "");
    root?.setAttribute("aria-hidden", "true");
    return () => {
      root?.removeAttribute("inert");
      root?.removeAttribute("aria-hidden");
      restoreFocus();
    };
  }, [lightboxOpen, restoreFocus]);

  useEffect(() => {
    if (status === "authenticated") return;
    cancelPhotoContinuity();
    setGallery(null);
  }, [status, user?.id]);

  const value = useMemo(() => ({ openGallery, hydrateGallery, closeGallery: close }), [close, hydrateGallery, openGallery]);
  return <MediaLightboxContext.Provider value={value}>
    {children}
    {gallery ? <Suspense fallback={null}><Lightbox gallery={gallery} close={close} move={move} download={download} opener={openerRef.current} /></Suspense> : null}
  </MediaLightboxContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useMediaLightbox() {
  const value = useContext(MediaLightboxContext);
  if (!value) throw new Error("useMediaLightbox 必须在 MediaLightboxProvider 中使用");
  return value;
}
