import { useEffect, useRef, useState } from "react";
import { useProtectedMedia } from "../hooks/useProtectedMedia";
import { MediaOpenButton } from "./MediaOpenButton";
import { ProtectedImage } from "./ProtectedImage";

const LONG_PRESS_MS = 320;

function prefersReducedMotion() {
  return typeof window !== "undefined" && Boolean(window.matchMedia?.("(prefers-reduced-motion: reduce)").matches);
}

// 正文与媒体列表里的 Live Photo：静态图与动态片段是一个条目（docs/product.md Live Photo 规则）。
// 默认只显示静态图；触屏长按画面或按住 LIVE 标识播放、松手停止，鼠标点 LIVE 标识切换；轻点画面仍打开灯箱。
// 动态片段在第一次交互（触碰、悬停或聚焦）时才读取；读取或播放失败时静态图照常显示。
export function LivePhotoFrame({ imagePath, videoPath, alt = "", imageClassName = "", galleryItem, galleryItems, context = "post" }) {
  const [armed, setArmed] = useState(false);
  const [playing, setPlaying] = useState(false);
  const clip = useProtectedMedia(armed ? videoPath : null);
  const videoRef = useRef(null);
  const pressing = useRef(false);
  const timer = useRef(0);
  const suppressClick = useRef(false);
  const pendingPlay = useRef(false);

  const play = async () => {
    const element = videoRef.current;
    if (!element || !clip.src) return;
    try {
      element.currentTime = 0;
      await element.play();
      setPlaying(true);
    } catch {
      setPlaying(false);
    }
  };
  const stop = () => {
    const element = videoRef.current;
    if (element) {
      element.pause();
      element.currentTime = 0;
    }
    setPlaying(false);
  };

  // 第一次长按或点 LIVE 时片段可能还在读取：读到后若仍在按住或刚点过，就开始播放。
  useEffect(() => {
    if (!clip.src) return;
    const held = pressing.current && suppressClick.current && !prefersReducedMotion();
    if (held || pendingPlay.current) void play();
    pendingPlay.current = false;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clip.src]);
  useEffect(() => () => window.clearTimeout(timer.current), []);

  const release = () => {
    window.clearTimeout(timer.current);
    pressing.current = false;
    stop();
  };

  return (
    <div
      className={`live-photo-stage${playing ? " is-playing" : ""}`}
      onPointerEnter={() => setArmed(true)}
      onFocus={() => setArmed(true)}
      onPointerDown={(event) => {
        setArmed(true);
        if (event.pointerType !== "touch") return;
        pressing.current = true;
        suppressClick.current = false;
        window.clearTimeout(timer.current);
        timer.current = window.setTimeout(() => {
          suppressClick.current = true;
          if (!prefersReducedMotion()) void play();
        }, LONG_PRESS_MS);
      }}
      onPointerUp={release}
      onPointerCancel={release}
      onPointerLeave={(event) => { if (event.pointerType === "touch") release(); }}
      onContextMenu={(event) => { if (pressing.current) event.preventDefault(); }}
      onClickCapture={(event) => {
        // 长按播放后松手不再触发“打开灯箱”或切换。
        if (!suppressClick.current) return;
        suppressClick.current = false;
        event.preventDefault();
        event.stopPropagation();
      }}
    >
      <MediaOpenButton item={galleryItem} items={galleryItems} context={context}>
        <ProtectedImage eager path={imagePath} alt={alt} className={imageClassName} />
      </MediaOpenButton>
      {clip.src ? (
        <video
          ref={videoRef}
          className="live-photo-motion"
          src={clip.src}
          muted
          playsInline
          preload="auto"
          aria-hidden="true"
          tabIndex={-1}
          onEnded={stop}
        />
      ) : null}
      <button
        type="button"
        className="live-photo-badge"
        aria-pressed={playing}
        aria-label={playing ? "停止播放 Live Photo" : "播放 Live Photo"}
        onClick={() => {
          setArmed(true);
          if (playing) stop();
          else if (clip.src) void play();
          else pendingPlay.current = true;
        }}
      >LIVE</button>
      {armed && clip.error ? <small className="live-photo-error" role="status">动态片段暂时无法播放，静态照片照常显示。</small> : null}
    </div>
  );
}
