import { useId, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "../lib/api";
import { continuationAfterLabel, continuationGapLabel, continuationLabel } from "../lib/continuations";
import { excerpt, formatDate, postTypeLabel } from "../lib/format";
import "../styles/continuation.css";

function PenGlyph() {
  return <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false"><path d="m4 20 1-4L16.5 4.5a2.1 2.1 0 0 1 3 3L8 19l-4 1Z" /><path d="m14.5 6.5 3 3M13 20h7" /></svg>;
}

// 像转发按钮一样挂在要接的那篇帖子上：点一下就开始写，来源不用再选。
export function ContinueWriteButton({ postId, className = "continue-write-button", onError }) {
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const start = async () => {
    if (busy) return;
    setBusy(true);
    setError("");
    onError?.("");
    try {
      const result = await api.post(`/posts/${postId}/continuations`, {});
      navigate(`/write/${result.data.id}`);
    } catch (startError) {
      if (onError) onError(startError.message);
      else setError(startError.message);
      setBusy(false);
    }
  };
  return <>
    <button className={className} type="button" disabled={busy} aria-busy={busy || undefined} onClick={() => void start()}>
      {className === "continue-write-button" ? <PenGlyph /> : null}{busy ? "正在打开…" : "接着写"}
    </button>
    {error ? <span className="continue-write-error" role="alert">{error}</span> : null}
  </>;
}

export function ContinuationKicker({ post }) {
  const source = post.continuation?.source;
  if (!source) return null;
  if (source.state !== "available") return <p className="continuation-kicker is-unavailable">接着写的记录已不在</p>;
  const gap = continuationGapLabel(source.published_at, post.published_at);
  return <p className="continuation-kicker"><Link to={source.canonical}>{gap ? `${gap}，` : ""}接着《{continuationLabel(source)}》写</Link></p>;
}

export function ContinuationSource({ post }) {
  const source = post.continuation?.source;
  if (!source) return null;
  if (source.state !== "available") {
    return <aside className="continuation-source is-unavailable" aria-label="这篇接着的记录"><p>原记录已不在。</p></aside>;
  }
  const gap = continuationGapLabel(source.published_at, post.published_at);
  const text = source.title ? excerpt(source) : "";
  return <aside className="continuation-source" aria-label="这篇接着的记录">
    <Link to={source.canonical}>
      <small className="continuation-source-head"><span>接着写的是</span>{gap ? <span>{gap}</span> : null}</small>
      <strong>{continuationLabel(source)}</strong>
      {text ? <p>{text}</p> : null}
      <small>{source.author?.nickname ? `${source.author.nickname} · ` : ""}{postTypeLabel(source.post_type)} · {formatDate(source.published_at)}</small>
    </Link>
  </aside>;
}

export function ContinuationLater({ post }) {
  const titleId = useId();
  const items = post.continuation?.later;
  if (!items?.length) return null;
  return <section className="continuation-later" aria-labelledby={titleId}>
    <h2 id={titleId}>后来</h2>
    <ol>{items.map((item) => <li key={item.id}>
      <Link to={item.canonical}>
        <small>{continuationAfterLabel(post.published_at, item.published_at)}</small>
        <span>{continuationLabel(item)}</span>
        <small>{postTypeLabel(item.post_type)}</small>
      </Link>
    </li>)}</ol>
  </section>;
}

// 目录保持连续目录行，来源只多一行小字；读不到来源时不占位。
export function ContinuationCardLine({ post }) {
  const source = post.continues;
  if (source?.state !== "available") return null;
  const gap = continuationGapLabel(source.published_at, post.published_at);
  return <p className="post-card-source"><Link to={source.canonical}>接着《{continuationLabel(source)}》写{gap ? ` · ${gap}` : ""}</Link></p>;
}

export function ContinuationEditorSource({ source, startedAt, busy, onAbandon }) {
  const available = source?.state === "available";
  const gap = available ? continuationGapLabel(source.published_at, startedAt) : "";
  return <div className={`continuation-editor-source${available ? "" : " is-unavailable"}`}>
    <span>{available ? <>接着《{continuationLabel(source)}》写{gap ? ` · ${gap}` : ""}</> : "接着写的记录已不在，仍可以继续写完这篇。"}</span>
    {onAbandon ? <button className="text-button" type="button" disabled={busy} onClick={onAbandon}>放弃这篇</button> : null}
  </div>;
}
