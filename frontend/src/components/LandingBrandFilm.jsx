import { useRef, useState } from "react";
import "../styles/landing-brand-film.css";

const filmUrl = `${import.meta.env.BASE_URL}brand-film/yingmo-brand-film-web-audio.mp4`;
const posterUrl = `${import.meta.env.BASE_URL}brand-film/poster.webp`;

export function LandingBrandFilm() {
  const videoRef = useRef(null);
  const [started, setStarted] = useState(false);
  const [failed, setFailed] = useState(false);
  const [notice, setNotice] = useState("");

  const play = () => {
    const video = videoRef.current;
    if (!video) return;
    setFailed(false);
    setNotice("正在载入影片…");
    setStarted(true);
    // Assign the source within the user's gesture. There is no MP4 request
    // on arrival, including when this sheet is reused by the cover turn.
    video.src = filmUrl;
    video.focus();
    void video.play().catch((error) => {
      if (error.name === "AbortError") return;
      if (video.error) {
        setFailed(true);
        setNotice("");
      } else {
        setNotice("影片已就绪，请使用播放器的播放按钮继续。");
      }
    });
  };

  return <section className="landing-film" aria-labelledby="landing-film-title">
    <div className="landing-film-copy">
      <p className="landing-film-eyebrow">AN EDITORIAL FILM</p>
      <h2 id="landing-film-title">让记忆，<br />慢慢展开。</h2>
      <p className="landing-film-intro">从一段文字、一张照片，到多年后重新翻开的日子。</p>
    </div>
    <figure className="landing-film-work">
      <div className="landing-film-frame">
        <video
          ref={videoRef}
          className="landing-film-video"
          width="1080"
          height="864"
          poster={posterUrl}
          preload="none"
          playsInline
          controls={started && !failed}
          tabIndex={started && !failed ? 0 : -1}
          aria-label="YING MO — A Page Kept in Time"
          aria-describedby="landing-film-description"
          onPlaying={() => setNotice("")}
          onLoadedData={() => setNotice("")}
          onError={() => { setFailed(true); setNotice(""); }}
        >
          <p>浏览器暂不支持视频播放。<a href={filmUrl}>打开影片文件</a></p>
        </video>
        {!started || failed ? <button className="landing-film-play" type="button" onClick={play}>
          <svg viewBox="0 0 18 18" aria-hidden="true" focusable="false"><path d="m6 3 9 6-9 6Z" /></svg>
          <span>{failed ? "重新载入影片" : "播放影片"}</span>
        </button> : null}
      </div>
      <figcaption className="landing-film-caption">
        <span>YING MO — A Page Kept in Time</span>
        <small>14.5 秒 · 建议开启声音</small>
      </figcaption>
      <p id="landing-film-description" className="landing-film-description">影片里的页面仅供观看。</p>
      {notice ? <p className="landing-film-feedback" role="status">{notice}</p> : null}
      {failed ? <p className="landing-film-feedback" role="alert">影片暂时无法播放，请重新载入。</p> : null}
    </figure>
  </section>;
}
