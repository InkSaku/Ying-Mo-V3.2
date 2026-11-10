import { UndoNotice } from "./UndoNotice";
import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "../lib/api";
import { ReactionPicker } from "./ReactionPicker";
import { FavoriteButton, FavoriteLink } from "./FavoriteControl";

export function InteractionBar({ postId, initialState, onFavoriteState, extraAction = null }) {
  const operation = useRef(null);
  const [favorited, setFavorited] = useState(Boolean(initialState?.favorited));
  const [favoriteReady, setFavoriteReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [canUndo, setCanUndo] = useState(false);
  const [celebration, setCelebration] = useState(0);

  useEffect(() => {
    const session = { active: true, busy: false, controller: new AbortController() };
    operation.current = session;
    setFavorited(Boolean(initialState?.favorited));
    setFavoriteReady(false);
    setBusy(false);
    setMessage("");
    setError("");
    setCelebration(0);
    setCanUndo(false);
    void api.get(`/interactions/posts/${postId}`, { signal: session.controller.signal }).then((result) => {
      if (!session.active) return;
      setFavorited(Boolean(result.data?.favorited));
      setFavoriteReady(true);
    }).catch((syncError) => {
      if (session.active) setError(`收藏状态读取失败：${syncError.message}`);
    });
    return () => { session.active = false; session.controller.abort(); };
  }, [initialState?.favorited, postId]);

  const toggleFavorite = useCallback(async (event, desired = !favorited) => {
    const session = operation.current;
    if (!favoriteReady || !session?.active || session.busy) return;
    session.busy = true;
    const animateSuccess = event?.detail > 0;
    const previous = favorited;
    // 乐观更新：点下去立刻显示新状态和收藏动画，服务器结果回来后再校准；失败则改回并提示原因。
    setFavorited(desired);
    if (desired && animateSuccess) setCelebration((value) => value + 1);
    setCanUndo(false);
    setBusy(true);
    setMessage("");
    setError("");
    try {
      const result = await api.post(`/interactions/posts/${postId}/favorite`, { favorited: desired }, { signal: session.controller.signal });
      if (!session.active) return;
      setFavorited(Boolean(result.data?.favorited));
      setCanUndo(result.data?.favorited === false);
      setMessage(result.data?.favorited ? "已收藏。" : "已取消收藏。");
    } catch (actionError) {
      if (!session.active) return;
      setFavorited(previous);
      setError(`收藏操作失败：${actionError.message}`);
    } finally {
      session.busy = false;
      if (session.active) setBusy(false);
    }
  }, [favoriteReady, favorited, postId]);

  useEffect(() => {
    onFavoriteState?.({ postId, favorited, ready: favoriteReady, busy, message, error, celebration, toggleFavorite });
  }, [postId, favorited, favoriteReady, busy, message, error, celebration, toggleFavorite, onFavoriteState]);

  return (
    <section className="interaction-region" aria-label="内容互动">
      <div className="interaction-actions">
        <ReactionPicker
          initialState={initialState?.reactions}
          readPath={`/interactions/posts/${postId}/reactions`}
          writePath={`/interactions/posts/${postId}/reaction`}
        />
        <div className="favorite-control">
          <FavoriteButton favorited={favorited} ready={favoriteReady} busy={busy} celebration={celebration} onToggle={toggleFavorite} />
          {favoriteReady && favorited ? <FavoriteLink /> : null}
        </div>
        {extraAction}
      </div>
      <UndoNotice message={canUndo ? "已取消收藏" : ""} busy={busy} error={error} onUndo={(event) => toggleFavorite(event, true)} onClose={() => setCanUndo(false)} />
      <div className="interaction-feedback" aria-live="polite" aria-atomic="true">
        {error ? <div className="inline-error" role="alert">{error}</div> : null}
        {message ? <p className="sr-only">{message}</p> : null}
      </div>
    </section>
  );
}
