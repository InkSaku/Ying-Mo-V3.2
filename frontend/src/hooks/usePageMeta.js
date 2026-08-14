import { useEffect } from "react";

export function usePageMeta(title, { indexable = false } = {}) {
  useEffect(() => {
    document.title = title ? `${title} | Ying-Mo` : "Ying-Mo";
    let robots = document.querySelector('meta[name="robots"]');
    if (!robots) {
      robots = document.createElement("meta");
      robots.setAttribute("name", "robots");
      document.head.appendChild(robots);
    }
    robots.setAttribute("content", indexable ? "index,follow" : "noindex,nofollow");
  }, [title, indexable]);
}
