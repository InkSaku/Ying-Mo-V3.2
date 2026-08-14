import { Link, NavLink, Outlet, useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { ThemeControl } from "./ThemeControl";

const navItems = [
  ["/home", "首页"],
  ["/articles", "文章"],
  ["/notes", "随记"],
  ["/collections", "合集"],
  ["/categories", "分类"],
  ["/tags", "标签"],
  ["/archive", "归档"],
  ["/search", "搜索"],
];

function NavLinks({ onNavigate }) {
  return navItems.map(([to, label]) => (
    <NavLink key={to} to={to} onClick={onNavigate} className={({ isActive }) => isActive ? "active" : ""}>
      {label}
    </NavLink>
  ));
}

export function AppShell() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

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
            <NavLinks />
          </nav>

          <div className="header-actions desktop-actions">
            <Link className="btn btn-primary btn-small" to="/write">写作</Link>
            {user?.role === "system_admin" ? <Link className="user-link" to="/admin">管理</Link> : null}
            <Link className="user-link" to="/me">{user?.nickname || user?.username}</Link>
            <ThemeControl />
            <button className="text-button" type="button" onClick={handleLogout}>退出</button>
          </div>

          <details className="mobile-menu">
            <summary>菜单</summary>
            <div className="mobile-menu-panel">
              <nav aria-label="移动端成员导航">
                <NavLinks onNavigate={(event) => event.currentTarget.closest("details")?.removeAttribute("open")} />
                <Link to="/write">写作</Link>
                <Link to="/me">我的空间</Link>
                {user?.role === "system_admin" ? <Link to="/admin">管理</Link> : null}
              </nav>
              <div className="mobile-menu-foot">
                <ThemeControl />
                <button className="text-button" type="button" onClick={handleLogout}>退出登录</button>
              </div>
            </div>
          </details>
        </div>
      </header>

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
