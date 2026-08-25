# Ying-Mo 前端开发交接

更新时间：2026-08-25

当前阶段：第二十一至第二十七阶段、V3.3–V3.9 Note 阶段一至阶段六、媒体记忆增强均已实现；Note 阶段六已让 ACL 安全的“往年今日”以单次、可去重的轻量插页进入首页连续阅读流

下次起点：Note 阶段六已完成代码、自动化与真实浏览器验收；后续增量不得恢复平行首页模块，也不得把日历回忆或 Collection 关系扩张为推荐流

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
- Git HEAD：`cee991114036dac926d8c073359a94ec5d86a6c5`。
- V3.3 Collection 时间轴与 V3.4 自动加入、通知感知已提交于 `cee9911`；当前未提交工作区包含后续长期保存、V3.7 轻量互动与媒体记忆开发成果。
- 这些修改和新增文件不是可清理的临时内容，不得通过 reset、checkout、clean 或重新脚手架化来“恢复”。
- `backend/app/uploads/` 包含本轮需要保留的后端源码；不要把它当成运行时上传文件删除。
- 不得覆盖或回滚与当前任务无关的本地修改。

继续前建议只做只读检查：

```bash
cd /Users/hannn/Desktop/Ying-Mo-V3.2
git status --short
git rev-parse HEAD
```

## 3. 已完成范围

完整实现说明和逐阶段验证数据位于 `docs/frontend/INTEGRATION_BASELINE.md`。当前已完成以下阶段：

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
| V3.3. Collection 时间轴与共同回忆 | 完成 | 语义时间轴、年份/作者/类型筛选、共同影像墙、Creator 最多 6 条关键记录与成员移除 ACL |
| V3.4. 未来成员自动加入 | 完成 | 创建/管理开关、注册事务自动入组、成员来源、通知、统一读写 ACL 与安全关闭语义 |
| V3.4. 全局通知感知增强 | 完成 | 桌面/移动未读角标、轻量计数、焦点与 60 秒刷新、会话内 Toast、未读视觉层级与菜单收起 |
| V3.5. Collection Creator 转让 | 完成 | active member 候选、原子权属交换、旧创建者保留读写、双向通知、结构化审计与二次确认 |
| V3.7. 轻量互动 | 完成 | 六种 Post/评论回应、扁平引用回复、结构化提及、通知摘要/评论深链、评论和回应乐观更新、失权 404 |
| 媒体记忆与沉浸灯箱 | 完成 | 多入口全局灯箱、逻辑 Live Photo、Collection 年份/成员/类型筛选、分页序列、深链接刷新、缩放/滑动/焦点、ACL 404 |
| V3.8. 可安装 PWA | 完成 | 独立窗口、桌面/主屏幕图标、三个应用快捷入口、设置页跨浏览器安装引导、可控更新提示与 API/私有媒体缓存排除 |
| V3.9. Note 阶段一 | 完成 | 首页 Quick Note Composer、默认 private、显式受众、本地恢复、图片草稿、地点/心情/发生时间渐进展开、原地发布与完整编辑器接续 |
| V3.9. Note 阶段二 | 完成 | Article / Note 混合单列 Feed、签名游标、URL 类型筛选、近视口补页、内存页面缓存、新发布置顶与详情返回滚动恢复 |
| V3.9. Note 阶段三 | 完成 | 独立 Article / Note Feed 与浏览卡片、共享作者/媒体骨架、Note 正文优先、Article 阅读导向、ACL 安全内容预览 |
| V3.9. Note 阶段四 | 完成 | 详情返回内容锚点、筛选独立位置、未缓存筛选回到 Feed 起点、新内容插入不打断深度阅读、数值坐标兜底 |
| V3.9. Note 阶段五 | 完成 | Note 正文优先详情、作者与生活时间开场、影像后置、Collection 邻近 Article/Note 共同经历链、ACL 安全关系数据 |
| V3.9. Note 阶段六 | 完成 | “往年今日”低频穿插 `all` Feed、签名游标跨页去重、类型筛选隔离、详情返回连续性与轻量响应式展示 |

当前前端已有的主要路由包括：

- 认证与成员入口：`/login`、`/register`、`/forgot-password`、`/verify-email`、`/reset-password`、`/home`
- 内容：`/articles`、`/articles/:slug`、`/notes`、`/notes/:id`
- 写作与作者管理：`/write`、`/write/:postId`、`/me/posts`
- Collection：`/collections`、`/collections/new`、`/collections/:slug`、`/collections/:slug/manage`
- 发现：`/search`、`/archive`、`/on-this-day`、`/explore`、`/categories`、`/categories/:slug`、`/tags`、`/tags/:slug`
- 用户与个人中心：`/users/:username`、`/me`、`/me/collections`、`/me/favorites`、`/me/comments`、`/me/notifications`、`/me/settings`、`/me/sessions`
- Admin：`/admin`、`/admin/users`、`/admin/posts`、`/admin/collections`、`/admin/comments`、`/admin/categories`、`/admin/tags`、`/admin/media`、`/admin/featured`、`/admin/settings`、`/admin/notifications`、`/admin/logs` 已完成。

## 4. 最近一次验证基线

V3.9 Note 阶段六收口时的当前权威门禁为：

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

