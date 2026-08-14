# Ying-Mo Frontend V3.2

React + JavaScript + Vite + React Router + Tailwind CSS v4 + 原生 fetch。

## 启动

```bash
cp .env.example .env
npm install
npm run dev
```

后端默认运行在 `http://127.0.0.1:8000`，前端开发地址为 `http://127.0.0.1:5173`。

```bash
# 在 ../backend
python run.py
```

## 构建

```bash
npm run build
npm run preview
```

## 约束

- `/` 与 `/about` 是无成员动态数据的公开页面。
- 成员内容路由全部经过前端登录门禁，最终权限仍以后端 ACL 为唯一事实来源。
- access token 仅保存在当前标签页的 `sessionStorage`；refresh token 由后端 Cookie 管理。
- refresh / logout 会携带 `csrf_refresh_token` 对应的 `X-CSRF-TOKEN`。
- 独立 Post 与 Collection Post 的可见性不在前端猜测或扩权。
- 本骨架未伪造上传接口；媒体上传 UI 留给后续独立任务接入。
