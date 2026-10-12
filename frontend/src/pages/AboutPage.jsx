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
          <p className="hero-kicker">About Ying-Mo</p>
          <h1>关于映墨</h1>
          <InkSketch variant="volumes" className="ink-about-art" />
          <p className="lede">映墨是一个由站长和现实朋友共同使用的多人博客与生活记录空间。</p>
          <h2>为什么存在</h2>
          <p>它不以流量、排行和陌生人分发为目标。这里更像一本可以长期写下去，也可以和朋友共同补充的生活档案。</p>
          <h2>记录什么</h2>
          <p>技术文章、学习笔记、随笔、摄影、旅行、校园、成长经历和共同回忆，都可以成为映墨中的内容。</p>
          <h2>谁能进入</h2>
          <p>成员通过统一邀请码注册。登录之后，你可以阅读向你开放的记录，以及你参与的共同合集。</p>
          <div className="about-actions">
            <Link className="btn btn-primary" to="/register">注册</Link>
            <Link className="btn btn-secondary" to="/login">登录</Link>
          </div>
        </article>
      </main>
    </>
  );
}
