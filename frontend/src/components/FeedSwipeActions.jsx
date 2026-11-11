import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "../lib/api";
import { homeFeedExcerpt } from "../lib/homeFeed";
import { REACTION_DEFINITIONS, normalizeReactions, optimisticReaction } from "../lib/reactions";
import { MobileSheet } from "./MobileSheet";
import { UndoNotice } from "./UndoNotice";

// 手机首页时间流的“拿起来”：按住一条记录约 0.26 秒，纸从桌面浮起，两侧露出“收藏”“回应”；
// 横向拖动时纸跟着手指走，越过约 76px 松手才执行：右拖收藏（已收藏则取消，可撤销），左拖打开回应面板。
// 竖向滑动交给浏览器正常滚动；图片、视频与按钮保留各自的手势；手势只是快捷方式，原有按钮不变。
const GESTURE_QUERY = "(max-width: 767px) and (pointer: coarse)";
const LIFT_DELAY = 260;
const DECIDE = 10;
const ARM = 76;
const SOFT = 96;
const LIMIT = 140;
const EDGE = 24;
const LEARNED_KEY = "yingmo:feed-swipe-learned";
const LEARNED_EVENT = "yingmo:feed-swipe-learned";
const STAR = "m16 5.5 3.25 6.6 7.25 1.05-5.25 5.12 1.24 7.23L16 22.08l-6.49 3.42 1.24-7.23-5.25-5.12 7.25-1.05L16 5.5Z";
const FACE = "M20.5 12.5a8.5 8.5 0 1 1-9-9M7.8 14.3c1.5 2.1 4.9 2.1 6.4 0M8 9h.01M13 9h.01M19 2v6M16 5h6";
const SPRING = "cubic-bezier(.2, .8, .2, 1)";

function readLearned() {
  try { return window.localStorage.getItem(LEARNED_KEY) === "1"; } catch { return false; }
}

function markLearned() {
  try { window.localStorage.setItem(LEARNED_KEY, "1"); } catch { /* 只是提示偏好，存不下就下次再提示 */ }
  window.dispatchEvent(new Event(LEARNED_EVENT));
}

