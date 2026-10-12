// A scene belongs to a task, so related pages share the same visual vocabulary.
export function inkSceneForPath(pathname) {
  const path = String(pathname || "/");
  if (path.startsWith("/admin/media")) return "camera";
  if (path.startsWith("/admin/settings")) return "garden";
  if (path.startsWith("/admin")) return "steward";
  if (/^\/(?:forgot-password|reset-password|verify-email)/.test(path)) return "garden";
  if (path.startsWith("/me/sessions")) return "keys";
  if (path.startsWith("/me/settings")) return "garden";
  if (path.startsWith("/me/notifications")) return "inbox";
  if (path.startsWith("/me/comments")) return "letter";
  if (path.startsWith("/me/data")) return "packed";
  if (/^\/me\/posts\/[^/]+\/revisions(?:\/|$)/.test(path)) return "rewind";
  if (/^\/(?:me\/media)/.test(path)) return "camera";
  if (/^\/(?:me\/(?:posts|data)|archive)/.test(path)) return "archive";
  if (/^\/(?:me\/collections|collections)/.test(path)) return "volumes";
  if (/^\/(?:year-in-review|on-this-day)/.test(path)) return "memory";
  if (/^\/(?:search|tags|categories)/.test(path)) return "search";
  if (path === "/me" || /^\/(?:home|write)/.test(path)) return "writer";
  if (/^\/(?:articles|me\/favorites)/.test(path)) return "reader";
  if (path.startsWith("/notes")) return "letter";
  if (path.startsWith("/explore")) return "wanderer";
  return "welcome";
}
