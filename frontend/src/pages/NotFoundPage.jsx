import { Link } from "react-router-dom";
import { usePageMeta } from "../hooks/usePageMeta";

export function NotFoundPage() {
  usePageMeta("页面不存在");
  return (
    <main className="page-shell narrow-page">
      <div className="empty-state">
        <h1>页面不存在</h1>
        <p>这个地址没有对应页面，或者内容已经不再对你开放。</p>
        <Link className="btn btn-primary" to="/">返回映墨</Link>
      </div>
    </main>
  );
}
