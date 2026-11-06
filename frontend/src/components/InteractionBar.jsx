import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "../lib/api";
import { ReactionPicker } from "./ReactionPicker";
import { FavoriteButton, FavoriteLink } from "./FavoriteControl";

export function InteractionBar({ postId, initialState, onFavoriteState }) {
  const operation = useRef(null);
  const [favorited, setFavorited] = useState(Boolean(initialState?.favorited));
  const [favoriteReady, setFavoriteReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
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
    void api.get(`/interactions/posts/${postId}`, { signal: session.controller.signal }).then((result) => {
      if (!session.active) return;
      setFavorited(Boolean(result.data?.favorited));
      setFavoriteReady(true);
    }).catch((syncError) => {
      if (session.active) setError(`收藏状态读取失败：${syncError.message}`);
    });
    return () => { session.active = false; session.controller.abort(); };
  }, [initialState?.favorited, postId]);

  const toggleFavorite = useCallback(async (event) => {
    const session = operation.current;
    if (!favoriteReady || !session?.active || session.busy) return;
    session.busy = true;
    const animateSuccess = event?.detail > 0;
    setBusy(true);
    setMessage("");
    setError("");
    try {
      const result = await api.post(`/interactions/posts/${postId}/favorite`, {}, { signal: session.controller.signal });
      if (!session.active) return;
      setFavorited(Boolean(result.data?.favorited));
      setMessage(result.data?.favorited ? "已收藏。" : "已取消收藏。");
      if (result.data?.favorited && animateSuccess) setCelebration((value) => value + 1);
    } catch (actionError) {
      if (session.active) setError(`收藏操作失败：${actionError.message}`);
    } finally {
      session.busy = false;
      if (session.active) setBusy(false);
    }
  }, [favoriteReady, postId]);

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
      </div>
      <div className="interaction-feedback" aria-live="polite" aria-atomic="true">
        {error ? <div className="inline-error" role="alert">{error}</div> : null}
        {message ? <p className="sr-only">{message}</p> : null}
      </div>
    </section>
  );
}
