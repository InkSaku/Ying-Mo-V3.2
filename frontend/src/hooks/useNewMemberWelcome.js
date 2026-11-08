import { useEffect, useState } from "react";
import { api } from "../lib/api";

const DISMISS_KEY = "yingmo:welcome-letter-dismissed";

function dismissKey(userId) {
  return `${DISMISS_KEY}:${userId}`;
}

function readDismissed(userId) {
  try {
    return window.localStorage.getItem(dismissKey(userId)) === "1";
  } catch {
    return false;
  }
}

// 新成员（还没有写过任何内容）在首页看到的“第一封信”。只读本人概览计数，不新增数据表；
// 写下第一则内容、或点“以后再说”后不再出现（后者按账号记在这台设备上）。
export function useNewMemberWelcome(user) {
  const [dismissed, setDismissed] = useState(() => (user?.id ? readDismissed(user.id) : true));
  const [counts, setCounts] = useState(null);

  useEffect(() => {
    setDismissed(user?.id ? readDismissed(user.id) : true);
    setCounts(null);
  }, [user?.id]);

  useEffect(() => {
    if (!user?.id || dismissed) return undefined;
    let active = true;
    api.get("/users/me/overview")
      .then((result) => { if (active) setCounts(result.data?.counts || null); })
      .catch(() => {});
    return () => { active = false; };
  }, [user?.id, dismissed]);

  // 仅开发环境：地址带 ?welcome-preview 时强制显示，便于在已有内容的账号上检查排版；正式构建不包含。
  const preview = import.meta.env.DEV && typeof window !== "undefined" && new URLSearchParams(window.location.search).has("welcome-preview");

  return {
    show: preview || (!dismissed && Boolean(counts) && counts.posts === 0),
    counts,
    dismiss: () => {
      try { window.localStorage.setItem(dismissKey(user.id), "1"); } catch { /* 隐私模式下只在本次会话收起 */ }
      setDismissed(true);
    },
    markWritten: () => setCounts((current) => (current ? { ...current, posts: (current.posts || 0) + 1 } : current)),
  };
}
