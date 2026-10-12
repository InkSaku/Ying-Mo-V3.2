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
    { label: "内容", value: counts.posts, unit: "则", href: "/me/posts", sketch: "pages", title: "留在纸上的日常", description: "文章与随记，都是自己的这一页。" },
    { label: "草稿", value: counts.drafts, unit: "份", href: "/me/posts?status=draft", sketch: "pencil", title: "还没写完，也很好", description: "让没说完的话，先在这里歇一会儿。" },
    { label: "合集", value: counts.collections, unit: "册", href: "/me/collections", sketch: "shelf", title: "把故事，收进同一册", description: "共同走过的日子，有了自己的书架。" },
    { label: "收藏", value: counts.favorites, unit: "则", href: "/me/favorites", sketch: "bookmark", title: "喜欢的，留一枚书签", description: "遇见喜欢的文字，留着慢慢重读。" },
    { label: "评论", value: counts.comments, unit: "条", href: "/me/comments", sketch: "replies", title: "说过的话，都有回声", description: "一来一往，像坐下来喝一杯茶。" },
    { label: "未读通知", value: counts.unread_notifications, unit: "封", href: "/me/notifications", sketch: "inbox", title: "回信，在这里落脚", description: counts.unread_notifications ? "朋友的回应与新页，都在这里等你。" : "信箱先歇一会儿，回信到了会放在这里。" },
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
            fallback={<div className="profile-monogram" aria-hidden="true">{(user.nickname || user.username).slice(0, 1)}</div>}
          />
        </div>
        <div>
          <p className="hero-kicker">Personal archive</p>
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
          <p>照料这间共同的书房，整理内容与成员事务。</p>
          <Link className="btn btn-secondary" to="/admin">进入系统管理</Link>
        </section>
      ) : null}
    </main>
  );
}
