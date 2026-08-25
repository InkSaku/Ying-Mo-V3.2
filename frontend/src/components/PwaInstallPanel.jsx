import { useState } from "react";
import { usePwaInstall } from "../hooks/usePwaInstall";

const MODE_LABELS = {
  installed: "已安装",
  prompt: "可以安装",
  ios: "可以添加",
  "browser-menu": "浏览器安装",
  insecure: "需要 HTTPS",
  unsupported: "当前不支持",
};

function InstallationGuidance({ mode }) {
  if (mode === "ios") {
    return <p className="pwa-install-guidance">请使用 Safari 打开映墨，点击“分享”，再选择“添加到主屏幕”。</p>;
  }
  if (mode === "browser-menu") {
    return <p className="pwa-install-guidance">请打开浏览器地址栏或菜单中的“安装映墨”“安装应用”或“添加到主屏幕”。</p>;
  }
  if (mode === "insecure") {
    return <div className="inline-error" role="alert">安装功能只会在 HTTPS 站点上启用。</div>;
  }
  if (mode === "unsupported") {
    return <p className="pwa-install-guidance">当前浏览器不支持完整 PWA 安装，可以继续将页面保存为普通书签。</p>;
  }
  return null;
}

export function PwaInstallPanel() {
  const { mode, requestInstall } = usePwaInstall();
  const [action, setAction] = useState({ busy: false, message: "", error: "" });

  const install = async () => {
    setAction({ busy: true, message: "", error: "" });
    try {
      const result = await requestInstall();
      setAction({
        busy: false,
        message: result.outcome === "accepted"
          ? "已提交安装，请按浏览器提示完成。"
          : "已取消安装，你可以稍后再试。",
        error: "",
      });
    } catch {
      setAction({ busy: false, message: "", error: "浏览器暂时无法打开安装窗口，请从浏览器菜单重试。" });
    }
  };

  return (
    <section className="settings-security-section pwa-install-section" aria-labelledby="pwa-install-title">
      <header>
        <div>
          <p className="section-kicker">桌面应用</p>
          <h2 id="pwa-install-title">安装映墨</h2>
        </div>
        <span className={`verification-badge is-${mode === "installed" ? "verified" : "pending"}`}>
          {MODE_LABELS[mode]}
        </span>
      </header>
      <p>安装后可以从桌面、Dock、开始菜单或手机主屏幕打开映墨，并以独立窗口运行。</p>
      <dl className="settings-security-details">
        <div><dt>启动方式</dt><dd>独立应用窗口，仍连接当前映墨服务器</dd></div>
        <div><dt>隐私边界</dt><dd>只缓存应用外壳；API、文章内容和受保护媒体不进入离线缓存</dd></div>
        <div><dt>快捷入口</dt><dd>支持从应用图标进入写随记、写文章和搜索</dd></div>
      </dl>
      {action.error ? <div className="inline-error" role="alert">{action.error}</div> : null}
      {action.message ? <div className="inline-success" role="status">{action.message}</div> : null}
      <InstallationGuidance mode={mode} />
      <div className="settings-security-actions">
        {mode === "prompt" ? (
          <button className="btn btn-primary" type="button" disabled={action.busy} onClick={() => { void install(); }}>
            {action.busy ? "正在打开安装窗口" : "安装映墨"}
          </button>
        ) : null}
        {mode === "installed" ? <button className="btn btn-secondary" type="button" disabled>映墨已安装</button> : null}
      </div>
    </section>
  );
}
