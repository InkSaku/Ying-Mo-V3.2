// Adapted from Bencho Emoji Reactions, Copyright (c) 2026 Lorenzo Cabra (MIT).
// Source: cabralorenzo/bencho@30ab35a; licence: /licenses/bencho-MIT.txt.
import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { api } from "../lib/api";
import { normalizeReactions, optimisticReaction } from "../lib/reactions";

// Sample a damped spring for the native engine; no idle animation loop.
const spring = (draw) => Array.from({ length: 37 }, (_, i) => {
  const t = i / 36;
  const p = i === 36 ? 1 : 1 - Math.exp(-7 * t) * (Math.cos(9 * t) + 7 / 9 * Math.sin(9 * t));
  return draw(p);
});
const mix = (a, b, p) => a + (b - a) * p;
const center = (rect) => ({ x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 });

function ReactionFace() {
  return <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden="true"><path d="M20.5 12.5a8.5 8.5 0 1 1-9-9M7.8 14.3c1.5 2.1 4.9 2.1 6.4 0M8 9h.01M13 9h.01M19 2v6M16 5h6" /></svg>;
}

function ReactionCount({ count, reduced }) {
  const root = useRef(null);
  const previous = useRef(count);
  useLayoutEffect(() => {
    const before = String(previous.current).padStart(String(count).length, " ").slice(-String(count).length);
    const up = count >= previous.current ? 1 : -1;
    previous.current = count;
    if (reduced || !root.current.animate) return undefined;
    const animations = [], ghosts = [];
    [...root.current.children].forEach((column, index) => {
      const digit = column.firstElementChild;
      if (!digit || digit.textContent === before[index]) return;
      const old = digit.cloneNode();
      old.textContent = before[index] || " ";
      old.className = "reaction-digit-old";
      column.append(old);
      ghosts.push(old);
      animations.push(digit.animate([{ transform: `translateY(${up * 100}%)` }, { transform: "translateY(0)" }], { duration: 300, easing: "cubic-bezier(.22,.8,.25,1)" }));
      const exit = old.animate([{ transform: "translateY(0)" }, { transform: `translateY(${-up * 100}%)` }], { duration: 300, easing: "cubic-bezier(.22,.8,.25,1)", fill: "forwards" });
      animations.push(exit);
      exit.finished.then(() => { old.remove(); exit.cancel(); }).catch(() => {});
    });
    return () => { animations.forEach((animation) => animation.cancel()); ghosts.forEach((ghost) => ghost.remove()); };
  }, [count, reduced]);
  return <span ref={root} className="reaction-count" aria-hidden="true">{String(count).split("").map((digit, index, digits) => <span className="reaction-digit" key={digits.length - index}><span>{digit}</span></span>)}</span>;
}

export function ReactionPicker(props) {
  // Late responses for another article/comment cannot update this target.
  return <ReactionControl key={`${props.readPath}|${props.writePath}`} {...props} />;
}

