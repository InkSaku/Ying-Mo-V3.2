import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { AccountSecurityLayout } from "../components/AccountSecurityLayout";
import { PageLoader } from "../components/States";
import { useAuth } from "../contexts/AuthContext";
import { usePageMeta } from "../hooks/usePageMeta";
import { api } from "../lib/api";
import {
  accountActionMessage,
  clearSecurityTokenFragment,
  emailVerificationConfirmPayload,
  emailVerificationState,
  securityTokenSnapshot,
} from "../lib/accountSecurity";

export function VerifyEmailPage() {
  usePageMeta("验证邮箱");
  const [params] = useSearchParams();
  const { status, user, refreshMe } = useAuth();
  const [token, setToken] = useState(() => (
    typeof window === "undefined" ? "" : securityTokenSnapshot(window.location).token
  ));
  const [confirmationMode] = useState(() => (
    typeof window === "undefined" ? false : Boolean(securityTokenSnapshot(window.location).token)
  ));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const verificationState = emailVerificationState(user);

  useEffect(() => {
    if (typeof window !== "undefined") {
      clearSecurityTokenFragment(window.location, window.history);
    }
  }, []);

  const confirmEmail = async () => {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const result = await api.authPost(
        "/auth/email-verification/confirm",
        emailVerificationConfirmPayload(token),
      );
      if (status === "authenticated") {
        try {
          await refreshMe();
        } catch {
          // 验证动作已经成功，账户信息会在下一次会话恢复时同步。
        }
      }
      setConfirmed(true);
      setToken("");
      setMessage(accountActionMessage(result.data, "邮箱已验证，可以继续使用映墨。"));
    } catch (confirmError) {
      setError(confirmError.message);
    } finally {
      setBusy(false);
    }
  };

  const resend = async () => {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const result = await api.post("/auth/email-verification/request", {});
      setMessage(accountActionMessage(
        result.data,
        "验证邮件已发送。请检查收件箱和垃圾邮件。",
      ));
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setBusy(false);
    }
  };

  if (!token && status === "loading") return <PageLoader label="正在确认邮箱状态" />;

  const registered = params.get("registered") === "1";
  const verified = confirmed || (!confirmationMode && verificationState === "verified");

  return (
    <AccountSecurityLayout
      eyebrow="账户安全"
      title={confirmationMode ? "确认你的邮箱" : "邮箱验证状态"}
      description={confirmationMode
        ? "确认后，这个邮箱会成为当前账号的已验证联系方式。"
        : "验证邮箱可用于安全找回密码，并帮助你确认账户联系方式。"}
      aside={<p>验证链接包含一次性令牌。不要把完整链接发送给其他人。</p>}
    >
      <header className="auth-card-intro">
        <h2>{verified ? "邮箱已验证" : confirmationMode ? "完成邮箱确认" : registered ? "账号已创建" : "检查验证状态"}</h2>
        <p>
          {verified
            ? "当前邮箱已经完成验证。"
            : confirmationMode
              ? "点击下方按钮完成确认。"
              : registered
                ? "请验证注册邮箱。没有收到邮件时可以在这里重发。"
                : "登录后可以查看状态或重新发送验证邮件。"}
        </p>
      </header>

      {error ? <div className="inline-error" role="alert">{error}</div> : null}
      {message ? <div className="inline-success" role="status">{message}</div> : null}

      {confirmationMode ? (
        <div className="account-security-actions" aria-busy={busy || undefined}>
          {!verified ? (
            <button className="btn btn-primary btn-wide" type="button" disabled={busy || !token} onClick={confirmEmail}>
              {busy ? "正在确认邮箱" : "确认邮箱"}
            </button>
          ) : null}
          <Link className={verified ? "btn btn-primary btn-wide" : "btn btn-secondary btn-wide"} to={status === "authenticated" ? "/home" : "/login"}>
            {status === "authenticated" ? "返回成员首页" : "前往登录"}
          </Link>
        </div>
      ) : status !== "authenticated" ? (
        <div className="account-security-actions">
          <Link className="btn btn-primary btn-wide" to="/login?next=%2Fverify-email">登录并查看状态</Link>
          <Link className="btn btn-secondary btn-wide" to="/register">使用邀请码注册</Link>
        </div>
      ) : (
        <div className="account-security-status" aria-busy={busy || undefined}>
          <dl>
            <div><dt>邮箱</dt><dd>{user.email}</dd></div>
            <div><dt>状态</dt><dd><span className={`verification-badge is-${verificationState}`}>{verified ? "已验证" : "待验证"}</span></dd></div>
          </dl>
          {!verified ? (
            <button className="btn btn-primary btn-wide" type="button" disabled={busy} onClick={resend}>
              {busy ? "正在发送验证邮件" : message ? "再次发送验证邮件" : "发送验证邮件"}
            </button>
          ) : null}
          <Link className="btn btn-secondary btn-wide" to="/me/settings">返回个人资料</Link>
        </div>
      )}
    </AccountSecurityLayout>
  );
}
