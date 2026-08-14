export function PageLoader({ label = "正在读取内容" }) {
  return (
    <main className="page-shell" aria-busy="true" aria-live="polite">
      <div className="skeleton-stack" role="status">
        <span className="sr-only">{label}</span>
        <div className="skeleton-line skeleton-line-short" />
        <div className="skeleton-line skeleton-line-title" />
        <div className="skeleton-block" />
      </div>
    </main>
  );
}

export function EmptyState({ title = "这里还没有内容", description, action }) {
  return (
    <div className="empty-state">
      <h3>{title}</h3>
      {description ? <p>{description}</p> : null}
      {action ? <div className="empty-action">{action}</div> : null}
    </div>
  );
}

export function ErrorState({ error, onRetry }) {
  const message = error?.message || "内容加载失败，请稍后重试。";
  const diagnostic = import.meta.env.DEV && (error?.status || error?.code)
    ? [error.status ? `HTTP ${error.status}` : null, error.code].filter(Boolean).join(" · ")
    : "";
  return (
    <div className="error-state" role="alert">
      <h3>没有成功读取内容</h3>
      <p>{message}</p>
      {diagnostic ? <p className="meta-text">{diagnostic}</p> : null}
      {error?.requestId ? <p className="meta-text">Request ID: {error.requestId}</p> : null}
      {onRetry ? (
        <button className="btn btn-secondary" type="button" onClick={onRetry}>
          重新加载
        </button>
      ) : null}
    </div>
  );
}
