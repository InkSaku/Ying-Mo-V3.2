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

品牌影片由用户点击后原地有声播放，保留原生音量、暂停、进度和全屏控制；进入欢迎页不会自动播放或预加载 MP4。公开视频使用独立文件名 `public/brand-film/yingmo-brand-film-web-audio-v3.mp4`，避免旧版本缓存。画面沿用原剪辑，使用确认后的第三版配乐：保留第一版钢琴旋律与轻薄和声，中段乐句略微错开动作，结尾和弦减轻力度并逐音铺开，移除两处气流动作音效。AAC、48kHz立体声，约-20.4 LUFS，峰值约-6.4dBTP。封面继续使用原渲染帧。

## 版本更新提示

已有版本的访客在检测到新版安装时，会看到居中的暖纸提示与墨团递来新纸页的 SVG 线稿；初次离线安装不提示更新。准备阶段显示真实等待状态，离线资源就绪后启用“刷新更新”，仅点击后激活新版并刷新。支持“稍后再说”、Escape、焦点循环与返回，关闭后同一版本准备完成不会再次弹出。失败可重试；没有更新时保持安静。

注册后立即检查版本；页面可见时每分钟检查一次，返回窗口、切回页面和恢复联网时也检查。返回事件节流15秒，隐藏或离线时不检查。离线缓存完成前不把更新说成已就绪，不强制刷新正在编辑的页面；提示先保存再更新。
