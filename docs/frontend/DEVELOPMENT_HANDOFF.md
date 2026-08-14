# Ying-Mo V3.2 前端开发交接

更新时间：2026-08-14  
当前阶段：第二十阶段“全功能回归与最终联调”完成，V3.2 计划内二十阶段全部结束  
下次起点：发布前人工浏览器验收（仅在具备浏览器控制运行环境时）或提交/部署准备

## 1. 使用说明

这份文件用于下一次开发直接续接当前进度，不需要依赖聊天历史。

开始工作前按以下顺序确认上下文：

1. 阅读本文件，确认当前阶段、工作区状态和下一项验收范围。
2. 阅读 `docs/frontend/INTEGRATION_BASELINE.md`，查看每个已完成阶段的实现和真实联调记录。
3. 继续遵守 `docs/product.md`、`docs/frontend/SKILL.md`、`docs/frontend/DESIGN.md` 和根 `README.md`。
4. 以后端当前代码和测试确认接口行为；产品规则冲突时以 `docs/product.md` 为准，接口行为以代码和测试为准。
5. 在现有 `frontend/` 上增量开发，不得删除重建、套模板或覆盖用户本地基线。

## 2. 当前代码基线

- 实际工作区：`/Users/hannn/Desktop/Ying-Mo-V3.2`
- Git 分支：`main`
- Git HEAD：`8273a531e55eda363f3b1164a08924c6a83f2aca`
- 业务与原后端基线：同上。
- 当前开发尚未提交，HEAD 没有随阶段开发移动。
- 工作区存在大量已修改和未跟踪文件，这是当前开发成果，不是可清理的临时内容。
- 尤其注意：`frontend/` 当前整体表现为未跟踪目录，同时原 `frontend/.gitkeep` 为删除状态；不得通过 reset、checkout、clean 或重新脚手架化来“恢复”。
- `backend/app/uploads/` 包含本轮需要保留的后端源码；不要把它当成运行时上传文件删除。
- 不得覆盖或回滚与当前任务无关的本地修改。

继续前建议只做只读检查：

```bash
cd /Users/hannn/Desktop/Ying-Mo-V3.2
git status --short
git rev-parse HEAD
```

## 3. 已完成范围

完整实现说明和逐阶段验证数据位于 `docs/frontend/INTEGRATION_BASELINE.md`。当前已完成以下二十阶段：

| 阶段 | 状态 | 已完成范围 |
| --- | --- | --- |
| 1. 前后端伴随契约 | 完成 | 媒体描述、作者管理媒体路径、媒体解绑、Category options、SPA Shell 等阻塞契约 |
| 2. Auth / Sessions / 受保护媒体 | 完成 | 内存 Access Token、Cookie Refresh、并发刷新、认证守卫、会话管理、Blob URL 生命周期 |
| 3. Post 作者管理 | 完成 | 我的草稿/发布/归档、编辑、发布、归档、删除、阅读、移出旧 Collection |
| 4. 写作与 Media | 完成 | Article/Note 全字段、图片、封面、Live Photo、上传绑定、作者管理媒体读取 |
| 5. Collection 管理 | 完成 | 创建、编辑、成员、封面、排序、移出 Post、Slug 锁定、删除、权限入口 |
| 6. Search | 完成 | Suggestions 防抖、键盘交互、分组结果、Post 分页、ACL Facet |
| 7. Category / Tag | 完成 | 列表、详情、计数、分页、导航和响应式入口 |
| 8. 用户主页 | 完成 | 公开资料、可见 Post/Collection、独立分页、隐私字段和 private Post 修复 |
| 9. 个人中心 | 完成 | 统一导航、概览、我的 Collection/收藏/评论/通知/设置、四类列表分页 |
| 10. Avatar | 完成 | 本地预览、上传、设置、替换、旧媒体解绑、移除和全局用户状态同步 |
| 11. 评论 | 完成 | 一级评论分页、发表评论、回复上下文、Unicode 上限、本人删除和删除占位 |
| 12. Like / Favorite | 完成 | 权威状态、点赞/收藏切换、独立反馈与无障碍、收藏就地取消、页码收敛和 ACL 联调 |
| 13. Notifications | 完成 | 目标点击已读、失败安全导航、七类通知、分页、计数同步、ACL 脱敏和禁发类型验证 |
| 14. Archive | 完成 | 年/月层级、URL 分页、页码收敛、语义时间、ACL Facet、响应式导航和多账号联调 |
| 15. Admin 基础、Dashboard / Users | 完成 | 管理导航、页面框架、状态和 reason 对话框、真实 Dashboard、用户搜索筛选分页和 ACL 边界 |
| 16. Admin Posts / Collections / Comments | 完成 | 三类内容检索、审计预览、hide/restore/delete、reason、分页收敛、终态边界与普通 ACL 联调 |
| 17. Admin Categories / Tags | 完成 | Category 创建编辑停用恢复、Tag 纠正停用恢复合并、Slug 锁定、前台状态收口与审计联调 |
| 18. Admin Media | 完成 | 逻辑媒体列表筛选、独立审计预览、普通 ACL 隔离、Live Photo 成组隐藏恢复软删除、终态与存储保留 |
| 19. Admin Featured / Settings / Notifications / Logs | 完成 | 精选生命周期与首页 ACL、设置 schema、全员/定向系统通知、结构化日志筛选与 before/after |
| 20. 全功能回归与最终联调 | 完成 | 路由级拆包与体积预算、全列表页码收敛、11 类核心流程与完整 Admin 多账号真实 HTTP 串行验收 |

当前前端已有的主要路由包括：

