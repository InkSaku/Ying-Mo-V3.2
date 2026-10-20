import { useEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { Link, useSearchParams } from "react-router-dom";
import { WelcomeSheet } from "./LandingPage";
import { InkBrandMark } from "../components/InkBrandMark";
import { LoginCompanion } from "../components/LoginCompanion";
import { HomeInkLandscape } from "../components/HomeSketches";
import { cancelLoginPageTurn, playLoginPageTurn, prepareLoginPageTurn } from "../lib/loginPageTurn";
import { cancelPageTear, playPageTear } from "../lib/pageTear";
import "../styles/login.css";
import "../styles/home.css";
import "../styles/home-editorial.css";
import "../styles/login-turn-preview.css";

export function LoginTurnPreview() {
  const [params] = useSearchParams();
  const welcome = params.get("from") === "welcome";
  const tear = !welcome && params.get("motion") !== "turn";
  const [scene, setScene] = useState("login");
  const [playing, setPlaying] = useState(false);
  const paperRef = useRef(null);
  useEffect(() => () => { cancelLoginPageTurn(); cancelPageTear(); }, []);

  const replay = () => {
    if (playing) return;
    flushSync(() => { setScene("login"); setPlaying(true); });
    window.scrollTo({ top: 0, behavior: "instant" });
    const snapshot = prepareLoginPageTurn(paperRef.current);
    const play = tear ? playPageTear : playLoginPageTurn;
    void play(snapshot, () => {
      flushSync(() => setScene("home"));
    }, welcome ? { duration: 550, leadIn: 0 } : undefined).then(() => setPlaying(false));
  };

  return <>
    {scene === "login" && welcome ? <WelcomeSheet paperRef={paperRef} /> : scene === "login" ? <main ref={paperRef} className="login-paper">
      <header className="login-masthead">
        <Link to="/login" className="login-wordmark"><InkBrandMark />映墨 <span>YING MO</span></Link>
        <span className="login-edition">文字与日常 · 私人留存</span>
      </header>
      <div className="login-spread">
        <section className="login-story">
          <div className="login-story-copy">
            <p className="login-ink">墨</p>
            <p className="login-manifesto">记录生活，<br />也保留此刻的自己。</p>
            <p className="login-english"><br /></p>
          </div>
          <figure className="login-landscape"><div className="login-landscape-art">
            <LoginCompanion className="ink-entry-art" trackPointer={false} />
          </div></figure>
        </section>
        <section className="login-entry">
          <div className="login-form">
            <header className="login-intro"><p className="login-overline"></p><h1>好久不见。</h1><p></p></header>
            <div className="login-field"><span>用户名或邮箱</span><div className="login-turn-field">演示账号</div></div>
            <div className="login-field"><span>密码</span><div className="login-turn-field">••••••••</div></div>
            <button type="button" className="login-submit" onClick={replay}><span>{tear ? "撕开这一页" : "翻回这一页"}</span><span aria-hidden="true">⟶</span></button>
            <p className="login-join">仅演示转场，不进行登录。</p>
          </div>
        </section>
      </div>
      <footer className="login-colophon"><span>映墨 · 留给生活的一页</span></footer>
    </main> : <div className="login-turn-preview-home">
      <header className="login-turn-preview-header">
        <Link to="/login" className="login-wordmark"><InkBrandMark />映墨 <span>YING MO</span></Link>
        <span>首页 · 漫游 · 合集</span>
      </header>
      <main className="page-shell home-page home-journal home-editorial">
        <section className="home-edition-heading">
          <div className="home-edition-copy">
            <p className="home-edition-eyebrow">映墨 · 生活继续</p>
            <h1>朋友的<br /><span>近况</span></h1>
            <p className="home-edition-note">阅读朋友最近发布的文章与随记。</p>
          </div>
          <article className="home-opening-feature is-illustrated">
            <div className="home-opening-feature-visual"><HomeInkLandscape /></div>
            <div className="home-opening-feature-meta"><span>演示画面</span><span>没有真实成员内容</span></div>
            <h2>把日常，留在这一页。</h2>
            <p className="home-opening-feature-footer">翻开以后，生活接着往下写。</p>
          </article>
        </section>
      </main>
    </div>}
    <aside className="login-preview-controls" aria-label="转场预览控制">
      <p>{welcome ? "翻开封面" : tear ? "撕开这一页" : "翻回这一页"} <span>{welcome ? "约 0.55 秒" : tear ? "约 1.9 秒" : "约 0.82 秒"} · 开发预览</span></p>
      <button type="button" onClick={replay} disabled={playing}>{playing ? "翻页中…" : scene === "home" ? "再看一次" : tear ? "播放撕纸" : "播放翻页"}</button>
      <Link to={welcome ? "/dev/login-page-turn" : "/dev/login-page-turn?from=welcome"}>{welcome ? "看登录翻页" : "看欢迎翻页"}</Link>
      {!welcome ? <Link to={tear ? "/dev/login-page-turn?motion=turn" : "/dev/login-page-turn"}>{tear ? "对照原翻页" : "看撕纸转场"}</Link> : null}
      <Link to={welcome ? "/" : "/login"}>{welcome ? "返回欢迎页" : "返回登录"}</Link>
    </aside>
  </>;
}
