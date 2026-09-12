import { Link } from "react-router-dom";
import inkGardenPath from "../assets/auth/ink-garden-path.webp";
import { usePageMeta } from "../hooks/usePageMeta";
import "../styles/login.css";
import "../styles/landing.css";

const promises = [
  { number: "01", title: "随手写下", copy: "长文、短句、照片，都有一处安静的位置。", icon: "pen" },
  { number: "02", title: "自在分享", copy: "只给自己，或与熟悉的人一起珍藏。", icon: "people" },
  { number: "03", title: "与往日重逢", copy: "在某年今日，再读一次当时的生活。", icon: "sun" },
];

function PromiseIcon({ name }) {
  if (name === "pen") {
    return <svg viewBox="0 0 52 52" aria-hidden="true"><path d="M10 40c9-2 18-7 25-15L42 18c1-1 1-3 0-4l-4-4c-1-1-3-1-4 0l-7 7C19 25 14 33 12 41" /><path d="m27 17 8 8M11 41c4-1 7 0 9 3M8 45c9 1 19 0 28-3" /></svg>;
  }
  if (name === "people") {
    return <svg viewBox="0 0 52 52" aria-hidden="true"><path d="M18 27c-6 1-10 5-11 12M34 27c6 1 10 5 11 12M26 29c-7 0-12 5-13 13h26c-1-8-6-13-13-13Z" /><path d="M26 10c5 0 8 4 8 9s-3 9-8 9-8-4-8-9 3-9 8-9ZM13 15c3 0 5 3 5 7s-2 7-5 7M39 15c-3 0-5 3-5 7s2 7 5 7" /></svg>;
  }
  return <svg viewBox="0 0 52 52" aria-hidden="true"><path d="M26 15c7 0 12 5 12 12S33 39 26 39s-12-5-12-12 5-12 12-12Z" /><path d="M26 5v6M26 43v5M5 27h6M42 27h6M11 11l5 5M37 38l4 4M41 11l-5 5M15 38l-4 4" /><path d="M20 28c2 2 4 3 7 3 2 0 4-1 6-3" /></svg>;
}

export function LandingPage() {
  usePageMeta("", { indexable: true });
  return (
    <main className="login-paper landing-paper">
      <header className="login-masthead landing-masthead">
        <Link to="/" className="login-wordmark" aria-label="映墨欢迎页">映墨 <span>YING MO</span></Link>
        <nav className="landing-nav" aria-label="公开导航">
          <Link to="/about">关于映墨</Link>
          <Link className="landing-nav-login" to="/login">登录 <span aria-hidden="true">↗</span></Link>
        </nav>
      </header>

      <section className="landing-hero" aria-labelledby="landing-title">
        <div className="landing-copy">
          <p className="landing-eyebrow"><span aria-hidden="true">✦</span> 一处安静的私人记录地</p>
          <h1 id="landing-title">把今天，<br /><em>轻轻</em>放进时间里。</h1>
          <p className="landing-lead">写随笔，存照片，把共同经历编成册。<br className="landing-desktop-break" />没有喧闹的广场，只有你愿意留下的人与事。</p>
          <div className="landing-actions" aria-label="进入映墨">
            <Link className="landing-primary" to="/register"><span><small>第一次来</small>开始记录</span><span className="landing-action-arrow" aria-hidden="true">⟶</span></Link>
            <Link className="landing-secondary" to="/login"><span><small>已经是成员</small>回到我的一页</span><span aria-hidden="true">↗</span></Link>
          </div>
          <p className="landing-trust"><span>凭邀请相聚</span><span>由你决定谁能看见</span></p>
        </div>

        <div className="landing-illustration" aria-label="通往映墨小院的水墨小径">
          <p className="landing-page-number" aria-hidden="true">第 〇 页&nbsp; / &nbsp;从这里开始</p>
          <div className="landing-ink-wash" aria-hidden="true" />
          <img src={inkGardenPath} alt="淡墨绘成的竹篱小径、枝叶与院门" />
          <p className="landing-handwritten" aria-hidden="true">Come in,<br /><span>stay awhile.</span></p>
          <blockquote>“日子不是为了被展示，<br />是为了被记得。”</blockquote>
          <span className="landing-seal" aria-hidden="true">映</span>
          <svg className="landing-flight" viewBox="0 0 160 80" aria-hidden="true"><path d="M4 65c34 9 43-30 78-22 19 5 19-24 43-19" /><path d="m119 19 12 4-8 9M139 9c5 1 8 4 10 8M142 24c5 0 9 2 13 5" /></svg>
        </div>
      </section>

      <section className="landing-promises" aria-label="映墨可以做什么">
        <header className="landing-promises-intro"><p>在这里</p><h2>让生活留下自己的笔迹。</h2></header>
        <div className="landing-promise-list">
          {promises.map((item) => (
            <article className="landing-promise" key={item.number}>
              <span className="landing-promise-number">{item.number}</span>
              <PromiseIcon name={item.icon} />
              <div><h3>{item.title}</h3><p>{item.copy}</p></div>
            </article>
          ))}
        </div>
      </section>

      <section className="landing-closing" aria-label="开始使用映墨">
        <p aria-hidden="true">YOUR DAYS, IN YOUR OWN HAND.</p>
        <h2>不必等特别的一天。<br />今天，就值得写下。</h2>
        <Link to="/register">拿着邀请码，推门进来 <span aria-hidden="true">⟶</span></Link>
      </section>

      <footer className="login-colophon landing-colophon"><span>映墨 · 留给生活的一页</span><span>A LITTLE LIFE, IN WORDS.</span></footer>
    </main>
  );
}
