import { PAPER_EASE, paperMotionAllowed } from "../lib/paperMotion";
import { Fragment, useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { api } from "../lib/api";
import {
  homeFeedDayKey,
  homeFeedDayLabel,
  homeFeedMemoryInterludeIndex,
  homeFeedAnchorScrollTarget,
  homeFeedPath,
  HOME_FEED_SAVE_EVENT,
  HOME_PINS_CHANGED_EVENT,
  captureHomeFeedAnchor,
  mergeHomeFeedItems,
  readHomeFeedAnchor,
  readHomeFeedCache,
  readHomeFeedScroll,
  removeHomeFeedScroll,
  writeHomeFeedAnchor,
  writeHomeFeedCache,
  writeHomeFeedScroll,
} from "../lib/homeFeed";
import { FeedPost } from "./FeedPost";
import { FeedMemoryInterlude } from "./FeedMemoryInterlude";
import { HomeCollectionsInterlude } from "./HomeClosing";

const REFRESH_INTERVAL_MS = 60_000;
// 手机“共同记录”插页夹在第 6 条之后；不足 6 条时排在已读到的最后一条之后。
const COLLECTIONS_INTERLUDE_AFTER = 6;

function emptyFeed() {
  return { items: [], nextCursor: "", hasMore: true, memoryInterlude: null, pins: null };
}

function FeedEntry({ post, showDay }) {
  const semanticTime = post.semantic_time || post.published_at;
  return (
    <div className={`home-feed-entry is-${post.post_type}${showDay ? " starts-day" : ""}`} data-feed-post-id={post.id}>
      <div className="home-feed-day-slot">
        {showDay ? <h3 className="home-feed-day"><span>{post._feedFresh ? "刚刚" : homeFeedDayLabel(semanticTime)}</span></h3> : null}
      </div>
      <div className="home-feed-entry-content"><FeedPost post={post} /></div>
    </div>
  );
}

function MemoryInterludeRow({ memory }) {
  return (
    <div className="home-feed-interlude-row">
      <div className="home-feed-day-slot"><p>回望</p></div>
      <FeedMemoryInterlude memory={memory} />
    </div>
  );
}

export function HomeFeed({ userId, type, newPost, onSnapshot, featuredId = null, hideEmptyState = false, collections = null }) {
  const cachedRef = useRef(readHomeFeedCache(userId, type));
  const initialRef = useRef(cachedRef.current || emptyFeed());
  const [feed, setFeed] = useState(initialRef.current);
  const feedRef = useRef(initialRef.current);
  const [loading, setLoading] = useState(!cachedRef.current);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState("");
  const mountedRef = useRef(true);
  const requestRef = useRef(null);
  const departureRef = useRef(null);
  const preserveFramesRef = useRef({ first: 0, second: 0 });
  const sectionRef = useRef(null);
  const sentinelRef = useRef(null);
  const celebratedRef = useRef(null);
  const newPostRef = useRef(newPost);
  const restoreRef = useRef(cachedRef.current && typeof window !== "undefined" ? {
    anchor: readHomeFeedAnchor(userId, type),
    fallback: readHomeFeedScroll(window.sessionStorage, userId, type),
  } : null);

  useEffect(() => {
    newPostRef.current = newPost;
  }, [newPost]);

  useEffect(() => {
    if (!loading && !error) onSnapshot?.(feed);
  }, [feed, loading, error, onSnapshot]);

  const feedViewportTop = useCallback(() => {
    const toolbar = document.querySelector(".home-feed-toolbar");
    if (!toolbar) return 0;
    const rect = toolbar.getBoundingClientRect();
    const headerBottom = document.querySelector(".app-header")?.getBoundingClientRect().bottom || 0;
    return rect.top <= headerBottom + 1 && rect.bottom > 0 ? Math.round(rect.bottom + 8) : 0;
  }, []);

  const capturePosition = useCallback(() => {
    if (!sectionRef.current) return null;
    const entries = [...sectionRef.current.querySelectorAll(".home-feed-entry[data-feed-post-id]")].map((node) => {
      const rect = node.getBoundingClientRect();
      return { id: Number(node.dataset.feedPostId), top: rect.top, bottom: rect.bottom };
    });
    const anchor = captureHomeFeedAnchor(entries, feedViewportTop());
    if (anchor) writeHomeFeedAnchor(userId, type, anchor);
    return anchor;
  }, [feedViewportTop, type, userId]);

  const restoreAnchor = useCallback((anchor) => {
    if (!anchor || !sectionRef.current) return false;
    const node = [...sectionRef.current.querySelectorAll(".home-feed-entry[data-feed-post-id]")]
      .find((entry) => Number(entry.dataset.feedPostId) === anchor.postId);
    if (!node) return false;
    const target = homeFeedAnchorScrollTarget(anchor, {
      entryTop: node.getBoundingClientRect().top,
      viewportTop: feedViewportTop(),
      scrollY: window.scrollY,
    });
    if (target === null) return false;
    window.scrollTo(0, target);
    return true;
  }, [feedViewportTop]);

  const rememberDeparture = useCallback(() => {
    const anchor = capturePosition();
    const scrollY = window.scrollY;
    departureRef.current = { anchor, scrollY };
    writeHomeFeedScroll(window.sessionStorage, userId, type, scrollY);
  }, [capturePosition, type, userId]);

  useEffect(() => {
    window.addEventListener(HOME_FEED_SAVE_EVENT, rememberDeparture);
    return () => window.removeEventListener(HOME_FEED_SAVE_EVENT, rememberDeparture);
  }, [rememberDeparture]);

  const preserveAnchorAfterRender = useCallback((anchor) => {
    const frames = preserveFramesRef.current;
    if (frames.first) window.cancelAnimationFrame(frames.first);
    if (frames.second) window.cancelAnimationFrame(frames.second);
    frames.first = window.requestAnimationFrame(() => {
      frames.second = window.requestAnimationFrame(() => {
        restoreAnchor(anchor);
        preserveFramesRef.current = { first: 0, second: 0 };
      });
    });
  }, [restoreAnchor]);

  const commit = useCallback((value) => {
    feedRef.current = value;
    writeHomeFeedCache(userId, type, value);
    if (mountedRef.current) setFeed(value);
  }, [type, userId]);

  const load = useCallback(async ({ cursor = "", append = false } = {}) => {
    if (requestRef.current) return;
    const controller = new AbortController();
    requestRef.current = controller;
    const previousFeed = feedRef.current;
    const publicationAtStart = newPostRef.current;
    if (append) setLoadingMore(true);
    else setLoading(true);
    setError("");
    try {
      let next = emptyFeed();
      let appending = append;
      // Revalidate the pages already read so deleted records cannot survive in
      // older cached pages, while keeping the reader's place in a long feed.
      for (let attempt = 0; attempt < 2; attempt += 1) {
        next = emptyFeed();
        let pageCursor = appending ? cursor : "";
        try {
          do {
            const result = await api.get(homeFeedPath(type, pageCursor), { signal: controller.signal, cache: "no-store" });
            if (controller.signal.aborted || !mountedRef.current) return;
            const data = result.data || {};
            next = {
              items: mergeHomeFeedItems(next.items, data.items || []),
              nextCursor: data.next_cursor || "",
              hasMore: Boolean(data.has_more),
              memoryInterlude: pageCursor ? next.memoryInterlude : (data.memory_interlude || null),
              pins: data.pins || null,
            };
            pageCursor = next.nextCursor;
          } while (!appending && next.hasMore && pageCursor && next.items.length < previousFeed.items.length);
          break;
        } catch (requestError) {
          if (attempt || requestError.code !== "HOME_PINS_CHANGED") throw requestError;
          // Start a fresh signed sequence when curation changes between pages.
          appending = false;
        }
      }

      const anchor = !appending && !restoreRef.current && window.scrollY > 200 ? capturePosition() : null;
      if (appending) {
        next.items = mergeHomeFeedItems(feedRef.current.items, next.items);
        next.memoryInterlude = feedRef.current.memoryInterlude || null;
      } else {
        // A note published during this request must keep its immediate echo.
        const fresh = newPostRef.current !== publicationAtStart
          ? feedRef.current.items.filter((post) => post._feedFresh && post.id === newPostRef.current?.id)
          : [];
        next.items = mergeHomeFeedItems(next.items, fresh, { prepend: true });
      }
      const pinIds = new Set((next.pins?.items || []).map((post) => post.id));
      next.items = next.items.filter((post) => !pinIds.has(post.id));
      commit(next);
      if (anchor) preserveAnchorAfterRender(anchor);
    } catch (loadError) {
      if (!controller.signal.aborted && mountedRef.current) setError(loadError.message);
    } finally {
      if (requestRef.current === controller) {
        requestRef.current = null;
        if (mountedRef.current) {
          setLoading(false);
          setLoadingMore(false);
        }
      }
    }
  }, [capturePosition, commit, preserveAnchorAfterRender, type]);

  useEffect(() => {
    mountedRef.current = true;
    void load();
    const refresh = () => {
      if (document.visibilityState === "visible" && navigator.onLine !== false) void load();
    };
    const interval = window.setInterval(refresh, REFRESH_INTERVAL_MS);
    window.addEventListener("focus", refresh);
    window.addEventListener("online", refresh);
    window.addEventListener(HOME_PINS_CHANGED_EVENT, refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      mountedRef.current = false;
      requestRef.current?.abort();
      requestRef.current = null;
      window.clearInterval(interval);
      window.removeEventListener("focus", refresh);
      window.removeEventListener("online", refresh);
      window.removeEventListener(HOME_PINS_CHANGED_EVENT, refresh);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [load]);

  useEffect(() => () => {
    const frames = preserveFramesRef.current;
    if (frames.first) window.cancelAnimationFrame(frames.first);
    if (frames.second) window.cancelAnimationFrame(frames.second);
  }, []);

  useLayoutEffect(() => {
    const saved = restoreRef.current;
    if (!saved || loading || !feed.items.length) return undefined;
    let secondFrame = 0;
    let settleTimer = 0;
    const apply = () => {
      if (!restoreAnchor(saved.anchor) && Number.isFinite(saved.fallback)) {
        window.scrollTo(0, saved.fallback);
      }
    };
    const firstFrame = window.requestAnimationFrame(() => {
      apply();
      secondFrame = window.requestAnimationFrame(() => {
        apply();
        settleTimer = window.setTimeout(() => {
          apply();
          restoreRef.current = null;
        }, 120);
      });
      removeHomeFeedScroll(window.sessionStorage, userId, type);
    });
    return () => {
      window.cancelAnimationFrame(firstFrame);
      if (secondFrame) window.cancelAnimationFrame(secondFrame);
      if (settleTimer) window.clearTimeout(settleTimer);
    };
  }, [feed.items.length, loading, restoreAnchor, type, userId]);

  useLayoutEffect(() => () => {
    if (departureRef.current) {
      const { anchor, scrollY } = departureRef.current;
      if (anchor) writeHomeFeedAnchor(userId, type, anchor);
      writeHomeFeedScroll(window.sessionStorage, userId, type, scrollY);
      return;
    }
    capturePosition();
    writeHomeFeedScroll(window.sessionStorage, userId, type, window.scrollY);
  }, [capturePosition, type, userId]);

  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel || !feed.hasMore || loading || loadingMore || error) return undefined;
    if (typeof IntersectionObserver === "undefined") return undefined;
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) void load({ cursor: feed.nextCursor, append: true });
    }, { rootMargin: "500px 0px" });
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [error, feed.hasMore, feed.nextCursor, load, loading, loadingMore]);

  useEffect(() => {
    if (!newPost || (type !== "all" && type !== newPost.post_type)) return;
    const anchor = window.scrollY > 200 ? capturePosition() : null;
    commit({
      ...feedRef.current,
      items: mergeHomeFeedItems(feedRef.current.items, [{ ...newPost, _feedFresh: true }], { prepend: true }),
    });
    if (anchor) preserveAnchorAfterRender(anchor);
  }, [capturePosition, commit, newPost, preserveAnchorAfterRender, type]);

  useLayoutEffect(() => {
    if (!newPost || celebratedRef.current === newPost.id) return;
    const entry = [...(sectionRef.current?.querySelectorAll("[data-feed-post-id]") || [])]
      .find((node) => node.dataset.feedPostId === String(newPost.id));
    if (!entry) return;
    celebratedRef.current = newPost.id;
    if (!paperMotionAllowed()) return;
    const tint = getComputedStyle(entry).getPropertyValue("--surface-alt").trim()
      || "color-mix(in srgb, var(--brand-link) 7%, var(--page))";
    const animation = entry.animate([
      { transform: "translateY(-8px)", opacity: .6, backgroundColor: tint },
      { transform: "translateY(0)", opacity: 1, backgroundColor: tint, offset: .3 },
      { transform: "translateY(0)", opacity: 1, backgroundColor: "transparent" },
    ], { duration: 900, easing: PAPER_EASE });
    return () => animation.cancel();
  }, [feed.items, newPost]);

  // 首页开篇已经主推的那条不在下方时间流里再出现一次；数据和分页游标保持不变。
  const streamItems = featuredId ? feed.items.filter((post) => post.id !== featuredId) : feed.items;
  const memoryIndex = homeFeedMemoryInterludeIndex(streamItems.length, feed.memoryInterlude);
  const collectionsIndex = collections?.length && !loading ? Math.min(COLLECTIONS_INTERLUDE_AFTER, streamItems.length) : -1;
  let previousStreamDay = "";
  return (
    <section ref={sectionRef} className="home-feed" aria-labelledby="home-feed-title" aria-busy={loading || loadingMore || undefined} onClickCapture={(event) => {
      if (event.target.closest?.("a[href]")) rememberDeparture();
    }}>
      {loading && !feed.items.length ? <div className="home-feed-loading" role="status"><span /><span /><span /><p className="sr-only">正在读取时间流</p></div> : null}

      {streamItems.length ? <div className="home-feed-stream">
        {streamItems.map((post, index) => {
          const dayKey = post._feedFresh ? `fresh-${post.id}` : homeFeedDayKey(post.semantic_time || post.published_at);
          const showDay = dayKey !== previousStreamDay;
          previousStreamDay = dayKey;
          return (
            <Fragment key={post.id}>
              <FeedEntry post={post} showDay={showDay} />
              {index + 1 === memoryIndex ? <MemoryInterludeRow memory={feed.memoryInterlude} /> : null}
              {index + 1 === collectionsIndex ? <HomeCollectionsInterlude collections={collections} /> : null}
            </Fragment>
          );
        })}
      </div> : null}

      {!streamItems.length && memoryIndex === 0 ? <FeedMemoryInterlude memory={feed.memoryInterlude} /> : null}
      {!streamItems.length && collectionsIndex === 0 ? <HomeCollectionsInterlude collections={collections} /> : null}

      {/* 新成员的“第一封信”已经说明下一步，这里不再重复一条空状态。 */}
      {!loading && !streamItems.length && !error && !hideEmptyState ? <div className="home-feed-empty"><h3>{feed.pins?.items?.length || feed.items.length ? "暂无其他记录" : "暂无记录"}</h3><p>发布第一则随记，或邀请朋友一起记录生活。</p></div> : null}
      {error ? <div className="home-feed-error" role="alert"><p>{error}</p><button className="btn btn-secondary" type="button" onClick={() => void load()}>重新读取</button></div> : null}

      <div ref={sentinelRef} className="home-feed-sentinel" aria-hidden="true" />
      {loadingMore ? <p className="home-feed-more" role="status">正在加载更早的记录…...</p> : null}
      {!loading && !loadingMore && feed.hasMore && typeof IntersectionObserver === "undefined" ? <button className="btn btn-secondary home-feed-more-button" type="button" onClick={() => void load({ cursor: feed.nextCursor, append: true })}>继续阅读</button> : null}
      {!loading && !loadingMore && !feed.hasMore && streamItems.length ? <p className="home-feed-end">已显示全部记录。</p> : null}
    </section>
  );
}
