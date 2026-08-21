# Validation Record

更新时间：2026-08-21

本文件只记录实际执行结果。最终交付前重复执行同一组命令；如最终结果变化，以最后一次运行输出为准。

## 已执行并通过

1. `python -m pytest -q`
   - 结果：`102 passed`（102/102）。
   - 覆盖 P0 认证/Session/ACL/内容/媒体/互动/Admin/隐私/migration，阶段 21–26 完整增量，以及阶段 27 相关阅读的静态分层、ACL、排除规则、数量上限和关联原因。
2. `python -m compileall -q app tests migrations scripts run.py gunicorn.conf.py`
   - 结果：通过。
3. `python scripts/verify_static.py`
   - 结果：当前后端源码 checksum 清单通过 `MANIFEST_VERIFY_OK`，整体返回 `STATIC_VERIFY_OK`。
4. `python -m pip check`
   - 结果：`No broken requirements found.`
5. `flask --app run.py db upgrade`（全新临时 SQLite 数据库）
   - 结果：升级到 `20260821_0006 (head)`。
   - 结果：20 张业务表与 SQLAlchemy metadata 表集合、列集合一致。
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
   - 结果：包含 Revision 在内的 20 张模型表和索引完成编译。
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
13. Gunicorn 启动与 HTTP smoke
   - `gunicorn --check-config -c gunicorn.conf.py run:app`：通过。
   - 以 testing 配置启动 Gunicorn，实际请求 `/api/v1/health`：200。
   - 实际请求 `/articles/private`：200 通用 Shell，包含 `noindex,nofollow` 与私密缓存头。
14. `npm run check`（`frontend/`）
   - 结果：ESLint 通过，Node 回归 `67 passed`（67/67），Vite 生产构建和 `BUNDLE_VERIFY_OK` 通过。
   - 覆盖账户安全、内容浏览、Revision、往年今日、Explore seed 规范化与分享路径，以及构建与包体门禁。
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

## 当前环境无法完成的外部验证

- 没有可连接的 MySQL 8 服务，因此未声称真实 MySQL `db upgrade` 已通过；已完成 SQLite migration 行为测试和 MySQL DDL 编译。
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
