import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "../lib/api";
import { usePageMeta } from "../hooks/usePageMeta";
import { PersonalNav } from "../components/PersonalNav";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { CustomSelect } from "../components/CustomSelect";
import { ErrorState, PageLoader } from "../components/States";
import { sparkKindLabels, sparkMessages, sparkStatusLabels, sparkTime } from "../lib/spark";
import "../styles/spark.css";

const numericFields = [
  ["jitter_minutes", "时间浮动（分钟）", 0, 120],
  ["send_gap_min", "好友间隔下限（秒）", 1, 300],
  ["send_gap_max", "好友间隔上限（秒）", 1, 300],
  ["max_friends_per_run", "每次最多好友数（0 为全部，上限 500）", 0, 500],
  ["first_message_daily_limit", "首条消息每日上限", 1, 10],
  ["creator_max_scrolls", "采集最多滚动次数", 1, 200],
];
const sourceLabels = { manual: "手动", daily: "每日计划", retry: "失败补发", weekly: "每周采集" };

export function SparkPage() {
  usePageMeta("续火花助手");
  const [data, setData] = useState(null);
  const [config, setConfig] = useState(null);
  const [messages, setMessages] = useState("");
  const [selection, setSelection] = useState({});
  const [search, setSearch] = useState("");
  const [newName, setNewName] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState("");
  const [confirm, setConfirm] = useState(null);
  const initialized = useRef(false);
  const contactsDirty = useRef(false);
  const selectionSequence = useRef([]);
  const requestPending = useRef(false);
  const fileInput = useRef(null);

  const acceptData = useCallback((value, reset = false) => {
    setData(value);
    if (!initialized.current || reset) {
      setConfig(value.config);
      setMessages(value.config.messages.join("\n"));
      initialized.current = true;
    }
    if (!contactsDirty.current || reset) {
      setSelection(Object.fromEntries(value.contacts.map((contact) => [contact.id, contact.selected])));
      selectionSequence.current = value.contacts.filter((contact) => contact.selected).map((contact) => contact.id);
      contactsDirty.current = false;
    }
  }, []);

  const load = useCallback(async () => {
    if (requestPending.current) return;
    requestPending.current = true;
    try {
      const response = await api.get("/spark");
      acceptData(response.data);
    } catch (loadError) {
      setError(loadError.message);
    } finally {
      requestPending.current = false;
    }
  }, [acceptData]);

  useEffect(() => {
    void load();
    const timer = window.setInterval(() => { if (!document.hidden) void load(); }, 5000);
    return () => window.clearInterval(timer);
  }, [load]);

  const action = async (name, operation, message) => {
    setBusy(name);
    setError("");
    setNotice("");
    try {
      await operation();
      setNotice(message);
      setConfirm(null);
    } catch (actionError) {
      setError(actionError.message);
      setConfirm(null);
    } finally {
      setBusy("");
    }
  };

  const queue = (kind) => action(kind, async () => {
    await api.post("/spark/jobs", { kind, request_id: crypto.randomUUID() });
    await load();
  }, `${sparkKindLabels[kind]}任务已加入，执行结果会显示在下方。`);

  const saveConfig = (event) => {
    event.preventDefault();
    void action("config", async () => {
      const response = await api.put("/spark/config", { ...config, messages: sparkMessages(messages) });
      acceptData(response.data);
      setConfig(response.data.config);
    }, "每日计划已保存，时间均按北京时间执行。");
  };

  const saveContacts = () => action("contacts", async () => {
    const response = await api.put("/spark/contacts", {
      entries: data.contacts.map((contact) => ({ id: contact.id, selected: Boolean(selection[contact.id]) }))
        .sort((left, right) => left.selected && right.selected
          ? selectionSequence.current.indexOf(left.id) - selectionSequence.current.indexOf(right.id)
          : Number(right.selected) - Number(left.selected)),
    });
    contactsDirty.current = false;
    acceptData(response.data);
  }, "好友选择已保存。");

  const importState = (event) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    void action("import", async () => {
      const body = new FormData();
      body.append("file", file);
      const response = await api.post("/spark/credentials", body);
      acceptData(response.data, true);
    }, "登录态已导入，请同步联系人验证登录。更换抖音账号后需重新选择好友。");
  };

  const downloadHelper = () => action("helper", async () => {
    const result = await api.blob("/spark/login-helper");
    const url = URL.createObjectURL(result.data);
    const link = document.createElement("a");
    link.href = url;
    link.download = "yingmo_extract_cookie.py";
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }, "扫码脚本已下载，按下方步骤在电脑上运行。");

  if (!data) return error
    ? <main className="page-shell narrow-page"><ErrorState error={{ message: error }} onRetry={load} /></main>
    : <PageLoader label="正在读取续火花助手" />;

  const activeJobs = data.jobs.filter((job) => ["queued", "running"].includes(job.status));
  const selectedCount = data.contacts.filter((contact) => selection[contact.id]).length;
  const visibleContacts = data.contacts.filter((contact) => `${contact.display_name} ${contact.nickname || ""} ${contact.short_id || ""}`.toLowerCase().includes(search.toLowerCase()));
  const canQueue = data.bound && !busy && !activeJobs.length;
  const canSend = canQueue && data.selected_count > 0 && !contactsDirty.current && !["expired", "blocked", "error"].includes(data.session_status);
  const changeConfig = (key, value) => setConfig((current) => ({ ...current, [key]: value }));

  return (
    <main className="page-shell personal-page-shell spark-page">
      <PersonalNav />
      <header className="spark-hero">
        <div>
          <p className="hero-kicker">映墨工具箱 · 01</p>
          <h1>留一点问候，<br />让火花继续。</h1>
          <p>选好朋友与消息，把每天的问候交给续火花助手。</p>
          <div className="spark-status-line"><span className={`spark-status-dot is-${data.session_status}`} />{sparkStatusLabels[data.session_status]}
            <span>·</span><span>{data.worker.online ? "后台服务在线" : "后台服务暂未连接"}</span></div>
        </div>
        <div className="spark-next-time">
          <svg viewBox="0 0 80 100" aria-hidden="true"><path d="M40 8c7 24-11 30-4 46 5-4 9-12 11-18 20 16 29 34 16 50-12 17-38 14-48-3C4 63 22 46 25 31c1 10 5 15 8 17C27 30 37 22 40 8Z" /><path d="M38 67c-8 9-10 21 1 25 13-2 16-13 5-23-1 5-4 7-6 9" /></svg>
          <span>下一次问候</span><strong>{data.next_run_at ? sparkTime(data.next_run_at) : "等你安排"}</strong><small>北京时间 · 已选择 {data.selected_count} 位好友</small>
        </div>
      </header>

      {error ? <div className="inline-error" role="alert">{error}</div> : null}
      {notice ? <div className="inline-success" role="status">{notice}</div> : null}
      {!data.worker.online ? <p className="spark-service-note">后台服务暂未连接。配置会保存，任务会等待服务恢复；不会显示为已发送。</p> : null}

      <section className="spark-section" aria-labelledby="spark-binding">
        <div className="spark-section-heading"><span>01</span><div><h2 id="spark-binding">连接你的抖音</h2><p>用电脑扫码获取登录态，然后导入这里。请妥善保管原文件。</p></div></div>
        <div className="spark-actions">
          <button className="btn btn-primary" disabled={Boolean(busy) || !data.credential_storage_ready} onClick={() => fileInput.current?.click()}>{data.bound ? "更新登录态" : "导入登录态"}</button>
          <input ref={fileInput} type="file" accept="application/json,.json" hidden onChange={importState} aria-label="登录态文件" />
          <button className="btn btn-secondary" disabled={Boolean(busy)} onClick={() => { void downloadHelper(); }}>下载扫码脚本</button>
          {data.bound ? <button className="text-button danger-text" disabled={Boolean(busy)} onClick={() => setConfirm("unbind")}>解绑并删除登录态</button> : null}
        </div>
        {!data.credential_storage_ready ? <p className="inline-error">管理员尚未启用加密存储，暂时无法导入登录态。</p> : null}
        {data.credential_updated_at ? <p className="spark-meta">最近导入：{sparkTime(data.credential_updated_at)}</p> : null}
        <details className="spark-help"><summary>第一次使用：如何获取登录态？</summary>
          <ol><li>在 Windows 或 macOS 电脑安装 Python，下载上面的扫码脚本。</li><li>打开脚本所在目录的终端，依次运行：</li></ol>
          <pre>python -m pip install playwright{"\n"}python -m playwright install chromium{"\n"}python yingmo_extract_cookie.py</pre>
          <p>macOS 如提示找不到 python，请把命令中的 python 换成 python3。用手机抖音扫描弹出窗口中的二维码；完成后，将脚本旁 data 文件夹中的 state.json 导入这里。</p>
          <p>导入后先同步联系人，再模拟运行。登录过期时重新扫码并更新文件。助手通过浏览器执行操作，可能遇到平台验证或账号限制。</p>
        </details>
      </section>

      <div className="spark-workspace">
        <section className="spark-section spark-friends" aria-labelledby="spark-friends-heading">
          <div className="spark-section-heading"><span>02</span><div><h2 id="spark-friends-heading">把问候留给谁</h2><p>选中的好友才会收到消息。修改后请保存选择。</p></div></div>
          <div className="spark-actions"><button className="btn btn-secondary" disabled={!canQueue} onClick={() => { void queue("sync"); }}>同步联系人</button>
            <button className="text-button" disabled={!canQueue} onClick={() => { void queue("harvest"); }}>采集抖音号</button></div>
          <label className="spark-search"><span className="sr-only">搜索好友</span><input placeholder="搜索名字或抖音号" value={search} onChange={(event) => setSearch(event.target.value)} /></label>
          <div className="spark-contact-list">
            {!data.contacts.length ? <div className="spark-empty"><strong>好友名单还在等你</strong><p>导入登录态后点击“同步联系人”，再勾选想续火花的朋友。</p></div> : null}
            {visibleContacts.map((contact) => <label className="spark-contact" key={contact.id}>
              <input type="checkbox" disabled={Boolean(busy)} checked={Boolean(selection[contact.id])} onChange={(event) => {
                contactsDirty.current = true;
                selectionSequence.current = selectionSequence.current.filter((id) => id !== contact.id);
                if (event.target.checked) selectionSequence.current.push(contact.id);
                setSelection((current) => ({ ...current, [contact.id]: event.target.checked }));
              }} /><span><strong>{contact.display_name}</strong><small>{contact.short_id ? `抖音号 ${contact.short_id} · ` : ""}{contact.ambiguous ? "同名身份待确认" : contact.has_conversation ? "已有聊天会话" : "尚无聊天会话"}</small></span>
              <span className="spark-streak">{contact.streak_days > 0 ? `${contact.streak_days} 天` : "—"}</span>
            </label>)}
            {data.contacts.length && !visibleContacts.length ? <p className="spark-meta">没有匹配的好友。</p> : null}
          </div>
          <div className="spark-actions spark-selection-footer"><span>已选择 {selectedCount} 位{contactsDirty.current ? " · 尚未保存" : ""}</span><button className="btn btn-primary" disabled={Boolean(busy) || !data.bound} onClick={() => { void saveContacts(); }}>保存好友选择</button></div>
          <details className="spark-help"><summary>好友台账概览</summary>
            <p>共 {data.ledger_stats.total} 位 · 已采集抖音号 {data.ledger_stats.with_short_id} 位 · 身份已匹配 {data.ledger_stats.confidence.high} 位</p>
            <p>尚无会话：{data.ledger_stats.no_conversation.join("、") || "无"}</p>
            <p>会话身份待匹配：{data.ledger_stats.low_pending.join("、") || "无"}</p>
            <p>近七天发送过：{data.ledger_stats.recent_sent_7d.join("、") || "无"}</p>
            <p>火花记录：{data.ledger_stats.top_streak.filter((item) => item.days).map((item) => `${item.name} ${item.days} 天`).join("、") || "暂无"}</p>
          </details>
          <details className="spark-help"><summary>手动添加好友</summary><form onSubmit={(event) => {
            event.preventDefault();
            void action("add-contact", async () => {
              const response = await api.put("/spark/contacts", { entries: [{ display_name: newName.trim(), selected: false }] });
              acceptData(response.data);
              setNewName("");
            }, "好友已加入。没有聊天会话的好友需要采集身份并启用首条消息通道。");
          }}><label>完整备注或昵称<input value={newName} maxLength={191} onChange={(event) => setNewName(event.target.value)} /></label><button className="btn btn-secondary" disabled={!data.bound || Boolean(busy) || !newName.trim()}>添加好友</button></form></details>
        </section>

        <section className="spark-section spark-plan" aria-labelledby="spark-plan-heading">
          <div className="spark-section-heading"><span>03</span><div><h2 id="spark-plan-heading">安排每天的问候</h2><p>所有时间按北京时间。多条模板会随机选择一条。</p></div></div>
          <form className="spark-plan-form" onSubmit={saveConfig}>
            <label className="spark-switch"><input type="checkbox" checked={config.auto_run_enabled} onChange={(event) => changeConfig("auto_run_enabled", event.target.checked)} /><span>启用每日自动续火花</span></label>
            <label>每天发送时间<input type="time" required value={config.schedule_time} onChange={(event) => changeConfig("schedule_time", event.target.value)} /></label>
            <label>消息模板（每行一条）<textarea rows={5} required value={messages} onChange={(event) => setMessages(event.target.value)} placeholder="今天也要开心哦" /></label>
            <details className="spark-help"><summary>发送节奏与双通道设置</summary><div className="spark-advanced-grid">
              {numericFields.map(([key, label, min, max]) => <label key={key}>{label}<input type="number" min={min} max={max} required value={config[key]} onChange={(event) => changeConfig(key, event.target.value === "" ? "" : Number(event.target.value))} /></label>)}
              <label className="spark-switch"><input type="checkbox" checked={config.allow_first_message} onChange={(event) => changeConfig("allow_first_message", event.target.checked)} /><span>允许对尚无会话的好友发送首条消息</span></label>
              <p className="spark-meta">首条消息通道默认关闭，每轮最多一位。今日已发送或待确认：{data.creator_sent_today} 条。</p>
              <label>每周采集抖音号<CustomSelect value={config.schedule_harvest_day} aria-label="每周采集日期" onChange={(event) => changeConfig("schedule_harvest_day", event.target.value)}>
                <option value="off">关闭每周采集</option>{["mon", "tue", "wed", "thu", "fri", "sat", "sun"].map((day, index) => <option key={day} value={day}>周{"一二三四五六日"[index]} 03:00</option>)}
              </CustomSelect></label>
              <p className="spark-meta">下一次采集：{sparkTime(data.next_harvest_at)}。每周采集单独控制，关闭每日发送后仍可运行。</p>
              <label>采集接口路径<input value={config.creator_user_detail_path} maxLength={150} onChange={(event) => changeConfig("creator_user_detail_path", event.target.value)} /></label>
            </div></details>
            <div className="spark-actions"><button className="btn btn-primary" disabled={Boolean(busy)}>{busy === "config" ? "正在保存" : "保存每日计划"}</button></div>
          </form>
        </section>
      </div>

      <section className="spark-section" aria-labelledby="spark-runs-heading">
        <div className="spark-section-heading"><span>04</span><div><h2 id="spark-runs-heading">问候的回音</h2><p>模拟运行只检查好友定位，不发送消息。真实发送结果不明确时，会保留为“待确认”，不会自动重发。</p></div></div>
        <div className="spark-actions"><button className="btn btn-secondary" disabled={!canQueue || !data.selected_count || contactsDirty.current} onClick={() => { void queue("dry_run"); }}>模拟运行</button>
          <button className="btn btn-primary" disabled={!canSend} onClick={() => setConfirm("send")}>立即续火花</button>
          <button className="text-button" disabled={Boolean(busy)} onClick={() => { void load(); }}>刷新状态</button></div>
        {!data.jobs.length ? <p className="spark-empty">还没有执行记录。先模拟运行，看看好友与登录状态是否准备好了。</p> : null}
        <div className="spark-run-list">{data.jobs.map((job) => <details className="spark-run" key={job.id} open={["queued", "running", "unknown", "failed", "partial", "expired", "blocked"].includes(job.status) ? true : undefined}>
          <summary><span><strong>{sparkKindLabels[job.kind]}</strong><small>{sourceLabels[job.source]} · {sparkTime(job.scheduled_at)}</small></span><span className={`spark-run-status is-${job.status}`}>{sparkStatusLabels[job.status] || job.status}</span></summary>
          {job.result.message ? <p>{job.result.message}</p> : null}
          {job.result.events?.map((event, index) => <div className="spark-run-event" key={`${event.name}-${index}`}><strong>{event.name}</strong><span>{sparkStatusLabels[event.status]} · {event.reason}</span></div>)}
          {["queued", "running"].includes(job.status) ? <button className="text-button danger-text" disabled={Boolean(busy) || job.cancel_requested} onClick={() => { void action("cancel", async () => { await api.post(`/spark/jobs/${job.id}/cancel`, {}); await load(); }, "停止请求已提交，后台将结束这次任务。"); }}>{job.cancel_requested ? "正在停止" : "停止任务"}</button> : null}
        </details>)}</div>
      </section>
      <ConfirmDialog open={Boolean(confirm)} title={confirm === "send" ? "现在给选中的好友续火花？" : "解绑并删除抖音登录态？"}
        description={confirm === "send" ? `将按已保存的计划向 ${data.selected_count} 位好友尝试发送消息。今天已发送或结果待确认的好友会跳过。` : "会停止当前账号的任务，删除服务器保存的登录态和好友名单。已发送的消息无法撤回。"}
        confirmLabel={confirm === "send" ? "确认发送" : "确认解绑"} danger={confirm === "unbind"} busy={Boolean(busy)} onClose={() => setConfirm(null)}
        onConfirm={() => { if (confirm === "send") void queue("send"); else void action("unbind", async () => { const response = await api.delete("/spark/credentials"); acceptData(response.data, true); }, "已解绑，登录态和好友名单已删除。"); }}
        >
        {confirm === "send" ? <p>本轮预计发送：{data.pending_send.map((item) => `${item.name}（${item.channel === "consumer" ? "已有会话" : "首条消息"}）`).join("、") || "没有可发送对象，已发送或待确认的好友会跳过。"}</p> : null}
      </ConfirmDialog>
    </main>
  );
}