function reducedMotion() {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

// 超过 96px 后有阻尼，最多拖出 140px。
function shownOffset(dx) {
  const distance = Math.abs(dx);
  const eased = distance <= SOFT ? distance : SOFT + (distance - SOFT) * .35;
  return Math.sign(dx) * Math.min(LIMIT, eased);
}

function buildUnderlay(content, favorited) {
  const under = document.createElement("div");
  under.className = "feed-swipe-under";
  under.setAttribute("aria-hidden", "true");
  under.style.top = `${content.offsetTop}px`;
  under.style.height = `${content.offsetHeight}px`;
  under.innerHTML = `<span class="feed-swipe-cue is-favorite"><svg viewBox="0 0 32 32" fill="none"><path class="feed-swipe-star-fill" d="${STAR}" fill="currentColor"/><path d="${STAR}" stroke="currentColor" stroke-width="1.65" stroke-linejoin="round"/></svg><b>${favorited ? "取消收藏" : "收藏"}</b></span>`
    + `<span class="feed-swipe-cue is-react"><b>回应</b><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><path d="${FACE}"/></svg></span>`;
  return under;
}

function stampFavorite(entry, content) {
  if (reducedMotion()) return;
  const stamp = document.createElement("span");
  stamp.className = "feed-swipe-stamp";
  stamp.setAttribute("aria-hidden", "true");
  stamp.style.top = `${content.offsetTop + 10}px`;
  stamp.innerHTML = `<svg viewBox="0 0 32 32"><path d="${STAR}" fill="currentColor"/></svg>`;
  entry.append(stamp);
  window.setTimeout(() => stamp.remove(), 1200);
}

export function FeedSwipeHint() {
  const [learned, setLearned] = useState(readLearned);
  useEffect(() => {
    const learn = () => setLearned(true);
    window.addEventListener(LEARNED_EVENT, learn);
    return () => window.removeEventListener(LEARNED_EVENT, learn);
  }, []);
  if (learned) return null;
  return <p className="home-feed-swipe-hint">
    <span>按住一条记录可以把它拿起来：往右拖收藏，往左拖回应。</span>
    <button className="text-button" type="button" onClick={markLearned}>知道了</button>
  </p>;
}

export function FeedSwipeActions({ rootRef, posts }) {
  const postsRef = useRef(posts);
  const favoriteCache = useRef(new Map());
  const busyRef = useRef(false);
  const mountedRef = useRef(true);
  const [notice, setNotice] = useState(null);
  const [sheet, setSheet] = useState(null);

  useEffect(() => { postsRef.current = posts; }, [posts]);
  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  const readFavorite = useCallback(async (postId) => {
    if (favoriteCache.current.has(postId)) return favoriteCache.current.get(postId);
    const result = await api.get(`/interactions/posts/${postId}`);
    const favorited = Boolean(result.data?.favorited);
    favoriteCache.current.set(postId, favorited);
    return favorited;
  }, []);

  const setFavorite = useCallback(async (postId, desired, { entry = null, content = null, undoable = true } = {}) => {
    if (busyRef.current) return;
    busyRef.current = true;
    setNotice((current) => current ? { ...current, busy: true } : current);
    try {
      const result = await api.post(`/interactions/posts/${postId}/favorite`, { favorited: desired });
      const favorited = Boolean(result.data?.favorited);
      favoriteCache.current.set(postId, favorited);
      if (favorited && entry && content) stampFavorite(entry, content);
      if (!mountedRef.current) return;
      setNotice({
        message: favorited ? "已收藏" : "已取消收藏",
        undo: undoable ? () => setFavorite(postId, !favorited, { undoable: false }) : null,
      });
    } catch (error) {
      if (mountedRef.current) setNotice({ message: desired ? "没有收藏成功" : "没有取消收藏", error: error.message });
    } finally {
      busyRef.current = false;
    }
  }, []);

  const toggleFavorite = useCallback(async (postId, entry, content) => {
    try {
      const current = await readFavorite(postId);
      await setFavorite(postId, !current, { entry, content });
    } catch (error) {
      if (mountedRef.current) setNotice({ message: "没有收藏成功", error: error.message });
    }
  }, [readFavorite, setFavorite]);

  const openReactions = useCallback((postId) => {
    const post = postsRef.current?.find((item) => item.id === postId);
    const title = post ? (post.post_type === "article" ? post.title : homeFeedExcerpt(post, 40)) || "这条记录" : "这条记录";
    setSheet({ postId, title, state: null });
    void api.get(`/interactions/posts/${postId}/reactions`).then((result) => {
      if (!mountedRef.current) return;
      setSheet((current) => current?.postId === postId ? { ...current, state: normalizeReactions(result.data) } : current);
    }).catch(() => { /* 读不到时仍可直接选择，提交后由服务器结果为准 */ });
  }, []);

  const writeReaction = useCallback(async (postId, kind, previousKind, undoable = true) => {
    if (busyRef.current) return;
    busyRef.current = true;
    setNotice((current) => current ? { ...current, busy: true } : current);
    try {
      const result = await api.put(`/interactions/posts/${postId}/reaction`, { kind });
      const next = normalizeReactions(result.data);
      const chosen = next.items.find((item) => item.kind === next.selected);
      if (!mountedRef.current) return;
      setNotice({
        message: chosen ? `已回应：${chosen.label}` : "已取消回应",
        undo: undoable ? () => writeReaction(postId, previousKind, next.selected, false) : null,
      });
    } catch (error) {
      if (mountedRef.current) setNotice({ message: "回应没有成功", error: error.message });
    } finally {
      busyRef.current = false;
    }
  }, []);

  const chooseReaction = async (kind) => {
    const current = sheet;
    if (!current) return;
    setSheet(null);
    let state = current.state;
    if (!state) {
      try { state = normalizeReactions((await api.get(`/interactions/posts/${current.postId}/reactions`)).data); }
      catch { state = normalizeReactions(null); }
    }
    const next = optimisticReaction(state, kind);
    await writeReaction(current.postId, next.selected, state.selected);
  };

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return undefined;
    const query = window.matchMedia(GESTURE_QUERY);
    let gesture = null;
    let suppressClickUntil = 0;

    const paint = () => {
      if (!gesture) return;
      gesture.frame = 0;
      const { content, under, lifted } = gesture;
      const x = shownOffset(gesture.dx);
      const lift = lifted ? 1 : 0;
      content.style.transform = reducedMotion()
        ? `translateX(${x}px)`
        : `translate(${x}px, ${-4 * lift}px) rotate(${x * .03}deg) scale(${1 + .02 * lift})`;
      if (under) {
        const progress = Math.min(1, Math.abs(x) / ARM);
        under.style.setProperty("--favorite-cue", x > 0 ? String(.35 + .65 * progress) : x < 0 ? "0" : ".45");
        under.style.setProperty("--react-cue", x < 0 ? String(.35 + .65 * progress) : x > 0 ? "0" : ".45");
        const armed = Math.abs(x) >= ARM;
        if (armed && !gesture.armed) navigator.vibrate?.(8);
        gesture.armed = armed;
        under.classList.toggle("is-armed", armed);
        under.dataset.side = x > 0 ? "favorite" : x < 0 ? "react" : "";
      }
    };
    const schedule = () => {
      if (gesture && !gesture.frame) gesture.frame = window.requestAnimationFrame(paint);
    };

    const lift = () => {
      if (!gesture || gesture.lifted) return;
      gesture.lifted = true;
      const { entry, content, postId } = gesture;
      gesture.under = buildUnderlay(content, favoriteCache.current.get(postId));
      entry.prepend(gesture.under);
      entry.classList.add("is-swipe-active", "is-swipe-lifted");
      const current = gesture;
      void readFavorite(postId).then((favorited) => {
        const label = current.under?.querySelector(".is-favorite b");
        if (label) label.textContent = favorited ? "取消收藏" : "收藏";
        current.under?.classList.toggle("is-favorited", favorited);
      }).catch(() => {});
      schedule();
    };

    const drop = () => {
      if (!gesture) return;
      const { entry, content, under, frame, timer } = gesture;
      gesture = null;
      window.clearTimeout(timer);
      if (frame) window.cancelAnimationFrame(frame);
      const from = content.style.transform;
      const cleanup = () => {
        content.style.transform = "";
        under?.remove();
        entry.classList.remove("is-swipe-active", "is-swipe-lifted");
      };
      entry.classList.remove("is-swipe-lifted");
      if (!from || reducedMotion() || !content.animate) { cleanup(); return; }
      content.style.transform = "";
      const animation = content.animate([{ transform: from }, { transform: "none" }], { duration: 260, easing: SPRING });
      animation.finished.then(cleanup, cleanup);
    };

    const onDown = (event) => {
      if (gesture || !query.matches || event.pointerType === "mouse" || !event.isPrimary) return;
      const entry = event.target.closest?.(".home-feed-stream > .home-feed-entry[data-feed-post-id]");
      if (!entry || !root.contains(entry)) return;
      if (event.target.closest(".media-lightbox-trigger, video, button, input, textarea, select, [data-live-photo]")) return;
      if (event.clientX < EDGE || event.clientX > window.innerWidth - EDGE) return;
      const content = entry.querySelector(".home-feed-entry-content");
      if (!content) return;
      gesture = {
        id: event.pointerId, entry, content, postId: Number(entry.dataset.feedPostId),
        x0: event.clientX, y0: event.clientY, dx: 0, mode: "pending", lifted: false, armed: false, frame: 0, under: null,
      };
      gesture.timer = window.setTimeout(() => {
        if (gesture?.mode === "pending") lift();
      }, LIFT_DELAY);
    };

    const onMove = (event) => {
      if (!gesture || event.pointerId !== gesture.id) return;
      const dx = event.clientX - gesture.x0;
      const dy = event.clientY - gesture.y0;
      if (gesture.mode === "pending") {
        if (Math.abs(dy) > DECIDE && Math.abs(dy) >= Math.abs(dx)) {
          drop();
          return;
        }
        if (Math.abs(dx) <= DECIDE || Math.abs(dx) < Math.abs(dy) * 1.2) return;
        gesture.mode = "swipe";
        window.clearTimeout(gesture.timer);
        try { gesture.entry.setPointerCapture(gesture.id); } catch { /* 部分浏览器在触摸开始后不允许捕获 */ }
        lift();
      }
      gesture.dx = dx;
      schedule();
    };

    const onUp = (event) => {
      if (!gesture || event.pointerId !== gesture.id) return;
      const { lifted, mode, armed, dx, postId, entry, content } = gesture;
      if (lifted || mode === "swipe") suppressClickUntil = performance.now() + 500;
      drop();
      if (mode !== "swipe" || !armed) return;
      markLearned();
      if (dx > 0) void toggleFavorite(postId, entry, content);
      else openReactions(postId);
    };

    const onCancel = (event) => {
      if (gesture && event.pointerId === gesture.id) drop();
    };
    // 拿起或拖过的记录松手后不再当作点按打开。
    const onClick = (event) => {
      if (performance.now() < suppressClickUntil && root.contains(event.target)) {
        event.preventDefault();
        event.stopPropagation();
      }
    };
    const onContextMenu = (event) => {
      if (gesture?.lifted) event.preventDefault();
    };
    const onLeave = () => drop();

    root.addEventListener("pointerdown", onDown);
    root.addEventListener("pointermove", onMove);
    root.addEventListener("pointerup", onUp);
    root.addEventListener("pointercancel", onCancel);
    root.addEventListener("contextmenu", onContextMenu);
    window.addEventListener("click", onClick, true);
    window.addEventListener("blur", onLeave);
    document.addEventListener("visibilitychange", onLeave);
    return () => {
      drop();
      root.removeEventListener("pointerdown", onDown);
      root.removeEventListener("pointermove", onMove);
      root.removeEventListener("pointerup", onUp);
      root.removeEventListener("pointercancel", onCancel);
      root.removeEventListener("contextmenu", onContextMenu);
      window.removeEventListener("click", onClick, true);
      window.removeEventListener("blur", onLeave);
      document.removeEventListener("visibilitychange", onLeave);
    };
  }, [rootRef, readFavorite, toggleFavorite, openReactions]);

  return <>
    <MobileSheet open={Boolean(sheet)} onClose={() => setSheet(null)} title="回应" closeLabel="取消" className="feed-reaction-sheet">
      {sheet ? <>
        <p className="feed-reaction-target">{sheet.title}</p>
        <div className="feed-reaction-grid" role="group" aria-label="选择回应">
          {REACTION_DEFINITIONS.map((definition) => {
            const selected = sheet.state?.selected === definition.kind;
            const count = sheet.state?.items.find((item) => item.kind === definition.kind)?.count || 0;
            return <button key={definition.kind} className={`feed-reaction-choice${selected ? " is-selected" : ""}`} type="button"
              aria-pressed={selected} onClick={() => void chooseReaction(definition.kind)}>
              <span aria-hidden="true">{definition.emoji}</span>
              <b>{definition.label}</b>
              {count ? <small className="tabular">{count}</small> : null}
            </button>;
          })}
        </div>
        {sheet.state?.selected ? <p className="feed-reaction-note">再点一次已选的回应可以取消。</p> : null}
      </> : null}
    </MobileSheet>
    <UndoNotice
      message={notice?.message || ""}
      busy={Boolean(notice?.busy)}
      error={notice?.error || ""}
      onUndo={notice?.undo ? () => void notice.undo() : null}
      onClose={() => setNotice(null)}
      label="时间流操作反馈"
      closeLabel="关闭操作反馈"
    />
  </>;
}
