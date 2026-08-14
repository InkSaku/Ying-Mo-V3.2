export function Pagination({ page, totalPages, onChange, disabled = false }) {
  if (!totalPages || totalPages <= 1) return null;
  return (
    <nav className="pagination" aria-label="分页">
      <button className="btn btn-secondary" type="button" disabled={disabled || page <= 1} onClick={() => onChange(page - 1)}>
        上一页
      </button>
      <span className="tabular">第 {page} / {totalPages} 页</span>
      <button className="btn btn-secondary" type="button" disabled={disabled || page >= totalPages} onClick={() => onChange(page + 1)}>
        下一页
      </button>
    </nav>
  );
}
