import { DefaultAvatar } from "../components/DefaultAvatar";
import { Link } from "react-router-dom";
import { api } from "../lib/api";
import { useAsyncData } from "../hooks/useAsyncData";
import { usePageMeta } from "../hooks/usePageMeta";
import { ErrorState, PageLoader } from "../components/States";
import { ProtectedImage } from "../components/ProtectedImage";
import { PersonalNav } from "../components/PersonalNav";
import { InkSketch } from "../components/InkSketch";

export function MePage() {
  usePageMeta("我的空间");
  const state = useAsyncData(() => api.get("/users/me/overview"), []);
  if (state.loading) return <PageLoader />;
  if (state.error) return <main className="page-shell"><ErrorState error={state.error} onRetry={state.reload} /></main>;
  const { user, counts } = state.data;

  const items = [
    { label: "内容", value: counts.posts, unit: "则", href: "/me/posts", sketch: "pages", title: "我的内容", description: "" },
    { label: "草稿", value: counts.drafts, unit: "份", href: "/me/posts?status=draft", sketch: "pencil", title: "草稿", description: "" },
    { label: "合集", value: counts.collections, unit: "册", href: "/me/collections", sketch: "shelf", title: "我的合集", description: "" },
    { label: "收藏", value: counts.favorites, unit: "则", href: "/me/favorites", sketch: "bookmark", title: "收藏", description: "" },
    { label: "评论", value: counts.comments, unit: "条", href: "/me/comments", sketch: "replies", title: "我的评论", description: "" },
    { label: "未读通知", value: counts.unread_notifications, unit: "条", href: "/me/notifications", sketch: "inbox", title: "未读通知", description: counts.unread_notifications ? "" : "" },
  ];

  return (
    <main className="page-shell personal-page-shell personal-overview-page">
      <PersonalNav />
      <header className="profile-hero me-hero">
        <div className="me-avatar">
          <ProtectedImage
            media={user.avatar_media}
            alt={`${user.nickname}的头像`}
            className="profile-avatar"
            fallback={<DefaultAvatar className="profile-avatar" />}
          />
        </div>
        <div>
          <p className="hero-kicker"></p>
          <h1>{user.nickname}</h1>
          <p className="profile-handle">@{user.username}</p>
          {user.bio ? <p>{user.bio}</p> : <p className="muted">还没有填写个人简介。</p>}
          <div className="profile-actions">
            <Link className="btn btn-secondary" to="/me/settings">编辑资料</Link>
            <Link className="btn btn-secondary" to="/me/sessions">登录设备</Link>
            <Link className="btn btn-secondary" to="/tools/spark">续火花助手</Link>
            <Link className="btn btn-primary" to="/write">新建记录</Link>
          </div>
        </div>
      </header>

      <nav className="personal-entry-grid" aria-label="个人空间入口">
        {items.map(({ label, value, unit, href, sketch, title, description }, index) => (
          <Link className="personal-entry" key={label} to={href} aria-label={`${label}，${value} ${unit}`}>
            <span className="personal-entry-meta" aria-hidden="true">
              <span><span className="personal-entry-index">{String(index + 1).padStart(2, "0")}</span> / {label}</span>
              <span className="personal-entry-count"><span className="tabular">{value}</span> {unit}</span>
            </span>
            <InkSketch variant={sketch} className="personal-entry-art" />
            <div className="personal-entry-copy">
              <h2>{title}<span className="personal-entry-arrow" aria-hidden="true">↗</span></h2>
              <p>{description}</p>
            </div>
          </Link>
        ))}
      </nav>

      {user.role === "system_admin" ? (
        <section className="content-section">
          <h2>系统管理</h2>
          <p>管理成员、内容和站点设置。</p>
          <Link className="btn btn-secondary" to="/admin">进入系统管理</Link>
        </section>
      ) : null}
    </main>
  );
}
