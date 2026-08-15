import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { AccountSecurityLayout } from "../components/AccountSecurityLayout";
import { useAuth } from "../contexts/AuthContext";
import { usePageMeta } from "../hooks/usePageMeta";
import { api, fieldErrorsFrom } from "../lib/api";
import {
  accountActionMessage,
  clearSecurityTokenFragment,
  passwordResetConfirmPayload,
  passwordResetFieldErrors,
  securityTokenSnapshot,
} from "../lib/accountSecurity";

export function ResetPasswordPage() {
  usePageMeta("设置新密码");
  const { logout, endLocalSession } = useAuth();
  const [token, setToken] = useState(() => (
    typeof window === "undefined" ? "" : securityTokenSnapshot(window.location).token
  ));
  const [form, setForm] = useState({ password: "", confirmPassword: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [fieldErrors, setFieldErrors] = useState({});
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (typeof window !== "undefined") {
      clearSecurityTokenFragment(window.location, window.history);
    }
  }, []);

  const set = (key) => (event) => {
    setForm((current) => ({ ...current, [key]: event.target.value }));
    setFieldErrors((current) => ({ ...current, [key]: undefined }));
    setError("");
  };

  const submit = async (event) => {
    event.preventDefault();
    const localErrors = passwordResetFieldErrors(form);
    if (Object.keys(localErrors).length) {
      setFieldErrors(localErrors);
      setError("请检查新密码后再提交。");
      return;
    }
    setBusy(true);
    setError("");
    setFieldErrors({});
    try {
      const result = await api.authPost(
        "/auth/password-reset/confirm",
        passwordResetConfirmPayload(token, form.password),
      );
      try {
        await logout();
      } catch {
        endLocalSession();
      }
      setForm({ password: "", confirmPassword: "" });
      setToken("");
      setMessage(accountActionMessage(
        result.data,
        "密码已更新，当前设备中的登录状态已清除。请使用新密码重新登录。",
      ));
    } catch (confirmError) {
      const fields = fieldErrorsFrom(confirmError);
      setFieldErrors({
        password: fields.password || fields.new_password,
        confirmPassword: fields.confirm_password,
      });
      setError(confirmError.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <AccountSecurityLayout
      eyebrow="账户安全"
      title="设置新的登录密码"
      description="新密码保存成功后，当前页面会清除本地登录状态。其他已签发会话的撤销以后端结果为准。"
      aside={<p>请不要复用其他网站的密码，也不要把邮件中的重置链接转发给任何人。</p>}
    >
      <header className="auth-card-intro">
        <h2>{message ? "密码已更新" : "输入新密码"}</h2>
        <p>{message ? "现在可以回到登录页继续。" : "密码长度需为 8-128 个字符。"}</p>
      </header>

      {error ? <div className="inline-error" role="alert">{error}</div> : null}
      {message ? <div className="inline-success" role="status">{message}</div> : null}

      {!message ? (
        <form className="account-security-form" onSubmit={submit} aria-busy={busy || undefined}>
          <label className="auth-field">
            <span>新密码</span>
            <input
              required
              type="password"
              minLength={8}
              maxLength={128}
              autoComplete="new-password"
              value={form.password}
              aria-invalid={Boolean(fieldErrors.password)}
              aria-describedby={fieldErrors.password ? "new-password-error" : "new-password-help"}
              onChange={set("password")}
            />
            <small id="new-password-help">使用 8-128 个字符。</small>
            {fieldErrors.password ? <small className="field-error" id="new-password-error">{fieldErrors.password}</small> : null}
          </label>
          <label className="auth-field">
            <span>确认新密码</span>
            <input
              required
              type="password"
              minLength={8}
              maxLength={128}
              autoComplete="new-password"
              value={form.confirmPassword}
              aria-invalid={Boolean(fieldErrors.confirmPassword)}
              aria-describedby={fieldErrors.confirmPassword ? "confirm-password-error" : "confirm-password-help"}
              onChange={set("confirmPassword")}
            />
            <small id="confirm-password-help">再次输入，避免拼写错误。</small>
            {fieldErrors.confirmPassword ? <small className="field-error" id="confirm-password-error">{fieldErrors.confirmPassword}</small> : null}
          </label>
          <button className="btn btn-primary btn-wide" type="submit" disabled={busy || !token}>
            {busy ? "正在更新密码" : "保存新密码"}
          </button>
          {!token ? <div className="inline-error" role="alert">重置链接缺少安全令牌，请重新申请。</div> : null}
        </form>
      ) : (
        <Link className="btn btn-primary btn-wide" to="/login">使用新密码登录</Link>
      )}

      <div className="account-security-links">
        <Link to="/forgot-password">重新申请重置邮件</Link>
        <Link to="/login">返回登录</Link>
      </div>
    </AccountSecurityLayout>
  );
}
