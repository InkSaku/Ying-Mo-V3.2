# Validation Record

更新时间：2026-08-15

本文件只记录实际执行结果。最终交付前重复执行同一组命令；如最终结果变化，以最后一次运行输出为准。

## 已执行并通过

1. `python -m pytest -q`
   - 结果：`88 passed`（88/88）。
   - 覆盖 P0 认证/Session/ACL/内容/媒体/互动/Admin/隐私/migration，以及阶段 21 的 Markdown 渲染、脚注、公式、Outline、自动保存和乐观并发，阶段 22 的验证/重置令牌、邮件失败、冷却、防枚举、过期/单次消费、密码更新和会话撤销。
2. `python -m compileall -q app tests migrations scripts run.py gunicorn.conf.py`
   - 结果：通过。
3. `python scripts/verify_static.py`
   - 结果：当前后端源码 checksum 清单通过 `MANIFEST_VERIFY_OK`，整体返回 `STATIC_VERIFY_OK`。
4. `python -m pip check`
   - 结果：`No broken requirements found.`
5. `flask --app run.py db upgrade`（全新临时 SQLite 数据库）
   - 结果：升级到 `20260815_0004 (head)`。
   - 结果：18 张业务表与 SQLAlchemy metadata 表集合、列集合一致。
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
9. MySQL Dialect DDL 编译
   - 结果：`MYSQL_DDL_COMPILE_OK tables=18`。
10. Production 配置加载
   - 使用合法 MySQL URL、32-byte secrets、显式 CORS、Redis URL、S3 bucket、HTTPS `SITE_URL`、SMTP、TLS 和发件地址配置创建 App。
   - 结果：应用配置与 adapter 初始化通过；这只是配置路径验证，不代表真实外部投递通过。
11. `flask --app run.py routes`
   - 结果：P0 API、文档 Shell、Sitemap、RSS 路由注册成功；无退休业务 Blueprint。
   - 阶段 22 的四个账户 API 与 `/forgot-password`、`/verify-email`、`/reset-password` Shell 已注册。
12. Gunicorn 启动与 HTTP smoke
   - `gunicorn --check-config -c gunicorn.conf.py run:app`：通过。
   - 以 testing 配置启动 Gunicorn，实际请求 `/api/v1/health`：200。
   - 实际请求 `/articles/private`：200 通用 Shell，包含 `noindex,nofollow` 与私密缓存头。
13. `npm run check`（`frontend/`）
   - 结果：ESLint 通过，Node 回归 `55 passed`（55/55），Vite 生产构建和 `BUNDLE_VERIFY_OK` 通过。
   - 覆盖 fragment-only 取令牌、Query 令牌清理、`no-referrer`、精确公开路由和无敏感信息的跨标签页会话失效事件。
14. `git diff --check`
   - 结果：通过。

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
