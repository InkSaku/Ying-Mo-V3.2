import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { api } from "../lib/api";
import { useAsyncData } from "../hooks/useAsyncData";
import { usePageMeta } from "../hooks/usePageMeta";
import { EmptyState, ErrorState } from "../components/States";
import { Pagination } from "../components/Pagination";
import { AdminPageFrame, AdminStatus } from "../components/AdminPanel";
import { adminUserSearchParams, adminUsersApiPath, readAdminUserFilters } from "../lib/admin";
import { clampPageToTotal } from "../lib/pagination";
import { formatDate } from "../lib/format";

const PAGE_SIZE = 20;

export function AdminUsersPage() {
  usePageMeta("用户管理");
  const [params, setParams] = useSearchParams();
  const filters = readAdminUserFilters(params);
  const { q, status, role, page } = filters;
  const [searchValue, setSearchValue] = useState(q);
  const canonicalParams = adminUserSearchParams(filters).toString();
  const state = useAsyncData(() => api.get(adminUsersApiPath(filters, PAGE_SIZE)), [q, status, role, page]);
  const pagination = state.meta?.pagination || {};
  const clampedPage = clampPageToTotal(page, pagination.total || 0, pagination.page_size || PAGE_SIZE);
  const pageNeedsClamp = Boolean(state.data) && clampedPage !== page;

  useEffect(() => setSearchValue(q), [q]);
  useEffect(() => {
    if (params.toString() !== canonicalParams) setParams(canonicalParams, { replace: true });
  }, [canonicalParams, params, setParams]);
  useEffect(() => {
    if (pageNeedsClamp) {
      setParams(adminUserSearchParams({ q, status, role, page: clampedPage }), { replace: true });
    }
  }, [clampedPage, pageNeedsClamp, q, role, setParams, status]);

  const updateFilters = (updates) => {
    setParams(adminUserSearchParams({ ...filters, ...updates, page: updates.page || 1 }));
  };

  const submitSearch = (event) => {
    event.preventDefault();
    updateFilters({ q: searchValue.trim(), page: 1 });
  };

  return (
    <AdminPageFrame
      title="用户"
      description="查看成员基础资料和内容数量。V3.2 不提供发布资格、评论资格或日常账号停用开关。"
      busy={state.loading || pageNeedsClamp}
      actions={<span className="personal-page-total tabular">共 {pagination.total || 0} 人</span>}
    >
      <form className="admin-user-filters" role="search" onSubmit={submitSearch}>
        <label>
          <span>搜索用户</span>
          <input type="search" maxLength={100} value={searchValue} onChange={(event) => setSearchValue(event.target.value)} placeholder="username 或 nickname" />
        </label>
        <label>
          <span>角色</span>
          <select value={role} onChange={(event) => updateFilters({ role: event.target.value, page: 1 })}>
            <option value="">全部角色</option>
            <option value="user">普通成员</option>
            <option value="system_admin">系统管理员</option>
          </select>
        </label>
        <label>
          <span>状态</span>
          <select value={status} onChange={(event) => updateFilters({ status: event.target.value, page: 1 })}>
            <option value="">全部状态</option>
            <option value="active">正常</option>
            <option value="banned">已封禁</option>
            <option value="deactivated">已停用</option>
          </select>
        </label>
        <button className="btn btn-secondary" type="submit" disabled={state.loading}>搜索</button>
      </form>

      {state.loading && !state.data ? (
        <div className="skeleton-stack" role="status"><span className="sr-only">正在读取用户列表</span><div className="skeleton-block" /></div>
      ) : null}
      {state.error ? <ErrorState error={state.error} onRetry={state.reload} /> : null}
      {state.loading && state.data ? <div className="profile-refresh" role="status">正在更新用户列表…</div> : null}
      {pageNeedsClamp ? <div className="profile-refresh" role="status">正在返回有效页码…</div> : null}

      {state.data && !pageNeedsClamp ? (
        state.data.length ? (
          <div className="admin-user-list">
            {state.data.map((user) => (
              <article key={user.id} className="admin-user-row">
                <div className="admin-user-identity">
                  <div className="admin-user-title">
                    <h2>{user.nickname}</h2>
                    <span>@{user.username}</span>
                  </div>
                  <div className="admin-user-badges">
                    <AdminStatus value={user.role} />
                    <AdminStatus value={user.status} />
                  </div>
                  <a href={`mailto:${user.email}`}>{user.email}</a>
                  {user.bio ? <p>{user.bio}</p> : <p className="muted">未填写简介</p>}
                  {user.region ? <small>{user.region}</small> : null}
                </div>
                <dl className="admin-user-counts">
                  <div><dt>Post</dt><dd className="tabular">{user.post_count}</dd></div>
                  <div><dt>创建的 Collection</dt><dd className="tabular">{user.collection_count}</dd></div>
                </dl>
                <dl className="admin-user-times">
                  <div><dt>注册</dt><dd><time dateTime={user.created_at}>{formatDate(user.created_at, true)}</time></dd></div>
                  <div><dt>最近登录</dt><dd>{user.last_login_at ? <time dateTime={user.last_login_at}>{formatDate(user.last_login_at, true)}</time> : "尚无记录"}</dd></div>
                </dl>
              </article>
            ))}
          </div>
        ) : <EmptyState title="没有匹配的用户" description="调整关键词、角色或状态筛选后重试。" />
      ) : null}

      <Pagination
        page={pagination.page || page}
        totalPages={pagination.total_pages || 0}
        disabled={state.loading || pageNeedsClamp}
        onChange={(nextPage) => updateFilters({ page: nextPage })}
      />
    </AdminPageFrame>
  );
}