function ReactionControl({ initialState, readPath, writePath, compact = false }) {
  const menuId = useId();
  const [state, setState] = useState(() => normalizeReactions(initialState));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState(null);
  const [hovered, setHovered] = useState(-1);
  const [flight, setFlight] = useState(null);
  const [reduced, setReduced] = useState(() => window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  const root = useRef(null), trigger = useRef(null), menu = useRef(null), flyer = useRef(null);
  const surface = useRef(null), returningFace = useRef(null);
  const chips = useRef(new Map()), glyphs = useRef([]), animations = useRef(new Map());
  const oldRects = useRef(new Map()), startedFlight = useRef(null), landing = useRef(null);
  const initialSignature = useRef(JSON.stringify(normalizeReactions(initialState)));
  const current = useRef(state);
  const operation = useRef({ active: true, busy: false, controller: null });

  const stopMotion = () => {
    animations.current.forEach((animation) => animation.cancel());
    animations.current.clear();
  };

  const play = (element, frames, duration = 420, done) => {
    if (!element || reduced || !element.animate) { done?.(); return; }
    animations.current.get(element)?.cancel();
    const animation = element.animate(frames, { duration, fill: "both" });
    animations.current.set(element, animation);
    animation.finished.then(() => {
      if (animations.current.get(element) !== animation) return;
      animations.current.delete(element);
      animation.cancel();
      done?.();
    }).catch(() => {});
  };

  const commit = (next) => {
    if (next.selected === current.current.selected
      && next.items.every((item, index) => item.count === current.current.items[index].count)) return;
    oldRects.current = new Map([...chips.current].map(([kind, element]) => [kind, element.getBoundingClientRect()]));
    oldRects.current.set("add", trigger.current.getBoundingClientRect());
    current.current = next;
    setState(next);
  };

  useEffect(() => {
    const session = { active: true, busy: false, controller: new AbortController() };
    operation.current = session;
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const preference = () => {
      if (menu.current?.contains(document.activeElement)) trigger.current?.focus({ preventScroll: true });
      stopMotion();
      setReduced(media.matches);
      setFlight(null);
      setPosition(null);
      setOpen(false);
      setHovered(-1);
    };
    media.addEventListener("change", preference);
    const running = animations.current;
    return () => {
      session.active = false;
      session.controller.abort();
      media.removeEventListener("change", preference);
      running.forEach((animation) => animation.cancel());
      running.clear();
    };
  }, []);

  useEffect(() => {
    const signature = JSON.stringify(normalizeReactions(initialState));
    if (signature === initialSignature.current) return;
    initialSignature.current = signature;
    if (!operation.current.busy) {
      current.current = normalizeReactions(initialState);
      setState(current.current);
    }
  }, [initialState]);

  const close = (restoreFocus = false) => {
    setOpen(false);
    setHovered(-1);
    if (restoreFocus) trigger.current?.focus({ preventScroll: true });
  };

  const show = () => {
    if (operation.current.busy) return;
    const anchor = trigger.current.getBoundingClientRect();
    const viewport = window.visualViewport;
    const leftEdge = (viewport?.offsetLeft || 0) + 12, topEdge = (viewport?.offsetTop || 0) + 12;
    const width = Math.min(282, (viewport?.width || window.innerWidth) - 24);
    const rightEdge = leftEdge + (viewport?.width || window.innerWidth) - 24;
    const bottomEdge = topEdge + (viewport?.height || window.innerHeight) - 24;
    const above = anchor.top - topEdge >= 86;
    setPosition((existing) => existing ? { ...existing, anchor } : {
      left: Math.max(leftEdge, Math.min(anchor.left, rightEdge - width)),
      top: Math.max(topEdge, Math.min(above ? anchor.top - 74 : anchor.bottom + 14, bottomEdge - 60)),
      width,
      anchor,
    });
    setOpen(true);
  };

  useEffect(() => {
    if (!position && !flight) return undefined;
    const outside = (event) => {
      if (!root.current?.contains(event.target) && !menu.current?.contains(event.target)) close();
    };
    const interrupt = () => {
      if (menu.current?.contains(document.activeElement)) trigger.current?.focus({ preventScroll: true });
      stopMotion();
      setFlight(null);
      setOpen(false);
      setPosition(null);
      setHovered(-1);
    };
    document.addEventListener("pointerdown", outside, true);
    window.addEventListener("scroll", interrupt, true);
    window.addEventListener("resize", interrupt);
    window.addEventListener("blur", interrupt);
    window.addEventListener("pagehide", interrupt);
    document.addEventListener("visibilitychange", interrupt);
    window.visualViewport?.addEventListener("resize", interrupt);
    return () => {
      document.removeEventListener("pointerdown", outside, true);
      window.removeEventListener("scroll", interrupt, true);
      window.removeEventListener("resize", interrupt);
      window.removeEventListener("blur", interrupt);
      window.removeEventListener("pagehide", interrupt);
      document.removeEventListener("visibilitychange", interrupt);
      window.visualViewport?.removeEventListener("resize", interrupt);
    };
  }, [position, flight]);

  useLayoutEffect(() => {
    const element = menu.current;
    const skin = surface.current;
    if (!position || !element || !skin) return;
    const { anchor, left, top, width } = position;
    // The add button can move when chips appear. Its layout position, rather
    // than the opening snapshot or an in-flight FLIP transform, is the return.
    const buttonRect = trigger.current.getBoundingClientRect();
    const buttonTransform = new DOMMatrix(getComputedStyle(trigger.current).transform);
    const destination = open ? { left, top, width, height: 60 } : {
      left: buttonRect.left - buttonTransform.e,
      top: buttonRect.top - buttonTransform.f,
      width: 44, height: 44,
    };
    const from = animations.current.has(skin) ? skin.getBoundingClientRect()
      : open ? anchor : { left, top, width, height: 60 };
    // Keep a full-size inner row. Only the surface transforms, so closing
    // never reflows six buttons into a shrinking flex box.
    const samples = Array.from({ length: 37 }, (_, index) => {
      const t = index / 36;
      return index === 36 ? 1 : (1 - (1 + 8 * t) * Math.exp(-8 * t)) / (1 - 9 * Math.exp(-8));
    });
    const frames = samples.map((p) => {
      const w = mix(from.width, destination.width, p), h = mix(from.height, destination.height, p);
      const radius = mix(open ? 22 : 30, open ? 30 : 22, p);
      return {
        transform: `translate(${mix(from.left, destination.left, p) - left}px, ${mix(from.top, destination.top, p) - top}px) scale(${w / width}, ${h / 60})`,
        borderRadius: `${radius * width / w}px / ${radius * 60 / h}px`,
      };
    });
    const duration = open ? 320 : 380;
    const face = returningFace.current;
    const faceStyle = getComputedStyle(face), faceMatrix = new DOMMatrix(faceStyle.transform);
    const faceFrom = animations.current.has(face) ? {
      x: faceMatrix.e, y: faceMatrix.f, opacity: parseFloat(faceStyle.opacity),
    } : { x: from.left - left + from.width / 2 - 22, y: from.top - top + from.height / 2 - 22, opacity: open ? 1 : 0 };
    const faceFrames = samples.map((p) => ({
      transform: `translate(${mix(faceFrom.x, destination.left - left + destination.width / 2 - 22, p)}px, ${mix(faceFrom.y, destination.top - top + destination.height / 2 - 22, p)}px)`,
      opacity: open ? faceFrom.opacity * Math.max(0, 1 - p * 3) : mix(faceFrom.opacity, 1, Math.max(0, (p - .55) / .45)),
    }));
    play(skin, frames, duration, () => {
      // Hold the endpoint until React removes the portal. Cancelling a filled
      // animation first would flash the full-size surface back for one frame.
      Object.assign(skin.style, frames.at(-1));
      if (!open) setPosition(null);
    });
    play(face, faceFrames, duration, () => Object.assign(face.style, faceFrames.at(-1)));
    [...element.querySelectorAll(".reaction-choice")].forEach((button, index) => {
      const style = getComputedStyle(button), matrix = new DOMMatrix(style.transform);
      const opacity = parseFloat(style.opacity);
      const rect = button.getBoundingClientRect();
      const dx = destination.left + 22 - (rect.left - matrix.e + rect.width / 2);
      const dy = destination.top + 22 - (rect.top - matrix.f + rect.height / 2);
      button.style.opacity = "1";
      play(button, open ? [
        { opacity: 0, transform: "translateY(8px) scale(.65)", offset: 0 },
        { opacity: 0, transform: "translateY(8px) scale(.65)", offset: .08 + index * .035 },
        { opacity: 1, transform: "translateY(0) scale(1)", offset: 1 },
      ] : samples.map((p) => ({
        opacity: opacity * Math.max(0, 1 - p * 1.8),
        transform: `translate(${mix(matrix.e, dx, p)}px, ${mix(matrix.f, dy, p)}px) scale(${mix(matrix.a, .3, p)})`,
      })), open ? 300 : duration, () => { if (!open) button.style.opacity = "0"; });
    });
    if (open) (element.querySelector('[aria-checked="true"]') || element.querySelector("button"))?.focus({ preventScroll: true });
    // Unrelated state updates must not restart the capsule's spring.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, position, reduced]);

  useLayoutEffect(() => {
    const elements = new Map(chips.current);
    elements.set("add", trigger.current);
    elements.forEach((element) => { animations.current.get(element)?.cancel(); animations.current.delete(element); });
    const positions = new Map([...elements].map(([kind, element]) => [kind, element.getBoundingClientRect()]));
    const target = flight && chips.current.get(flight.kind)?.querySelector(".reaction-chip-emoji");
    const to = target ? center(target.getBoundingClientRect()) : null;
    for (const [kind, rect] of positions) {
      const element = elements.get(kind), old = oldRects.current.get(kind);
      if (!old) {
        if (kind !== "add" && oldRects.current.size) play(element, spring((p) => ({ opacity: Math.min(1, p), transform: `scale(${mix(.65, 1, p)})` })));
        continue;
      }
      const dx = old.left - rect.left, dy = old.top - rect.top;
      if (Math.abs(dx) + Math.abs(dy) > .5) play(element, spring((p) => ({ transform: `translate(${dx * (1 - p)}px, ${dy * (1 - p)}px)` })));
    }
    oldRects.current.clear();
    if (landing.current) {
      const glyph = chips.current.get(landing.current)?.querySelector(".reaction-chip-emoji");
      play(glyph, spring((p) => ({ transform: `scale(${mix(1.12, 1, p)}, ${mix(.82, 1, p)})` })), 360);
      landing.current = null;
    }
    if (!flight || startedFlight.current === flight || reduced) return;
    startedFlight.current = flight;
    if (!to || !flyer.current) { setFlight(null); return; }
    const controlY = Math.min(flight.y, to.y) - 46;
    const frames = Array.from({ length: 45 }, (_, i) => {
      const progress = i / 44;
      const t = progress * progress * (3 - 2 * progress), q = 1 - t;
      const x = q * q * flight.x + 2 * q * t * (flight.x + to.x) / 2 + t * t * to.x;
      const y = q * q * flight.y + 2 * q * t * controlY + t * t * to.y;
      return { transform: `translate(${x}px, ${y}px) translate(-50%, -50%) rotate(${-14 * Math.sin(t * Math.PI)}deg) scale(${1.3 - .3 * t})` };
    });
    play(flyer.current, frames, 560, () => {
      setFlight(null);
      play(target, spring((p) => ({ transform: `scale(${mix(1.16, 1, p)}, ${mix(.76, 1, p)}) rotate(${mix(-8, 0, p)}deg)` })), 420);
    });
    // Measure the committed landing once; server counts cannot restart a flight.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state, flight, reduced]);

  const magnify = (x = null, index = -1) => {
    if (!open) return;
    if (reduced) { setHovered(index); return; }
    let nearest = index, nearestDistance = Infinity;
    glyphs.current.forEach((element, i) => {
      if (!element) return;
      const rect = element.parentElement.getBoundingClientRect();
      const distance = x === null ? (index < 0 ? Infinity : Math.abs(i - index) * 44) : Math.abs(x - rect.left - rect.width / 2);
      if (distance < nearestDistance) { nearestDistance = distance; nearest = i; }
      const heat = Math.exp(-((distance / 28) ** 2));
      const matrix = new DOMMatrix(getComputedStyle(element).transform);
      const scale = 1 + .3 * heat, y = -6 * heat;
      element.style.transform = `translateY(${y}px) scale(${scale})`;
      play(element, spring((p) => ({ transform: `translateY(${mix(matrix.f, y, p)}px) scale(${mix(matrix.a, scale, p)})` })), 260);
    });
    setHovered(nearest);
  };

  const choose = async (kind, source = null) => {
    const session = operation.current;
    if (session.busy || !session.active) return;
    session.busy = true; // Lock even two clicks arriving before React renders.
    const previous = current.current, optimistic = optimisticReaction(previous, kind);
    if (flight) {
      animations.current.get(flyer.current)?.cancel();
      animations.current.delete(flyer.current);
      setFlight(null);
    }
    if (!source && optimistic.selected) landing.current = kind;
    if (source && optimistic.selected && !reduced) {
      setFlight({
        kind,
        emoji: optimistic.items.find((item) => item.kind === kind).emoji,
        previousCount: previous.items.find((item) => item.kind === kind).count,
        ...center((source.firstElementChild || source).getBoundingClientRect()),
      });
    }
    close(Boolean(source) || (previous.selected === kind && previous.items.find((item) => item.kind === kind).count === 1));
    commit(optimistic);
    setBusy(true);
    setError("");
    setNotice(optimistic.selected ? `已回应：${optimistic.items.find((item) => item.kind === optimistic.selected).label}` : "已取消回应");
    try {
      const result = await api.put(writePath, { kind: optimistic.selected }, { signal: session.controller.signal });
      if (session.active) commit(normalizeReactions(result.data));
    } catch (actionError) {
      if (!session.active) return;
      stopMotion();
      setFlight(null);
      setPosition(null);
      commit(previous);
      setNotice("");
      try {
        const result = await api.get(readPath, { signal: session.controller.signal });
        if (session.active) commit(normalizeReactions(result.data));
      } catch { /* Keep the pre-request state when reconciliation is unavailable. */ }
      if (session.active) setError(`回应失败：${actionError.message}，请重试。`);
    } finally {
      session.busy = false;
      if (session.active) setBusy(false);
    }
  };

  const menuKeys = (event) => {
    const buttons = [...menu.current.querySelectorAll(".reaction-choice")];
    const index = buttons.indexOf(document.activeElement);
    const next = { ArrowRight: (index + 1) % 6, ArrowLeft: (index + 5) % 6, Home: 0, End: 5 }[event.key];
    if (next !== undefined) { event.preventDefault(); buttons[next].focus(); }
    if (event.key === "Escape") { event.preventDefault(); close(true); }
    if (event.key === "Tab") close(true);
  };

  return <div ref={root} className={`reaction-picker${compact ? " reaction-picker-compact" : ""}`} aria-label="表情回应" aria-busy={busy || undefined}>
    <div className="reaction-options">
      {state.items.filter((item) => item.count > 0 || item.kind === state.selected).map((item) => <button
        key={item.kind} ref={(element) => { if (element) chips.current.set(item.kind, element); else chips.current.delete(item.kind); }}
        className={`reaction-chip${state.selected === item.kind ? " selected" : ""}`} type="button"
        aria-disabled={busy || undefined} aria-pressed={state.selected === item.kind}
        aria-label={`${item.label}，当前 ${item.count} 人${state.selected === item.kind ? "，再次点击取消" : ""}`}
        onClick={() => { void choose(item.kind); }}
      ><span className="reaction-chip-emoji" data-flying={flight?.kind === item.kind || undefined} aria-hidden="true">{item.emoji}</span><ReactionCount count={flight?.kind === item.kind ? flight.previousCount : item.count} reduced={reduced} /></button>)}
      <button ref={trigger} type="button" className="reaction-add" data-morphing={Boolean(position) && !reduced || undefined} aria-label={busy ? "正在保存回应" : open ? "关闭回应选择器" : "添加回应"}
        aria-expanded={open} aria-controls={position ? menuId : undefined} aria-haspopup="menu" aria-disabled={busy || undefined}
        onClick={() => { if (open) close(true); else show(); }}
        onKeyDown={(event) => { if (event.key === "ArrowDown" || event.key === "ArrowUp") { event.preventDefault(); show(); } if (event.key === "Escape") close(true); }}
      ><ReactionFace /></button>
    </div>
    <span className="sr-only" role="status">{busy ? "正在保存回应" : notice}</span>
    {error ? <p className="reaction-error" role="alert">{error}</p> : null}
    {position ? createPortal(<div ref={menu} id={menuId} className={`reaction-menu${compact ? " reaction-menu-compact" : ""}`} role="menu" aria-label="选择一种回应" inert={!open}
      style={{ left: position.left, top: position.top, width: position.width }} onKeyDown={menuKeys}
      onPointerMove={(event) => { if (event.pointerType === "mouse") magnify(event.clientX); }} onPointerLeave={() => magnify()}
      onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget) && event.relatedTarget !== trigger.current) close(); }}
    ><span ref={surface} className="reaction-menu-surface" aria-hidden="true" /><span ref={returningFace} className="reaction-menu-return" aria-hidden="true"><ReactionFace /></span>
      {state.items.map((item, index) => <button key={item.kind} className="reaction-choice" type="button" role="menuitemradio" aria-checked={state.selected === item.kind} aria-label={item.label}
      onFocus={() => magnify(null, index)} onClick={(event) => { void choose(item.kind, event.currentTarget); }}
    ><span ref={(element) => { glyphs.current[index] = element; }} aria-hidden="true">{item.emoji}</span></button>)}
      {hovered >= 0 && open ? <span className="reaction-tip" aria-hidden="true" style={{ left: `${(hovered + .5) / 6 * 100}%` }}>{state.items[hovered].label}</span> : null}
    </div>, document.body) : null}
    {flight ? createPortal(<span ref={flyer} className="reaction-fly" aria-hidden="true">{flight.emoji}</span>, document.body) : null}
  </div>;
}
