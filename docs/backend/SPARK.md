# 续火花运行与维护

## 进程与密钥

网站后端、前端和续火花 worker 是独立进程。单个 worker 串行运行一个 Chromium 与任务子进程；不要放入 Gunicorn 或在多台机器重复启动。

Playwright 是实际浏览器业务依赖。登录态以 `SPARK_CREDENTIAL_KEY`（Fernet）加密存入数据库；备份数据库时另行安全备份密钥。丢失或更换密钥后需要重新连接账号。禁止输出密钥与登录态。

本地开发：

```bash
cd backend
.venv/bin/python -m playwright install chromium
.venv/bin/python scripts/run_local_spark.py --check
.venv/bin/python scripts/run_local_spark.py
```

脚本只允许开发环境和本机数据库；首次生成固定密钥写入本地 `.env`，权限为 600。若网站后端已运行，首次生成后重启一次。`--check` 检查配置、数据库和空白 Chromium，不访问抖音。

打开 `/tools/spark`，确认后台在线后扫码并确认账号，等待联系人同步，保存问候计划、完成模拟检查后显式开启每日计划。备用本机扫码脚本从网页入口获取。

## 生产部署

生产环境保留固定的 `SPARK_CREDENTIAL_KEY`，设置 `SPARK_LOGIN_HEADLESS=true`。首次配置示例：

```bash
sudo install -d -m 700 -o www-data -g www-data /var/lib/yingmo-spark
sudo /var/www/yingmo/backend/.venv/bin/python -m playwright install-deps chromium
sudo -u www-data env PLAYWRIGHT_BROWSERS_PATH=/var/lib/yingmo-spark/browsers /var/www/yingmo/backend/.venv/bin/python -m playwright install chromium
sudo install -m 644 /var/www/yingmo/deploy/yingmo-spark.service /etc/systemd/system/yingmo-spark.service
sudo systemctl daemon-reload
sudo systemctl enable --now yingmo-spark
```

按实际路径与运行用户调整服务文件。运行用户需能读取代码与 `.env`；Chromium 使用非 root 用户和 sandbox。服务文件设置进程组内存上限 1800M，任务默认上限 1200 秒，并通过文件锁限制单实例。

升级顺序：停止 worker → 创建并校验备份 → 更新代码与依赖 → `flask --app run.py db upgrade` → 重启网站后端与 worker → 构建前端并检查健康与心跳。任一步失败时停止后续操作。现有 `deploy/deploy.sh` 会处理已安装的 worker 停止和重启；备份应在运行脚本前完成。

2026-10-15 生产服务器曾有未提交热修复，原备份位于 `/var/tmp/yingmo-spark-before-20261015`，切换前静态产物位于其 `served-dist/`。常规部署前核对服务器差异和发布分支，不丢弃未合并修复。

## 登录与发送边界

- 无界面扫码需要后续验证时，网页展示同一官方会话画面，支持有限点击、拖动、滚动和数字输入；约 1.5 秒刷新一次。先选择官方输入框再填入数字。
- 预览和输入校验当前成员及会话；图片、输入加密且不缓存。完成、取消、过期、解绑或恢复中断时清除。
- 不转发本机摄像头、麦克风；需要这些能力时使用备用本机扫码流程。离线验证不代表真实账号的平台流程已通过。
- 保存计划撤销旧配置自动任务并重新安排；暂停每日计划不影响手动任务与单独启用的每周采集，解绑取消账号全部任务。
- 每位好友每天有独立投递记录，Enter 前记录发送意图；成功或结果不明不重复发送。仅确认发送前失败才安排 45 分钟后补发，每账号每天最多一次补发批次。
- 平台验证或登录失效暂停计划。重启不重放中断发送，跨日过期任务取消，不集中补发历史消息。发送开始后取消不能撤回消息。
- 采集补全无关联系人资料可保留既有检查资格；身份、通道、同名风险、好友、消息或凭证变化仍需重新模拟检查。同步与采集保留已有到期时间。

## 修复被采集误暂停的计划

命令默认只读；完成并校验私有备份、核对预览后再应用：

```bash
cd backend
APP_ENV=production .venv/bin/python -m flask --app run.py spark-repair-harvest-pauses
APP_ENV=production .venv/bin/python -m flask --app run.py spark-repair-harvest-pauses --apply
```

只恢复有完整历史检查、采集与自动计划证据，且指纹仅因首次补全无关资料而变化的计划；拒绝主动暂停、改消息、换号、选人变化及身份风险。仅安排未来到期时间，不发送消息、不补发跨日内容，可重复执行。

上游出处、固定版本和 MIT 许可见 `backend/app/spark/vendor/NOTICE.md` 与 `LICENSE`，必须保留。
