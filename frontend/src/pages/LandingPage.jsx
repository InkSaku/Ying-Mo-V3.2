import { Link } from "react-router-dom";
import { usePageMeta } from "../hooks/usePageMeta";
import coast from "../assets/home/coast.jpg";
import "../styles/login.css";
import "../styles/landing.css";

export function LandingPage() {
  usePageMeta("", { indexable: true });
  return (
    <main className="login-paper landing-paper">
      <header className="login-masthead">
        <Link to="/" className="login-wordmark" aria-label="映墨首页">映墨 <span>YING MO</span></Link>
        <nav className="landing-nav" aria-label="公开导航"><Link to="/about">关于</Link><Link to="/login">登录 <span aria-hidden="true">↗</span></Link></nav>
      </header>
      <section className="landing-opening" aria-labelledby="landing-title">
        <div className="landing-opening-copy">
          <h1 id="landing-title">墨</h1>
          <p className="landing-verse">记录生活，<br />也保留此刻的自己。</p>
          <p className="landing-translation">A QUIETER<br />PLACE TO WRITE.</p>
          <div className="landing-entry-links">
            <Link className="login-submit" to="/register"><span>开始记录</span><span aria-hidden="true">⟶</span></Link>
            <p>已有账号？ <Link to="/login">登录</Link></p>
          </div>
        </div>
        <figure className="landing-coast">
          <img src={coast} alt="宁静的海面与绵延的山岸" />
          <figcaption><span>一些平常，却想记住的瞬间。</span><span aria-hidden="true">01 — 日常</span></figcaption>
        </figure>
        <p className="landing-annotation" aria-hidden="true">Write a softer<br /><span>tomorrow.</span></p>
      </section>
      <footer className="login-colophon"><span>一个凭邀请相聚的记录空间。</span><span>A LITTLE LIFE, IN WORDS.</span></footer>
    </main>
  );
}
