import { InkBrandMark } from "../components/InkBrandMark";
import { useEffect, useRef } from "react";
import { Link, useNavigate, useNavigationType } from "react-router-dom";
import { InkSketch } from "../components/InkSketch";
import { useAuth } from "../contexts/AuthContext";
import { usePageMeta } from "../hooks/usePageMeta";
import { playLoginPageTurn, prepareLoginPageTurn } from "../lib/loginPageTurn";
import "../styles/login.css";
import "../styles/landing.css";

const details = [
  { title: "写下来", copy: "用文章与随记，保存文字、照片和 Live Photo。" },
  { title: "一起留存", copy: "和选定的朋友，共同整理一本合集。" },
  { title: "日后重读", copy: "翻开往年今日，回看当时的生活。" },
];

let hasOpenedWelcome = false;

function EntryArrow({ small = false }) {
  return <svg className={small ? "landing-nav-arrow" : "landing-entry-arrow"} viewBox="0 0 24 24" fill="none" aria-hidden="true" focusable="false">
    {small ? <path d="M6 18 18 6M7 6h11v11" /> : <path d="M3 12h18m-6-6 6 6-6 6" />}
  </svg>;
}

export function LandingPage() {
  usePageMeta("", { indexable: true });
  const { status } = useAuth();
  const navigate = useNavigate();
  const navigationType = useNavigationType();
  const paperRef = useRef(null);

  useEffect(() => {
    // A lazy destination can keep this sheet mounted while its chunk loads.
    // Browser history already reflects that departure; never redirect it back.
    const stillOnWelcome = () => window.location.pathname === "/" && paperRef.current?.isConnected;
    if (status !== "authenticated" || !stillOnWelcome()) return undefined;
    void import("./HomePage").catch(() => {});
    const enterHome = () => {
      if (!stillOnWelcome()) return;
      navigate("/home", { replace: true });
      window.scrollTo({ top: 0, behavior: "instant" });
    };
    // Only the browser's welcome entrance gets a cover turn. Internal links
    // return straight home, and replace keeps Back from replaying the cover.
    if (hasOpenedWelcome || navigationType !== "POP") {
      enterHome();
      return undefined;
    }
    let frame = requestAnimationFrame(() => {
      if (!stillOnWelcome()) return;
      frame = requestAnimationFrame(() => {
        if (!stillOnWelcome()) return;
        hasOpenedWelcome = true;
        void playLoginPageTurn(prepareLoginPageTurn(paperRef.current), enterHome, { duration: 550, leadIn: 0 });
      });
    });
    // Navigation away or a session change before the turn must cancel entry.
    // Once started, the sheet intentionally survives this route's unmount.
    return () => cancelAnimationFrame(frame);
  }, [status, navigate, navigationType]);

  return <WelcomeSheet paperRef={paperRef} checking={status === "loading"} />;
}

// Shared with the development replay; this sheet never checks authentication.
export function WelcomeSheet({ paperRef, checking = false }) {
  return (
    <main ref={paperRef} className="login-paper landing-paper">
      {checking ? <span className="sr-only" role="status">正在确认登录状态。</span> : null}
      <header className="login-masthead landing-masthead">
        <Link to="/" className="login-wordmark" aria-label="映墨欢迎页"><InkBrandMark />映墨 <span>YING MO</span></Link>
        <nav className="landing-nav" aria-label="公开导航">
          <Link to="/about">关于映墨</Link>
          <Link to="/login">登录 <EntryArrow small /></Link>
        </nav>
      </header>

      <section className="landing-hero" aria-labelledby="landing-title">
        <div className="landing-copy">
          <h1 id="landing-title"><span>把今天，</span><span>轻轻放进时间里。</span></h1>
          <p className="landing-lead">写字、存照片，<br />也和朋友一起记录生活。</p>
          <div className="landing-actions" aria-label="进入映墨">
            <Link className="landing-primary" to="/login"><span>进入映墨</span><EntryArrow /></Link>
          </div>
          <p className="landing-join"><span>有邀请码？</span><Link to="/register">加入我们</Link></p>
        </div>

        <figure className="landing-illustration" aria-hidden="true">
          <InkSketch variant="welcome" className="ink-entry-art" />
        </figure>
      </section>

      <section className="landing-details" aria-labelledby="landing-details-title">
        <h2 id="landing-details-title" className="sr-only">在映墨可以做什么</h2>
        <dl className="landing-detail-list">
          {details.map((item) => (
            <div key={item.title}><dt>{item.title}</dt><dd>{item.copy}</dd></div>
          ))}
        </dl>
      </section>

      <footer className="login-colophon landing-colophon"><span>映墨 · 留给生活的一页</span><span>朋友间的邀请制空间 · 登录后阅读</span></footer>
    </main>
  );
}
