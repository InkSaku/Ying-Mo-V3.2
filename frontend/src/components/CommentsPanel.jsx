import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { api } from "../lib/api";
import {
  insertOptimisticComment,
  removeOptimisticComment,
  replaceOptimisticComment,
} from "../lib/commentOptimistic";
import { formatDate } from "../lib/format";
import { ConfirmDialog } from "./ConfirmDialog";
import { Pagination } from "./Pagination";
import { ProtectedImage } from "./ProtectedImage";
import { ReactionPicker } from "./ReactionPicker";
import { EmptyState, ErrorState } from "./States";

const PAGE_SIZE = 10;

function unicodeLength(value) {
  return Array.from(value).length;
}

function limitUnicode(value, maxLength) {
  return Array.from(value).slice(0, maxLength).join("");
}

function requestId() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (token) => {
    const value = Math.floor(Math.random() * 16);
    return (token === "x" ? value : (value & 0x3) | 0x8).toString(16);
  });
}

function mentionQuery(value) {
  const match = value.match(/(?:^|\s)@([a-z0-9_-]{0,32})$/i);
  return match ? match[1].toLowerCase() : null;
}

function excerpt(value, limit = 100) {
  const text = (value || "").trim();
  return Array.from(text).length <= limit
    ? text
    : `${Array.from(text).slice(0, limit).join("")}…`;
}

function CommentBody({ comment }) {
  const mentions = new Map((comment.mentions || []).map((user) => [user.username, user]));
  const body = comment.body || "";
  const parts = [];
  const pattern = /@([a-z0-9_-]{3,32})/gi;
  let cursor = 0;
  let match;
  while ((match = pattern.exec(body)) !== null) {
    if (match.index > cursor) parts.push(body.slice(cursor, match.index));
    const user = mentions.get(match[1].toLowerCase());
    parts.push(user
      ? <Link key={`${match.index}-${user.id}`} className="comment-mention" to={`/users/${user.username}`}>@{user.username}</Link>
      : match[0]);
    cursor = pattern.lastIndex;
  }
  if (cursor < body.length) parts.push(body.slice(cursor));
  return <p>{parts}</p>;
}

function CommentAvatar({ member, current = false }) {
  const initial = (member?.nickname || member?.username || "?").slice(0, 1);
  const image = (
    <ProtectedImage
      media={member?.avatar_media}
      alt=""
      className="comment-avatar-image"
      fallback={<span className="comment-avatar-fallback" aria-hidden="true">{initial}</span>}
    />
  );

  if (!member?.username || current) return <span className="comment-avatar">{image}</span>;
  return <Link className="comment-avatar" to={`/users/${member.username}`} aria-label={`查看${member.nickname || "成员"}的主页`}>{image}</Link>;
}

