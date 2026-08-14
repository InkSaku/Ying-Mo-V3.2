import { Link, NavLink } from "react-router-dom";
import { ThemeControl } from "./ThemeControl";

function publicNavClass({ isActive }) {
  return `public-nav-link${isActive ? " active" : ""}`;
}

export function PublicHeader() {
  return (
    <header className="site-header">
      <div className="header-inner">
        <Link className="brand" to="/" aria-label="Ying-Mo 首页">
          映墨 <span>Ying-Mo</span>
        </Link>
        <nav className="public-nav" aria-label="公开导航">
          <NavLink className={publicNavClass} to="/about">关于</NavLink>
          <NavLink className={publicNavClass} to="/login">登录</NavLink>
          <NavLink
            className={({ isActive }) => `btn btn-primary btn-small public-register-link${isActive ? " active" : ""}`}
            to="/register"
          >
            注册
          </NavLink>
          <ThemeControl />
        </nav>
      </div>
    </header>
  );
}