- `npm run check` 中 ESLint、前端 Node 回归 `110/110`、Vite 生产构建和包体预算全部通过；HomePage 页面块为 `8.64 KiB gzip`。
- 后端全量测试 `128/128` 通过，Alembic head 仍为 `20260825_0011`；本阶段扩展既有 Home Feed 响应与签名游标，不新增端点、依赖或迁移。
- 静态文档与安全约束检查返回 `STATIC_VERIFY_OK`。
- `git diff --check` 通过。
- 阶段 20 的全模块真实 HTTP 脚本仍保持 `FULL_HTTP_VERIFY_OK` 历史记录；阶段 21 各创作/阅读工作流已有隔离浏览器联调记录。
- 阶段 22 的三个公开账户页面、URL fragment 清理、浅/深色、移动视口和 Console 验收已按 Browser Skill 实际尝试；当前桌面安全策略拒绝本地 HTTP 导航，隔离服务启动权限也不可用。未绕过、未记为通过。
- V3.4 通知感知已在隔离数据环境完成桌面和 390px 浏览器验收；验收中发现并修复移动菜单跳转后未收起的问题。
- V3.5 Creator 转让已在隔离数据环境完成桌面和 390px、浅深色、候选筛选、二次确认及真实转让验收；旧 creator 保留投稿入口，新 creator 获得管理入口与未读通知，Console 无错误。
- V3.7 轻量互动已在隔离环境完成回应、引用、提及候选、通知摘要/深链和 390×844 实测；页面无横向溢出，评论焦点准确，Console 无错误或警告。
- 媒体记忆已在隔离环境完成 Post、Collection、Live Photo、筛选相册、深链接刷新、键盘切换、缩放和 390×844 实测；无权限只显示通用错误，Console 无错误或警告。
- V3.9 Note 阶段一已在真实登录态完成桌面与 390×844 浏览器验收：文字本地恢复、private 文字发布、图片上传与纯图片发布、发布后原地回显、无横向溢出，Console 无错误或警告；验收产生的两条私密测试 Note 与测试图片已精确清理。
- V3.9 Note 阶段二已在真实登录态完成桌面、深色与 390×844 浏览器验收：混合时间流、类型筛选及 URL、近视口补页、详情返回入口、阅读坐标恢复、PWA Composer 聚焦和移动端无横向溢出均通过，Console 无错误或警告；本阶段浏览器验收未创建测试内容。
- V3.9 Note 阶段四已在真实登录态完成桌面与 390×844 浏览器验收：详情返回保持同一 Post，全部 / 随记筛选分别恢复点击发生时的内容锚点；移动端 `innerWidth/bodyWidth=390/390`，无横向溢出，Console 无错误或警告。本阶段未创建、修改或删除内容数据。
- V3.9 Note 阶段五已在真实登录态完成桌面、390×844、浅色与深色浏览器验收：无标题 Note 不显示伪标题，正文先于影像与管理上下文；共同经历实际混排 2 篇 Article 与 2 条 Note，内容与 Collection 跳转有效。移动端 `innerWidth/bodyWidth/noteWidth=390/390/358`，Console 无错误或警告。本阶段未创建、修改或删除内容数据。
- V3.9 Note 阶段六已在真实登录态完成桌面深色与 390×844 浏览器验收：回忆只在 `all` 第三条当前内容之后出现一次，`note` 筛选中不出现；进入回忆 Note 详情并返回后仍停在插页附近。验收创建的精确标记私密旧日 Note 已通过作者删除流程软删除。

## 5. 当前已知未完成或部分完成项

阶段 21–27 的代码和自动化门禁已完成。当前仍需补齐或在部署环境执行：

- 阶段 22 真实浏览器页面状态、Hash 清理、前进/后退、Console、浅/深色和移动端视觉验收：当前桌面本地导航安全策略与服务启动权限阻断；需在允许本地页面访问的环境补跑。
- 真实 SMTP/STARTTLS、实际投递/退信与 SPF/DKIM/DMARC/DNS 尚未验证。
- 当前数据库已升级到媒体记忆 `20260825_0011`；完整发布演练、真实 S3 I/O 和真实 Redis 分布式限流仍需在目标基础设施补跑。
- Explore、阅读统计、Revision、往年今日与静态相关阅读已完成；阶段 27 隔离浏览器和完整 HTTP 回归已通过，相关阅读不扩展为推荐算法、热门流或个性化 Feed。

代码审查、生产构建和自动回归已验证；上述浏览器或外部基础设施项目在得到真实结果前不得改写为已通过。

## 6. 后续开发顺序

V3.9 Note 阶段六收口后的建议顺序：

1. 先由维护者确定 Note 下一阶段范围；首页继续保持内容优先的单列 Feed，不恢复“精选文章 / 最近随记 / 我的合集”等平行模块，也不增加第二种回忆插入机制。
2. 若继续增强 Note，优先补真实互动摘要或明确关系节点；共同经历只使用 Collection 权属与语义时间，回忆只使用日历同日，不扩展成推荐算法、热门流或隐式画像。
3. 重新执行 `npm run check`、后端全量测试、静态验证、`git diff --check` 和隔离 HTTP 验收。
4. 由维护者确认工作区既有大量修改的提交边界，再进入提交、发布或部署流程；不要擅自清理或拆分用户成果。

## 7. 下一次开发的第一步

下一次不要重新开发阶段 21–27、V3.3–V3.8 或 Note 阶段一至阶段六。先读取当前工作区和浏览器验收记录：

1. 先确认 Note 下一阶段的产品目标，再从现有 `/api/v1/home/feed`、Quick Note、类型组件、锚点连续性和共同经历契约增量开发。
2. 若调整 Feed 卡片，必须继续保持作者、时间、正文或标题、首张媒体、最多一个 Collection / 地点上下文和“查看与回应”的当前信息层级。
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
- 媒体必须使用受保护接口；只允许短时相邻图预加载，退出、切换账号或会话失效后释放全部 Blob URL。
- 高风险操作必须确认；后端要求 reason 时必须收集并提交。
- 保持 kami / editorial paper 设计语言，并覆盖响应式、焦点和 reduced motion。
- 不把未执行的验证描述成“已通过”。
