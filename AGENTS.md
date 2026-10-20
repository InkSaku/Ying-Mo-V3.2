# 项目阅读与维护

- 先读根 README；用 `rg` 定位当前任务需要的文件，不默认遍历或全文读取整个项目。
- 产品规则按 `docs/product.md` 的相关章节查询；UI 工作先看 `docs/frontend/DESIGN.md`，再按需看对应 `designs/` 子目录或项目 UI skill。
- 后端入口：`backend/app/__init__.py`、`blueprints.py`；权限：`backend/app/access.py`；模型：`backend/app/models/`。
- 前端入口与路由：`frontend/src/main.jsx`、`App.jsx`；按页面追踪组件、lib 与样式。
- 共同回忆约束见 `docs/backend/SHARED_MEMORY.md`；续火花运行维护见 `docs/backend/SPARK.md`。
- 不批量读取 `designs/`、截图、`package-lock.json`、依赖目录、构建产物、运行数据或 Git 历史；仅在任务直接需要时查看。
- 本仓库已按维护者要求移除历史测试。默认不新增测试套件、验收报告、审查日志、交接记录或补丁副本；必要说明直接更新现有对应文档。用户明确要求时按用户指示执行。
- 前端验证使用 `cd frontend && npm run check`；后端做编译、依赖检查及与改动相关的隔离 API/迁移验证。不要对业务数据库执行验证写入。
- 保留连续迁移、环境模板、部署维护工具、UI 资料及第三方许可证。后端 Playwright 用于续火花实际业务，不能当作测试依赖删除。
