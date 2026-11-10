import { createPortal } from "react-dom";
import { useCallback, useLayoutEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { ThemeControl } from "../components/ThemeControl";
import { usePageMeta } from "../hooks/usePageMeta";
import { usePaperDisclosure } from "../hooks/usePaperDisclosure";
import { revealCollection, startCollectionOpening } from "../lib/collectionOpening";
import { animatePhoto, cancelPhotoContinuity } from "../lib/photoContinuity";
import { crumpleAway } from "../lib/paperCrumple";
import { createPaperBallArt } from "../lib/paperBallArt";
import coast from "../assets/home/coast.jpg";
import train from "../assets/home/train.jpg";
import "../styles/paper-motion-preview.css";

function PaperBallIllustration({ actual = false }) {
  const artRef = useRef(null);
  useLayoutEffect(() => {
    const art = createPaperBallArt();
    artRef.current.append(art);
    return () => art.remove();
  }, []);
  return <div ref={artRef} className={`paper-preview-crumple-art${actual ? " is-actual" : ""}`} aria-hidden="true" />;
}

function CrumplePreview() {
  const [round, setRound] = useState(0);
  const [state, setState] = useState("ready");
  const sampleRef = useRef(null);
  const slowFrame = useRef(0);
  useLayoutEffect(() => () => cancelAnimationFrame(slowFrame.current), []);

  const play = async (slow = false) => {
    if (state === "playing") return;
    setRound((value) => value + 1);
    setState("playing");
    await new Promise(requestAnimationFrame);
    const sample = sampleRef.current;
    if (slow) {
      const slowDown = () => {
        for (const animation of sample.getAnimations({ subtree: true })) {
          if (animation.playbackRate !== .15) animation.updatePlaybackRate(.15);
        }
        slowFrame.current = requestAnimationFrame(slowDown);
      };
      slowFrame.current = requestAnimationFrame(slowDown);
    }
    try {
      await crumpleAway(sample, { collapse: true });
    } finally {
      cancelAnimationFrame(slowFrame.current);
      setState("done");
    }
  };

  return <section className="paper-preview-row">
    <div className="paper-preview-label"><h2>揉起一张纸</h2><p>折起的纸角，叠压的纸面，<br />墨线留在最深的折缝里。<br />这里只演示动作，不删除内容。</p>
      <div className="paper-preview-crumple-controls"><button type="button" disabled={state === "playing"} onClick={() => play()}>揉起这张纸</button><button type="button" disabled={state === "playing"} onClick={() => play(true)}>慢放看看</button></div>
      <p className="paper-preview-crumple-status" role="status">{state === "playing" ? "纸页正在收拢。" : state === "done" ? "纸页已收起，可以再放一张。" : "点击可重复体验。"}</p>
    </div>
    <div className="paper-preview-crumple-stage">
      <div className="paper-preview-crumple-specimens">
        <figure><PaperBallIllustration /><figcaption>墨线与纸面</figcaption></figure>
        <figure><PaperBallIllustration actual /><figcaption>实际大小 · 64px</figcaption></figure>
      </div>
      <div className="paper-preview-crumple-sheet-stage">
        <article key={round} ref={sampleRef} className="paper-preview-crumple-sheet" hidden={state === "done"}>
          <small>示例草稿</small><h3>还没写完的一页</h3><p>把暂时不需要的这一页揉起来，<br />留一点位置，给下一个想法。</p>
        </article>
      </div>
    </div>
  </section>;
}

export function PaperMotionPreview() {
  usePageMeta("纸上动作预览");
  const [bookOpen, setBookOpen] = useState(false);
  const [photoOpen, setPhotoOpen] = useState(false);
  const [noteOpen, setNoteOpen] = useState(false);
  const [noteText, setNoteText] = useState("");
  const pageRef = useRef(null);
  const photoCloseRef = useRef(null);
  const closePhoto = useCallback(() => {
    animatePhoto(photoRef.current, thumbRef.current, true);
    setPhotoOpen(false);
  }, []);
  const coverRef = useRef(null);
  const thumbRef = useRef(null);
  const photoRef = useRef(null);
  const noteInputRef = useRef(null);
  const noteButtonRef = useRef(null);
  const [noteRef, rememberNote] = usePaperDisclosure(noteOpen);
  useLayoutEffect(() => {
    if (bookOpen) revealCollection("preview", coverRef.current);
  }, [bookOpen]);
  useLayoutEffect(() => {
    if (!photoOpen) return;
    const image = photoRef.current;
    const lift = () => animatePhoto(image, thumbRef.current);
    if (image.complete) lift();
    else image.addEventListener("load", lift, { once: true });
    return () => image.removeEventListener("load", lift);
  }, [photoOpen]);
  useLayoutEffect(() => {
    if (!photoOpen) return;
    const page = pageRef.current;
    const thumbnailButton = thumbRef.current?.parentElement;
    page.inert = true;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    photoCloseRef.current?.focus();
    const onKey = (event) => {
      if (event.key === "Escape") closePhoto();
      if (event.key === "Tab") { event.preventDefault(); photoCloseRef.current?.focus(); }
    };
    window.addEventListener("keydown", onKey);
    return () => { page.inert = false; document.body.style.overflow = overflow; window.removeEventListener("keydown", onKey); thumbnailButton?.focus({ preventScroll: true }); };
  }, [photoOpen, closePhoto]);
  useLayoutEffect(() => () => cancelPhotoContinuity(), []);
  return <main ref={pageRef} className="paper-motion-preview">
    <header className="paper-preview-header"><Link to="/">映墨</Link><ThemeControl /></header>
    <div className="paper-preview-intro"><h1>把动作，留在纸上。</h1><p>开一本书，拿起一张照片，写下一点今天，揉起不再需要的一页。<br />这里使用示例内容，动作与实际页面共用。</p></div>
    <CrumplePreview />
    <section className="paper-preview-row">
      <div className="paper-preview-label"><h2>打开这一册</h2><p>封面抬起，沿书脊掀开。<br />用在合集目录进入详情。</p>{bookOpen ? <button type="button" onClick={() => setBookOpen(false)}>放回书架</button> : null}</div>
      <div className="paper-preview-book-stage">
        {bookOpen ? <div className="paper-preview-open-book"><div ref={coverRef} className="paper-preview-book-cover"><img src={coast} alt="海边手册封面" /></div><div><h3>海边手册</h3><p>把风、光线与同行的人，<br />收进这一册。</p><span>共同时间轴 · 合集内容 · 共同影像</span></div></div>
          : <article className="collection-card"><button type="button" className="paper-preview-book-button" onClick={(event) => { startCollectionOpening(event, "preview"); setBookOpen(true); }} aria-label="打开示例合集"><div className="collection-card-cover-frame"><img src={coast} alt="" /></div><h3>海边手册</h3><span>点击封面，翻开看看 →</span></button></article>}
      </div>
    </section>
    <section className="paper-preview-row">
      <div className="paper-preview-label"><h2>拿起一张照片</h2><p>从原位展开，再放回原位。<br />用在照片墙与媒体灯箱。</p></div>
      <div className="paper-preview-photo-stage">
        <button type="button" className="paper-preview-thumbnail" onClick={() => setPhotoOpen(true)} disabled={photoOpen} aria-label="拿起示例照片"><img ref={thumbRef} src={train} alt="列车窗外的风景" /></button>
        {photoOpen ? createPortal(<div className="paper-preview-photo-expanded" role="dialog" aria-modal="true" aria-label="示例照片" onClick={(event) => { if (event.target === event.currentTarget) closePhoto(); }}><img ref={photoRef} src={train} alt="展开的列车窗外风景" /><button ref={photoCloseRef} type="button" onClick={closePhoto}>放回原处 ↙</button></div>, document.body) : <p className="paper-preview-photo-caption">旅途中，留下的一张。</p>}
      </div>
    </section>
    <section className="paper-preview-row">
      <div className="paper-preview-label"><h2>展开一张便笺</h2><p>纸面随书写舒展。<br />用在首页快速随记。</p></div>
      <div ref={noteRef} className="paper-preview-note">
        {noteOpen ? <><div className="paper-preview-note-heading"><label htmlFor="paper-preview-writing">写随记</label><button type="button" onClick={() => { rememberNote(); setNoteOpen(false); requestAnimationFrame(() => noteButtonRef.current?.focus({ preventScroll: true })); }}>收起</button></div><textarea ref={noteInputRef} id="paper-preview-writing" value={noteText} onChange={(event) => setNoteText(event.target.value)} placeholder="写点什么，或留下一张照片……" /><p>示例便笺，可体验展开与收起。</p></>
          : <button ref={noteButtonRef} type="button" className="paper-preview-note-prompt" onClick={() => { rememberNote(); setNoteOpen(true); requestAnimationFrame(() => noteInputRef.current?.focus({ preventScroll: true })); }}><strong>写随记</strong><span>今天想记住什么？</span><small>开始写 ↗</small></button>}
      </div>
    </section>
    <footer className="paper-preview-footer"><Link to="/collections">去合集体验 →</Link><Link to="/home">去首页写随记 →</Link><Link to="/dev/theme-ink">纸墨换色 →</Link></footer>
  </main>;
}
