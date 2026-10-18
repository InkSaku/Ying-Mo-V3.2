import { Link } from "react-router-dom";
import { InkBrandMark } from "../components/InkBrandMark";
import { ThemeControl } from "../components/ThemeControl";
import { useTheme } from "../contexts/ThemeContext";
import { usePageMeta } from "../hooks/usePageMeta";
import trainPhoto from "../assets/home/train.jpg";
import "../styles/theme-ink-preview.css";

export function ThemeInkPreview() {
  usePageMeta("纸墨换色预览");
  const { resolved, setMode } = useTheme();
  const changePaper = (event) => {
    const box = event.currentTarget.getBoundingClientRect();
    setMode(resolved === "dark" ? "light" : "dark", { origin: { x: box.x + box.width / 2, y: box.y + box.height / 2 } });
  };

  return <div className="theme-ink-preview">
    <header className="ink-preview-header">
      <Link to="/" className="ink-preview-brand"><InkBrandMark />映墨</Link>
      <div><Link to="/about">关于映墨</Link><ThemeControl /></div>
    </header>
    <main className="ink-preview-main">
      <section className="ink-preview-copy" aria-labelledby="ink-preview-title">
        <h1 id="ink-preview-title">换一页光线。</h1>
        <p>白日读字，夜里留墨。<br />同一页日常，也有不同的明暗。</p>
        <button type="button" className="ink-preview-switch" onClick={changePaper}>{resolved === "dark" ? "换成浅色纸" : "换成深色纸"}
          <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M4 12h16m-6-6 6 6-6 6" /></svg>
        </button>
        <p className="ink-preview-hint">从按钮处晕开，试着来回切换。</p>
      </section>
      <figure className="ink-preview-photo"><img src={trainPhoto} alt="途中留下的一张照片" /><figcaption>纸墨换色，照片仍是原来的色彩。</figcaption></figure>
      <section className="ink-preview-note">
        <label htmlFor="ink-preview-note">随手写一点</label>
        <textarea id="ink-preview-note" rows={3} defaultValue="把今天的一点小事，留在这一页。" />
        <p>切换纸色，写到一半的文字也在。</p>
      </section>
    </main>
    <footer className="ink-preview-footer"><span>映墨 · 纸与墨的明暗</span><span>主题动效预览 · 可重复切换</span></footer>
  </div>;
}
