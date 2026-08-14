# Validation Record

更新时间：2026-08-14

本文件只记录实际执行结果。最终交付前重复执行同一组命令；如最终结果变化，以最后一次运行输出为准。

## 已执行并通过

1. `python -m pytest -q`
   - 结果：`38 passed`。
   - 覆盖认证/Session、guest 401、越权 404、独立 private/login_only、Collection creator/member/non-member、成员增删、历史作者管理例外、移动/移出/删除 detach、排序、聚合泄漏、Slug 历史、媒体/Live Photo、评论互动、通知、Admin、HTML 隐私和 migration。
2. `python -m compileall -q app tests migrations scripts run.py gunicorn.conf.py`
   - 结果：通过。
3. `python scripts/verify_static.py`
   - 结果：`STATIC_VERIFY_OK`。
4. `python -m pip check`
   - 结果：`No broken requirements found.`
5. `flask --app run.py db upgrade`（全新临时 SQLite 数据库）
   - 结果：升级到 `20260814_0002 (head)`。
   - 结果：17 张业务表与 SQLAlchemy metadata 表集合、列集合一致。
6. legacy visibility migration 集成测试
   - 在 `20260814_0001` 写入 `public` Post，再升级 head。
   - 结果：migration 输出转换数量，记录变为 `login_only`。
   - Downgrade 到 `0001` 后仍为 `login_only`，未重新公开。
7. MySQL Dialect DDL 编译
   - 结果：`MYSQL_DDL_COMPILE_OK tables=17`。
8. Production 配置加载
   - 使用合法 MySQL URL、32-byte secrets、显式 CORS、Redis URL、S3 bucket 配置创建 App。
   - 结果：`PRODUCTION_CONFIG_OK mysql+pymysql S3PrivateStorage`。
9. `flask --app run.py routes`
   - 结果：P0 API、文档 Shell、Sitemap、RSS 路由注册成功；无退休业务 Blueprint。
10. Gunicorn 启动与 HTTP smoke
   - `gunicorn --check-config -c gunicorn.conf.py run:app`：通过。
   - 以 testing 配置启动 Gunicorn，实际请求 `/api/v1/health`：200。
   - 实际请求 `/articles/private`：200 通用 Shell，包含 `noindex,nofollow` 与私密缓存头。

## 当前环境无法完成的外部验证

- 没有可连接的 MySQL 8 服务，因此未声称真实 MySQL `db upgrade` 已通过；已完成 SQLite migration 行为测试和 MySQL DDL 编译。
- 没有 S3-compatible bucket 凭证，因此未声称真实对象存储 I/O 已通过；已完成同一接口下的 LocalPrivateStorage HTTP 集成测试和 S3 client 配置加载。
- 没有 Redis 服务，因此未执行分布式限流压测；已验证依赖和 production limiter 配置可初始化。

上线前应在目标基础设施执行：

```bash
python -m pip install -r requirements.txt
flask --app run.py db upgrade
gunicorn --check-config -c gunicorn.conf.py run:app
python -m pytest -q
```