- 认证与成员入口：`/login`、`/register`、`/home`
- 内容：`/articles`、`/articles/:slug`、`/notes`、`/notes/:id`
- 写作与作者管理：`/write`、`/write/:postId`、`/me/posts`
- Collection：`/collections`、`/collections/new`、`/collections/:slug`、`/collections/:slug/manage`
- 发现：`/search`、`/archive`、`/categories`、`/categories/:slug`、`/tags`、`/tags/:slug`
- 用户与个人中心：`/users/:username`、`/me`、`/me/collections`、`/me/favorites`、`/me/comments`、`/me/notifications`、`/me/settings`、`/me/sessions`
- Admin：`/admin`、`/admin/users`、`/admin/posts`、`/admin/collections`、`/admin/comments`、`/admin/categories`、`/admin/tags`、`/admin/media`、`/admin/featured`、`/admin/settings`、`/admin/notifications`、`/admin/logs` 已完成。

## 4. 最近一次验证基线

第二十阶段结束时已实际执行：

```bash
cd /Users/hannn/Desktop/Ying-Mo-V3.2/frontend
npm run check

cd /Users/hannn/Desktop/Ying-Mo-V3.2/backend
.venv/bin/python -m pytest -q
.venv/bin/python scripts/verify_static.py

cd /Users/hannn/Desktop/Ying-Mo-V3.2
git diff --check
```

结果：

- 前端 Node 回归通过，共 14 项。
- Vite 生产构建通过，共转换 112 个模块；37 个页面异步入口，最大单页 5.51 KiB gzip，最重首次路由 88.73 KiB gzip，分别低于 150/300 KiB 产品预算。
- 后端测试通过，共 56 项。
- 静态文档与安全约束检查返回 `STATIC_VERIFY_OK`。
- `git diff --check` 通过。
- `backend/scripts/verify_full_http.py` 在 system_admin、creator、member、非成员四账号、隔离 SQLite、独立上传目录和 `18200` 临时端口上完整返回 `FULL_HTTP_VERIFY_OK`；Auth、Media、Post、Collection、Search、Taxonomy、个人中心、Interactions、Comments、Notifications、Archive、完整 Admin 和撤权 ACL 全部通过。
- 联调临时服务已停止，`/tmp/yingmo-stage20.*` 数据库和上传目录已删除，仓库开发数据库与上传目录未被使用或污染。
- 当前会话虽安装浏览器控制 Skill，但未暴露其必需的浏览器运行工具，因此浏览器点按、运行时 Console、视觉回归、浅色/深色主题和实际移动端视口仍明确未验证。

## 5. 当前已知未完成或部分完成项

V3.2 计划内功能和可自动执行的最终横向验收均已完成。唯一未完成项是受当前桌面运行环境限制的人工浏览器验证：

- 真实浏览器逐路由点按与前进/后退。
- DevTools Console 零错误确认。
- 浅色/深色主题视觉复核。
- `<768px` 实际移动端视口、触控目标和横向溢出检查。
- 键盘 Tab 顺序、对话框焦点陷阱/恢复和 reduced-motion 的运行时实测。

代码审查、CSS 媒体查询、焦点实现、生产构建、自动回归和真实 HTTP 均已验证；以上五项不得在没有浏览器运行工具时改写为已通过。

## 6. 后续开发顺序

二十个计划阶段已经全部结束，没有剩余业务开发阶段。后续只应按需执行：

1. 在具备浏览器控制运行工具的会话中补做第 5 节五项人工验收，发现问题才做最小修复。
2. 重新执行 `npm run check`、后端全量测试、静态验证、`git diff --check` 和隔离 HTTP 验收。
3. 由维护者确认工作区既有大量修改的提交边界，再进入提交、发布或部署流程；不要擅自清理或拆分用户成果。

## 7. 下一次开发的第一步

下一次不要重新开发第二十阶段。先检查是否具备浏览器控制运行工具：

1. 若具备，直接补做第 5 节的浏览器验收，重点查看 Console、主题、移动端和键盘/焦点；只修复实际发现的问题。
2. 若仍不具备，保持“环境限制未验证”结论，不用其他浏览器自动化框架绕过 Skill 约束。
3. 若用户要求发布，先确认当前未提交工作区的提交范围，再执行发布门禁；不得 reset、checkout、clean 或重建 `frontend/`。

## 8. 每阶段固定验证模板

前端：

```bash
cd /Users/hannn/Desktop/Ying-Mo-V3.2/frontend
npm run build
```

后端：

```bash
cd /Users/hannn/Desktop/Ying-Mo-V3.2/backend
.venv/bin/python -m pytest -q
.venv/bin/python scripts/verify_static.py
```

仓库检查：

```bash
cd /Users/hannn/Desktop/Ying-Mo-V3.2
git diff --check
git status --short
```

真实 HTTP 联调要求：

- 使用 `/tmp/yingmo-*.XXXXXX` 隔离目录、独立 SQLite 数据库和独立上传目录。
- 使用与开发服务不同的临时端口。
- 结束后停止临时服务。
- 记录真实状态码、分页总数、ACL 差异和关键响应字段。
- 没有完成的浏览器或外部环境验证必须明确标为未验证。

## 9. 持续约束

- 保持 React、JavaScript、Vite、React Router 和原生 fetch；不要引入 Axios、Redux 或大型 UI 框架。
- 所有 API 调用继续经过 `frontend/src/lib/api.js`。
- 不使用 Mock、假按钮、TODO、静态 JSON 页面或前端 ACL 绕过。
- 无权资源按后端 404 语义处理，避免泄漏 private 或 Collection 内容存在性。
- 媒体必须使用受保护接口；退出或会话失效后释放 Blob URL。
- 高风险操作必须确认；后端要求 reason 时必须收集并提交。
- 保持 kami / editorial paper 设计语言，并覆盖响应式、焦点和 reduced motion。
- 不把未执行的验证描述成“已通过”。
