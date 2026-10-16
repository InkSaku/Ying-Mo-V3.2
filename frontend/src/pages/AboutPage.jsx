import { InkSketch } from "../components/InkSketch";
import { Link } from "react-router-dom";
import { PublicHeader } from "../components/PublicHeader";
import { usePageMeta } from "../hooks/usePageMeta";

export function AboutPage() {
  usePageMeta("关于", { indexable: true });
  return (
    <>
      <PublicHeader />
      <main className="public-main narrow-page">
        <article className="about-article">
          <p className="hero-kicker"></p>
          <h1>关于映墨</h1>
          <InkSketch variant="volumes" className="ink-about-art" />
          <p className="lede">映墨是受邀朋友共同记录生活的地方。</p>
          <h2>为什么存在</h2>
          <p>想把写过的文字、拍过的照片和共同经历长久留下。</p>
          <h2>记录什么</h2>
          <p>技术文章、学习笔记、随笔、摄影、旅行、校园、成长经历和共同回忆，都可以成为映墨中的内容。</p>
          <h2>谁能进入</h2>
          <p>使用朋友给你的邀请码注册，登录后阅读向你开放的内容，以及你创建或加入的合集。</p>
          <div className="about-actions">
            <Link className="btn btn-primary" to="/register">注册</Link>
            <Link className="btn btn-secondary" to="/login">登录</Link>
          </div>
        </article>
      </main>
    </>
  );
}
