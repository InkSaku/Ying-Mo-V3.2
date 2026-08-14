import { Link, NavLink } from "react-router-dom";
import { ThemeControl } from "./ThemeControl";

export function PublicHeader() {
  return (
    <header className="site-header">
      <div className="header-inner">
        <Link className="brand" to="/" aria-label="Ying-Mo 首页">
          映墨 <span>Ying-Mo</span>
        </Link>
        <nav className="public-nav" aria-label="公开导航">
          <NavLink to="/about">关于</NavLink>
          <NavLink to="/login">登录</NavLink>
          <Link className="btn btn-primary btn-small" to="/register">注册</Link>
          <ThemeControl />
        </nav>
      </div>
    </header>
  );
}
