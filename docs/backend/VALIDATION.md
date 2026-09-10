# Validation Record

更新时间：2026-08-24

本文件保留截至媒体记忆阶段的实际执行记录；下文测试数量、数据库 head 和“当前环境”均指记录发生时，不代表当前工作区或生产环境。本次文档审查未重跑这些业务验收。后续发布应记录新的执行日期、代码版本与结果；前端分阶段历史另见 `docs/frontend/INTEGRATION_BASELINE.md`。

## 已执行并通过

1. `python -m pytest -q`
   - 结果：`124 passed`（124/124）。
   - 覆盖 P0 认证/Session/ACL/内容/媒体/互动/Admin/隐私/migration、阶段 21–27、V3.3–V3.7，以及逻辑媒体、展示衍生图、固定回应、引用回复、提及、通知摘要/深链、导出和 ACL 撤销边界。
2. `python -m compileall -q app tests migrations scripts run.py gunicorn.conf.py`
   - 结果：通过。
3. `python scripts/verify_static.py`
   - 结果：当前后端源码 checksum 清单通过 `MANIFEST_VERIFY_OK`，整体返回 `STATIC_VERIFY_OK`。
4. `python -m pip check`
   - 结果：`No broken requirements found.`
5. `flask --app run.py db upgrade`（全新临时 SQLite 数据库）
   - 结果：升级到 `20260825_0011 (head)`。
   - 结果：23 张业务表与 SQLAlchemy metadata 表集合、列集合一致；既有 Like 转为 `heart` 回应。
6. legacy visibility migration 集成测试
   - 在 `20260814_0001` 写入 `public` Post，再升级 head。
   - 结果：migration 输出转换数量，记录变为 `login_only`。
   - Downgrade 到 `0001` 后仍为 `login_only`，未重新公开。
7. Post edit-version migration 集成测试
   - 从 `20260814_0002` 的既有 Post 升级到 `20260815_0003`，结果统一回填 `edit_version=1` 并启用正整数约束。
   - Downgrade 到 `0002` 后列被移除，再升级 head 后重新回填且 Schema/Model 对齐。
8. Account trust/recovery migration 与邮件单元集成
   - `20260815_0004` 新增 `users.email_verified_at` 和 `account_tokens`，数据库只保存 HMAC 摘要，不保存邮件中的原始令牌。
   - memory Outbox 覆盖验证/重置邮件内容、令牌轮换和发送失败；失败不会回滚已创建账号，未投递令牌会撤销并允许重试。
   - Console 与异常日志脱敏测试保证完整邮箱、完整链接和原始令牌不进入日志；SMTP 单元集成覆盖 timeout、STARTTLS、认证、固定发件人与消息投递调用。
9. Post Revision migration 与恢复集成
   - `20260821_0006` 创建不可变 `post_revisions` 快照表，唯一关联 Post 与源编辑版本；downgrade 删除 Revision 表但保留既有 Post，随后可重新 upgrade。
   - 发布后真实修改、Collection 变更与恢复会在事务内留版；草稿自动保存和无变化恢复不会制造 Revision。
   - 列表/详情仅作者可读，恢复使用 `expected_version` 防止旧窗口覆盖，失效 taxonomy、媒体或 Collection 按最小权限降级。
10. MySQL Dialect DDL 编译
   - 结果：包含 V3.7 回应与提及表在内的 23 张模型表和索引完成编译。
11. Production 配置加载
   - 使用合法 MySQL URL、32-byte secrets、显式 CORS、Redis URL、S3 bucket、HTTPS `SITE_URL`、SMTP、TLS 和发件地址配置创建 App。
   - 结果：应用配置与 adapter 初始化通过；这只是配置路径验证，不代表真实外部投递通过。
12. `flask --app run.py routes`
   - 结果：P0 API、文档 Shell、Sitemap、RSS 路由注册成功；无退休业务 Blueprint。
   - 阶段 22 的四个账户 API 与 `/forgot-password`、`/verify-email`、`/reset-password` Shell 已注册。
   - 阶段 24 的作者版本列表、详情和恢复 API 已注册。
   - 阶段 25 的 `/api/v1/home/on-this-day` 成员接口已注册。
   - 阶段 26 的 `/api/v1/explore` 成员接口已注册。
   - 阶段 27 复用 Article 详情 API 返回最多 4 条 ACL 安全、带明确原因的 `related` 卡片数据。
   - V3.5 `/api/v1/collections/:id/transfer-creator` 已注册；复用既有 creator/member 模型，无需新增 migration。
   - V3.7 Post/评论回应、提及候选、评论上下文与通知评论深链接口均已注册。
