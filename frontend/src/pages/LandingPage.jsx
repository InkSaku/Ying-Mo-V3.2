import { Link } from "react-router-dom";
import { PublicHeader } from "../components/PublicHeader";
import { usePageMeta } from "../hooks/usePageMeta";

export function LandingPage() {
  usePageMeta("", { indexable: true });
  return (
    <>
      <PublicHeader />
      <main className="public-main">
        <section className="landing-hero">
          <div className="hero-copy">
            <p className="hero-kicker">邀请制朋友记录空间</p>
            <h1>写字，也和朋友一起记录生活。</h1>
            <p className="hero-lede">映墨用于保存文章、随记、照片、旅行、学习与共同经历。只有受邀成员能够进入内容空间。</p>
            <div className="hero-actions">
              <Link className="btn btn-primary" to="/register">使用邀请码注册</Link>
              <Link className="btn btn-secondary" to="/login">成员登录</Link>
            </div>
          </div>
          <aside className="paper-note" aria-label="映墨的记录方式">
            <p>个人记录</p>
            <h2>Article / Note</h2>
            <span>写下自己的长期内容与生活片段。</span>
            <hr />
            <p>共同记录</p>
            <h2>Collection</h2>
            <span>由创建者和指定朋友共同阅读、共同投稿。</span>
          </aside>
        </section>

        <section className="public-principles" aria-labelledby="principles-title">
          <h2 id="principles-title">一个小而长期的记录空间</h2>
          <div className="principle-grid">
            <article>
              <h3>邀请制</h3>
              <p>注册需要站长提供的邀请码。公开页面不会展示成员作品、用户数据或内容统计。</p>
            </article>
            <article>
              <h3>真实作者</h3>
              <p>每篇内容都保留自己的作者归属。共同 Collection 不会把朋友的内容变成创建者的内容。</p>
            </article>
            <article>
              <h3>成员边界</h3>
              <p>Collection 的成员名单同时决定阅读权和投稿权。权限判断始终由后端执行。</p>
            </article>
          </div>
        </section>
      </main>
    </>
  );
}