export function CommentsPanel({ postId }) {
  const { user } = useAuth();
  const [searchParams] = useSearchParams();
  const focusCommentParam = searchParams.get("comment");
  const textareaRef = useRef(null);
  const [page, setPage] = useState(1);
  const [items, setItems] = useState([]);
  const [body, setBody] = useState("");
  const [replyTo, setReplyTo] = useState(null);
  const [selectedMentions, setSelectedMentions] = useState([]);
  const [mentionCandidates, setMentionCandidates] = useState([]);
  const [state, setState] = useState({ loading: true, error: null, pagination: null });
  const [submitting, setSubmitting] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [actionError, setActionError] = useState("");
  const [message, setMessage] = useState("");
  const [focusTarget, setFocusTarget] = useState(null);
  const [focusedComment, setFocusedComment] = useState(null);
  const activeMentionQuery = mentionQuery(body);

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
    void load();
  }, [load]);

  useEffect(() => {
    if (activeMentionQuery === null || submitting) {
      setMentionCandidates([]);
      return undefined;
    }
    let active = true;
    const timer = window.setTimeout(() => {
      void api.get(`/comments/mentionable?post_id=${postId}&q=${encodeURIComponent(activeMentionQuery)}`)
        .then((result) => {
          if (active) setMentionCandidates(result.data || []);
        })
        .catch(() => {
          if (active) setMentionCandidates([]);
        });
    }, 160);
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [activeMentionQuery, postId, submitting]);

  useEffect(() => {
    const commentId = Number.parseInt(focusCommentParam || "", 10);
    if (!Number.isFinite(commentId) || commentId <= 0) return undefined;
    let active = true;
    void api.get(`/comments/${commentId}/context?page_size=${PAGE_SIZE}`).then((result) => {
      if (!active) return;
      setFocusTarget(result.data.comment_id);
      setPage(result.data.page);
    }).catch((error) => {
      if (active) setActionError(`无法定位评论：${error.message}`);
    });
    return () => { active = false; };
  }, [focusCommentParam, postId]);

  useEffect(() => {
    if (!focusTarget || state.loading) return;
    const node = document.getElementById(`comment-${focusTarget}`);
    if (!node) return;
    setFocusedComment(focusTarget);
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    node.scrollIntoView({ block: "center", behavior: reducedMotion ? "auto" : "smooth" });
    node.focus({ preventScroll: true });
  }, [focusTarget, items, state.loading]);

  const beginReply = (comment) => {
    setReplyTo(comment);
    setActionError("");
    setMessage("");
    window.requestAnimationFrame(() => textareaRef.current?.focus());
  };

  const selectMention = (candidate) => {
    setBody((current) => current.replace(/@([a-z0-9_-]{0,32})$/i, `@${candidate.username} `));
    setSelectedMentions((current) => current.some((item) => item.id === candidate.id)
      ? current
      : [...current, candidate]);
    setMentionCandidates([]);
    window.requestAnimationFrame(() => textareaRef.current?.focus());
  };

  const submit = async (event) => {
    event.preventDefault();
    const content = body.trim();
    if (!content) return;
    const idempotencyKey = requestId();
    const parentId = replyTo ? (replyTo.parent_id || replyTo.id) : null;
    const temporaryId = `temp-${idempotencyKey}`;
    const optimistic = {
      id: temporaryId,
      post_id: postId,
      author: user,
      body: content,
      status: "active",
      parent_id: parentId,
      reply_to_comment_id: replyTo?.id || null,
      reply_to_user: replyTo?.author || null,
      quoted_comment: replyTo ? {
        id: replyTo.id,
        author: replyTo.author,
        body: excerpt(replyTo.body),
        status: replyTo.status,
      } : null,
      mentions: selectedMentions,
      reactions: null,
      can_delete: false,
      created_at: new Date().toISOString(),
      optimistic: true,
    };
    const draft = { body, replyTo, mentions: selectedMentions };
    const wasReply = Boolean(replyTo);
    setItems((current) => insertOptimisticComment(current, optimistic));
    if (!wasReply) {
      setState((current) => ({
        ...current,
        pagination: current.pagination
          ? { ...current.pagination, total: (current.pagination.total || 0) + 1 }
          : current.pagination,
      }));
    }
    setBody("");
    setReplyTo(null);
    setSelectedMentions([]);
    setMentionCandidates([]);
    setSubmitting(true);
    setActionError("");
    setMessage(wasReply ? "回复正在发送…" : "评论正在发送…");
    try {
      const result = await api.post("/comments", {
        post_id: postId,
        body: content,
        client_request_id: idempotencyKey,
        mention_user_ids: selectedMentions.map((item) => item.id),
        ...(replyTo ? { reply_to_comment_id: replyTo.id } : {}),
      });
      const saved = result.data;
      if (wasReply) {
        setItems((current) => replaceOptimisticComment(current, temporaryId, saved));
      } else {
        const nextTotal = (state.pagination?.total || 0) + 1;
        const targetPage = Math.max(1, Math.ceil(nextTotal / PAGE_SIZE));
        if (targetPage === page) {
          setItems((current) => replaceOptimisticComment(current, temporaryId, saved));
        } else {
          setPage(targetPage);
        }
      }
      setMessage(wasReply ? "回复已发布。" : "评论已发布。");
      window.dispatchEvent(new CustomEvent("yingmo:notifications-changed"));
    } catch (error) {
      setItems((current) => removeOptimisticComment(current, temporaryId));
      if (!wasReply) {
        setState((current) => ({
          ...current,
          pagination: current.pagination
            ? { ...current.pagination, total: Math.max(0, (current.pagination.total || 0) - 1) }
            : current.pagination,
        }));
      }
      setBody(draft.body);
      setReplyTo(draft.replyTo);
      setSelectedMentions(draft.mentions);
      setMessage("");
      setActionError(`发送失败：${error.message} 草稿已恢复。`);
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
    setSelectedMentions([]);
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

  const scrollToQuoted = (commentId) => {
    const node = document.getElementById(`comment-${commentId}`);
    if (!node) return;
    setFocusedComment(commentId);
    node.scrollIntoView({ block: "center", behavior: "smooth" });
    node.focus({ preventScroll: true });
  };

  const commentNode = (comment, nested = false) => {
    const authorName = comment.author?.nickname || "成员";
    return (
      <article
        key={comment.id}
        id={typeof comment.id === "number" ? `comment-${comment.id}` : undefined}
        tabIndex={-1}
        className={`comment ${nested ? "comment-reply" : ""} ${comment.status === "deleted" ? "comment-deleted" : ""} ${focusedComment === comment.id ? "comment-focused" : ""} ${comment.optimistic ? "comment-optimistic" : ""}`}
      >
        <header className="comment-header">
          <CommentAvatar member={comment.author} />
          <div className="comment-author-block">
            {comment.author ? <Link to={`/users/${comment.author.username}`}>{authorName}</Link> : <strong>{authorName}</strong>}
            <div className="comment-meta">
              <time dateTime={comment.created_at}>{comment.optimistic ? "刚刚" : formatDate(comment.created_at, true)}</time>
              {nested && comment.reply_to_user ? <span>回复 {comment.reply_to_user.nickname}</span> : null}
            </div>
          </div>
        </header>
        <div className="comment-copy">
          {comment.quoted_comment ? (
            <button className="comment-quote" type="button" onClick={() => scrollToQuoted(comment.quoted_comment.id)}>
              <strong>引用 {comment.quoted_comment.author?.nickname || "成员"}</strong>
              <span>{excerpt(comment.quoted_comment.body)}</span>
            </button>
          ) : null}
          <CommentBody comment={comment} />
          {comment.status === "active" && !comment.optimistic ? (
            <div className="comment-toolbar">
              <ReactionPicker
                compact
                initialState={comment.reactions}
                readPath={`/interactions/comments/${comment.id}/reactions`}
                writePath={`/interactions/comments/${comment.id}/reaction`}
              />
              <div className="comment-actions">
                <button className="text-button" type="button" disabled={submitting || deleting} onClick={() => beginReply(comment)}>回复并引用</button>
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
            </div>
          ) : comment.optimistic ? <p className="meta-text" role="status">正在发送</p> : null}
        </div>
        {comment.replies?.map((reply) => commentNode(reply, true))}
      </article>
    );
  };

  const characterCount = unicodeLength(body);
  const pagination = state.pagination || {};

  return (
    <section className="comments-panel" aria-labelledby="comments-title" aria-busy={state.loading || undefined}>
      <div className="comments-heading">
        <div>
          <h2 id="comments-title">评论</h2>
          <p>围绕这篇内容，留下你的想法与回应。</p>
        </div>
        {pagination.total !== undefined ? <span className="tabular">{pagination.total} 条一级评论</span> : null}
      </div>
      <form className="comment-form" onSubmit={submit}>
        {replyTo ? (
          <div className="reply-notice">
            <span><strong>正在回复 {replyTo.author?.nickname || "成员"}</strong> · 将引用“{excerpt(replyTo.body, 60)}”</span>
            <button className="text-button" type="button" disabled={submitting} onClick={() => setReplyTo(null)}>取消回复</button>
          </div>
        ) : null}
        <div className="comment-composer-header">
          <CommentAvatar member={user} current />
          <div>
            <strong>{user?.nickname || user?.username || "成员"}</strong>
            <span>{replyTo ? `回复 ${replyTo.author?.nickname || "成员"}` : "参与这段共同阅读"}</span>
          </div>
        </div>
        <label className="sr-only" htmlFor={`comment-body-${postId}`}>{replyTo ? "写下回复" : "写下回应"}</label>
        <div className="comment-compose">
          <textarea
            ref={textareaRef}
            id={`comment-body-${postId}`}
            value={body}
            disabled={submitting}
            aria-describedby={`comment-count-${postId}`}
            placeholder={replyTo ? "写下你的回复…" : "写下你想继续讨论的内容…"}
            onChange={(event) => {
              const next = limitUnicode(event.target.value, 500);
              setBody(next);
              setSelectedMentions((current) => current.filter((member) => next.includes(`@${member.username}`)));
              setActionError("");
              setMessage("");
            }}
          />
          {activeMentionQuery !== null && mentionCandidates.length ? (
            <div className="mention-suggestions" role="listbox" aria-label="可提及成员">
              {mentionCandidates.map((candidate) => (
                <button key={candidate.id} type="button" role="option" aria-selected="false" onClick={() => selectMention(candidate)}>
                  <strong>{candidate.nickname}</strong><span>@{candidate.username}</span>
                </button>
              ))}
            </div>
          ) : null}
        </div>
        <div className="comment-compose-footer">
          <span className="meta-text">输入 @ 选择当前可访问成员</span>
          <div>
            <span className="meta-text tabular" id={`comment-count-${postId}`}>{characterCount} / 500</span>
            <button className="btn btn-primary" type="submit" disabled={submitting || deleting || state.loading || !body.trim()}>
              {submitting ? "发送中" : replyTo ? "发表回复" : "发表评论"}
            </button>
          </div>
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
