import { InkSketch } from "../components/InkSketch";
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

  return <main className="page-shell personal-page-shell settings-page data-export-page">
    <PersonalNav />
    <header className="page-heading">
      <div><p className="section-kicker">PORTABLE ARCHIVE</p><h1>数据导出</h1><p>把自己的长期记录带走，不依赖某一个运行中的站点。</p></div>
    </header>
    <section className="ink-export-sheet" aria-labelledby="export-title" aria-busy={state.busy || undefined}>
      <figure className="ink-export-art">
        <InkSketch variant="packed" />
        <figcaption>把记录装进行李。<br />书签也要一起带走。</figcaption>
      </figure>
      <div className="ink-export-copy">
        <header><p className="section-kicker">一份可以带走的记录</p><h2 id="export-title">导出我的数据</h2><p>整理成一个 ZIP，把写过的、收好的，放在一起。</p></header>
        <dl className="ink-export-manifest">
          <div><dt><span aria-hidden="true">01</span>写过的文字</dt><dd>文章和随记的 Markdown 原文</dd></div>
          <div><dt><span aria-hidden="true">02</span>一起收好的记忆</dt><dd>个人资料、合集关系与共同记录关联</dd></div>
          <div><dt><span aria-hidden="true">03</span>来往与留痕</dt><dd>评论、收藏、互动和通知清单</dd></div>
          <div><dt><span aria-hidden="true">04</span>影像与附件</dt><dd>你拥有的媒体清单与可读取的原件</dd></div>
        </dl>
        <p className="ink-export-note">导出中包含你的私密记录，请妥善保管。其他成员的正文不会被打包。</p>
        {state.error ? <div className="inline-error" role="alert">{state.error}</div> : null}
        {state.message ? <div className="inline-success" role="status">{state.message}</div> : null}
        <div className="settings-security-actions">
          <button className="btn btn-primary" type="button" disabled={state.busy} onClick={() => { void download(); }}>
            {state.busy ? "正在整理导出文件" : "下载 ZIP 导出"}
          </button>
          <span className="ink-export-format">ZIP · Markdown · 媒体原件</span>
        </div>
      </div>
    </section>
  </main>;
}
