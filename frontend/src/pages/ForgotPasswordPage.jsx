import { useState } from "react";
import { Link } from "react-router-dom";
import { AccountSecurityLayout } from "../components/AccountSecurityLayout";
import { usePageMeta } from "../hooks/usePageMeta";
import { api, fieldErrorsFrom } from "../lib/api";
import { passwordResetRequestPayload } from "../lib/accountSecurity";

const SAFE_SUCCESS_MESSAGE = "如果该邮箱对应可找回的账号，你会收到重置邮件。请检查收件箱和垃圾邮件。";

export function ForgotPasswordPage() {
  usePageMeta("找回密码");
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [fieldError, setFieldError] = useState("");
  const [message, setMessage] = useState("");

  const submit = async (event) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    setFieldError("");
    setMessage("");
    try {
      await api.authPost(
        "/auth/password-reset/request",
        passwordResetRequestPayload(email),
      );
      setMessage(SAFE_SUCCESS_MESSAGE);
    } catch (requestError) {
      const fields = fieldErrorsFrom(requestError);
      setFieldError(fields.email || "");
      setError(requestError.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <AccountSecurityLayout
      eyebrow="账户安全"
      title="找回密码"
      description="输入注册邮箱，获取密码重置链接。"
      aside={<p>请在邮件标注的有效期内使用重置链接，链接只能使用一次。</p>}
    >
      <header className="auth-card-intro">
        <h2>发送重置邮件</h2>
        <p>收到邮件后，使用其中的安全链接设置新密码。</p>
      </header>

      {error ? <div className="inline-error" role="alert">{error}</div> : null}
      {message ? <div className="inline-success" role="status">{message}</div> : null}

      <form className="account-security-form" onSubmit={submit} aria-busy={busy || undefined}>
        <label className="auth-field">
          <span>注册邮箱</span>
          <input
            required
            type="email"
            autoComplete="email"
            inputMode="email"
            maxLength={254}
            value={email}
            aria-invalid={Boolean(fieldError)}
            aria-describedby={fieldError ? "password-reset-email-error" : "password-reset-email-help"}
            onChange={(event) => {
              setEmail(event.target.value);
              setError("");
              setFieldError("");
              setMessage("");
            }}
          />
          <small id="password-reset-email-help">请输入创建映墨账号时使用的邮箱。</small>
          {fieldError ? <small className="field-error" id="password-reset-email-error">{fieldError}</small> : null}
        </label>
        <button className="btn btn-primary btn-wide" type="submit" disabled={busy || !email.trim()}>
          {busy ? "正在发送" : message ? "再次发送" : "发送重置邮件"}
        </button>
      </form>

      <div className="account-security-links">
        <Link to="/login">返回登录</Link>
        <Link to="/register">使用邀请码注册</Link>
      </div>
    </AccountSecurityLayout>
  );
}
