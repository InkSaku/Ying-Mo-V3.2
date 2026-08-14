import { Link } from "react-router-dom";
import { api } from "../lib/api";
import { useAsyncData } from "../hooks/useAsyncData";
import { usePageMeta } from "../hooks/usePageMeta";
import { ErrorState, PageLoader } from "../components/States";
import { ProtectedImage } from "../components/ProtectedImage";
import { PersonalNav } from "../components/PersonalNav";

export function MePage() {
  usePageMeta("我的空间");
  const state = useAsyncData(() => api.get("/users/me/overview"), []);
  if (state.loading) return <PageLoader />;
  if (state.error) return <main className="page-shell"><ErrorState error={state.error} onRetry={state.reload} /></main>;
  const { user, counts } = state.data;

  const items = [
    ["内容", counts.posts, "/me/posts"],
    ["草稿", counts.drafts, "/me/posts?status=draft"],
    ["Collection", counts.collections, "/me/collections"],
    ["收藏", counts.favorites, "/me/favorites"],
    ["评论", counts.comments, "/me/comments"],
    ["未读通知", counts.unread_notifications, "/me/notifications"],
  ];

  return (
    <main className="page-shell">
      <PersonalNav />
      <header className="profile-hero me-hero">
        <ProtectedImage
          media={user.avatar_media}
          alt={`${user.nickname}的头像`}
          className="profile-avatar"
          fallback={<div className="profile-monogram" aria-hidden="true">{(user.nickname || user.username).slice(0, 1)}</div>}
        />
        <div>
          <h1>{user.nickname}</h1>
          <p className="profile-handle">@{user.username}</p>
          {user.bio ? <p>{user.bio}</p> : <p className="muted">还没有填写个人简介。</p>}
          <div className="profile-actions">
            <Link className="btn btn-secondary" to="/me/settings">编辑资料</Link>
            <Link className="btn btn-secondary" to="/me/sessions">登录会话</Link>
            <Link className="btn btn-primary" to="/write">新建记录</Link>
          </div>
        </div>
      </header>

      <section className="metric-grid">
        {items.map(([label, value, href]) => (
          <Link className="metric-link" key={label} to={href}>
            <span className="metric-value">{value}</span>
            <span>{label}</span>
          </Link>
        ))}
      </section>

      {user.role === "system_admin" ? (
        <section className="content-section">
          <h2>系统管理</h2>
          <p>当前账号拥有 system_admin 角色。普通内容接口仍不会因为管理员身份扩大读取范围。</p>
          <Link className="btn btn-secondary" to="/admin">进入系统管理</Link>
        </section>
      ) : null}
    </main>
  );
}
