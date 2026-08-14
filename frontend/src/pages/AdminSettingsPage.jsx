import { useEffect, useState } from "react";
import { AdminActionDialog, AdminPageFrame } from "../components/AdminPanel";
import { ErrorState } from "../components/States";
import { useAsyncData } from "../hooks/useAsyncData";
import { usePageMeta } from "../hooks/usePageMeta";
import { api } from "../lib/api";
import { siteSettingsForm } from "../lib/admin";
import { formatDate } from "../lib/format";

export function AdminSettingsPage() {
  usePageMeta("站点设置");
  const state = useAsyncData(() => api.get("/admin/settings"), []);
  const [form, setForm] = useState({});
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => { if (state.data) setForm(siteSettingsForm(state.data)); }, [state.data]);
  const schema = state.data?.schema || [];
  const validate = () => {
    for (const item of schema) {
      const value = form[item.key] || "";
      if (item.required && !value.trim()) return `${item.label}不能为空。`;
      if (value.length > item.max_length) return `${item.label}不能超过 ${item.max_length} 字。`;
    }
    return "";
  };
  const requestSave = (event) => {
    event.preventDefault();
    const problem = validate();
    if (problem) { setError(problem); setMessage(""); return; }
    setReason(""); setError(""); setMessage(""); setConfirmOpen(true);
  };
  const save = async () => {
    if (busy || !reason.trim()) return;
    setBusy(true); setError("");
    try {
      const result = await api.put("/admin/settings", { settings: form, reason: reason.trim() });
      setForm(siteSettingsForm(result.data));
      setConfirmOpen(false);
      setMessage("站点设置已保存并写入操作日志。");
      await state.reload();
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <AdminPageFrame title="站点设置" description="维护站点名称、说明、关于文本、页脚和注册提示。字段类型与长度由后端 schema 统一定义。" busy={state.loading || busy} actions={state.data?.updated_at ? <span className="personal-page-total">最近更新 {formatDate(state.data.updated_at, true)}</span> : null}>
      {message ? <div className="inline-success admin-feedback" role="status">{message}</div> : null}
      {state.loading && !state.data ? <div className="skeleton-stack" role="status"><span className="sr-only">正在读取站点设置</span><div className="skeleton-block" /></div> : null}
      {state.error ? <ErrorState error={state.error} onRetry={state.reload} /> : null}
      {state.data ? <form className="admin-settings-form" onSubmit={requestSave} aria-busy={busy || undefined}>
        {error && !confirmOpen ? <div className="inline-error" role="alert">{error}</div> : null}
        {schema.map((item) => <label key={item.key} className={item.multiline ? "admin-settings-wide" : ""}>
          <span>{item.label}</span>
          {item.multiline ? <textarea rows={item.key === "about" ? 10 : 4} required={item.required} maxLength={item.max_length} disabled={busy} value={form[item.key] || ""} onChange={(event) => { setForm({ ...form, [item.key]: event.target.value }); setError(""); setMessage(""); }} /> : <input required={item.required} maxLength={item.max_length} disabled={busy} value={form[item.key] || ""} onChange={(event) => { setForm({ ...form, [item.key]: event.target.value }); setError(""); setMessage(""); }} />}
          <small>{(form[item.key] || "").length} / {item.max_length}{item.required ? " · 必填" : ""}</small>
        </label>)}
        <div className="admin-settings-actions"><button className="btn btn-secondary" type="button" disabled={busy || state.loading} onClick={() => { setForm(siteSettingsForm(state.data)); setError(""); setMessage(""); }}>恢复已保存值</button><button className="btn btn-primary" type="submit" disabled={busy || state.loading}>保存设置</button></div>
      </form> : null}
      <AdminActionDialog open={confirmOpen} title="保存站点设置" description="本次修改会覆盖当前站点配置，并记录修改前后值、操作者、请求 ID 和原因。" confirmLabel="确认保存" reason={reason} busy={busy} error={confirmOpen ? error : ""} onReasonChange={setReason} onConfirm={() => { void save(); }} onClose={() => { if (!busy) { setConfirmOpen(false); setError(""); } }} />
    </AdminPageFrame>
  );
}
