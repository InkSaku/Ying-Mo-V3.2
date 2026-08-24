import { NavLink } from "react-router-dom";

const items = [
  ["/me", "概览", true],
  ["/me/posts", "我的内容"],
  ["/me/collections", "我的 Collection"],
  ["/me/favorites", "收藏"],
  ["/me/comments", "我的评论"],
  ["/me/notifications", "通知"],
  ["/year-in-review", "年度回顾"],
  ["/me/media", "我的媒体"],
  ["/me/data", "数据导出"],
  ["/me/settings", "个人资料"],
  ["/me/sessions", "登录会话"],
];

export function PersonalNav() {
  return (
    <nav className="personal-nav" aria-label="个人中心">
      {items.map(([to, label, end]) => (
        <NavLink key={to} to={to} end={Boolean(end)} className={({ isActive }) => isActive ? "active" : ""}>
          {label}
        </NavLink>
      ))}
    </nav>
  );
}
