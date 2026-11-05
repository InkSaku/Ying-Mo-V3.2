export function markNotificationReadForNavigation(apiClient, notificationId, onChanged) {
  return apiClient.post(`/notifications/${notificationId}/read`, {})
    .then(() => {
      onChanged?.();
      return true;
    })
    .catch(() => false);
}

function postNoun(targetUrl) {
  if (targetUrl?.startsWith("/articles/")) return "文章";
  if (targetUrl?.startsWith("/notes/")) return "随记";
  return "内容";
}

// Older rows store the internal terms in their message text.
function plainMessage(message = "") {
  return message.replace(/\s*Collection\s*/g, "合集").replace(/\s*Post\s*/g, "内容");
}

// A named sentence is only built while the target is still readable; otherwise
// the server's neutral wording stands.
export function notificationSentence(item) {
  const actor = item.actor?.nickname || item.actor?.username;
  if (actor && item.target_url) {
    const verb = {
      post_comment: `评论了你的${postNoun(item.target_url)}`,
      comment_reply: "回复了你的评论",
      comment_mention: "在评论中提到了你",
      memory_contribution_added: "补充了你们的共同回忆",
    }[item.kind];
    if (verb) return { actor, text: verb, summary: item.summary };
  }
  if (item.kind === "spark_send_result") {
    const [headline, ...rest] = (item.message || "").split("。");
    return { actor: null, text: headline, summary: rest.join("。").trim() || item.summary };
  }
  return { actor: null, text: item.kind === "system" ? item.message : plainMessage(item.message), summary: item.summary };
}

function dayStart(value) {
  return new Date(value.getFullYear(), value.getMonth(), value.getDate()).getTime();
}

function dayLabel(date, now) {
  const days = Math.round((dayStart(now) - dayStart(date)) / 86400000);
  if (days === 0) return "今天";
  if (days === 1) return "昨天";
  return new Intl.DateTimeFormat("zh-CN", {
    ...(date.getFullYear() === now.getFullYear() ? {} : { year: "numeric" }),
    month: "long",
    day: "numeric",
  }).format(date);
}

export function groupNotificationsByDay(items, now = new Date()) {
  const groups = [];
  items.forEach((item) => {
    const date = new Date(item.created_at);
    const key = Number.isNaN(date.getTime()) ? "unknown" : String(dayStart(date));
    if (groups.at(-1)?.key !== key) {
      groups.push({ key, label: key === "unknown" ? "时间未记录" : dayLabel(date, now), items: [] });
    }
    groups.at(-1).items.push(item);
  });
  return groups;
}

export function notificationClock(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("zh-CN", { hour: "2-digit", minute: "2-digit" }).format(date);
}
