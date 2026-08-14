import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "../lib/api";

function interactionState(value) {
  return {
    liked: Boolean(value?.liked),
    favorited: Boolean(value?.favorited),
    like_count: Number.isFinite(value?.like_count) ? value.like_count : 0,
  };
}

export function InteractionBar({ postId, initialState }) {
  const mounted = useRef(true);
  const requestVersion = useRef(0);
  const [info, setInfo] = useState(() => interactionState(initialState));
  const [ready, setReady] = useState(false);
  const [syncing, setSyncing] = useState(true);
  const [busy, setBusy] = useState({ like: false, favorite: false });
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const syncState = useCallback(async ({ announce = false } = {}) => {
    const version = ++requestVersion.current;
    setSyncing(true);
    setError("");
    if (!announce) setMessage("");
    try {
      const result = await api.get(`/interactions/posts/${postId}`);
      if (!mounted.current || version !== requestVersion.current) return false;
      setInfo(interactionState(result.data));
      setReady(true);
      if (announce) setMessage("互动状态已同步。");
      return true;
    } catch (syncError) {
      if (!mounted.current || version !== requestVersion.current) return false;
      setReady(false);
      setError(`互动状态读取失败：${syncError.message}`);
      return false;
    } finally {
      if (mounted.current && version === requestVersion.current) setSyncing(false);
    }
  }, [postId]);

  useEffect(() => {
    mounted.current = true;
    requestVersion.current += 1;
    setInfo(interactionState(initialState));
    setReady(false);
    setSyncing(true);
    setBusy({ like: false, favorite: false });
    setMessage("");
    setError("");
    void syncState();
    return () => {
      mounted.current = false;
      requestVersion.current += 1;
    };
  }, [postId, syncState]);

  const toggle = async (kind) => {
    const isLike = kind === "like";
    const actionLabel = isLike
      ? (info.liked ? "取消喜欢" : "喜欢")
      : (info.favorited ? "取消收藏" : "收藏");
    setBusy((current) => ({ ...current, [kind]: true }));
    setMessage("");
    setError("");
    try {
      const result = await api.post(`/interactions/posts/${postId}/${kind}`, {});
      if (!mounted.current) return;
      setInfo((current) => interactionState({ ...current, ...result.data }));
      setMessage(`${actionLabel}成功。`);
    } catch (actionError) {
      if (!mounted.current) return;
      let reconciled = false;
      try {
        const result = await api.get(`/interactions/posts/${postId}`);
        if (mounted.current) {
          setInfo(interactionState(result.data));
          setReady(true);
          reconciled = true;
        }
      } catch {
        if (mounted.current) setReady(false);
      }
      if (mounted.current) {
        setError(reconciled
          ? `${actionLabel}失败：${actionError.message} 当前状态已重新同步。`
          : `${actionLabel}失败：${actionError.message} 当前状态无法确认，请重试同步。`);
      }
    } finally {
      if (mounted.current) setBusy((current) => ({ ...current, [kind]: false }));
    }
  };

  const feedbackId = `interaction-feedback-${postId}`;
  const likeDisabled = !ready || syncing || busy.like;
  const favoriteDisabled = !ready || syncing || busy.favorite;

  return (
    <section className="interaction-region" aria-label="内容互动" aria-busy={syncing || busy.like || busy.favorite || undefined}>
      <div className="interaction-bar">
        <button
          className="btn btn-secondary"
          type="button"
          disabled={likeDisabled}
          aria-pressed={info.liked}
          aria-describedby={feedbackId}
          aria-label={`${info.liked ? "取消喜欢" : "喜欢"}，当前 ${info.like_count} 次喜欢`}
          onClick={() => { void toggle("like"); }}
        >
          {busy.like ? "正在处理喜欢" : (info.liked ? "取消喜欢" : "喜欢")}
          <span className="tabular" aria-hidden="true">{info.like_count}</span>
        </button>
        <button
          className="btn btn-secondary"
          type="button"
          disabled={favoriteDisabled}
          aria-pressed={info.favorited}
          aria-describedby={feedbackId}
          onClick={() => { void toggle("favorite"); }}
        >
          {busy.favorite ? "正在处理收藏" : (info.favorited ? "取消收藏" : "收藏")}
        </button>
      </div>
      <div id={feedbackId} className="interaction-feedback" aria-live="polite" aria-atomic="true">
        {syncing ? <p className="interaction-syncing" role="status">正在同步互动状态…</p> : null}
        {error ? (
          <div className="inline-error" role="alert">
            <span>{error}</span>
            {!ready ? (
              <button className="text-button" type="button" disabled={syncing} onClick={() => { void syncState({ announce: true }); }}>
                重新同步
              </button>
            ) : null}
          </div>
        ) : null}
        {message ? <p className="inline-success" role="status">{message}</p> : null}
      </div>
    </section>
  );
}
