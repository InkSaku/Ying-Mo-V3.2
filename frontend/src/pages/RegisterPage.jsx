import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { PublicHeader } from "../components/PublicHeader";
import { useAuth } from "../contexts/AuthContext";
import { usePageMeta } from "../hooks/usePageMeta";
import { fieldErrorsFrom } from "../lib/api";

export function RegisterPage() {
  usePageMeta("注册");
  const { register } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({
    username: "", nickname: "", email: "", password: "", invite_code: "",
  });
  const [error, setError] = useState("");
  const [fieldErrors, setFieldErrors] = useState({});
  const [busy, setBusy] = useState(false);

  const set = (key) => (event) => {
    setForm((current) => ({ ...current, [key]: event.target.value }));
    setFieldErrors((current) => ({ ...current, [key]: undefined }));
  };

  const submit = async (event) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    setFieldErrors({});
    try {
      await register(form);
      navigate("/home", { replace: true });
    } catch (err) {
      setError(err.message);
      setFieldErrors(fieldErrorsFrom(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <PublicHeader />
      <main className="auth-page">
        <form className="auth-card auth-card-wide" onSubmit={submit}>
          <div>
            <p className="hero-kicker">邀请注册</p>
            <h1>成为映墨成员</h1>
            <p>用户名用于稳定地址，昵称用于页面展示。邀请码仅在注册时校验。</p>
          </div>
          {error ? <div className="inline-error" role="alert">{error}</div> : null}
          <div className="form-grid">
            <label>
              <span>用户名</span>
              <input required minLength={3} maxLength={32} autoComplete="username" value={form.username} onChange={set("username")} aria-invalid={Boolean(fieldErrors.username)} aria-describedby={fieldErrors.username ? "username-error" : "username-help"} />
              <small id="username-help">3-32 位，小写字母、数字、-、_。</small>
              {fieldErrors.username ? <small className="field-error" id="username-error">{fieldErrors.username}</small> : null}
            </label>
            <label>
              <span>昵称</span>
              <input required maxLength={50} autoComplete="nickname" value={form.nickname} onChange={set("nickname")} aria-invalid={Boolean(fieldErrors.nickname)} aria-describedby={fieldErrors.nickname ? "nickname-error" : undefined} />
              {fieldErrors.nickname ? <small className="field-error" id="nickname-error">{fieldErrors.nickname}</small> : null}
            </label>
            <label>
              <span>邮箱</span>
              <input required type="email" autoComplete="email" value={form.email} onChange={set("email")} aria-invalid={Boolean(fieldErrors.email)} aria-describedby={fieldErrors.email ? "email-error" : undefined} />
              {fieldErrors.email ? <small className="field-error" id="email-error">{fieldErrors.email}</small> : null}
            </label>
            <label>
              <span>密码</span>
              <input required type="password" minLength={8} maxLength={128} autoComplete="new-password" value={form.password} onChange={set("password")} aria-invalid={Boolean(fieldErrors.password)} aria-describedby={fieldErrors.password ? "password-error" : undefined} />
              {fieldErrors.password ? <small className="field-error" id="password-error">{fieldErrors.password}</small> : null}
            </label>
          </div>
          <label>
            <span>邀请码</span>
            <input required autoComplete="off" value={form.invite_code} onChange={set("invite_code")} aria-invalid={Boolean(fieldErrors.invite_code)} aria-describedby={fieldErrors.invite_code ? "invite-error" : undefined} />
            {fieldErrors.invite_code ? <small className="field-error" id="invite-error">{fieldErrors.invite_code}</small> : null}
          </label>
          <button className="btn btn-primary btn-wide" type="submit" disabled={busy}>
            {busy ? "正在注册" : "注册并进入"}
          </button>
          <p className="auth-foot">已经是成员？<Link to="/login">直接登录</Link></p>
        </form>
      </main>
    </>
  );
}
