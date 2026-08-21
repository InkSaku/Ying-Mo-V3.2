import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { api } from "../lib/api";
import { useAsyncData } from "../hooks/useAsyncData";
import { usePageMeta } from "../hooks/usePageMeta";
import { CustomSelect } from "../components/CustomSelect";
import { EmptyState, ErrorState, PageLoader } from "../components/States";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { Pagination } from "../components/Pagination";
import { formatDate, postTypeLabel, visibilityLabel } from "../lib/format";
import { PersonalNav } from "../components/PersonalNav";
import { clampPageToTotal } from "../lib/pagination";

const PAGE_SIZE = 20;

const statusOptions = [
  ["", "全部"],
  ["draft", "草稿"],
  ["published", "已发布"],
  ["archived", "已归档"],
];

const statusLabels = {
  draft: "草稿",
  published: "已发布",
  archived: "已归档",
};

function positivePage(value) {
  const parsed = Number.parseInt(value || "1", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
}

export function MyPostsPage() {
  usePageMeta("我的内容");
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const status = params.get("status") || "";
  const postType = params.get("type") || "";
  const query = params.get("q") || "";
  const page = positivePage(params.get("page"));
  const [searchValue, setSearchValue] = useState(query);
  const [action, setAction] = useState(null);
  const [actionBusy, setActionBusy] = useState(false);
  const [actionError, setActionError] = useState("");
  const [feedback, setFeedback] = useState("");
  const [slug, setSlug] = useState("");
  const [openingId, setOpeningId] = useState(null);

  useEffect(() => setSearchValue(query), [query]);

  const requestParams = new URLSearchParams({ page: String(page), page_size: String(PAGE_SIZE) });
  if (status) requestParams.set("status", status);
  if (postType) requestParams.set("post_type", postType);
  if (query) requestParams.set("q", query);
  const state = useAsyncData(() => api.get(`/posts/me?${requestParams}`), [status, postType, query, page]);
  const pagination = state.meta?.pagination || {};
  const clampedPage = clampPageToTotal(page, pagination.total || 0, pagination.page_size || PAGE_SIZE);
  const pageNeedsClamp = Boolean(state.meta) && clampedPage !== page;

  const updateParams = (updates) => {
    const next = new URLSearchParams(params);
    Object.entries(updates).forEach(([key, value]) => {
      if (value) next.set(key, String(value));
      else next.delete(key);
    });
    setParams(next);
  };

  useEffect(() => {
    if (!pageNeedsClamp) return;
    const next = new URLSearchParams(params);
    if (clampedPage === 1) next.delete("page");
    else next.set("page", String(clampedPage));
    setParams(next, { replace: true });
  }, [clampedPage, pageNeedsClamp, params, setParams]);

  const beginAction = (type, post) => {
    setFeedback("");
    setActionError("");
    setSlug(post.slug_candidate || post.slug || "");
    setAction({ type, post });
  };

  const closeAction = () => {
    if (actionBusy) return;
    setAction(null);
    setActionError("");
  };

  const completeAction = async () => {
    if (!action) return;
    const { type, post } = action;
    setActionBusy(true);
    setActionError("");
    try {
      if (type === "publish") {
        await api.post(`/posts/${post.id}/publish`, post.post_type === "article" ? { slug: slug.trim() } : {});
        setFeedback("内容已发布。");
      } else if (type === "archive") {
        await api.post(`/posts/${post.id}/archive`, {});
        setFeedback("内容已归档。");
      } else if (type === "detach") {
        await api.post(`/posts/${post.id}/remove-from-collection`, {});
        setFeedback("内容已移出 Collection，并恢复为仅自己可见。");
      } else if (type === "delete") {
        await api.delete(`/posts/${post.id}`);
        setFeedback(post.published_at ? "已删除发布内容。" : "已删除草稿。");
      }
      setAction(null);
      if (type === "delete" && state.data?.length === 1 && page > 1) {
        updateParams({ page: page - 1 });
      } else {
        await state.reload();
      }
    } catch (error) {
      setActionError(error.message);
    } finally {
      setActionBusy(false);
    }
  };

  const openReadingPage = async (post) => {
    setFeedback("");
    setActionError("");
    setOpeningId(post.id);
    try {
      const result = await api.get(`/posts/${post.id}`);
      navigate(result.data.canonical || (post.post_type === "article" ? `/articles/${post.slug}` : `/notes/${post.id}`));
    } catch (error) {
      setFeedback("");
      setActionError(error.status === 404 && post.collection_id
        ? "普通阅读入口当前不可用。你仍可编辑此内容，或先将它移出原 Collection。"
        : error.message);
    } finally {
      setOpeningId(null);
    }
  };

  const submitSearch = (event) => {
    event.preventDefault();
    updateParams({ q: searchValue.trim(), page: "" });
  };

  if (state.loading) return <PageLoader />;
  if (state.error) return <main className="page-shell"><ErrorState error={state.error} onRetry={state.reload} /></main>;

  return (
    <main className="page-shell" aria-busy={pageNeedsClamp || actionBusy || undefined}>
      <PersonalNav />
      <header className="page-heading">
        <div>
          <h1>我的内容</h1>
          <p>这里是作者管理入口，即使你已被移出某个 Collection，自己的历史 Post 仍会保留最小管理能力。</p>
        </div>
        <Link className="btn btn-primary" to="/write">新建</Link>
      </header>

      <div className="management-controls">
        <div className="filter-tabs" role="group" aria-label="内容状态">
        {statusOptions.map(([value, label]) => (
          <button key={value || "all"} className={status === value ? "active" : ""} type="button"
            aria-pressed={status === value}
            onClick={() => updateParams({ status: value, page: "" })}>{label}</button>
        ))}
        </div>
        <form className="management-search" role="search" onSubmit={submitSearch}>
          <label className="sr-only" htmlFor="my-posts-search">搜索自己的内容</label>
          <input id="my-posts-search" type="search" maxLength={100} value={searchValue} onChange={(event) => setSearchValue(event.target.value)} placeholder="搜索标题、摘要或正文" />
          <CustomSelect aria-label="内容类型" value={postType} onChange={(event) => updateParams({ type: event.target.value, page: "" })}>
            <option value="">全部类型</option>
            <option value="article">Article</option>
            <option value="note">Note</option>
          </CustomSelect>
          <button className="btn btn-secondary" type="submit">搜索</button>
        </form>
      </div>

      {feedback ? <div className="inline-success" role="status">{feedback}</div> : null}
      {actionError && !action ? <div className="inline-error" role="alert">{actionError}</div> : null}

      {pageNeedsClamp ? <div className="profile-refresh" role="status">正在返回有效页码…</div> : state.data?.length ? (
        <div className="management-list">
          {state.data.map((post) => (
            <article className="post-management-row" key={post.id}>
              <div className="post-management-summary">
                <div className="post-management-meta">
                  <span>{postTypeLabel(post.post_type)}</span>
                  <span className={`post-status post-status-${post.status}`}>{statusLabels[post.status] || post.status}</span>
                  <span>{post.collection_id ? "Collection 内容" : visibilityLabel(post.visibility)}</span>
                </div>
                <h2>{post.title || (post.post_type === "note" ? "未命名随记" : "未命名文章")}</h2>
                <p>更新于 {formatDate(post.updated_at, true)}{post.published_at ? ` · 首次发布于 ${formatDate(post.published_at, true)}` : ""}</p>
                {post.published_at ? (
                  <p>
                    阅读 {post.reading_stats?.views ?? 0}
                    {" · "}{post.reading_stats?.unique_readers ?? 0} 位读者
                    {" · "}近 7 天 {post.reading_stats?.views_7d ?? 0}
                    {" · "}近 30 天 {post.reading_stats?.views_30d ?? 0}
                  </p>
                ) : null}
              </div>
              <div className="post-management-actions" aria-label={`${post.title || "未命名内容"}的操作`}>
                {(post.status === "published" || post.status === "archived") ? (
                  <button className="btn btn-secondary" type="button" disabled={openingId === post.id} onClick={() => openReadingPage(post)}>
                    {openingId === post.id ? "正在打开" : "阅读"}
                  </button>
                ) : null}
                <Link className="btn btn-secondary" to={`/write/${post.id}`}>编辑</Link>
                {post.published_at ? <Link className="btn btn-secondary" to={`/me/posts/${post.id}/revisions`}>版本历史</Link> : null}
                {post.status === "draft" ? <button className="btn btn-primary" type="button" onClick={() => beginAction("publish", post)}>发布</button> : null}
                {post.status === "published" ? <button className="btn btn-secondary" type="button" onClick={() => beginAction("archive", post)}>归档</button> : null}
                {post.collection_id ? <button className="text-button" type="button" onClick={() => beginAction("detach", post)}>移出合集</button> : null}
                <button className="text-button danger-text" type="button" onClick={() => beginAction("delete", post)}>删除</button>
              </div>
            </article>
          ))}
        </div>
      ) : <EmptyState title="这个筛选下没有内容" />}

      <Pagination
        page={pagination.page || page}
        totalPages={pagination.total_pages || 1}
        disabled={pageNeedsClamp || actionBusy}
        onChange={(nextPage) => updateParams({ page: nextPage === 1 ? "" : nextPage })}
      />

      <ConfirmDialog
        open={Boolean(action)}
        title={action?.type === "publish"
          ? "发布这篇内容？"
          : action?.type === "archive"
            ? "归档这篇内容？"
            : action?.type === "detach"
              ? "移出原 Collection？"
              : "删除这篇内容？"}
        description={action?.type === "publish"
          ? "发布后会按照独立可见性或 Collection 成员范围开放阅读。"
          : action?.type === "archive"
            ? "归档后内容仍可由有权成员阅读，也可以继续编辑。"
            : action?.type === "detach"
              ? "内容会脱离原 Collection，并自动恢复为仅自己可见。"
              : action?.post?.published_at
                ? "发布过的内容会从正常入口移除，这项操作不能在前端撤销。"
                : "未发布草稿会被永久删除，这项操作不能撤销。"}
        confirmLabel={action?.type === "publish" ? "确认发布" : action?.type === "archive" ? "确认归档" : action?.type === "detach" ? "确认移出" : "确认删除"}
        danger={action?.type !== "publish"}
        busy={actionBusy}
        confirmDisabled={action?.type === "publish" && action?.post?.post_type === "article" && !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug.trim())}
        onConfirm={completeAction}
        onClose={closeAction}
      >
        {action?.type === "publish" && action?.post?.post_type === "article" ? (
          <label>
            <span>Article Slug</span>
            <input data-autofocus required value={slug} onChange={(event) => {
              setSlug(event.target.value.toLowerCase());
              setActionError("");
            }} aria-invalid={Boolean(slug) && !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug.trim())} aria-describedby="publish-slug-help" />
            <small id="publish-slug-help">使用小写字母、数字和连字符，例如：my-article。</small>
          </label>
        ) : null}
        {actionError ? <div className="inline-error" role="alert">{actionError}</div> : null}
      </ConfirmDialog>
    </main>
  );
}
