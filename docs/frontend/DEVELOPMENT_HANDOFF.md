# Ying-Mo V3.2 前端开发交接

更新时间：2026-08-21

当前阶段：第二十一至第二十七阶段均已在未提交工作区实现；最新完成“相关阅读增强”

下次起点：阶段 27 已完成登录态视觉与完整 HTTP 验收，可进入提交部署准备

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
- Git HEAD：`4d206aa9991f52698a04f56bb38bbeb574eb8d59`
- 业务与原后端基线：同上。
- 当前开发尚未提交，HEAD 没有随阶段开发移动。
- 工作区存在大量已修改和未跟踪文件，这是当前开发成果，不是可清理的临时内容。
- 阶段 21–27 与此前成果均在当前未提交修改中；不得通过 reset、checkout、clean 或重新脚手架化来“恢复”。
- `backend/app/uploads/` 包含本轮需要保留的后端源码；不要把它当成运行时上传文件删除。
- 不得覆盖或回滚与当前任务无关的本地修改。

继续前建议只做只读检查：

```bash
cd /Users/hannn/Desktop/Ying-Mo-V3.2
git status --short
git rev-parse HEAD
```

## 3. 已完成范围

完整实现说明和逐阶段验证数据位于 `docs/frontend/INTEGRATION_BASELINE.md`。当前已完成以下二十六阶段：

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
| 21. 创作与长文阅读增强 | 完成 | Markdown 快捷操作与表格、草稿自动保存/版本冲突、脚注、数学公式、Article 目录/阅读进度/语法高亮 |
| 22. 邮箱可信与账号恢复闭环 | 实现与自动化完成；浏览器环境阻断 | 邮箱验证、密码重置、防枚举、令牌单次消费、会话撤销、日志脱敏、跨标签页退出、邮件适配器与三个公开账户页面 |
| 23. 内容浏览完整化 | 完成 | Article/Note 组合筛选、信息卡片、详情元信息、Note 自动缩略图与 Archive 查询器 |
| 24. 内容版本历史与恢复 | 完成 | 作者专属 Revision 时间线、安全历史预览、并发保护、恢复前留版与失效关联降级 |
| 25. 往年今日 | 完成 | semantic time 同日查询、ACL 年份聚合、首页预览、独立分页页面、年份分组与响应式空状态 |
| 26. Explore 朋友内容漫游 | 完成 | 稳定随机 Article/Note、ACL 精选合集、往年今日、Tag 漫游、最近成员、换一批和响应式区块 |
| 27. 相关阅读增强 | 完成 | Article 详情最多 4 篇 ACL 安全静态关联、明确原因、响应式卡片，不足不补 |

当前前端已有的主要路由包括：

- 认证与成员入口：`/login`、`/register`、`/forgot-password`、`/verify-email`、`/reset-password`、`/home`
- 内容：`/articles`、`/articles/:slug`、`/notes`、`/notes/:id`
- 写作与作者管理：`/write`、`/write/:postId`、`/me/posts`
- Collection：`/collections`、`/collections/new`、`/collections/:slug`、`/collections/:slug/manage`
- 发现：`/search`、`/archive`、`/on-this-day`、`/explore`、`/categories`、`/categories/:slug`、`/tags`、`/tags/:slug`
- 用户与个人中心：`/users/:username`、`/me`、`/me/collections`、`/me/favorites`、`/me/comments`、`/me/notifications`、`/me/settings`、`/me/sessions`
- Admin：`/admin`、`/admin/users`、`/admin/posts`、`/admin/collections`、`/admin/comments`、`/admin/categories`、`/admin/tags`、`/admin/media`、`/admin/featured`、`/admin/settings`、`/admin/notifications`、`/admin/logs` 已完成。

## 4. 最近一次验证基线

阶段 27 收口时的当前权威门禁为：

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

- `npm run check` 中 ESLint、前端 Node 回归 `67/67`、Vite 生产构建和包体预算全部通过。
- 后端测试 `102/102` 通过，Alembic head 为 `20260821_0006`。
- 静态文档与安全约束检查返回 `STATIC_VERIFY_OK`。
- `git diff --check` 通过。
- 阶段 20 的全模块真实 HTTP 脚本仍保持 `FULL_HTTP_VERIFY_OK` 历史记录；阶段 21 各创作/阅读工作流已有隔离浏览器联调记录。
- 阶段 22 的三个公开账户页面、URL fragment 清理、浅/深色、移动视口和 Console 验收已按 Browser Skill 实际尝试；当前桌面安全策略拒绝本地 HTTP 导航，隔离服务启动权限也不可用。未绕过、未记为通过。

## 5. 当前已知未完成或部分完成项

阶段 21–27 的代码和自动化门禁已完成。当前仍需补齐或在部署环境执行：

- 阶段 22 真实浏览器页面状态、Hash 清理、前进/后退、Console、浅/深色和移动端视觉验收：当前桌面本地导航安全策略与服务启动权限阻断；需在允许本地页面访问的环境补跑。
- 真实 SMTP/STARTTLS、实际投递/退信与 SPF/DKIM/DMARC/DNS 尚未验证。
- 真实 MySQL 8 migration、真实 S3 I/O 和真实 Redis 分布式限流仍需在目标基础设施补跑。
- Explore、阅读统计、Revision、往年今日与静态相关阅读已完成；阶段 27 隔离浏览器和完整 HTTP 回归已通过，相关阅读不扩展为推荐算法、热门流或个性化 Feed。

代码审查、生产构建和自动回归已验证；上述浏览器或外部基础设施项目在得到真实结果前不得改写为已通过。

## 6. 后续开发顺序

阶段 21–27 收口后的建议顺序：

1. 若具备允许本地页面导航的 Browser 环境，补做阶段 22 运行验收并把真实结果回填到本文件与 `INTEGRATION_BASELINE.md`。
2. 重新执行 `npm run check`、后端全量测试、静态验证、`git diff --check` 和隔离 HTTP 验收。
3. 若继续产品开发，先由维护者确定新的 P1 范围；阶段 27 不继续扩张为推荐算法、热门排序或个性化 Feed。
4. 由维护者确认工作区既有大量修改的提交边界，再进入提交、发布或部署流程；不要擅自清理或拆分用户成果。

## 7. 下一次开发的第一步

下一次不要重新开发阶段 21–27。先读取当前工作区和浏览器验收记录：

1. 若运行环境已解除阶段 22 的浏览器策略阻断，直接完成第 5 节验收并只修复实际发现的问题。
2. 若浏览器验收已回填，先重新跑权威门禁，再按产品优先级进入下一项完整 P1 大阶段。
3. 若用户要求发布，先确认当前未提交工作区的提交范围与外部基础设施门禁；不得 reset、checkout、clean 或重建 `frontend/`。

## 8. 每阶段固定验证模板

前端：

```bash
cd /Users/hannn/Desktop/Ying-Mo-V3.2/frontend
npm run check
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
