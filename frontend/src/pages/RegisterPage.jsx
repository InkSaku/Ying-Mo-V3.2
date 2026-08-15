import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { AuthStory } from "../components/AuthStory";
import { PublicHeader } from "../components/PublicHeader";
import { useAuth } from "../contexts/AuthContext";
import { usePageMeta } from "../hooks/usePageMeta";
import { fieldErrorsFrom } from "../lib/api";
import { needsEmailVerification } from "../lib/accountSecurity";

const REGISTER_FEATURES = [
  { icon: "lock", title: "邀请加入", description: "仅限受邀成员" },
  { icon: "pen", title: "温柔书写", description: "留下真实表达" },
  { icon: "archive", title: "安静同伴", description: "与朋友共享空间" },
];

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
      const user = await register(form);
      navigate(needsEmailVerification(user) ? "/verify-email?registered=1" : "/home", { replace: true });
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
      <main className="auth-page auth-editorial-page">
        <div className="auth-editorial-layout auth-editorial-layout-register">
          <AuthStory
            step="02"
            eyebrow="邀请注册"
            title="成为映墨成员"
            description="映墨是为朋友们准备的私密书写空间，在这里，文字被认真对待，记忆被妥帖安放，思想得以缓慢生长。"
            quote="从一枚邀请码开始，认真记录生活与思绪。"
            features={REGISTER_FEATURES}
          />

          <form className="auth-card auth-card-wide auth-editorial-card auth-editorial-card-register" onSubmit={submit}>
            <header className="auth-card-intro">
              <p className="auth-badge">Invitation Only</p>
              <h1>成为映墨成员</h1>
              <p>用户名用于稳定地址，昵称用于页面展示，邀请码仅在注册时校验。</p>
            </header>

            {error ? <div className="inline-error" role="alert">{error}</div> : null}

            <div className="auth-register-grid">
              <label className="auth-field">
                <span>用户名</span>
                <input required minLength={3} maxLength={32} autoComplete="username" placeholder="例如 icesakura" value={form.username} onChange={set("username")} aria-invalid={Boolean(fieldErrors.username)} aria-describedby={fieldErrors.username ? "username-error" : "username-help"} />
                <small id="username-help">3-32 位，小写字母、数字、-、_。注册后不可修改。</small>
                {fieldErrors.username ? <small className="field-error" id="username-error">{fieldErrors.username}</small> : null}
              </label>

              <label className="auth-field">
                <span>昵称</span>
                <input required maxLength={50} autoComplete="nickname" placeholder="用于页面展示" value={form.nickname} onChange={set("nickname")} aria-invalid={Boolean(fieldErrors.nickname)} aria-describedby={fieldErrors.nickname ? "nickname-error" : "nickname-help"} />
                <small id="nickname-help">支持中文等 Unicode 字符，注册后可以修改。</small>
                {fieldErrors.nickname ? <small className="field-error" id="nickname-error">{fieldErrors.nickname}</small> : null}
              </label>

              <label className="auth-field">
                <span>邮箱</span>
                <input required type="email" autoComplete="email" placeholder="name@example.com" value={form.email} onChange={set("email")} aria-invalid={Boolean(fieldErrors.email)} aria-describedby={fieldErrors.email ? "email-error" : undefined} />
                {fieldErrors.email ? <small className="field-error" id="email-error">{fieldErrors.email}</small> : null}
              </label>

              <label className="auth-field">
                <span>密码</span>
                <input required type="password" minLength={8} maxLength={128} autoComplete="new-password" placeholder="至少 8 个字符" value={form.password} onChange={set("password")} aria-invalid={Boolean(fieldErrors.password)} aria-describedby={fieldErrors.password ? "password-error" : undefined} />
                {fieldErrors.password ? <small className="field-error" id="password-error">{fieldErrors.password}</small> : null}
              </label>
            </div>

            <label className="auth-field">
              <span>邀请码</span>
              <input required autoComplete="off" placeholder="请输入朋友给你的邀请码" value={form.invite_code} onChange={set("invite_code")} aria-invalid={Boolean(fieldErrors.invite_code)} aria-describedby={fieldErrors.invite_code ? "invite-error" : undefined} />
              {fieldErrors.invite_code ? <small className="field-error" id="invite-error">{fieldErrors.invite_code}</small> : null}
            </label>

            <button className="btn btn-primary btn-wide auth-primary-action" type="submit" disabled={busy}>
              {busy ? "正在注册" : "注册并发送验证邮件"}
            </button>

            <p className="auth-foot">已经是成员？<Link to="/login">直接登录</Link></p>
          </form>
        </div>
      </main>
    </>
  );
}
