import { api } from "../lib/api";
import { useAsyncData } from "../hooks/useAsyncData";
import { usePageMeta } from "../hooks/usePageMeta";
import { EmptyState, ErrorState } from "../components/States";
import { AdminPageFrame, AdminStatus } from "../components/AdminPanel";
import { dashboardMetrics } from "../lib/admin";
import { formatDate, postTypeLabel } from "../lib/format";

function DashboardLoader() {
  return (
    <div className="skeleton-stack" role="status">
      <span className="sr-only">正在读取管理概览</span>
      <div className="skeleton-line skeleton-line-title" />
      <div className="skeleton-block" />
    </div>
  );
}

export function AdminPage() {
  usePageMeta("管理概览");
  const state = useAsyncData(() => api.get("/admin/dashboard"), []);
  const data = state.data || {};

  return (
    <AdminPageFrame
      title="系统管理"
      description="后台扩展读取只通过 Admin API 提供，普通内容接口仍遵守成员 ACL。"
      busy={state.loading}
    >
      {state.loading && !state.data ? <DashboardLoader /> : null}
      {state.error ? <ErrorState error={state.error} onRetry={state.reload} /> : null}
      {state.data ? (
        <>
          {state.loading ? <div className="profile-refresh" role="status">正在更新管理概览…</div> : null}
          <dl className="admin-metric-grid">
            {dashboardMetrics(data).map((metric) => (
              <div key={metric.key}>
                <dt>{metric.label}</dt>
                <dd className="tabular">{metric.value}</dd>
              </div>
            ))}
          </dl>

          <div className="admin-dashboard-grid">
            <section className="admin-section" aria-labelledby="recent-posts-heading">
              <div className="admin-section-heading">
                <div><p className="hero-kicker">Content</p><h2 id="recent-posts-heading">最近内容</h2></div>
                <span>最近 {data.recent_posts?.length || 0} 条</span>
              </div>
              {data.recent_posts?.length ? (
                <div className="admin-feed">
                  {data.recent_posts.map((post) => (
                    <article key={post.id}>
                      <div className="admin-feed-meta">
                        <span>{postTypeLabel(post.post_type)}</span>
                        <AdminStatus value={post.deleted_at ? "deleted" : post.moderation_status === "hidden" ? "hidden" : post.status} />
                      </div>
                      <h3>{post.title || (post.post_type === "note" ? "未命名随记" : "未命名文章")}</h3>
                      <p>@{post.author?.username || `user-${post.author_id}`} · {post.visibility === "private" ? "仅作者" : "成员可见"}</p>
                      <time dateTime={post.created_at}>{formatDate(post.created_at, true)}</time>
                    </article>
                  ))}
                </div>
              ) : <EmptyState title="还没有 Post" />}
            </section>

            <section className="admin-section" aria-labelledby="recent-comments-heading">
              <div className="admin-section-heading">
                <div><p className="hero-kicker">Interaction</p><h2 id="recent-comments-heading">最近评论</h2></div>
                <span>最近 {data.recent_comments?.length || 0} 条</span>
              </div>
              {data.recent_comments?.length ? (
                <div className="admin-feed admin-comment-feed">
                  {data.recent_comments.map((comment) => (
                    <article key={comment.id}>
                      <div className="admin-feed-meta">
                        <span>Post #{comment.post_id}</span>
                        <AdminStatus value={comment.status} />
                      </div>
                      <h3>{comment.post?.title || (comment.post?.post_type === "note" ? "未命名随记" : "评论目标")}</h3>
                      <p>{comment.body || "[评论正文不可用]"}</p>
                      <small>@{comment.author?.username || `user-${comment.author_id}`}</small>
                      <time dateTime={comment.created_at}>{formatDate(comment.created_at, true)}</time>
                    </article>
                  ))}
                </div>
              ) : <EmptyState title="还没有评论" />}
            </section>
          </div>

          <section className="admin-section admin-system-section" aria-labelledby="system-status-heading">
            <div className="admin-section-heading">
              <div><p className="hero-kicker">Runtime</p><h2 id="system-status-heading">系统状态</h2></div>
              <AdminStatus value={data.system?.status || "unknown"} />
            </div>
            <dl className="admin-system-grid">
              <div><dt>运行环境</dt><dd>{data.system?.environment || "未知"}</dd></div>
              <div><dt>数据库</dt><dd>{data.system?.database || "未知"}</dd></div>
              <div><dt>媒体存储</dt><dd>{data.system?.media_storage || "未知"}</dd></div>
            </dl>
          </section>
        </>
      ) : null}
    </AdminPageFrame>
  );
}
