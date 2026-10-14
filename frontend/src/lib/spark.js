export const sparkStatusLabels = {
  unbound: "尚未绑定", unverified: "已导入，待验证", ready: "登录正常", expired: "需要重新登录",
  blocked: "需要平台验证", error: "登录态无法使用", queued: "等待执行", running: "正在执行",
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
