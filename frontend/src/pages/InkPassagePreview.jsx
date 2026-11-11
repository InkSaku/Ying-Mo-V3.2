import { useEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { WelcomeSheet } from "./LandingPage";
import { LoginPage } from "./LoginPage";
import { ArticleInkEnding } from "../components/ArticleInkEnding";
import { cancelInkPassage, playWelcomeInk } from "../lib/inkPassage";
import "../styles/login.css";
import "../styles/landing.css";
import "../styles/ink-passage.css";

// Development replay: the welcome sheet and the article ending, without signing out.
export function InkPassagePreview() {
  const [scene, setScene] = useState("welcome");
  const [round, setRound] = useState(0);
  const paperRef = useRef(null);
  useEffect(() => cancelInkPassage, []);

  const enter = (event) => {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    if (!playWelcomeInk(paperRef.current, () => flushSync(() => setScene("login")))) setScene("login");
  };

  return <>
    <div className="ink-preview-controls">
      <button type="button" onClick={() => { cancelInkPassage(); setScene("welcome"); window.scrollTo({ top: 0, behavior: "instant" }); }}>回到欢迎页</button>
      <button type="button" onClick={() => { cancelInkPassage(); setScene("ending"); setRound((value) => value + 1); }}>文章读完</button>
    </div>
    {scene === "welcome" ? <WelcomeSheet paperRef={paperRef} onEnter={enter} /> : null}
    {scene === "login" ? <LoginPage /> : null}
    {scene === "ending" ? <main className="page-shell reading-page ink-preview-ending">
      <p>向下滚动到文末，标题会化成墨点，再聚成读书的墨团。</p>
      <div style={{ height: "110vh" }} />
      <ArticleInkEnding key={round} title="春天最后一场雨落下来的那个下午" />
      <div style={{ height: "40vh" }} />
    </main> : null}
  </>;
}
