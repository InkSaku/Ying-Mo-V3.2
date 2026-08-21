import { useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { api } from "../lib/api";
import { useAsyncData } from "../hooks/useAsyncData";
import { usePageMeta } from "../hooks/usePageMeta";
import { formatDate, postTypeLabel } from "../lib/format";
import { positiveRevisionParam, revisionChangedLabels, revisionReasonLabel } from "../lib/revisions";
import { PersonalNav } from "../components/PersonalNav";
import { ProtectedMarkdown } from "../components/ProtectedMarkdown";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { Pagination } from "../components/Pagination";
import { EmptyState, ErrorState, PageLoader } from "../components/States";

const PAGE_SIZE = 20;

function RevisionPreview({ post, revisionId, onRestored }) {
  const state = useAsyncData(
    () => api.get(`/posts/me/${post.id}/revisions/${revisionId}`),
    [post.id, revisionId]
  );
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const restore = async () => {
    setBusy(true);
    setError("");
    try {
      const result = await api.post(`/posts/me/${post.id}/revisions/${revisionId}/restore`, {
        expected_version: post.edit_version,
      });
      setConfirmOpen(false);
      onRestored(result.data);
    } catch (restoreError) {
      setError(restoreError.message);
    } finally {
      setBusy(false);
    }
  };

  if (state.loading) return <PageLoader label="正在读取历史版本" />;
  if (state.error) return <ErrorState error={state.error} onRetry={state.reload} />;
  const revision = state.data;
  const snapshot = revision.snapshot || {};
  const changed = revisionChangedLabels(revision.changed_fields);

  return (
    <section className="revision-preview" aria-labelledby="revision-preview-title">
      <div className="revision-preview-heading">
        <div>
          <p className="hero-kicker">版本 {revision.source_edit_version}</p>
          <h2 id="revision-preview-title">{snapshot.title || (snapshot.post_type === "note" ? "未命名随记" : "未命名文章")}</h2>
          <p>{formatDate(revision.created_at, true)} · {revisionReasonLabel(revision.reason)}</p>
        </div>
        <button className="btn btn-primary" type="button" onClick={() => setConfirmOpen(true)}>恢复此版本</button>
      </div>

      <dl className="revision-facts">
        <div><dt>类型</dt><dd>{postTypeLabel(snapshot.post_type)}</dd></div>
        <div><dt>当次变更</dt><dd>{changed.length ? changed.join("、") : "未记录"}</dd></div>
        {snapshot.slug ? <div><dt>Slug</dt><dd>{snapshot.slug}</dd></div> : null}
        {snapshot.occurred_at ? <div><dt>记录时间</dt><dd>{formatDate(snapshot.occurred_at, true)}</dd></div> : null}
        {snapshot.location ? <div><dt>地点</dt><dd>{snapshot.location}</dd></div> : null}
        {snapshot.mood ? <div><dt>心情</dt><dd>{snapshot.mood}</dd></div> : null}
        {snapshot.category ? <div><dt>Category</dt><dd>{snapshot.category.name}</dd></div> : null}
        {snapshot.tags?.length ? <div><dt>Tags</dt><dd>{snapshot.tags.map((tag) => `#${tag.name}`).join(" ")}</dd></div> : null}
        {snapshot.collection ? <div><dt>Collection</dt><dd>{snapshot.collection.name}</dd></div> : null}
        {snapshot.collection_unavailable ? <div><dt>Collection</dt><dd>原合集当前不可访问</dd></div> : null}
      </dl>
      {snapshot.summary ? <p className="revision-summary">{snapshot.summary}</p> : null}
      <ProtectedMarkdown html={snapshot.rendered_html} media={snapshot.bound_media || []} management className="prose revision-prose" />

      <ConfirmDialog
        open={confirmOpen}
        title="恢复这个历史版本？"
        description="当前内容会先保存为一条新的历史记录，然后恢复所选版本。恢复不会删除任何既有 Revision。"
        confirmLabel="确认恢复"
        busy={busy}
        onConfirm={restore}
        onClose={() => { if (!busy) { setConfirmOpen(false); setError(""); } }}
      >
        {error ? <div className="inline-error" role="alert">{error}</div> : null}
      </ConfirmDialog>
    </section>
  );
}

export function PostRevisionsPage() {
  const { postId } = useParams();
  const [params, setParams] = useSearchParams();
  const page = positiveRevisionParam(params.get("page"), 1);
  const revisionId = positiveRevisionParam(params.get("revision"));
  const [reloadKey, setReloadKey] = useState(0);
  const [feedback, setFeedback] = useState("");
  usePageMeta("版本历史");

  const postState = useAsyncData(() => api.get(`/posts/me/${postId}`), [postId, reloadKey]);
  const listState = useAsyncData(
    () => api.get(`/posts/me/${postId}/revisions?page=${page}&page_size=${PAGE_SIZE}`),
    [postId, page, reloadKey]
  );

  if ((postState.loading && !postState.data) || (listState.loading && !listState.data)) return <PageLoader />;
  if (postState.error) return <main className="page-shell"><ErrorState error={postState.error} onRetry={postState.reload} /></main>;
  if (listState.error) return <main className="page-shell"><ErrorState error={listState.error} onRetry={listState.reload} /></main>;

  const post = postState.data;
  const pagination = listState.meta?.pagination || {};
  const updateSelection = (nextRevision, nextPage = page) => {
    const next = new URLSearchParams();
    if (nextPage > 1) next.set("page", String(nextPage));
    if (nextRevision) next.set("revision", String(nextRevision));
    setParams(next);
  };
  const restored = (data) => {
    const warningText = data.warnings?.length ? ` ${data.warnings.join(" ")}` : "";
    setFeedback(`历史版本已恢复。${warningText}`);
    setReloadKey((value) => value + 1);
  };

  return (
    <main className="page-shell">
      <PersonalNav />
      <header className="page-heading revision-page-heading">
        <div>
          <p className="hero-kicker">内容恢复</p>
          <h1>版本历史</h1>
          <p>{post.title || (post.post_type === "note" ? "未命名随记" : "未命名文章")} · 当前编辑版本 {post.edit_version}</p>
        </div>
        <div className="page-heading-actions">
          <Link className="btn btn-secondary" to="/me/posts">返回我的内容</Link>
          <Link className="btn btn-secondary" to={`/write/${post.id}`}>继续编辑</Link>
        </div>
      </header>

      {feedback ? <div className="inline-success revision-feedback" role="status">{feedback}</div> : null}
      {!listState.data?.length ? (
        <EmptyState title="还没有历史版本" description="这篇内容下一次成功保存修改时，会在这里保留修改前的版本。" />
      ) : (
        <div className="revision-layout">
          <aside className="revision-timeline" aria-label="历史版本列表">
            {listState.data.map((revision) => (
              <button
                key={revision.id}
                className={revision.id === revisionId ? "active" : ""}
                type="button"
                aria-pressed={revision.id === revisionId}
                onClick={() => updateSelection(revision.id)}
              >
                <strong>版本 {revision.source_edit_version}</strong>
                <span>{formatDate(revision.created_at, true)}</span>
                <span>{revisionReasonLabel(revision.reason)}</span>
              </button>
            ))}
            <Pagination
              page={pagination.page || page}
              totalPages={pagination.total_pages || 1}
              onChange={(nextPage) => updateSelection(0, nextPage)}
            />
          </aside>
          {revisionId ? (
            <RevisionPreview key={`${revisionId}-${reloadKey}`} post={post} revisionId={revisionId} onRestored={restored} />
          ) : (
            <section className="revision-preview revision-preview-empty">
              <p>选择左侧版本，查看当时保存的内容并决定是否恢复。</p>
            </section>
          )}
        </div>
      )}
    </main>
  );
}
