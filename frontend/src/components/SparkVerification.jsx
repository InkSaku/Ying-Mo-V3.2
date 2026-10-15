import { useEffect, useRef, useState } from "react";
import { api } from "../lib/api";

export function SparkVerification({ sessionId }) {
  const [screen, setScreen] = useState(null);
  const [error, setError] = useState("");
  const [digits, setDigits] = useState("");
  const [sending, setSending] = useState(false);
  const [enlarged, setEnlarged] = useState(false);
  const activeRequest = useRef(false);
  const pointer = useRef(null);
  const screenRef = useRef(null);
  useEffect(() => {
    const controller = new AbortController();
    let timer;
    let imageUrl;
    const update = async () => {
      try {
        const result = await api.blob(`/spark/login-sessions/${sessionId}/verification`, { signal: controller.signal, cache: "no-store" });
        if (controller.signal.aborted) return;
        if (pointer.current || activeRequest.current) return;
        const url = URL.createObjectURL(result.data);
        const next = { url, revision: result.headers.get("X-Spark-Revision"), sequence: Number(result.headers.get("X-Spark-Input-Sequence")), pending: result.headers.get("X-Spark-Input-Pending") === "1" };
        if (next.revision === screenRef.current?.revision && next.sequence < screenRef.current.sequence) {
          URL.revokeObjectURL(url);
          return;
        }
        const previousUrl = imageUrl;
        imageUrl = url;
        screenRef.current = next;
        setScreen(next);
        if (previousUrl) URL.revokeObjectURL(previousUrl);
      } catch (failure) {
        if (!controller.signal.aborted) setError(failure.message);
      } finally {
        if (!controller.signal.aborted) timer = setTimeout(update, 1500);
      }
    };
    void update();
    return () => { controller.abort(); clearTimeout(timer); if (imageUrl) URL.revokeObjectURL(imageUrl); screenRef.current = null; };
  }, [sessionId]);

  const send = async (action) => {
    const current = screenRef.current;
    if (!current || current.pending || activeRequest.current) return;
    activeRequest.current = true;
    setSending(true);
    setError("");
    try {
      const result = await api.post(`/spark/login-sessions/${sessionId}/interaction`, { revision: current.revision, sequence: current.sequence, action });
      if (screenRef.current?.revision === current.revision) { screenRef.current.sequence = result.data.sequence; screenRef.current.pending = true; }
      if (action.type === "text") setDigits("");
    } catch (failure) {
      setError(failure.message);
    } finally {
      activeRequest.current = false;
      setSending(false);
    }
  };
  const coordinates = (event) => {
    const rect = event.currentTarget.getBoundingClientRect();
    return { x: Math.min(1365, Math.max(0, Math.round((event.clientX - rect.left) * 1366 / rect.width))),
      y: Math.min(799, Math.max(0, Math.round((event.clientY - rect.top) * 800 / rect.height))) };
  };
  const begin = (event) => {
    if (!screen || screen.pending || sending || event.button !== 0) return;
    event.preventDefault();
    pointer.current = coordinates(event);
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const end = (event) => {
    if (!pointer.current) return;
    const start = pointer.current;
    pointer.current = null;
    const finish = coordinates(event);
    const drag = Math.hypot(start.x - finish.x, start.y - finish.y) > 10;
    void send(drag ? { type: "drag", ...start, end_x: finish.x, end_y: finish.y } : { type: "click", ...finish });
  };
  return <section className="spark-verification" aria-label="继续完成抖音登录">
    <div className="spark-verification-heading"><strong>继续完成登录</strong><span>抖音官方页面 · 自动更新</span></div>
    <p className="spark-meta">点击下方画面中的提示继续。若出现新的二维码，请用抖音扫描；按官方页面要求完成后，这里会自动进入账号确认。</p>
    <button type="button" className="text-button" onClick={() => setEnlarged(!enlarged)}>{enlarged ? "缩小画面" : "放大画面"}</button>
    <div className={`spark-verification-screen${enlarged ? " is-enlarged" : ""}`} aria-label="抖音官方登录画面">
      {screen ? <img src={screen.url} alt="抖音官方登录页面实时画面" width="1366" height="800" draggable="false" onPointerDown={begin} onPointerUp={end}
        onPointerCancel={() => { pointer.current = null; }} /> : <p>正在读取官方登录页面…</p>}
    </div>
    <div className="spark-verification-controls">
      <form onSubmit={(event) => { event.preventDefault(); if (digits) void send({ type: "text", text: digits }); }}>
        <label>验证码或手机号<input type="password" inputMode="numeric" autoComplete="off" maxLength="20" value={digits}
          onChange={(event) => setDigits(event.target.value.replace(/[^0-9]/g, ""))} placeholder="仅当官方页面要求时填写" /></label>
        <button className="btn btn-secondary" disabled={!screen || screen.pending || sending || !digits}>填入已选输入框</button>
      </form>
      <div className="spark-verification-keys">
        {[["Tab", "切换输入框"], ["Backspace", "删除一位"], ["Enter", "确认输入"]].map(([key, label]) =>
          <button key={key} type="button" className="text-button" disabled={!screen || screen.pending || sending} onClick={() => { void send({ type: "key", key }); }}>{label}</button>)}
        <button type="button" className="text-button" disabled={!screen || screen.pending || sending} onClick={() => { void send({ type: "scroll", delta: -500 }); }}>向上滚动</button>
        <button type="button" className="text-button" disabled={!screen || screen.pending || sending} onClick={() => { void send({ type: "scroll", delta: 500 }); }}>向下滚动</button>
      </div>
    </div>
    <p className="spark-meta">填入数字前，先点击官方画面中的输入框。画面会稍有延迟，请等上一步更新后再操作。</p>
    {sending ? <p role="status" className="spark-meta">正在提交操作…</p> : null}
    {error ? <p role="alert" className="spark-meta">{error}</p> : null}
  </section>;
}
