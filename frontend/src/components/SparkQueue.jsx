import { SparkIcon } from "./SparkIcon";
import { sparkJobDuration, sparkJobPhase, sparkKindLabels, sparkTime } from "../lib/spark";

const statusIcons = {
  queued: "clock", scheduled: "clock", running: "flame", succeeded: "check",
  failed: "alert", partial: "alert", unknown: "alert", expired: "alert", blocked: "alert",
  offline: "server", stopping: "pause", cancelled: "stopped", skipped: "arrow",
};

export function SparkRunBadge({ phase }) {
  return <span className={`spark-run-status is-${phase.key}`} key={phase.key}>
    <span className="spark-status-motion" aria-hidden="true">
      <SparkIcon name={statusIcons[phase.key] || "alert"} className={phase.key === "running" ? "spark-moving-flame" : phase.key === "succeeded" ? "spark-finished-check" : ""} />
    </span>{phase.label}
  </span>;
}

export function SparkQueue({ data, now, busy, onCancel }) {
  const jobs = data.jobs.filter((job) => ["queued", "running"].includes(job.status)).sort((a, b) =>
    Number(b.status === "running") - Number(a.status === "running") || new Date(a.scheduled_at) - new Date(b.scheduled_at));
  const online = data.worker.online;
  const running = jobs.find((job) => job.status === "running");
  const ready = jobs.filter((job) => job.status === "queued" && new Date(job.scheduled_at).getTime() <= now);
  if (!jobs.length) return null;
  const headline = !online ? "等待后台同步任务状态" : running ? "任务执行中" : ready.length ? "等待执行" : "时间已安排，到点后入队";
  const explanation = !online ? "后台暂未连接，任务状态会在恢复后同步。"
    : running ? "后台正在处理你的任务，结果会自动更新。"
    : ready.length ? data.queue?.busy ? "前序任务正在执行，结束后后台会继续处理队列。无需重复提交。" : "任务已提交，正在等待后台接手。无需重复提交。"
      : "定时任务到点后才进入执行队列，现在还没有开始执行。";

  return <section id="spark-queue" className={`spark-queue-panel${running && online ? " is-running" : ""}`} aria-labelledby="spark-queue-heading">
    <div className="spark-queue-intro">
      <div><p className="hero-kicker">任务队列 · 依次执行</p><h2 id="spark-queue-heading">{headline}</h2><p className="spark-queue-explanation" aria-live="polite">{explanation}</p>
        {online && ready.length && data.queue?.ready_count > 1 ? <small>后台共有 {data.queue.ready_count} 项就绪任务，按调度顺序逐项处理。</small> : null}
      </div>
    </div>
    <div className="spark-queue-items">{jobs.map((job) => {
      const phase = sparkJobPhase(job, online, now);
      const active = job.status === "running";
      const isTimed = phase.key === "scheduled";
      return <div className={`spark-queue-item is-${phase.key}`} key={job.id}>
        <div className="spark-queue-item-heading"><strong>{sparkKindLabels[job.kind]}{job.source === "retry" ? " · 失败补发" : ""}</strong><SparkRunBadge phase={phase} /></div>
        {isTimed ? <p className="spark-queue-timing">{sparkTime(job.scheduled_at)} 到点后入队 · 北京时间</p>
          : <><ol className="spark-queue-stages" aria-label="任务执行阶段"><li className="is-done"><i />已加入队列</li><li className={active ? "is-done" : "is-current"}><i />{active ? "已轮到你" : "等待执行"}</li><li className={active ? "is-current" : ""}><i />开始执行</li></ol>
            {active && job.result.progress ? <div className="spark-queue-progress"><span>已检查 {job.result.progress.completed}/{job.result.progress.total} 位{online && job.result.progress.current_name ? ` · 正在检查 ${job.result.progress.current_name}` : ""}</span><progress className="spark-progress" value={job.result.progress.completed} max={job.result.progress.total || 1} aria-label="队列中的模拟检查进度" /></div> : null}
          </>}
        <div className="spark-queue-item-footer"><span aria-live="off">{isTimed ? "尚未开始" : !online ? "状态等待同步" : `${active ? "已执行" : "已等待"} ${sparkJobDuration(job, now)}`}</span><button className="text-button danger-text" disabled={Boolean(busy) || job.cancel_requested} onClick={() => onCancel(job)}>{job.cancel_requested ? "正在停止" : active ? "停止当前任务" : isTimed ? "取消这次安排" : "退出排队"}</button></div>
      </div>;
    })}</div>
  </section>;
}
