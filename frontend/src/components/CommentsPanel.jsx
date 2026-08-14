import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../lib/api";
import { formatDate } from "../lib/format";
import { ConfirmDialog } from "./ConfirmDialog";
import { Pagination } from "./Pagination";
import { EmptyState, ErrorState } from "./States";

const PAGE_SIZE = 10;

function unicodeLength(value) {
  return Array.from(value).length;
}

function limitUnicode(value, maxLength) {
  return Array.from(value).slice(0, maxLength).join("");
}

export function CommentsPanel({ postId }) {
  const textareaRef = useRef(null);
  const [page, setPage] = useState(1);
  const [items, setItems] = useState([]);
  const [body, setBody] = useState("");
  const [replyTo, setReplyTo] = useState(null);
  const [state, setState] = useState({ loading: true, error: null, pagination: null });
  const [submitting, setSubmitting] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [actionError, setActionError] = useState("");
  const [message, setMessage] = useState("");

  const load = useCallback(async (targetPage = page) => {
    setState((current) => ({ ...current, loading: true, error: null }));
    try {
      const result = await api.get(`/comments?post_id=${postId}&page=${targetPage}&page_size=${PAGE_SIZE}`);
      setItems(result.data || []);
      setState({ loading: false, error: null, pagination: result.meta?.pagination || null });
      return result;
    } catch (error) {
      setState((current) => ({ ...current, loading: false, error }));
      return null;
    }
  }, [page, postId]);

  useEffect(() => {
    load();
  }, [load]);

  const beginReply = (comment) => {
    setReplyTo(comment);
    setActionError("");
    setMessage("");
    window.requestAnimationFrame(() => textareaRef.current?.focus());
  };

  const submit = async (event) => {
    event.preventDefault();
    const content = body.trim();
    if (!content) return;
    setSubmitting(true);
    setActionError("");
    setMessage("");
    try {
      await api.post("/comments", {
        post_id: postId,
        body: content,
        ...(replyTo ? { reply_to_comment_id: replyTo.id } : {}),
      });
      const wasReply = Boolean(replyTo);
      setBody("");
      setReplyTo(null);
      setMessage(wasReply ? "回复已发布。" : "评论已发布。");
      if (wasReply) {
        await load(page);
      } else {
        const nextTotal = (state.pagination?.total || 0) + 1;
        const targetPage = Math.max(1, Math.ceil(nextTotal / PAGE_SIZE));
        if (targetPage === page) await load(page);
        else setPage(targetPage);
      }
    } catch (error) {
      setActionError(error.message);
    } finally {
      setSubmitting(false);
    }
  };

  const remove = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    setActionError("");
    setMessage("");
    try {
      await api.delete(`/comments/${deleteTarget.id}`);
      const removesRoot = !deleteTarget.parent_id && !(deleteTarget.replies?.length);
      const nextTotal = Math.max(0, (state.pagination?.total || 0) - (removesRoot ? 1 : 0));
      const targetPage = Math.max(1, Math.min(page, Math.ceil(nextTotal / PAGE_SIZE) || 1));
      setDeleteTarget(null);
      setMessage(deleteTarget.replies?.length
        ? "评论正文已删除，回复已保留。"
        : "评论已删除。");
      if (targetPage === page) await load(page);
      else setPage(targetPage);
    } catch (error) {
      setActionError(error.message);
    } finally {
      setDeleting(false);
    }
  };

  const changePage = (nextPage) => {
    setPage(nextPage);
    setReplyTo(null);
    setActionError("");
    setMessage("");
    window.requestAnimationFrame(() => {
      const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      document.getElementById("comments-title")?.scrollIntoView({
        block: "start",
        behavior: reducedMotion ? "auto" : "smooth",
      });
    });
  };

  const commentNode = (comment, nested = false) => (
    <article key={comment.id} className={`comment ${nested ? "comment-reply" : ""} ${comment.status === "deleted" ? "comment-deleted" : ""}`}>
      <div className="comment-meta">
        {comment.author ? <Link to={`/users/${comment.author.username}`}>{comment.author.nickname}</Link> : <strong>成员</strong>}
        {nested && comment.reply_to_user ? <span>回复 {comment.reply_to_user.nickname}</span> : null}
        <time dateTime={comment.created_at}>{formatDate(comment.created_at, true)}</time>
      </div>
      <p>{comment.body}</p>
      {comment.status === "active" ? (
        <div className="comment-actions">
          <button className="text-button" type="button" disabled={submitting || deleting} onClick={() => beginReply(comment)}>回复</button>
          {comment.can_delete ? (
            <button className="text-button danger-text" type="button" disabled={submitting || deleting} onClick={() => {
              setDeleteTarget(comment);
              setActionError("");
              setMessage("");
            }}>
              删除
            </button>
          ) : null}
        </div>
      ) : null}
      {comment.replies?.map((reply) => commentNode(reply, true))}
    </article>
  );

  const characterCount = unicodeLength(body);
  const pagination = state.pagination || {};

  return (
    <section className="comments-panel" aria-labelledby="comments-title" aria-busy={state.loading || undefined}>
      <div className="comments-heading">
        <h2 id="comments-title">评论</h2>
        {pagination.total !== undefined ? <span className="tabular">{pagination.total} 条一级评论</span> : null}
      </div>
      <form className="comment-form" onSubmit={submit}>
        {replyTo ? (
          <div className="reply-notice">
            <span>正在回复 {replyTo.author?.nickname || "成员"}</span>
            <button className="text-button" type="button" disabled={submitting} onClick={() => setReplyTo(null)}>取消回复</button>
          </div>
        ) : null}
        <label htmlFor={`comment-body-${postId}`}>{replyTo ? "写下回复" : "写下回应"}</label>
        <textarea
          ref={textareaRef}
          id={`comment-body-${postId}`}
          value={body}
          disabled={submitting}
          aria-describedby={`comment-count-${postId}`}
          onChange={(event) => {
            setBody(limitUnicode(event.target.value, 500));
            setActionError("");
            setMessage("");
          }}
        />
        <div className="form-row-end">
          <span className="meta-text tabular" id={`comment-count-${postId}`}>{characterCount} / 500</span>
          <button className="btn btn-primary" type="submit" disabled={submitting || deleting || state.loading || !body.trim()}>
            {submitting ? "发送中" : replyTo ? "发表回复" : "发表评论"}
          </button>
        </div>
      </form>

      {actionError ? <div className="inline-error comment-feedback" role="alert">{actionError}</div> : null}
      {message ? <div className="inline-success comment-feedback" role="status">{message}</div> : null}
      {state.loading && !items.length ? <div className="comment-loading" role="status">正在读取评论…</div> : null}
      {state.loading && items.length ? <div className="comment-loading comment-loading-inline" role="status">正在更新评论…</div> : null}
      {state.error ? <ErrorState error={state.error} onRetry={() => load(page)} /> : null}
      {!state.loading && !state.error && items.length === 0 ? (
        <EmptyState title="还没有评论" description="你可以成为第一个留下回应的人。" />
      ) : null}
      {!state.error ? <div className="comment-list">{items.map((item) => commentNode(item))}</div> : null}
      <Pagination page={pagination.page || page} totalPages={pagination.total_pages || 0} onChange={changePage} />

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title="删除这条评论？"
        description={deleteTarget?.replies?.length
          ? "这条评论已有回复。删除后会保留节点并显示“[该评论已删除]”，回复不会被删除。"
          : "评论将从当前内容中删除，这项操作不能在前端撤销。"}
        confirmLabel="确认删除"
        danger
        busy={deleting}
        onConfirm={remove}
        onClose={() => {
          if (!deleting) setDeleteTarget(null);
        }}
      />
    </section>
  );
}
