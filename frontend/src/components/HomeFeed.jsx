import { Fragment, useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { api } from "../lib/api";
import {
  homeFeedDayKey,
  homeFeedDayLabel,
  homeFeedMemoryInterludeIndex,
  homeFeedAnchorScrollTarget,
  homeFeedPath,
  HOME_FEED_SAVE_EVENT,
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

function emptyFeed() {
  return { items: [], nextCursor: "", hasMore: true, memoryInterlude: null };
}

export function HomeFeed({ userId, type, newPost }) {
  const cachedRef = useRef(readHomeFeedCache(userId, type));
  const initialRef = useRef(cachedRef.current || emptyFeed());
  const [feed, setFeed] = useState(initialRef.current);
  const feedRef = useRef(initialRef.current);
  const [loading, setLoading] = useState(!cachedRef.current);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState("");
  const mountedRef = useRef(true);
  const requestRef = useRef(false);
  const departureRef = useRef(null);
  const preserveFramesRef = useRef({ first: 0, second: 0 });
  const sectionRef = useRef(null);
  const sentinelRef = useRef(null);
  const restoreRef = useRef(cachedRef.current && typeof window !== "undefined" ? {
    anchor: readHomeFeedAnchor(userId, type),
    fallback: readHomeFeedScroll(window.sessionStorage, userId, type),
  } : null);

  const feedViewportTop = useCallback(() => {
    const toolbar = document.querySelector(".home-feed-toolbar");
    if (!toolbar) return 0;
    const rect = toolbar.getBoundingClientRect();
    return rect.top <= 80 && rect.bottom > 0 ? Math.round(rect.bottom + 8) : 0;
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
    requestRef.current = true;
    if (append) setLoadingMore(true);
    else setLoading(true);
    setError("");
    try {
      const result = await api.get(homeFeedPath(type, cursor));
      const data = result.data || {};
      commit({
        items: append ? mergeHomeFeedItems(feedRef.current.items, data.items || []) : (data.items || []),
        nextCursor: data.next_cursor || "",
        hasMore: Boolean(data.has_more),
        memoryInterlude: append ? (feedRef.current.memoryInterlude || null) : (data.memory_interlude || null),
      });
    } catch (loadError) {
      if (mountedRef.current) setError(loadError.message);
    } finally {
      requestRef.current = false;
      if (mountedRef.current) {
        setLoading(false);
        setLoadingMore(false);
      }
    }
  }, [commit, type]);

  useEffect(() => {
    mountedRef.current = true;
    if (!cachedRef.current) void load();
    return () => { mountedRef.current = false; };
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

  let previousDay = "";
  const memoryIndex = homeFeedMemoryInterludeIndex(feed.items.length, feed.memoryInterlude);
  return (
    <section ref={sectionRef} className="home-feed" aria-labelledby="home-feed-title" aria-busy={loading || loadingMore || undefined} onClickCapture={(event) => {
      if (event.target.closest?.("a[href]")) rememberDeparture();
    }}>
      {loading && !feed.items.length ? <div className="home-feed-loading" role="status"><span /><span /><span /><p className="sr-only">正在读取时间流</p></div> : null}

      {feed.items.map((post, index) => {
        const dayKey = post._feedFresh ? `fresh-${post.id}` : homeFeedDayKey(post.semantic_time || post.published_at);
        const showDay = dayKey !== previousDay;
        previousDay = dayKey;
        return (
          <Fragment key={post.id}>
            <div className="home-feed-entry" data-feed-post-id={post.id}>{showDay ? <h3 className="home-feed-day">{post._feedFresh ? "刚刚" : homeFeedDayLabel(post.semantic_time || post.published_at)}</h3> : null}<FeedPost post={post} /></div>
            {index + 1 === memoryIndex ? <FeedMemoryInterlude memory={feed.memoryInterlude} /> : null}
          </Fragment>
        );
      })}

      {!feed.items.length && memoryIndex === 0 ? <FeedMemoryInterlude memory={feed.memoryInterlude} /> : null}

      {!loading && !feed.items.length && !error ? <div className="home-feed-empty"><h3>时间流还是空的</h3><p>发布第一则随记，或邀请朋友一起记录生活。</p></div> : null}
      {error ? <div className="home-feed-error" role="alert"><p>{error}</p><button className="btn btn-secondary" type="button" onClick={() => void load({ cursor: feed.items.length ? feed.nextCursor : "", append: Boolean(feed.items.length) })}>重新读取</button></div> : null}

      <div ref={sentinelRef} className="home-feed-sentinel" aria-hidden="true" />
      {loadingMore ? <p className="home-feed-more" role="status">正在接上更早的记录...</p> : null}
      {!loading && !loadingMore && feed.hasMore && typeof IntersectionObserver === "undefined" ? <button className="btn btn-secondary home-feed-more-button" type="button" onClick={() => void load({ cursor: feed.nextCursor, append: true })}>继续阅读</button> : null}
      {!loading && !loadingMore && !feed.hasMore && feed.items.length ? <p className="home-feed-end">已经读到这段时间的尽头。</p> : null}
    </section>
  );
}
