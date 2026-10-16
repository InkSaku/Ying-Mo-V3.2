import { InkSketch } from "../components/InkSketch";
import { Link } from "react-router-dom";
import { usePageMeta } from "../hooks/usePageMeta";

export function NotFoundPage() {
  usePageMeta("找不到这个页面");
  return (
    <main className="page-shell narrow-page">
      <div className="empty-state ink-not-found">
        <InkSketch variant="wanderer" />
        <h1>找不到这个页面</h1>
        <p>地址可能有误，或你暂时无法访问。</p>
        <Link className="btn btn-primary" to="/">返回首页</Link>
      </div>
    </main>
  );
}
