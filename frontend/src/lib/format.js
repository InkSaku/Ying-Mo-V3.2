export function formatDate(value, withTime = false) {
  if (!value) return "时间未记录";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "时间未记录";
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "short",
    day: "numeric",
    ...(withTime ? { hour: "2-digit", minute: "2-digit" } : {}),
  }).format(date);
}

export function postHref(post) {
  if (!post) return "#";
  return post.post_type === "article" && post.slug
    ? `/articles/${post.slug}`
    : `/notes/${post.id}`;
}

export function postTypeLabel(type) {
  return type === "article" ? "文章" : "随记";
}

export function visibilityLabel(value) {
  return value === "login_only" ? "成员可见" : "仅自己";
}

export function excerpt(post) {
  const raw = post?.summary || post?.body || "";
  const compact = String(raw).replace(/[#>*_`\[\]()]/g, " ").replace(/\s+/g, " ").trim();
  return compact.length > 120 ? `${compact.slice(0, 120)}...` : compact;
}
