import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import "../styles/spark-risk-notice.css";

const storageKey = (userId) => `yingmo:spark-risk-notice:v1:${userId}`;

function shouldShow(userId) {
  try { return window.localStorage.getItem(storageKey(userId)) !== "acknowledged"; }
  catch { return true; }
}

function SparkRiskSketch() {
  return <svg viewBox="0 0 248 164" fill="none" aria-hidden="true" focusable="false">
    <g stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="m22 131 154 3 33-16-147-5-40 18Z M22 131v8l154 4 33-17v-8 M176 134v9" />
      <path d="m47 126 36-6m-21 12 31-6m-7 7 18-4" opacity=".45" />
      <path d="M72 109c-8-9-8-20-2-29 4-6 13-13 13-26 12 8 19 21 16 33 5-3 9-8 10-13 13 18 15 34 3 44" />
      <path d="M83 114c-6-8-5-17 2-26 0 9 8 12 8 20 0 5-2 8-4 10" stroke="var(--brand-link)" />
      <path d="m56 59-7-9m45-10 2-10m28 31 8-5" stroke="var(--brand-link)" />
      <path d="m148 119 9-82 62 4-5 66-57-4 M157 37l11-7 62 5-11 6 M219 41l11-6-5 65-11 7" />
      <path d="m184 53-18 31 35 2-17-33Z" stroke="var(--brand-link)" />
      <path d="m184 64-1 9m0 6h.1" stroke="var(--brand-link)" strokeWidth="2" />
      <path d="m164 96 34 2m-35 6 24 1 M13 149h164m11 0h29" opacity=".4" />
    </g>
  </svg>;
}

export function SparkRiskNotice({ userId }) {
  const [visible, setVisible] = useState(() => shouldShow(userId));
  const [remember, setRemember] = useState(false);
  const dialogRef = useRef(null);
  const confirmRef = useRef(null);
  const titleId = useId();
  const descriptionId = useId();

  useEffect(() => {
    if (!visible) return undefined;
    const dialog = dialogRef.current;
    const previousFocus = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    dialog.showModal();
    document.body.style.overflow = "hidden";
    confirmRef.current?.focus();
    return () => {
      dialog.close();
      document.body.style.overflow = previousOverflow;
      if (previousFocus instanceof HTMLElement && previousFocus.isConnected) previousFocus.focus();
    };
  }, [visible]);

  const keepFocusInside = (event) => {
    if (event.key !== "Tab") return;
    const controls = [...dialogRef.current.querySelectorAll("button, input")];
    const current = controls.indexOf(document.activeElement);
    event.preventDefault();
    controls[(current + (event.shiftKey ? -1 : 1) + controls.length) % controls.length].focus();
  };

  const acknowledge = () => {
    if (remember) {
      try { window.localStorage.setItem(storageKey(userId), "acknowledged"); }
      catch { /* Storage may be unavailable; the notice will appear next visit. */ }
    }
    setVisible(false);
  };

  if (!visible) return null;
  return createPortal(
    <dialog className="spark-risk-notice" ref={dialogRef} onKeyDown={keepFocusInside} aria-labelledby={titleId} aria-describedby={descriptionId}
      onCancel={(event) => { event.preventDefault(); setVisible(false); }}>
      <button className="spark-risk-close" type="button" aria-label="关闭提示" onClick={() => setVisible(false)}>
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m7 7 10 10M17 7 7 17" /></svg>
      </button>
      <div className="spark-risk-heading">
        <p className="spark-risk-kicker">映墨工具箱 / 使用前须知</p>
        <span className="spark-risk-number" aria-hidden="true"></span>
      </div>
      <div className="spark-risk-art"><SparkRiskSketch /></div>
      <div className="spark-risk-copy">
        <p className="spark-risk-caption"></p>
        <h2 id={titleId}>使用须知<br /></h2>
        <p id={descriptionId} className="spark-risk-description">本功能纯属作者自娱自乐，违反抖音社区公约，<strong>有封号风险</strong>，望知悉。</p>
      </div>
      <div className="spark-risk-footer">
        <div>
          <label className="spark-risk-choice"><input type="checkbox" checked={remember} onChange={(event) => setRemember(event.target.checked)} />不再提示</label>
          <p className="spark-risk-storage">仅在当前浏览器记住此选择</p>
        </div>
        <button ref={confirmRef} type="button" className="btn btn-primary spark-risk-confirm" onClick={acknowledge}>我已知悉<span aria-hidden="true">↗</span></button>
      </div>
    </dialog>, document.body,
  );
}
