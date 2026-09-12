import { NavLink, useLocation } from "react-router-dom";

const personalNavGroups = [
  {
    label: "记录",
    items: [
      { to: "/me", label: "空间概览", end: true },
      { to: "/me/posts", label: "我的内容" },
      { to: "/me/collections", label: "共同书册" },
      { to: "/me/favorites", label: "收藏" },
      { to: "/me/comments", label: "我的评论" },
      { to: "/me/notifications", label: "通知" },
    ],
  },
  {
    label: "回看",
    items: [
      { to: "/on-this-day", label: "往年今日" },
      { to: "/year-in-review", label: "年度回顾" },
      { to: "/me/media", label: "影像资料" },
    ],
  },
  {
    label: "账户",
    items: [
      { to: "/me/settings", label: "个人资料" },
      { to: "/me/data", label: "数据导出" },
      { to: "/me/sessions", label: "登录会话" },
    ],
  },
];

const personalNavItems = personalNavGroups.flatMap((group) => group.items);

function PersonalLinks({ onNavigate }) {
  return personalNavGroups.map((group) => (
    <section key={group.label}>
      <p>{group.label}</p>
      {group.items.map(({ to, label, end }) => (
        <NavLink key={to} to={to} end={Boolean(end)} onClick={onNavigate} className={({ isActive }) => isActive ? "active" : ""}>
          {label}
        </NavLink>
      ))}
    </section>
  ));
}

export function PersonalNav() {
  const { pathname } = useLocation();
  const current = personalNavItems.find(({ to, end }) => end ? pathname === to : pathname === to || pathname.startsWith(`${to}/`));
  const closeMobileNav = (event) => event.currentTarget.closest("details")?.removeAttribute("open");

  return (
    <aside className="personal-navigation">
      <div className="personal-navigation-heading">
        <span>PERSONAL ARCHIVE</span>
        <strong>我的映墨</strong>
      </div>
      <nav className="personal-nav" aria-label="个人中心">
        <PersonalLinks />
      </nav>
      <details className="personal-nav-mobile" data-header-menu>
        <summary><span>个人中心</span><strong>{current?.label || "更多页面"}</strong><i aria-hidden="true">⌄</i></summary>
        <nav aria-label="个人中心移动导航">
          <PersonalLinks onNavigate={closeMobileNav} />
        </nav>
      </details>
    </aside>
  );
}
