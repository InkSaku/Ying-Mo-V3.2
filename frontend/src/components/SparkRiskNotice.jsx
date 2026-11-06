import { lockPageScroll } from "../lib/dialog";
import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { SparkNoticeArt } from "./SparkArt";
import { SparkIcon } from "./SparkIcon";
import "../styles/spark-risk-notice.css";

const storageKey = (userId) => `yingmo:spark-risk-notice:v1:${userId}`;

function shouldShow(userId) {
  try { return window.localStorage.getItem(storageKey(userId)) !== "acknowledged"; }
  catch { return true; }
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
    dialog.showModal();
    const unlock = lockPageScroll();
    confirmRef.current?.focus();
    return () => {
      dialog.close();
      unlock();
      if (previousFocus instanceof HTMLElement && previousFocus.isConnected) previousFocus.focus({ preventScroll: true });
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
        <SparkIcon name="close" />
      </button>
      <div className="spark-risk-heading">
        <p className="spark-risk-kicker">映墨工具箱 / 使用前须知</p>
      </div>
      <div className="spark-risk-art"><SparkNoticeArt /></div>
      <div className="spark-risk-copy">
        <h2 id={titleId}>使用须知</h2>
        <p id={descriptionId} className="spark-risk-description">本功能纯属作者自娱自乐，违反抖音社区公约，<strong>有封号风险</strong>，望知悉。</p>
      </div>
      <div className="spark-risk-footer">
        <div>
          <label className="spark-risk-choice"><input type="checkbox" checked={remember} onChange={(event) => setRemember(event.target.checked)} />不再提示</label>
          <p className="spark-risk-storage">仅在当前浏览器记住此选择</p>
        </div>
        <button ref={confirmRef} type="button" className="btn btn-primary spark-risk-confirm" onClick={acknowledge}>我已知悉<SparkIcon name="external" /></button>
      </div>
    </dialog>, document.body,
  );
}
