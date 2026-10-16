import { NavLink } from "react-router-dom";

export function TaxonomyNav() {
  return (
    <nav className="taxonomy-nav" aria-label="分类与标签">
      <NavLink to="/categories" className={({ isActive }) => isActive ? "active" : ""}>
        分类
      </NavLink>
      <NavLink to="/tags" className={({ isActive }) => isActive ? "active" : ""}>
        标签
      </NavLink>
    </nav>
  );
}
