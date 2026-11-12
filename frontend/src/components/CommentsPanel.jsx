import { commentDrafts, commentSends, rememberSessionValue, trackCommentSend } from "../lib/mobileSession";
import { DefaultAvatar } from "./DefaultAvatar";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { api } from "../lib/api";
import {
  insertOptimisticComment,
  removeOptimisticComment,
  replaceOptimisticComment,
} from "../lib/commentOptimistic";
import { formatDate } from "../lib/format";
import { commentLinks, firstPostLink, postLinkPath } from "../lib/commentLinks";
import { internalLinkPath } from "../lib/contentLinks";
import { ConfirmDialog } from "./ConfirmDialog";
import { Pagination } from "./Pagination";
import { PostLinkCard } from "./PostLinkCard";
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

function mentionParts(text, mentions, offset) {
  const parts = [];
  const pattern = /@([a-z0-9_-]{3,32})/gi;
  let cursor = 0;
  let match;
  while ((match = pattern.exec(text)) !== null) {
    if (match.index > cursor) parts.push(text.slice(cursor, match.index));
    const user = mentions.get(match[1].toLowerCase());
    parts.push(user
      ? <Link key={`${offset + match.index}-${user.id}`} className="comment-mention" to={`/users/${user.username}`}>@{user.username}</Link>
      : match[0]);
    cursor = pattern.lastIndex;
  }
  if (cursor < text.length) parts.push(text.slice(cursor));
  return parts;
}

// 评论正文：@成员与链接都可点击；第一个站内帖子链接另出一张卡片，
// 它在评论末尾时不再重复显示网址。
function CommentBody({ comment }) {
  const mentions = new Map((comment.mentions || []).map((user) => [user.username, user]));
  const active = comment.status === "active";
  const body = comment.body || "";
  const card = active ? comment.link_card : null;
  const links = active ? commentLinks(body) : [];
  const cardLink = card ? links.find((link) => link.href === card.href) : null;
  const visible = cardLink && !body.slice(cardLink.end).trim() ? body.slice(0, cardLink.start).trimEnd() : body;
  const parts = [];
  let cursor = 0;
  for (const link of links) {
    if (link.end > visible.length) break;
    if (link.start > cursor) parts.push(...mentionParts(visible.slice(cursor, link.start), mentions, cursor));
    const path = internalLinkPath(link.href);
    parts.push(path
      ? <Link key={`link-${link.start}`} className="comment-link" to={path}>{link.href}</Link>
      : <a key={`link-${link.start}`} className="comment-link" href={link.href} target="_blank" rel="noopener noreferrer nofollow">{link.href}</a>);
    cursor = link.end;
  }
  if (cursor < visible.length) parts.push(...mentionParts(visible.slice(cursor), mentions, cursor));
  return <>
    {visible ? <p>{parts}</p> : null}
    {card ? <PostLinkCard card={card} /> : null}
  </>;
}

function CommentAvatar({ member, current = false }) {
  const image = (
    <ProtectedImage
      media={member?.avatar_media}
      alt=""
      className="comment-avatar-image"
      fallback={<DefaultAvatar className="comment-avatar-image" />}
    />
  );

  if (!member?.username || current) return <span className="comment-avatar">{image}</span>;
  return <Link className="comment-avatar" to={`/users/${member.username}`} aria-label={`查看${member.nickname || "成员"}的主页`}>{image}</Link>;
}