13. Gunicorn 启动与 HTTP smoke
   - `gunicorn --check-config -c gunicorn.conf.py run:app`：通过。
   - 以 testing 配置启动 Gunicorn，实际请求 `/api/v1/health`：200。
   - 实际请求 `/articles/private`：200 通用 Shell，包含 `noindex,nofollow` 与私密缓存头。
14. `npm run check`（`frontend/`）
   - 结果：ESLint 通过，Node 回归 `88 passed`（88/88），Vite PWA 生产构建和 `BUNDLE_VERIFY_OK` 通过。
   - 覆盖账户安全、内容浏览、Revision、往年今日、Explore、Collection 成员/时间轴/通知、Creator 转让、离线草稿、固定回应与评论乐观回滚，以及构建与包体门禁。
15. `git diff --check`
   - 结果：通过。
16. 阶段 23 本地浏览器验收
   - 使用真实登录会话与样例 Article、Note、Collection 检查 `/articles`、`/notes`、`/archive` 和两类详情页。
   - 作者筛选后 URL 正确写入 `author`；Archive 年份与作者、Tag、Collection 组合查询返回准确结果。
   - 桌面 1280px 与窄屏 390px 均无横向溢出；修正筛选栏 CSS 级联后，390px 控件为单列完整宽度；Console 无警告或错误。
17. 阶段 24 本地浏览器验收尝试
   - 新版本页面需要作者登录；本轮隔离浏览器没有可复用的已登录本地会话。为避免在浏览器中传输或保存测试凭据，未绕过登录门禁，也未把视觉验收记为通过。
   - 版本页已通过 ESLint、生产构建和组件辅助逻辑回归；真实登录态下的桌面/390px 点按验收仍可作为发布前人工检查补跑。
18. 阶段 27 隔离浏览器与真实 HTTP 验收
   - 使用全新 SQLite、独立上传目录、后端 `8017` 与前端 `5187` 登录成员账号，验证 Article 详情分别返回并展示 0、1、2、4 篇相关阅读；0 篇时区块不存在，其他情况不以无关内容补位。
   - 验证四张卡片顺序、原因文本与真实跳转；新增无权 Collection 中的高相关 Article 后，标题和 Collection 名称均未泄露，结果仍为原有四篇。
   - 1280px 与 390×844 下页面 `clientWidth/scrollWidth` 分别为 `1280/1280`、`390/390`；窄屏为单列 358px 卡片，原因文本均有有效布局高度。深色模式下原因、卡片和页面使用深色主题变量，Console error/warn 为空。
   - 浏览器发现紧凑 Article 卡片旧选择器会把关联原因与摘要一起隐藏；已收窄为只隐藏非原因段落，并增加前端静态回归。
   - 在另一套全新迁移数据库、独立上传目录和后端 `8018` 运行 `scripts/verify_full_http.py`，返回 `FULL_HTTP_VERIFY_OK`，覆盖 Auth、Media、Post、Collection、Search、Taxonomy、个人中心、互动、评论、通知、Archive、Admin 全表面和 ACL 撤销。
19. V3.5 Creator 转让隔离浏览器验收
   - 使用全新升级到 `20260822_0008` 的临时 SQLite、独立上传目录、后端 `8017` 与前端 `5187`，以三个合成成员账号实际完成 Creator 转让，没有连接仓库开发数据库。
   - 桌面与 390×844、浅色与深色下，目标下拉只列当前 active member；二次确认明确列出双方转让后的权限，布局与交互正常。
   - 转让成功后旧 creator 自动回到 Collection 详情，仍有投稿入口但不再有管理入口；新 creator 拥有管理入口，并收到带 `1` 未读角标的转让通知。
   - Collection 作者、成员、内容顺序与关键记录保持不变；浏览器 Console 没有 error，临时服务已停止，隔离目录已移入系统废纸篓且可恢复。
