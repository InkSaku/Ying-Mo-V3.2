export const sparkStatusLabels = {
  unbound: "尚未绑定", unverified: "已导入，待验证", ready: "登录正常", expired: "需要重新登录",
  blocked: "需要平台验证", error: "登录态无法使用", queued: "排队中", running: "正在执行",
  succeeded: "已完成", partial: "部分完成", failed: "未完成", unknown: "结果待确认",
  cancelled: "已停止", skipped: "已跳过", sending: "正在发送",
};
export const sparkKindLabels = { send: "续火花", dry_run: "模拟运行", sync: "同步联系人", harvest: "采集抖音号" };

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