export function CommentsPanel({ postId }) {
  const { user } = useAuth();
  const [searchParams] = useSearchParams();
  const focusCommentParam = searchParams.get("comment");
  const draftKey = `${user?.id}:${postId}`;
  const initialSend = useRef(commentSends.get(draftKey));
  const initialDraft = useRef(initialSend.current ? null : commentDrafts.get(draftKey));
  const pendingSend = useRef(Boolean(initialSend.current));
  const textareaRef = useRef(null);
  const [page, setPage] = useState(1);
  const [items, setItems] = useState([]);
  const [body, setBody] = useState(initialDraft.current?.body || "");
  const [replyTo, setReplyTo] = useState(initialDraft.current?.replyTo || null);
  const [selectedMentions, setSelectedMentions] = useState(initialDraft.current?.mentions || []);
  // 选了“不附卡片”的那条链接；换了链接就自动恢复卡片。
  const [hiddenCardPath, setHiddenCardPath] = useState(initialDraft.current?.hiddenCardPath || null);
  const [linkPreview, setLinkPreview] = useState(null);
  const [mentionCandidates, setMentionCandidates] = useState([]);
  const [state, setState] = useState({ loading: true, error: null, pagination: null });
  const [submitting, setSubmitting] = useState(Boolean(initialSend.current));
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [actionError, setActionError] = useState("");
  const [message, setMessage] = useState(initialSend.current ? "评论正在发送…" : "");
  const [focusTarget, setFocusTarget] = useState(null);
  const [focusedComment, setFocusedComment] = useState(null);
  useLayoutEffect(() => {
    if (submitting) return;
    if (body || replyTo) rememberSessionValue(commentDrafts, draftKey, { body, replyTo, mentions: selectedMentions, hiddenCardPath });
    else commentDrafts.delete(draftKey);
  }, [body, replyTo, selectedMentions, hiddenCardPath, submitting, draftKey]);

  const activeMentionQuery = mentionQuery(body);
  const draftLink = firstPostLink(body);
  const draftLinkPath = draftLink ? postLinkPath(draftLink.href) : null;
  const previewCard = linkPreview && linkPreview.path === draftLinkPath && linkPreview.card?.id !== postId ? linkPreview.card : null;
  const cardHidden = Boolean(draftLinkPath) && hiddenCardPath === draftLinkPath;

  // 发送前预览：和别人看到的是同一张卡片；读不到或不存在都显示同一行占位。
  useEffect(() => {
    if (!draftLinkPath || submitting) return undefined;
    let active = true;
    const timer = window.setTimeout(() => {
      void api.get(`/posts/link-preview?path=${encodeURIComponent(draftLinkPath)}`)
        .then((result) => {
          if (active) setLinkPreview({ path: draftLinkPath, card: result.data });
        })
        .catch((error) => {
          if (!active) return;
          setLinkPreview(error.code === "RESOURCE_NOT_FOUND" ? { path: draftLinkPath, card: { state: "unavailable" } } : null);
        });
    }, 300);
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [draftLinkPath, submitting]);

  useEffect(() => {
    let frame;
    let previousHeight = "";
    const root = document.documentElement;
    const keepInputVisible = () => {
      const height = root.dataset.mobileKeyboard === "open" ? root.style.getPropertyValue("--mobile-viewport-height") : "";
      if (height === previousHeight) return;
      previousHeight = height;
      if (!height || !window.matchMedia("(max-width: 767px)").matches) return;
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const input = textareaRef.current;
        if (document.activeElement !== input) return;
        const footer = input.closest("form").querySelector(".comment-compose-footer");
        const overflow = input.getBoundingClientRect().bottom - footer.getBoundingClientRect().top + 12;
        if (overflow > 0) window.scrollBy({ top: overflow, behavior: "instant" });
      });
    };
    const observer = new MutationObserver(keepInputVisible);
    observer.observe(root, { attributes: true, attributeFilter: ["data-mobile-keyboard", "style"] });
    return () => { observer.disconnect(); cancelAnimationFrame(frame); };
  }, []);

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
    const send = initialSend.current;
    if (!send) return undefined;
    let active = true;
    void send.promise.then(({ result, error, cancelled }) => {
      if (!active || cancelled) return;
      initialSend.current = null;
      if (error) {
        setBody(send.draft.body);
        setReplyTo(send.draft.replyTo);
        setSelectedMentions(send.draft.mentions);
        setHiddenCardPath(send.draft.hiddenCardPath || null);
        setMessage("");
        setActionError(`发送失败：${error.message} 草稿已恢复。`);
      } else if (result) {
        setMessage(send.draft.replyTo ? "回复已发布。" : "评论已发布。");
        void load();
      }
      pendingSend.current = false;
      setSubmitting(false);
    });
    return () => { active = false; };
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
    if (!content || pendingSend.current || commentSends.has(draftKey) || deleting || state.loading) return;
    pendingSend.current = true;
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
      link_card: draftLink && previewCard && !cardHidden ? { href: draftLink.href, ...previewCard } : null,
      can_delete: false,
      created_at: new Date().toISOString(),
      optimistic: true,
    };
    const draft = { body, replyTo, mentions: selectedMentions, hiddenCardPath };
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
    setHiddenCardPath(null);
    setMentionCandidates([]);
    setSubmitting(true);
    setActionError("");
    setMessage(wasReply ? "回复正在发送…" : "评论正在发送…");
    try {
      const outcome = await trackCommentSend(draftKey, draft, api.post("/comments", {
        post_id: postId,
        body: content,
        client_request_id: idempotencyKey,
        mention_user_ids: selectedMentions.map((item) => item.id),
        ...(cardHidden ? { hide_link_card: true } : {}),
        ...(replyTo ? { reply_to_comment_id: replyTo.id } : {}),
      }));
      if (outcome.cancelled) return;
      if (outcome.error) throw outcome.error;
      const result = outcome.result;
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
      setHiddenCardPath(draft.hiddenCardPath);
      setMessage("");
      setActionError(`发送失败：${error.message} 草稿已恢复。`);
    } finally {
      pendingSend.current = false;
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
          <p></p>
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
            <span>{replyTo ? `回复 ${replyTo.author?.nickname || "成员"}` : ""}</span>
          </div>
        </div>
        <label className="sr-only" htmlFor={`comment-body-${postId}`}>{replyTo ? "写下回复" : "写下回应"}</label>
        <div className="comment-compose">
          <textarea
            ref={textareaRef}
            id={`comment-body-${postId}`}
            value={body}
            disabled={submitting}
            enterKeyHint="enter"
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
        {previewCard && !submitting ? (cardHidden ? (
          <p className="comment-card-preview-hidden">这条评论只显示链接，不附卡片。<button className="text-button" type="button" onClick={() => setHiddenCardPath(null)}>附上卡片</button></p>
        ) : (
          <div className="comment-card-preview">
            <PostLinkCard card={previewCard} linked={false} />
            <button className="text-button" type="button" onClick={() => setHiddenCardPath(draftLinkPath)}>不附卡片</button>
          </div>
        )) : null}
        <div className="comment-compose-footer">
          <span className="meta-text comment-compose-context">{replyTo ? `回复 ${replyTo.author?.nickname || "成员"}` : "输入 @ 提及成员"}</span>
          <div>
            <span className="meta-text tabular" id={`comment-count-${postId}`}>{characterCount} / 500</span>
            <button className="btn btn-primary" type="submit" onPointerDown={(event) => { if (document.activeElement === textareaRef.current) event.preventDefault(); }} disabled={submitting || deleting || state.loading || !body.trim()}>
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
        <EmptyState title="还没有评论" description="" />
      ) : null}
      {!state.error ? <div className="comment-list">{items.map((item) => commentNode(item))}</div> : null}
      <Pagination page={pagination.page || page} totalPages={pagination.total_pages || 0} onChange={changePage} />

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title="删除这条评论？"
        description={deleteTarget?.replies?.length
          ? "删除后将显示“[该评论已删除]”，已有回复保留。"
          : "评论将被删除，无法在本页恢复。"}
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
