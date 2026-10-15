import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "../lib/api";
import { useAuth } from "../contexts/AuthContext";
import { SparkRiskNotice } from "../components/SparkRiskNotice";
import { usePageMeta } from "../hooks/usePageMeta";
import { PersonalNav } from "../components/PersonalNav";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { CustomSelect } from "../components/CustomSelect";
import { SparkBinding } from "../components/SparkBinding";
import { SparkQueue, SparkRunBadge } from "../components/SparkQueue";
import { InkSketch } from "../components/InkSketch";
import { ErrorState, PageLoader } from "../components/States";
import { sparkJobDuration, sparkJobPhase, sparkKindLabels, sparkMessages, sparkStatusLabels, sparkTime } from "../lib/spark";
import "../styles/spark.css";

const numericFields = [
  ["jitter_minutes", "时间浮动（分钟）", 0, 120],
  ["send_gap_min", "好友间隔下限（秒）", 1, 300],
  ["send_gap_max", "好友间隔上限（秒）", 1, 300],
  ["max_friends_per_run", "每次最多好友数（0 为全部，上限 500）", 0, 500],
  ["first_message_daily_limit", "首条消息每日上限", 1, 10],
  ["creator_max_scrolls", "采集最多滚动次数", 1, 200],
];
const sourceLabels = { manual: "手动", daily: "每日计划", retry: "失败补发", weekly: "每周采集", auto_bind: "连接后同步" };

export function SparkPage() {
  const { user } = useAuth();
  return <><SparkRiskNotice key={user.id} userId={user.id} /><SparkWorkspace /></>;
}

