export const sparkStatusLabels = {
  unbound: "尚未绑定", unverified: "已连接，待同步", ready: "登录正常", expired: "需要重新登录",
  blocked: "需要平台验证", error: "登录态无法使用", queued: "排队中", running: "正在执行",
  succeeded: "已完成", partial: "部分完成", failed: "未完成", unknown: "结果待确认",
  cancelled: "已停止", skipped: "已跳过", sending: "正在发送",
};
export const sparkKindLabels = { send: "续火花", dry_run: "模拟运行", sync: "同步联系人", harvest: "采集抖音号" };

// Recovery is based on structured states, including records created before
// error_code existed. Never ask a member to diagnose the server or replay a send.
export function sparkJobRecovery(job) {
  if (!["failed", "partial", "unknown", "expired", "blocked"].includes(job.status)) return null;
  const reason = job.result?.message?.trim();
  const uncertain = job.status === "unknown" || job.result?.events?.some((event) => event.status === "unknown");
  if (uncertain) return {
    title: "有消息的发送结果还不能确认",
    message: "请先在手机抖音的私信中核对聊天记录。助手不会自动重发结果待确认的消息。",
    hint: ["expired", "blocked"].includes(job.status) ? "核对后，请到“连接抖音”处理登录或验证提示。" : "请按下方好友名单逐一核对，避免重复发送。",
    target: ["expired", "blocked"].includes(job.status) ? "#spark-step-1" : null,
    label: "去处理抖音连接",
  };
  if (job.result?.error_code === "CREDENTIAL_UNREADABLE" || job.result?.message?.includes("登录态无法解密")) return {
    title: "无法读取已保存的抖音登录信息",
    message: "请重新扫码连接抖音，再同步联系人。如果仍然失败，请联系网站管理员并提供这条记录的时间。",
    target: "#spark-step-1", label: "去重新扫码连接",
  };
  if (job.status === "expired") return {
    title: "抖音私信页要求重新登录",
    message: reason || "抖音私信页仍要求登录，已保存的登录信息未生效或已过期。",
    hint: job.kind === "send" ? "若已开始发送，请先在手机抖音核对聊天记录；已发送或结果待确认的消息不会重复发送。" : "请重新扫码连接，完成官方页面提示后，再同步联系人。手机收到登录成功通知后，仍需等待本页确认连接结果。",
    target: "#spark-step-1", label: "去重新扫码连接",
  };
  if (job.status === "blocked") return {
    title: "抖音要求验证或限制了本次操作",
    message: reason || "抖音要求安全验证或提示操作频繁。",
    hint: job.kind === "send" ? "若已开始发送，请先在手机抖音核对聊天记录；已发送或结果待确认的消息不会重复发送。" : "请重新扫码，并按映墨中显示的抖音官方页面完成验证。若提示操作受限，请稍后再试。",
    target: "#spark-step-1", label: "去处理抖音连接",
  };
  if (job.kind === "send") return {
    title: job.status === "partial" ? "部分好友的消息没有发送成功" : "这次发送未完成",
    message: "请查看下方每位好友的结果，并在手机抖音核对聊天记录。已发送或结果待确认的消息不会重复发送。",
    hint: "如有补发安排，可在任务队列查看；多次失败时，请联系网站管理员并提供这条记录的时间。",
    target: "#spark-step-4", label: "查看发送条件",
  };
  const operation = { sync: "联系人同步", harvest: "抖音号采集", dry_run: "模拟检查" }[job.kind];
  if (!operation) return null;
  const interruptedMessage = job.result?.message || "";
  const hint = {
    BROWSER_START_FAILED: "请联系网站管理员检查续火花后台，并提供下方记录编号；无需反复扫码。",
    BROWSER_INTERRUPTED: "可以重试本次操作。如果再次中断，请联系网站管理员并提供下方记录编号。",
    PLATFORM_NETWORK_ERROR: "可以稍后重试，无需重新扫码。如果持续失败，请联系网站管理员检查后台到抖音的连接。",
    CHAT_PAGE_UNAVAILABLE: "可以稍后重试，无需重新扫码。如果持续失败，请联系网站管理员。",
    PAGE_TIMEOUT: "可以稍后重试，无需重新扫码。",
    CONTACTS_NOT_READY: "请先在抖音网页版确认已有私信会话，再重试同步。原有好友选择会保留。",
    RESULT_SAVE_FAILED: "请联系网站管理员并提供下方记录编号。",
  }[job.result?.error_code];
  return {
    title: `${operation}没有完成`,
    message: interruptedMessage.includes("执行超时") ? "这次操作等待时间过长，已停止。本次操作不会发送消息。"
      : interruptedMessage.includes("服务已重启") ? "续火花服务重新启动，这次操作已中断。本次操作不会发送消息。"
      : job.kind === "dry_run" && job.result?.events?.length
      ? "请查看下方未通过检查的好友，核对昵称和聊天是否可用，再重试检查。本次检查没有发送消息。"
      : reason || "这条旧记录没有保存具体失败原因。请重试后查看新的执行结果。本次操作不会发送消息。",
    hint: hint || "可以稍后重试。如果多次失败，请联系网站管理员并提供下方记录编号。",
    retryKind: job.kind, label: { sync: "重试同步联系人", harvest: "重试采集抖音号", dry_run: "重试模拟检查" }[job.kind],
  };
}

export function sparkTime(value) {
  if (!value) return "尚未安排";
  return new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false,
  }).format(new Date(value));
}

export function sparkMessages(value) {
  return value.split("\n").map((item) => item.trim()).filter(Boolean);
}

export function sparkJobPhase(job, online = true, now = Date.now()) {
  if (["queued", "running"].includes(job.status) && job.cancel_requested) return { key: "stopping", label: "正在停止" };
  if (job.status === "queued") {
    if (new Date(job.scheduled_at).getTime() > now) return { key: "scheduled", label: "定时等待" };
    return online ? { key: "queued", label: "排队中" } : { key: "offline", label: "等待服务恢复" };
  }
  if (job.status === "running" && !online) return { key: "offline", label: "状态待同步" };
  return { key: job.status, label: sparkStatusLabels[job.status] || job.status };
}

export function sparkDuration(start, now = Date.now()) {
  const time = new Date(start).getTime();
  if (!start || !Number.isFinite(time)) return "—";
  const seconds = Math.max(0, Math.floor((now - time) / 1000));
  const hours = Math.floor(seconds / 3600);
  return `${hours ? `${String(hours).padStart(2, "0")}:` : ""}${String(Math.floor(seconds / 60) % 60).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
}

export function sparkJobDuration(job, now = Date.now()) {
  if (job.status === "running") return sparkDuration(job.started_at, now);
  const created = new Date(job.created_at || job.scheduled_at).getTime();
  const scheduled = new Date(job.scheduled_at).getTime();
  const start = Math.max(created, scheduled);
  return Number.isFinite(start) ? sparkDuration(start, now) : "—";
}
