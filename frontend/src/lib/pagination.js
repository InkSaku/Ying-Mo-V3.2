export function clampPageToTotal(page, total, pageSize) {
  const totalPages = total > 0 ? Math.ceil(total / pageSize) : 1;
  return Math.max(1, Math.min(page, totalPages));
}

export function pageAfterRemovingItem({ page, total, pageSize }) {
  return clampPageToTotal(page, Math.max(0, total - 1), pageSize);
}