function SparkWorkspace() {
  usePageMeta("续火花助手");
  const [data, setData] = useState(null);
  const [config, setConfig] = useState(null);
  const [messages, setMessages] = useState("");
  const [selection, setSelection] = useState({});
  const [search, setSearch] = useState("");
  const [contactFilter, setContactFilter] = useState("all");
  const [runFilter, setRunFilter] = useState("all");
  const [newName, setNewName] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState("");
  const [confirm, setConfirm] = useState(null);
  const [now, setNow] = useState(Date.now);
  const initialized = useRef(false);
  const contactsDirty = useRef(false);
  const selectionSequence = useRef([]);
  const requestPending = useRef(false);
  const fileInput = useRef(null);

  const acceptData = useCallback((value, reset = false) => {
    setData(value);
    setNow(Date.now());
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

  const hasActiveWork = Boolean(data?.jobs.some((job) => ["queued", "running"].includes(job.status)));
  useEffect(() => {
    void load();
    const activeLogin = ["queued", "preparing", "waiting_scan", "verifying", "awaiting_confirmation"].includes(data?.login_session?.status);
    const timer = window.setInterval(() => { if (!document.hidden) void load(); }, activeLogin ? 1500 : hasActiveWork ? 2000 : 5000);
    return () => window.clearInterval(timer);
  }, [load, data?.login_session?.status, hasActiveWork]);

  useEffect(() => {
    if (!hasActiveWork) return;
    const timer = window.setInterval(() => { if (!document.hidden) setNow(Date.now()); }, 1000);
    return () => window.clearInterval(timer);
  }, [hasActiveWork]);

  const action = async (name, operation, message) => {
    setBusy(name);
    setError("");
    setNotice("");
    try {
      await operation();
      setNotice(message);
      setConfirm(null);
    } catch (actionError) {
      if (actionError.code === "SPARK_BUSY") {
        await load();
        setError("你已有任务在排队或执行，下方任务队列会自动显示进度。");
      } else setError(actionError.message);
      setConfirm(null);
    } finally {
      setBusy("");
    }
  };

  const queue = (kind) => action(kind, async () => {
    await api.post("/spark/jobs", { kind, request_id: crypto.randomUUID() });
    await load();
  }, `${sparkKindLabels[kind]}已加入队列，下方会自动显示排队与执行进度。`);

  const saveConfig = (event) => {
    event.preventDefault();
    void action("config", async () => {
      const response = await api.put("/spark/config", { ...config, auto_run_enabled: false, messages: sparkMessages(messages) });
      acceptData(response.data);
      setConfig(response.data.config);
    }, "每日计划已保存，请模拟检查后开启。时间均按北京时间执行。");
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
  const needsReview = (contact) => contact.missing_in_sync || contact.ambiguous;
  const reviewCount = data.contacts.filter(needsReview).length;
  const visibleContacts = data.contacts.filter((contact) =>
    (contactFilter === "all" || (contactFilter === "selected" ? selection[contact.id] : needsReview(contact)))
    && `${contact.display_name} ${contact.nickname || ""} ${contact.short_id || ""}`.toLowerCase().includes(search.trim().toLowerCase()));
  const visibleJobs = data.jobs.filter((job) => runFilter === "all" || (runFilter === "send" ? job.kind === "send" : job.kind !== "send"));
  const canQueue = data.bound && !busy && !activeJobs.length;
  const planDirty = Object.entries(data.config).some(([key, value]) => key !== "auto_run_enabled" && JSON.stringify(key === "messages" ? sparkMessages(messages) : config[key]) !== JSON.stringify(value));
  const canCheck = canQueue && data.selected_count > 0 && !contactsDirty.current && !planDirty && data.step_progress.completed[2];
  const canSend = canCheck && data.validation_ready && data.pending_send.length > 0;
  const canActivate = canCheck && data.validation_ready;
  const waitingRetry = activeJobs.find((job) => job.source === "retry" && job.status === "queued");
  const runningCheck = activeJobs.find((job) => job.kind === "dry_run" && job.status === "running");
  const stepComplete = data.step_progress.completed.map((done, index) => done &&
    (index === 1 ? !contactsDirty.current : index === 2 ? !planDirty : index === 3 ? !contactsDirty.current && !planDirty : true));
  const currentStep = stepComplete.findIndex((done) => !done);
  const queueHint = !data.bound ? "先连接抖音账号，再同步好友。"
    : waitingRetry && new Date(waitingRetry.scheduled_at).getTime() > now ? `补发已安排在 ${sparkTime(waitingRetry.scheduled_at)}。如需现在操作，可先停止补发任务。`
    : activeJobs.length ? `${sparkKindLabels[activeJobs[0].kind]} · ${sparkJobPhase(activeJobs[0], data.worker.online, now).label}。下方任务队列会自动更新，无需重复提交。` : "";
  const checkHint = queueHint || (contactsDirty.current ? "好友选择尚未保存，请先保存左侧名单。"
    : !data.selected_count ? "先在好友名单中勾选朋友，并保存选择。"
    : planDirty || !data.step_progress.completed[2] ? "先保存每日计划，再进行模拟检查。"
    : !data.validation_ready ? "模拟检查只确认会话和输入框，不会发送消息。" : "账号、好友与消息模板已检查，可以开启每日计划。");
  const selectVisible = (checked) => {
    contactsDirty.current = true;
    const ids = new Set(visibleContacts.map((contact) => contact.id));
    if (checked) selectionSequence.current.push(...[...ids].filter((id) => !selection[id]));
    else selectionSequence.current = selectionSequence.current.filter((id) => !ids.has(id));
    setSelection((current) => ({ ...current, ...Object.fromEntries([...ids].map((id) => [id, checked])) }));
  };
  const cancelJob = (job) => action("cancel", async () => {
    await api.post(`/spark/jobs/${job.id}/cancel`, {});
    await load();
  }, "停止请求已提交，任务状态会自动更新。");
  const changeConfig = (key, value) => setConfig((current) => ({ ...current, [key]: value }));
  const startLogin = () => action("login", async () => { await api.post("/spark/login-sessions", {}); await load(); }, "连接已开始，请等待二维码。");
  const togglePlan = () => action("toggle-plan", async () => {
    const response = await api.put("/spark/config", { auto_run_enabled: !data.config.auto_run_enabled });
    acceptData(response.data);
    setConfig(response.data.config);
  }, data.config.auto_run_enabled ? "每日计划已暂停。" : "每日计划已开启，关闭网页后仍会执行。");

  return (
    <main className="page-shell personal-page-shell spark-page">
      <PersonalNav />
      <header className="spark-hero">
        <div>
          <p className="hero-kicker">映墨工具箱 / 续火花助手</p>
          <h1>留一点问候，让火花继续。</h1>
          <p>选朋友、定时间，剩下的每日问候交给助手。</p>
          <div className="spark-status-line"><span className={`spark-status-dot is-${data.session_status}`} />{sparkStatusLabels[data.session_status]}
            <span>·</span><span>{data.worker.online ? "后台服务在线" : "后台服务暂未连接"}</span></div>
        </div>
        <div className="spark-hero-scene">
          <InkSketch variant="spark" className="spark-hero-companion" />
          <div className="spark-next-time"><span>{data.config.auto_run_enabled ? "下次问候" : "每日计划未开启"}</span><strong>{data.config.auto_run_enabled && data.next_run_at ? sparkTime(data.next_run_at) : "等你安排"}</strong><small>{data.config.auto_run_enabled && data.next_run_at ? "北京时间" : "检查通过后，开启每日问候"}</small></div>
        </div>
      </header>

      {error ? <div className="inline-error" role="alert">{error}</div> : null}
      {notice ? <div className="inline-success" role="status">{notice}</div> : null}
      {!data.worker.online ? <p className="spark-service-note">后台服务暂未连接。配置会保存，任务会等待服务恢复；不会显示为已发送。</p> : null}
      {["expired", "blocked", "error"].includes(data.session_status) ? <div className="spark-service-note"><p>抖音登录需要处理，自动发送已暂停。请重新扫码连接；遇到平台验证时先在抖音官方客户端查看提示。</p><button className="text-button" disabled={Boolean(busy) || !data.worker.online} onClick={() => { void startLogin(); }}>重新扫码连接</button></div> : null}
      {data.jobs.some((job) => job.status === "unknown") ? <p className="spark-service-note">存在发送结果待确认的记录，请到抖音私信查看。助手不会自动重发这些消息。</p> : null}
      <nav className="spark-steps" aria-label="续火花设置步骤">{["连接抖音", "选择好友", "设置问候", "检查并开启"].map((label, index) => <a href={`#spark-step-${index + 1}`} key={label} className={stepComplete[index] ? "is-complete" : ""} aria-current={currentStep === index ? "step" : undefined}><span>{stepComplete[index] ? "✓" : `0${index + 1}`}</span><div>{label}<small>{stepComplete[index] ? "已完成" : currentStep === index ? "下一步" : "待完成"}</small></div></a>)}</nav>

      <section id="spark-step-1" className={`spark-section spark-connection${data.bound ? " is-bound" : ""}`} aria-labelledby="spark-binding">
        <div className={data.bound ? "sr-only" : "spark-section-heading"}><span>01</span><div><h2 id="spark-binding">连接你的抖音</h2><p>用手机抖音扫描网页二维码，在手机上确认登录，再核对连接的账号。</p></div></div>
        <SparkBinding data={data} busy={busy} onStart={() => { void startLogin(); }}
          onCancel={() => { void action("cancel-login", async () => { const response = await api.post(`/spark/login-sessions/${data.login_session.id}/cancel`, {}); acceptData(response.data); }, "连接已取消。"); }}
          onConfirm={() => { void action("confirm-login", async () => { const response = await api.post(`/spark/login-sessions/${data.login_session.id}/confirm`, {}); acceptData(response.data, true); }, "账号已连接，正在同步联系人。每日发送尚未开启。"); }} />
        <div className="spark-connection-tools">{data.bound ? <details className="spark-help spark-account-management"><summary>管理连接</summary><button className="text-button danger-text" disabled={Boolean(busy)} onClick={() => setConfirm("unbind")}>解绑并删除登录态</button>
          <p>解绑会停止任务并删除保存的账号与好友名单。</p></details> : null}
        {!data.credential_storage_ready ? <p className="inline-error">管理员尚未启用加密存储，暂时无法连接抖音。</p> : null}
        <details className="spark-help"><summary>备用登录方式</summary><p>在电脑上运行扫码脚本，导出登录态后上传到这里。</p>
        <div className="spark-actions">
          <button className="btn btn-primary" disabled={Boolean(busy) || !data.credential_storage_ready} onClick={() => fileInput.current?.click()}>{data.bound ? "更新登录态" : "导入登录态"}</button>
          <input ref={fileInput} type="file" accept="application/json,.json" hidden onChange={importState} aria-label="登录态文件" />
          <button className="btn btn-secondary" disabled={Boolean(busy)} onClick={() => { void downloadHelper(); }}>下载扫码脚本</button>
        </div>
        {data.credential_updated_at ? <p className="spark-meta">最近导入：{sparkTime(data.credential_updated_at)}</p> : null}
          <ol><li>在 Windows 或 macOS 电脑安装 Python，下载上面的扫码脚本。</li><li>打开脚本所在目录的终端，依次运行：</li></ol>
          <pre>python -m pip install playwright{"\n"}python -m playwright install chromium{"\n"}python yingmo_extract_cookie.py</pre>
          <p>macOS 如提示找不到 python，请把命令中的 python 换成 python3。用手机抖音扫描弹出窗口中的二维码；完成后，将脚本旁 data 文件夹中的 state.json 导入这里。</p>
          <p>导入后先同步联系人，再模拟运行。登录过期时重新扫码并更新文件。助手通过浏览器执行操作，可能遇到平台验证或账号限制。</p>
        </details></div>
      </section>

      <div className="spark-workspace">
        <section id="spark-step-2" className="spark-section spark-friends" aria-labelledby="spark-friends-heading">
          <div className="spark-section-heading"><span>02</span><div><h2 id="spark-friends-heading">把问候留给谁</h2><p>选中的好友才会收到消息。修改后请保存。</p></div><button className="btn btn-secondary spark-heading-action" disabled={!canQueue} onClick={() => { void queue("sync"); }}>{busy === "sync" ? "正在提交" : "同步联系人"}</button></div>
          {activeJobs.length ? <a className="spark-friends-queue-link" href="#spark-queue">{sparkKindLabels[activeJobs[0].kind]} · {sparkJobPhase(activeJobs[0], data.worker.online, now).label}，查看进度 →</a> : null}
          {!data.contacts_updated_at && data.bound ? <p className="spark-meta">账号已连接。联系人同步尚未完成，可点击“同步联系人”重试，无需重新扫码。</p> : null}
          {data.reconnection_diff.missing_selected.length ? <p className="spark-service-note">本次同步未找到：{data.reconnection_diff.missing_selected.join("、")}。请核对，尚不能确认这些好友已失效。</p> : null}
          <label className="spark-search"><span className="sr-only">搜索好友</span><input type="search" placeholder="搜索名字或抖音号" value={search} onChange={(event) => setSearch(event.target.value)} /></label>
          <div className="spark-list-toolbar"><div className="spark-filters" role="group" aria-label="筛选好友">{[["all", `全部 ${data.contacts.length}`], ["selected", `已选 ${selectedCount}`], ["review", `需核对 ${reviewCount}`]].map(([value, label]) => <button type="button" key={value} aria-pressed={contactFilter === value} onClick={() => setContactFilter(value)}>{label}</button>)}</div>
            <div className="spark-bulk-actions"><button className="text-button" disabled={Boolean(busy) || !visibleContacts.some((contact) => !selection[contact.id])} onClick={() => selectVisible(true)}>选择当前列表</button><button className="text-button" disabled={Boolean(busy) || !visibleContacts.some((contact) => selection[contact.id])} onClick={() => selectVisible(false)}>清空当前列表</button></div></div>
          <div className="spark-contact-list">
            {!data.contacts.length ? <div className="spark-empty"><strong>好友名单还在等你</strong><p>导入登录态后点击“同步联系人”，再勾选想续火花的朋友。</p></div> : null}
            {visibleContacts.map((contact) => <label className={`spark-contact${selection[contact.id] ? " is-selected" : ""}`} key={contact.id}>
              <input type="checkbox" disabled={Boolean(busy)} checked={Boolean(selection[contact.id])} onChange={(event) => {
                contactsDirty.current = true;
                selectionSequence.current = selectionSequence.current.filter((id) => id !== contact.id);
                if (event.target.checked) selectionSequence.current.push(contact.id);
                setSelection((current) => ({ ...current, [contact.id]: event.target.checked }));
              }} /><span className="spark-contact-avatar" aria-hidden="true">{Array.from(contact.display_name)[0]}</span><span><strong>{contact.display_name}</strong><small>{contact.short_id ? `抖音号 ${contact.short_id} · ` : ""}{contact.missing_in_sync ? "本次同步未找到，请核对" : contact.ambiguous ? "同名身份待确认" : contact.has_conversation ? "已有聊天会话" : "尚无聊天会话"}</small></span>
              <span className="spark-streak">{contact.streak_days > 0 ? `${contact.streak_days} 天` : "—"}</span>
            </label>)}
            {data.contacts.length && !visibleContacts.length ? <p className="spark-empty">{contactFilter === "selected" && !selectedCount ? "还没有选中的好友，切换到“全部”开始选择。" : contactFilter === "review" && !reviewCount ? "目前没有需要核对的好友。" : "没有匹配的好友，试试其他名字或筛选条件。"}</p> : null}
          </div>
          <div className="spark-actions spark-selection-footer"><span><strong>{selectedCount}</strong> 位好友已选<small>{contactsDirty.current ? "有更改，请保存" : "选择已保存"}</small></span><button className="btn btn-primary" disabled={Boolean(busy) || !data.bound || !contactsDirty.current} onClick={() => { void saveContacts(); }}>{busy === "contacts" ? "正在保存" : "保存好友选择"}</button></div>
          <details className="spark-help spark-friends-more"><summary>更多好友操作</summary>
          <div className="spark-harvest-action"><button className="text-button" disabled={!canQueue} onClick={() => { void queue("harvest"); }}>采集抖音号</button><p className="spark-meta">需要匹配尚无会话的好友时使用。</p></div>
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
          }}><label>完整备注或昵称<input value={newName} maxLength={191} onChange={(event) => setNewName(event.target.value)} /></label><button className="btn btn-secondary" disabled={!data.bound || Boolean(busy) || !newName.trim() || contactsDirty.current}>添加好友</button>{contactsDirty.current ? <p>请先保存当前好友选择，再添加好友。</p> : null}</form></details></details>
        </section>

        <div className="spark-plan-column"><section id="spark-step-3" className="spark-section spark-plan" aria-labelledby="spark-plan-heading">
          <div className="spark-section-heading"><span>03</span><div><h2 id="spark-plan-heading">安排每天的问候</h2><p>定一个时间，留一句问候。</p></div><InkSketch variant="sparkCalendar" className="spark-plan-sketch" /></div>
          <form className="spark-plan-form" onSubmit={saveConfig}>
            {planDirty ? <p className="spark-meta">问候设置尚未保存。请先保存，再检查和开启。</p> : null}
            <label>每天发送时间<span className="spark-time-field"><input type="time" required value={config.schedule_time} onChange={(event) => changeConfig("schedule_time", event.target.value)} /><small>北京时间</small></span></label>
            <label>消息模板（每行一条）<textarea rows={3} required value={messages} onChange={(event) => setMessages(event.target.value)} placeholder="今天也要开心哦" /></label>
            <div className="spark-message-preview"><span>问候预览 · {sparkMessages(messages).length} 条模板</span><p>{sparkMessages(messages)[0] || "写一句想送给朋友的问候"}</p><small>每次随机选择一条，按保存后的内容发送。</small><InkSketch variant="sparkGreeting" className="spark-message-sketch" /></div>
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
            <div className="spark-actions spark-plan-footer"><span className="spark-meta">{planDirty ? "修改后需要重新模拟检查" : data.step_progress.completed[2] ? "每日计划已保存" : "保存后继续模拟检查"}</span><button className="btn btn-primary" disabled={Boolean(busy) || (!planDirty && data.step_progress.completed[2])}>{busy === "config" ? "正在保存" : "保存每日计划"}</button></div>
          </form>
        </section></div></div>
      <section id="spark-step-4" className="spark-section spark-launch" aria-labelledby="spark-runs-heading">
        <div className="spark-section-heading"><span>04</span><div><h2 id="spark-runs-heading">检查并开启</h2><p>先模拟检查，再开启每天的问候。</p></div></div>
        <div className="spark-launch-main"><div className="spark-readiness" aria-label="开启前的准备状态">{[[data.bound, "账号已连接"], [data.selected_count > 0 && !contactsDirty.current, `已选 ${data.selected_count} 位好友`], [data.step_progress.completed[2] && !planDirty, "计划已保存"], [data.validation_ready && !planDirty && !contactsDirty.current, "模拟检查通过"]].map(([done, label]) => <span key={label} className={done ? "is-done" : ""}><i aria-hidden="true">{done ? "✓" : "○"}</i>{label}</span>)}</div>
        <div className={`spark-check-status${data.validation_ready && !planDirty && !contactsDirty.current ? " is-ready" : ""}`}><strong>{runningCheck ? data.worker.online ? "模拟检查正在进行" : "模拟检查状态待同步" : data.validation_ready && !planDirty && !contactsDirty.current ? "✓ 模拟检查已通过" : "完成检查，就准备好了"}</strong><p id="spark-check-hint">{checkHint}</p>
          {runningCheck?.result.progress ? <div className="spark-current-progress" aria-live="polite"><p>已检查 {runningCheck.result.progress.completed}/{runningCheck.result.progress.total} 位{!data.worker.online ? " · 等待状态同步" : runningCheck.result.progress.current_name ? ` · 正在检查 ${runningCheck.result.progress.current_name}` : " · 正在整理结果"}</p><progress className="spark-progress" value={runningCheck.result.progress.completed} max={runningCheck.result.progress.total || 1} aria-label="当前模拟检查进度" /></div> : null}
          {activeJobs.length ? <a className="spark-history-link" href="#spark-queue">查看排队与进度 →</a> : null}
          {waitingRetry ? <button className="text-button danger-text" disabled={Boolean(busy) || waitingRetry.cancel_requested} onClick={() => { void cancelJob(waitingRetry); }}>{waitingRetry.cancel_requested ? "正在停止" : "停止补发任务"}</button> : null}</div>
        <div className="spark-actions spark-activation-actions" aria-describedby="spark-check-hint"><button className="btn btn-secondary" disabled={!canCheck} onClick={() => { void queue("dry_run"); }}>{busy === "dry_run" ? "正在提交" : "模拟运行"}</button>
          <button className="btn btn-primary" disabled={Boolean(busy) || (!data.config.auto_run_enabled && !canActivate)} onClick={() => { void togglePlan(); }}>{data.config.auto_run_enabled ? "暂停每日计划" : data.account_profile.plan_was_enabled ? "恢复每日计划" : "开启每日自动续火花"}</button></div>
        <p className="spark-launch-footnote">开启后，关闭网页也会执行。修改账号、好友或模板后，需要重新检查。</p></div>
        <div className="spark-manual-send"><div><strong>想现在打个招呼？</strong><p>{!activeJobs.length && data.validation_ready && !data.pending_send.length ? "今日可发送对象已完成或有待确认结果，助手不会重复发送。" : `按已保存的计划，预计向 ${data.pending_send.length} 位好友发送。今日已发送或待确认的好友会跳过。`}</p></div><button className="btn btn-secondary" disabled={!canSend} onClick={() => setConfirm("send")}>立即续火花</button></div>
      </section>

      <SparkQueue data={data} now={now} busy={busy} onCancel={(job) => { void cancelJob(job); }} />
      <section id="spark-history" className="spark-section spark-history" aria-labelledby="spark-history-heading">
        <div className="spark-history-heading"><div><p className="hero-kicker">问候的回音</p><h2 id="spark-history-heading">执行记录</h2><p>每次检查与问候的结果，都在这里。</p></div><button className="text-button" disabled={Boolean(busy)} onClick={() => { void load(); }}>刷新状态</button></div>
        <div className="spark-filters" role="group" aria-label="筛选执行记录">{[["all", "全部记录"], ["send", "发送记录"], ["check", "检查与同步"]].map(([value, label]) => <button key={value} aria-pressed={runFilter === value} onClick={() => setRunFilter(value)}>{label}</button>)}</div>
        {!visibleJobs.length ? <p className="spark-empty">{data.jobs.length ? "这里还没有相关记录。" : "还没有执行记录。完成好友和计划设置后，先来一次模拟检查。"}</p> : null}
        <div className="spark-run-list">{visibleJobs.map((job) => {
          const phase = sparkJobPhase(job, data.worker.online, now);
          return <details className={`spark-run is-${phase.key}`} key={job.id} open={["queued", "running", "unknown", "failed", "partial", "expired", "blocked"].includes(job.status) ? true : undefined}>
          <summary><span><strong>{sparkKindLabels[job.kind]}{job.source === "retry" ? <em>失败补发</em> : null}</strong><small>{sourceLabels[job.source]} · {sparkTime(job.scheduled_at)}{job.result.events?.length ? ` · ${job.result.events.length} 位好友` : ""}</small></span><SparkRunBadge phase={phase} /></summary>
          {job.status === "queued" ? <p className="spark-meta">{phase.key === "scheduled" ? `${sparkTime(job.scheduled_at)} 到点后进入队列。` : phase.key === "stopping" ? "停止请求已提交，等待后台确认。" : !data.worker.online ? "后台暂未连接，排队状态会在恢复后同步。" : `已等待 ${sparkJobDuration(job, now)} · ${data.queue?.busy ? "前序任务正在执行，完成后继续处理队列。" : "等待后台接手。"}`}{job.source === "retry" ? "仅重试未发送成功的好友，已发送或结果待确认的对象会跳过。" : ""}</p> : null}
          {job.status === "running" ? <p className="spark-meta spark-run-clock" aria-live="off">{data.worker.online ? `已执行 ${sparkJobDuration(job, now)} · 结果自动更新` : "后台暂未连接，当前执行状态待同步。"}</p> : null}
          {job.result.message ? <p>{job.result.message}</p> : null}
          {job.kind === "dry_run" && job.status === "running" && data.worker.online ? <p className="spark-meta" role="status">
            {job.result.progress ? `已检查 ${job.result.progress.completed}/${job.result.progress.total} 位${job.result.progress.current_name ? `，正在检查：${job.result.progress.current_name}` : "，正在整理结果"}` : "正在打开抖音并检查会话，请稍候。"}模拟检查不会发送消息。
          </p> : null}
          {job.status === "running" && job.result.progress ? <progress className="spark-progress" value={job.result.progress.completed} max={job.result.progress.total || 1} aria-label="模拟检查进度" /> : null}
          {job.result.events?.map((event, index) => <div className="spark-run-event" key={`${event.name}-${index}`}><strong>{event.name}</strong><span>{sparkStatusLabels[event.status]} · {event.reason}</span></div>)}
          {["queued", "running"].includes(job.status) ? <button className="text-button danger-text" disabled={Boolean(busy) || job.cancel_requested} onClick={() => { void cancelJob(job); }}>{job.cancel_requested ? "正在停止" : "停止任务"}</button> : null}
        </details>;
        })}</div>
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
