import { useEffect } from "react";
import { Link, NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { useUnreadNotifications } from "../hooks/useUnreadNotifications";
import {
  desktopPrimaryNavItems,
  discoveryNavItems,
  discoveryPaths,
  mobilePrimaryNavItems,
  pathMatches,
  pathMatchesAny,
  personalPaths,
} from "../lib/navigation";
import { unreadBadgeText } from "../lib/notificationCount";
import { ThemeControl } from "./ThemeControl";

function NavLinks({ items, onNavigate }) {
  return items.map(({ to, label }) => (
    <NavLink key={to} to={to} onClick={onNavigate} className={({ isActive }) => isActive ? "active" : ""}>
      {label}
    </NavLink>
  ));
}

function MobileNavIcon({ name }) {
  const paths = {
    home: <><path d="M3 10.5 12 3l9 7.5" /><path d="M5.5 9.5V21h13V9.5M9 21v-6h6v6" /></>,
    discover: <><circle cx="12" cy="12" r="8.5" /><path d="m15.5 8.5-2.1 4.9-4.9 2.1 2.1-4.9 4.9-2.1Z" /></>,
    write: <><path d="M4 20h4l11-11-4-4L4 16v4Z" /><path d="m13.5 6.5 4 4M4 20h16" /></>,
    profile: <><circle cx="12" cy="8" r="3.5" /><path d="M5.5 21v-2.5a6.5 6.5 0 0 1 13 0V21" /></>,
  };
  return <svg viewBox="0 0 24 24" aria-hidden="true">{paths[name]}</svg>;
}

function closeOwningMenu(event) {
  event.currentTarget.closest("details")?.removeAttribute("open");
}

export function AppShell() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const { unreadCount, toastDelta, dismissToast } = useUnreadNotifications(user?.id);
  const badgeText = unreadBadgeText(unreadCount);
  const notificationLabel = unreadCount ? `通知，${unreadCount} 条未读` : "通知";
  const discoveryActive = pathMatchesAny(location.pathname, discoveryPaths);
  const accountActive = pathMatchesAny(location.pathname, personalPaths);

  useEffect(() => {
    const closeMenus = (event) => {
      document.querySelectorAll("details[data-header-menu][open]").forEach((menu) => {
        if (!menu.contains(event.target)) menu.removeAttribute("open");
      });
    };
    const closeOnEscape = (event) => {
      if (event.key !== "Escape") return;
      const openMenus = [...document.querySelectorAll("details[data-header-menu][open]")];
      const lastMenu = openMenus.at(-1);
      if (!lastMenu) return;
      lastMenu.removeAttribute("open");
      lastMenu.querySelector("summary")?.focus();
    };
    document.addEventListener("pointerdown", closeMenus);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeMenus);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, []);

  const handleLogout = async () => {
    await logout();
    navigate("/");
  };

  return (
    <div className="app-frame">
      <header className="site-header app-header">
        <div className="header-inner">
          <Link className="brand" to="/home">
            映墨 <span>Ying-Mo</span>
          </Link>

          <nav className="desktop-nav" aria-label="成员导航">
            <NavLinks items={desktopPrimaryNavItems} />
            <details className={`header-menu discover-menu${discoveryActive ? " active" : ""}`} data-header-menu>
              <summary>查找 <span aria-hidden="true">⌄</span></summary>
              <div className="header-menu-panel discover-menu-panel">
                <p className="header-menu-eyebrow">FIND &amp; READ</p>
                <nav aria-label="查找内容">
                  {discoveryNavItems.map(({ to, label, description }) => (
                    <NavLink key={to} to={to} onClick={closeOwningMenu} className={({ isActive }) => isActive ? "active" : ""}>
                      <span>{label}</span>
                      <small>{description}</small>
                    </NavLink>
                  ))}
                </nav>
              </div>
            </details>
          </nav>

          <div className="header-actions desktop-actions">
            <Link className="btn btn-primary btn-small" to="/write">写作</Link>
            <Link className={`notification-link${unreadCount ? " has-unread" : ""}`} to="/me/notifications" aria-label={notificationLabel}>
              <span>通知</span>
              {badgeText ? <span className="notification-badge" aria-hidden="true">{badgeText}</span> : null}
            </Link>
            <details className={`header-menu account-menu${accountActive ? " active" : ""}`} data-header-menu>
              <summary>我的 <span aria-hidden="true">⌄</span></summary>
              <div className="header-menu-panel account-menu-panel">
                <div className="account-menu-identity">
                  <strong>{user?.nickname || user?.username}</strong>
                  <small>@{user?.username}</small>
                </div>
                <nav aria-label="个人空间">
                  <Link to="/me" onClick={closeOwningMenu}>我的空间</Link>
                  <Link to="/me/posts" onClick={closeOwningMenu}>我的内容</Link>
                  <Link to="/me/settings" onClick={closeOwningMenu}>设置与安全</Link>
                  {user?.role === "system_admin" ? <Link to="/admin" onClick={closeOwningMenu}>管理后台</Link> : null}
                </nav>
                <div className="header-menu-foot">
                  <ThemeControl />
                  <button className="text-button" type="button" onClick={handleLogout}>退出登录</button>
                </div>
              </div>
            </details>
          </div>

          <div className="mobile-header-actions">
            <Link className={`mobile-notification-button${unreadCount ? " has-unread" : ""}`} to="/me/notifications" aria-label={notificationLabel}>
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6.5 9a5.5 5.5 0 0 1 11 0c0 6 2.5 6 2.5 7.5H4c0-1.5 2.5-1.5 2.5-7.5Z" /><path d="M9.5 19a2.7 2.7 0 0 0 5 0" /></svg>
              {badgeText ? <span className="notification-badge" aria-hidden="true">{badgeText}</span> : null}
            </Link>
            <details className="mobile-menu" data-header-menu>
              <summary aria-label="更多导航">
                <span aria-hidden="true">•••</span>
              </summary>
              <div className="mobile-menu-panel">
                <p className="header-menu-eyebrow">BROWSE</p>
                <nav aria-label="更多导航">
                  {[...discoveryNavItems.slice(0, 2), { to: "/collections", label: "合集" }, ...discoveryNavItems.slice(2)].map(({ to, label }) => (
                    <NavLink key={to} to={to} onClick={closeOwningMenu} className={({ isActive }) => isActive ? "active" : ""}>{label}</NavLink>
                  ))}
                  <Link className="mobile-notification-link" to="/me/notifications" onClick={closeOwningMenu}>
                    <span>通知</span>
                    {badgeText ? <span className="notification-badge" aria-hidden="true">{badgeText}</span> : null}
                  </Link>
                  {user?.role === "system_admin" ? <Link to="/admin" onClick={closeOwningMenu}>管理后台</Link> : null}
                </nav>
                <div className="mobile-menu-foot">
                  <ThemeControl />
                  <button className="text-button" type="button" onClick={handleLogout}>退出登录</button>
                </div>
              </div>
            </details>
          </div>
        </div>
      </header>

      <nav className="mobile-bottom-nav" aria-label="移动端主要导航">
        {mobilePrimaryNavItems.map(({ to, label, icon }) => {
          const active = to === "/me" ? accountActive : pathMatches(location.pathname, to);
          return (
            <NavLink key={to} to={to} className={active ? "active" : ""} aria-current={active ? "page" : undefined}>
              <span className="mobile-bottom-icon">
                <MobileNavIcon name={icon} />
                {to === "/me" && badgeText ? <span className="mobile-bottom-badge" aria-hidden="true">{badgeText}</span> : null}
              </span>
              <span>{label}</span>
            </NavLink>
          );
        })}
      </nav>

      {toastDelta ? (
        <div className="notification-toast" role="status" aria-live="polite" aria-atomic="true">
          <span>你有 {toastDelta} 条新通知</span>
          <Link to="/me/notifications" onClick={dismissToast}>查看</Link>
          <button type="button" onClick={dismissToast} aria-label="关闭新通知提示">×</button>
        </div>
      ) : null}

      <Outlet />

      <footer className="site-footer">
        <div className="footer-inner">
          <p>写字，也和朋友一起记录生活。</p>
          <Link to="/about">关于映墨</Link>
        </div>
      </footer>
    </div>
  );
}
