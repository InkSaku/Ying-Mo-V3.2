import { useState } from "react";
import { AdminActionDialog, AdminPageFrame } from "../components/AdminPanel";
import { EmptyState, ErrorState } from "../components/States";
import { useAsyncData } from "../hooks/useAsyncData";
import { usePageMeta } from "../hooks/usePageMeta";
import { api } from "../lib/api";
import { adminNotificationPayload } from "../lib/admin";

export function AdminNotificationsPage() {
  usePageMeta("系统通知");
  const [query, setQuery] = useState("");
  const [appliedQuery, setAppliedQuery] = useState("");
  const users = useAsyncData(() => api.get(`/admin/users?status=active&q=${encodeURIComponent(appliedQuery)}&page=1&page_size=100`), [appliedQuery]);
  const [scope, setScope] = useState("all");
  const [selected, setSelected] = useState([]);
  const [messageText, setMessageText] = useState("");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const toggleUser = (id) => setSelected((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
  const requestSend = (event) => {
    event.preventDefault(); setError(""); setSuccess("");
    if (!messageText.trim()) { setError("系统通知内容不能为空。"); return; }
    if (messageText.trim().length > 500) { setError("系统通知不能超过 500 字。"); return; }
    if (scope === "selected" && !selected.length) { setError("请至少选择一位有效接收者。"); return; }
    setReason(""); setConfirmOpen(true);
  };
  const send = async () => {
    if (busy || !reason.trim()) return;
    setBusy(true); setError("");
    try {
      const payload = adminNotificationPayload({ message: messageText, scope, selectedIds: selected, reason });
      const result = await api.post("/admin/notifications", payload);
      setSuccess(`系统通知发送完成：${result.data.recipient_count} 位有效成员。`);
      setMessageText(""); setSelected([]); setConfirmOpen(false);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <AdminPageFrame title="系统通知" description="向全部 active 成员或明确选中的成员发送站内系统通知。发送结果和正文会进入结构化操作日志。" busy={users.loading || busy}>
      {success ? <div className="inline-success admin-feedback" role="status">{success}</div> : null}
      {error && !confirmOpen ? <div className="inline-error admin-feedback" role="alert">{error}</div> : null}
      <form className="admin-notification-form" onSubmit={requestSend}>
        <fieldset disabled={busy}><legend>接收范围</legend><label className="radio-row"><input type="radio" name="scope" checked={scope === "all"} onChange={() => setScope("all")} /><span>全部 active 成员</span></label><label className="radio-row"><input type="radio" name="scope" checked={scope === "selected"} onChange={() => setScope("selected")} /><span>仅选中成员</span></label></fieldset>
        {scope === "selected" ? <section className="admin-recipient-picker" aria-labelledby="recipient-heading">
          <div><h2 id="recipient-heading">选择接收者</h2><span className="tabular">已选 {selected.length} 人</span></div>
          <div className="admin-recipient-search" role="search"><label><span className="sr-only">搜索 active 成员</span><input value={query} maxLength={100} onChange={(event) => setQuery(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); setAppliedQuery(query.trim()); } }} placeholder="搜索 username 或 nickname" /></label><button className="btn btn-secondary" type="button" disabled={users.loading} onClick={() => setAppliedQuery(query.trim())}>搜索</button></div>
          {users.loading && !users.data ? <div className="profile-refresh" role="status">正在读取 active 成员…</div> : null}
          {users.error ? <ErrorState error={users.error} onRetry={users.reload} /> : null}
          {users.data ? users.data.length ? <div className="admin-recipient-list">{users.data.map((user) => <label key={user.id}><input type="checkbox" checked={selected.includes(user.id)} disabled={busy} onChange={() => toggleUser(user.id)} /><span><strong>{user.nickname}</strong><small>@{user.username} · 用户 #{user.id}</small></span></label>)}</div> : <EmptyState title="没有匹配的 active 成员" /> : null}
        </section> : null}
        <label className="admin-notification-message"><span>通知内容</span><textarea required rows={8} maxLength={500} disabled={busy} value={messageText} onChange={(event) => { setMessageText(event.target.value); setError(""); setSuccess(""); }} /><small>{messageText.length} / 500</small></label>
        <button className="btn btn-primary" type="submit" disabled={busy || users.loading}>检查并发送</button>
      </form>
      <AdminActionDialog open={confirmOpen} title="发送系统通知" description={scope === "all" ? "这条消息将发送给提交时所有状态为 active 的成员。" : `这条消息将发送给已选择的 ${selected.length} 位 active 成员。`} confirmLabel="确认发送" reason={reason} busy={busy} error={confirmOpen ? error : ""} onReasonChange={setReason} onConfirm={() => { void send(); }} onClose={() => { if (!busy) { setConfirmOpen(false); setError(""); } }}><blockquote className="admin-notification-preview">{messageText.trim()}</blockquote></AdminActionDialog>
    </AdminPageFrame>
  );
}
