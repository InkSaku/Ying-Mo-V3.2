import { useEffect, useState } from "react";
import { api } from "../lib/api";

const live = ["queued", "preparing", "waiting_scan", "verifying", "awaiting_confirmation"];
const labels = {
  queued: "后台正在处理其他任务，连接正在等待。", preparing: "正在打开抖音登录页面…",
  waiting_scan: "请用手机抖音扫码，并在手机上确认登录。", verifying: "正在确认登录状态…",
  awaiting_confirmation: "登录已完成，请确认连接的账号。", succeeded: "账号已连接，联系人同步已安排。",
  expired: "连接或二维码已经过期，请重新获取。", blocked: "抖音要求安全验证，本次连接未完成。",
  interrupted: "后台连接中断，请重新扫码。", cancelled: "本次连接已取消。",
};

export function SparkBinding({ data, busy, onStart, onCancel, onConfirm }) {
  const [image, setImage] = useState(null);
  const [imageError, setImageError] = useState("");
  const session = data.login_session;
  const waiting = session?.status === "waiting_scan" && session.has_qr;
  const version = waiting ? `${session.id}:${session.qr_updated_at}` : "";
  useEffect(() => {
    if (!version) return undefined;
    const controller = new AbortController();
    let url;
    void api.blob(`/spark/login-sessions/${session.id}/qr`, { signal: controller.signal, cache: "no-store" })
      .then((result) => {
        if (controller.signal.aborted) return;
        url = URL.createObjectURL(result.data);
        setImage({ version, url });
        setImageError("");
      }).catch((error) => { if (!controller.signal.aborted) setImageError(error.message); });
    return () => { controller.abort(); if (url) URL.revokeObjectURL(url); };
  }, [version, session?.id]);

  const active = session && live.includes(session.status);
  const detected = session?.detected_account;
  const showSession = session && !(data.bound && session.status === "succeeded");
  return <div className="spark-binding">
    <div className={`spark-account-card${data.bound ? " is-bound" : ""}`}>
      <span className="spark-account-avatar" aria-hidden="true">{data.bound ? Array.from(data.account_profile.nickname || "抖音")[0] : "↗"}</span>
      <div className="spark-account-identity"><small>{data.bound ? "已连接的抖音账号" : "从连接账号开始"}</small><strong>{data.bound ? data.account_profile.nickname || "抖音账号" : "把问候交给你自己的账号"}</strong><span>{data.bound ? data.account_profile.short_id ? `抖音号 ${data.account_profile.short_id}` : data.contacts_updated_at ? `已同步 ${data.contacts.length} 位联系人` : "账号已连接，等待同步好友" : "手机扫码 · 核对账号 · 同步好友"}</span></div>
      {!active ? <button className={`btn ${data.bound ? "btn-secondary" : "btn-primary"}`} disabled={Boolean(busy) || !data.credential_storage_ready || !data.worker.online} onClick={onStart}>{data.bound ? "重新扫码连接" : "扫码连接抖音"}</button> : null}
    </div>
    {showSession ? <div className="spark-login-session" aria-live="polite">
      <p>{labels[session.status] || session.reason}</p>
      {waiting ? <div className="spark-qr-area">
        {image?.version === version ? <img src={image.url} alt="抖音登录二维码" width="200" height="200" /> : <p>正在读取二维码…</p>}
        {imageError ? <p className="spark-meta">{imageError}</p> : null}
        <p className="spark-meta">二维码会随平台更新；失效时请重新获取。手机上打开本页时，可用另一块屏幕展示二维码。</p>
      </div> : null}
      {session.status === "awaiting_confirmation" ? <div className="spark-account-confirm">
        <strong>{detected.nickname || "已登录的抖音账号"}</strong>
        {detected.short_id ? <p>抖音号：{detected.short_id}</p> : null}
        <p>{detected.same_account ? "识别为原账号，将保留好友选择、时间与模板。同步并检查后，再恢复每日计划。" : data.bound ? "将更换账号，取消旧任务并清空旧好友选择；每日发送保持关闭。" : "确认后会读取联系人；每日发送保持关闭，选好朋友并检查后再开启。"}</p>
        {!session.identity_known ? <p className="spark-meta">尚未读取到可靠身份标识，请核对手机上实际登录的账号。好友名单将按新账号重新获取。</p> : null}
        <button className="btn btn-primary" disabled={Boolean(busy)} onClick={onConfirm}>确认连接此账号</button>
      </div> : null}
      {session.reason && !active ? <p className="spark-meta">{session.reason}</p> : null}
      {active ? <button className="text-button danger-text" disabled={Boolean(busy)} onClick={onCancel}>取消连接</button> : null}
    </div> : null}
    {!data.worker.online ? <p className="spark-meta">后台恢复在线后即可开始扫码连接。</p> : null}
  </div>;
}
