import { useEffect, useRef, useState } from "react";
import { api } from "../lib/api";
import { ReactionPicker } from "./ReactionPicker";

export function InteractionBar({ postId, initialState }) {
  const mounted = useRef(true);
  const [favorited, setFavorited] = useState(Boolean(initialState?.favorited));
  const [favoriteReady, setFavoriteReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    mounted.current = true;
    setFavorited(Boolean(initialState?.favorited));
    setFavoriteReady(false);
    setBusy(false);
    setMessage("");
    setError("");
    void api.get(`/interactions/posts/${postId}`).then((result) => {
      if (!mounted.current) return;
      setFavorited(Boolean(result.data?.favorited));
      setFavoriteReady(true);
    }).catch((syncError) => {
      if (mounted.current) setError(`收藏状态读取失败：${syncError.message}`);
    });
    return () => { mounted.current = false; };
  }, [initialState?.favorited, postId]);

  const toggleFavorite = async () => {
    setBusy(true);
    setMessage("");
    setError("");
    try {
      const result = await api.post(`/interactions/posts/${postId}/favorite`, {});
      if (!mounted.current) return;
      setFavorited(Boolean(result.data?.favorited));
      setMessage(result.data?.favorited ? "已收藏。" : "已取消收藏。");
    } catch (actionError) {
      if (mounted.current) setError(`收藏操作失败：${actionError.message}`);
    } finally {
      if (mounted.current) setBusy(false);
    }
  };

  return (
    <section className="interaction-region" aria-label="内容互动">
      <ReactionPicker
        initialState={initialState?.reactions}
        readPath={`/interactions/posts/${postId}/reactions`}
        writePath={`/interactions/posts/${postId}/reaction`}
      />
      <div className="interaction-bar interaction-favorite-row">
        <button
          className="btn btn-secondary"
          type="button"
          disabled={!favoriteReady || busy}
          aria-pressed={favorited}
          onClick={() => { void toggleFavorite(); }}
        >
          {busy ? "处理中" : favorited ? "取消收藏" : "收藏"}
        </button>
      </div>
      <div className="interaction-feedback" aria-live="polite" aria-atomic="true">
        {error ? <div className="inline-error" role="alert">{error}</div> : null}
        {message ? <p className="inline-success" role="status">{message}</p> : null}
      </div>
    </section>
  );
}
