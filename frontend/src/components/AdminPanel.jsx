import { useId } from "react";
import { NavLink } from "react-router-dom";
import { ConfirmDialog } from "./ConfirmDialog";
import { adminLabels } from "../lib/admin";

const adminNavItems = [
  ["/admin", "Dashboard", true],
  ["/admin/users", "用户", false],
  ["/admin/posts", "Post", false],
  ["/admin/collections", "Collection", false],
  ["/admin/comments", "评论", false],
  ["/admin/categories", "Category", false],
  ["/admin/tags", "Tag", false],
  ["/admin/media", "媒体", false],
  ["/admin/featured", "精选", false],
  ["/admin/settings", "站点设置", false],
  ["/admin/notifications", "系统通知", false],
  ["/admin/logs", "操作日志", false],
];

export function AdminNav() {
  return (
    <nav className="admin-nav" aria-label="后台导航">
      {adminNavItems.map(([to, label, end]) => (
        <NavLink key={to} to={to} end={end} className={({ isActive }) => isActive ? "active" : ""}>
          {label}
        </NavLink>
      ))}
    </nav>
  );
}

export function AdminPageFrame({ title, description, actions, busy = false, children }) {
  return (
    <main className="page-shell admin-page" aria-busy={busy || undefined}>
      <AdminNav />
      <header className="page-heading admin-heading">
        <div>
          <p className="hero-kicker">System administration</p>
          <h1>{title}</h1>
          {description ? <p>{description}</p> : null}
        </div>
        {actions ? <div className="admin-heading-actions">{actions}</div> : null}
      </header>
      {children}
    </main>
  );
}

export function AdminStatus({ value }) {
  return <span className={`admin-status admin-status-${value}`}>{adminLabels[value] || value}</span>;
}

export function AdminActionDialog({
  open,
  title,
  description,
  confirmLabel,
  reason,
  busy,
  error,
  onReasonChange,
  onConfirm,
  onClose,
  confirmDisabled = false,
  children,
}) {
  const reasonHelpId = useId();
  return (
    <ConfirmDialog
      open={open}
      title={title}
      description={description}
      confirmLabel={confirmLabel}
      danger
      busy={busy}
      confirmDisabled={!reason?.trim() || confirmDisabled}
      onConfirm={onConfirm}
      onClose={onClose}
    >
      {children}
      <label>
        <span>操作原因</span>
        <textarea
          data-autofocus
          required
          maxLength={500}
          rows={4}
          value={reason}
          disabled={busy}
          onChange={(event) => onReasonChange(event.target.value)}
          aria-describedby={reasonHelpId}
        />
        <small id={reasonHelpId}>必填，最多 500 字；后端会将原因写入操作日志。</small>
      </label>
      {error ? <div className="inline-error" role="alert">{error}</div> : null}
    </ConfirmDialog>
  );
}
