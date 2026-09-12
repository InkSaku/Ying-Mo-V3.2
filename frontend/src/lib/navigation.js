export const desktopPrimaryNavItems = [
  { to: "/home", label: "首页" },
  { to: "/explore", label: "漫游" },
  { to: "/collections", label: "合集" },
];

export const discoveryNavItems = [
  { to: "/articles", label: "文章", description: "阅读完整文章" },
  { to: "/notes", label: "随记", description: "浏览短篇记录" },
  { to: "/categories", label: "分类", description: "按主题查找" },
  { to: "/tags", label: "标签", description: "沿关键词漫游" },
  { to: "/archive", label: "归档", description: "按时间回看" },
  { to: "/search", label: "搜索", description: "查找具体内容" },
];

export const mobilePrimaryNavItems = [
  { to: "/home", label: "首页", icon: "home" },
  { to: "/explore", label: "发现", icon: "discover" },
  { to: "/write", label: "写作", icon: "write" },
  { to: "/me", label: "我的", icon: "profile" },
];

export function pathMatches(pathname, target) {
  return pathname === target || pathname.startsWith(`${target}/`);
}

export function pathMatchesAny(pathname, targets) {
  return targets.some((target) => pathMatches(pathname, target));
}

export const discoveryPaths = discoveryNavItems.map((item) => item.to);
export const personalPaths = ["/me", "/year-in-review", "/on-this-day"];
