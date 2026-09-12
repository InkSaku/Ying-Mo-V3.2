import { useState } from "react";
import { PersonalNav } from "../components/PersonalNav";
import { usePageMeta } from "../hooks/usePageMeta";
import { api } from "../lib/api";

export function DataExportPage() {
  usePageMeta("数据导出");
  const [state, setState] = useState({ busy: false, message: "", error: "" });

  const download = async () => {
    setState({ busy: true, message: "", error: "" });
    try {
      const result = await api.blob("/data/export");
      const url = URL.createObjectURL(result.data);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `ying-mo-member-export-${new Date().toISOString().slice(0, 10)}.zip`;
      anchor.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      setState({ busy: false, message: "导出文件已生成。请妥善保管，其中包含你的私密内容和媒体原件。", error: "" });
    } catch (error) {
      setState({ busy: false, message: "", error: error.message });
    }
  };

  return <main className="page-shell personal-page-shell settings-page">
    <PersonalNav />
    <header className="page-heading"><div><h1>数据导出</h1><p>把自己的长期记录带走，不依赖某一个运行中的站点。</p></div></header>
    <section className="settings-security-section">
      <header><div><p className="section-kicker">Portable archive</p><h2>导出我的数据</h2></div></header>
      <p>ZIP 包含个人资料、Markdown 原文、Collection 关系、评论、收藏、通知清单和你拥有的媒体原件。其他成员的正文不会被打包。</p>
      {state.error ? <div className="inline-error" role="alert">{state.error}</div> : null}
      {state.message ? <div className="inline-success" role="status">{state.message}</div> : null}
      <div className="settings-security-actions">
        <button className="btn btn-primary" type="button" disabled={state.busy} onClick={() => { void download(); }}>
          {state.busy ? "正在整理导出文件" : "下载 ZIP 导出"}
        </button>
      </div>
    </section>
  </main>;
}