20. V3.7 轻量互动隔离浏览器与真实 HTTP 验收
   - 使用全新升级到 `20260824_0010` 的隔离 SQLite、后端 `8019` 与前端 `5189`，以三个合成成员账号验证六种 Post/评论回应、一级引用回复、结构化提及和通知评论摘要。
   - 提及输入只列当前可访问的目标成员；通知目标为 `?comment=:id#comment-:id`，详情页通过评论上下文定位并高亮具体回复。
   - 390×844 下 `clientWidth/scrollWidth` 为 `390/390`，Post 与两条评论共 18 个回应按钮均正常布局，评论深链仍保持焦点；Console error/warn 为空。
   - 在同一隔离服务执行 `scripts/verify_full_http.py`，返回 `FULL_HTTP_VERIFY_OK`，覆盖 Auth、Media、Post、Collection、Search、Taxonomy、个人中心、互动、评论、通知、Archive、Admin 和 ACL 撤销。
   - 浏览器技能促使本轮同时检查可访问名称、移动端横向溢出、提及下拉、深链焦点和 Console；隔离服务已停止，测试目录已移入系统废纸篓且可恢复。
21. V3.7 真实 MySQL 中断恢复迁移
   - 从 `20260823_0009` 的 DDL 部分提交状态恢复并升级到 `20260824_0010`；原有 Post 回应记录保留并回填为 `heart`。
   - 隔离数据库同时覆盖正常旧表、改名后中断、旧表缺失三种迁移路径。
22. 媒体记忆自动化、真实 MySQL 与隔离浏览器验收
   - Alembic `20260825_0011` 已在当前真实 MySQL 从 `0010` 升级，新增 `media.display_key` 且保留原有两条媒体记录；迁移自动化覆盖 downgrade/re-upgrade 和模型列对齐。
   - 后端集成测试验证 WebP 展示图去除 EXIF、普通成员不能下载所有者原件、Live Photo 逻辑合并、单媒体解析，以及成员移除后解析和文件读取均为 404。
   - 使用全新隔离数据库、独立上传目录、后端 `8020` 与前端 `5190`，验证 Post 和 Collection 打开同一灯箱、三条逻辑媒体、Live Photo 播放/静态回退、左右键、深链接刷新恢复 `2 / 3`、双击缩放和通用无权错误。
   - 390×844 下页面与灯箱均无横向溢出；关闭后焦点返回原媒体入口，灯箱打开时页面根节点 inert，干净标签页 Console error/warn 为空。
   - 上传与读取链路仅提供授权展示衍生图；原文件走所有者接口。相邻静态图只短时预加载，认证结束或账号切换会释放所有受保护 Blob URL。
23. V3.8 PWA 构建与隔离浏览器验收
   - 生产构建生成 `app.webmanifest`、`sw.js`、Workbox 运行时、192/512/maskable/Apple Touch 图标；Manifest 为 `standalone`，从 `/home?source=pwa` 启动并提供写随记、写文章和搜索快捷入口。
   - 构建门禁从生成的 Service Worker 提取 precache URL，确认没有 `/api`；导航回退包含 `/api` denylist，未配置任何运行时 API 或受保护媒体缓存。
   - Vite Preview 实际返回 `application/manifest+json` 与 `text/javascript`，Manifest、Service Worker 和图标均为 200；部署脚本增加对应产物与 HTML 元数据检查。
   - 使用全新 SQLite、独立上传目录、后端 `8000` 与前端 `4173` 登录隔离演示成员，真实检查个人资料安装区；桌面 DOM、可访问名称和 390×844 视觉布局正常，`clientWidth/scrollWidth` 为 `390/390`，Console error/warn 为空。
   - 当前内置验收浏览器不暴露 Service Worker 和 `beforeinstallprompt`，外部 Chrome 连接也不可用，因此没有把系统级安装弹窗记为已点按通过；该项需在 HTTPS 部署域名上用 Chrome/Edge/Safari 完成最终设备安装检查。

## 当前环境无法完成的外部验证

- 没有 S3-compatible bucket 凭证，因此未声称真实对象存储 I/O 已通过；已完成同一接口下的 LocalPrivateStorage HTTP 集成测试和 S3 client 配置加载。
- 没有 Redis 服务，因此未执行分布式限流压测；已验证依赖和 production limiter 配置可初始化。
- 没有真实 SMTP 账号、可投递域名和 DNS 控制权，因此未声称 STARTTLS 握手、真实收件、退信处理或 SPF/DKIM/DMARC 已通过；已完成 memory Outbox、SMTP adapter 和 production 配置校验。
- 已调用 Browser Skill 尝试阶段 22 运行验收，但当前桌面安全策略拒绝访问本地 HTTP 页面，隔离开发服务也因权限门禁无法启动；按策略未尝试绕过，页面点按、Console、主题和 390px 实测未计为通过。

上线前应在目标基础设施执行：

```bash
python -m pip install -r requirements.txt
flask --app run.py db upgrade
gunicorn --check-config -c gunicorn.conf.py run:app
python -m pytest -q

cd ../frontend
npm run check
```
