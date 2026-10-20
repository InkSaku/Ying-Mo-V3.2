# Ying-Mo Frontend V3.2

React + JavaScript + Vite + React Router + Tailwind CSS v4 + 原生 fetch。

## 启动

```bash
cp .env.example .env
npm ci
npm run dev
```

后端默认运行在 `http://127.0.0.1:8000`，前端开发地址为 `http://127.0.0.1:5173`。

```bash
# 在 ../backend
python run.py
```

## 构建

```bash
npm run check
npm run preview
```

`npm run check` 依次执行 ESLint、Vite 生产构建和包体预算／PWA 校验。单独构建使用 `npm run build`；页面与业务流程按改动范围手动验证。

## 主要路由

- 无成员动态数据的公开页面：`/`、`/about`。
- 账户公开流程：`/login`、`/register`、`/forgot-password`、`/verify-email`、`/reset-password`。
- 登录成员入口：`/home`、`/articles`、`/notes`、`/collections`、`/write`、`/search`、`/archive`、`/me/*`。
- 管理入口：`/admin/*`，仍由前端路由守卫和后端角色校验共同保护。

## 约束

- `/` 与 `/about` 是无成员动态数据的公开页面。
- `/forgot-password`、`/verify-email`、`/reset-password` 是公开账户恢复路由；邮箱未验证不会阻断正常成员登录或内容能力。
- 其余成员内容路由经过前端登录门禁，最终权限仍以后端 ACL 为唯一事实来源。
- Access Token 仅保存在运行中 JavaScript 模块内存，不写入 `sessionStorage` 或 `localStorage`；Refresh Token 由后端 HttpOnly Cookie 管理。
- refresh / logout 会携带 `csrf_refresh_token` 对应的 `X-CSRF-TOKEN`。
- 邮箱验证和密码重置令牌只从 URL fragment `#token=...` 读取，页面初始化后立即通过 History API 清除；误入 Query 的令牌会被删除而不会被消费，页面使用 `no-referrer`；不得改用 query、路径、Web Storage 或日志持久化。
- 密码重置成功后前端清理当前认证状态与受保护媒体 Blob URL，并通过只含事件类型和时间的短暂同源存储事件通知其他标签页立即清理；服务端同时撤销该账号全部 Refresh Session。
- 独立 Post 与 Collection Post 的可见性不在前端猜测或扩权。
- 媒体继续通过受保护 API 和 Blob URL 生命周期读取；退出或会话失效时必须释放本地对象 URL。

## 欢迎页品牌影片

品牌影片由用户点击后原地有声播放，保留原生音量、暂停、进度和全屏控制；进入欢迎页不会自动播放或预加载 MP4。公开视频使用独立文件名 `public/brand-film/yingmo-brand-film-web-audio.mp4`，避免旧无声版缓存。画面沿用原剪辑，音频为专为14.5秒影片编排的钢琴与轻环境声，品牌落定和弦对齐9.97秒；AAC、48kHz立体声，约-20 LUFS，峰值约-2dBTP。封面继续使用原渲染帧。
