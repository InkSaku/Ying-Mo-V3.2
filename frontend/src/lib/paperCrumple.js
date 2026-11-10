import { paperMotionAllowed } from "./paperMotion";
import { createPaperBallArt, PAPER_BALL_EDGE, paperBallReady } from "./paperBallArt";

const SVG_NS = "http://www.w3.org/2000/svg";
// 半圈取 32 个点，四角必在其中；每一帧点数相同，clip-path 才能逐点插值。
const HALF_POINTS = PAPER_BALL_EDGE.length / 2;
const BALL_RADIUS = 32;
const INK_LINE = 1.25;
const CRUMPLE_MS = 440;
const DROP_MS = 260;
const COLLAPSE_MS = 200;
const STAGES = [0, .3, .68, 1];
const TILT = [0, -1.5, 3, -9];

const wobble = (amount) => (Math.random() * 2 - 1) * amount;
const lerp = (from, to, amount) => from + (to - from) * amount;
const fixed = (value) => value.toFixed(1);

function outline(width, height) {
  const across = Math.min(HALF_POINTS - 3, Math.max(3, Math.round(HALF_POINTS * width / (width + height))));
  const down = HALF_POINTS - across;
  const points = [];
  for (let i = 0; i < across; i += 1) points.push([width * i / across, 0]);
  for (let i = 0; i < down; i += 1) points.push([width, height * i / down]);
  for (let i = 0; i < across; i += 1) points.push([width - width * i / across, height]);
  for (let i = 0; i < down; i += 1) points.push([0, height - height * i / down]);
  return points;
}

const polygon = (points) => `polygon(${points.map(([x, y]) => `${fixed(x)}px ${fixed(y)}px`).join(", ")})`;

// 纸面比墨边往里收一道线宽，两层叠起来就是带墨边的皱纸。
function inset(points, [cx, cy], amount) {
  return points.map(([x, y]) => {
    const dx = cx - x;
    const dy = cy - y;
    const length = Math.hypot(dx, dy) || 1;
    const step = Math.min(amount, length);
    return [x + dx / length * step, y + dy / length * step];
  });
}

// 起皱阶段保留纸面折线，收拢后由同一轮廓的墨绘纸团接住，避免随机折线挤在一起。
function creasePaths(width, height, [cx, cy]) {
  const reach = Math.max(width, height);
  const point = (x, y) => `${fixed(x)} ${fixed(y)}`;
  const paths = [];
  for (let i = 0; i < 7; i += 1) {
    const angle = Math.random() * Math.PI * 2;
    const back = angle + Math.PI + wobble(.7);
    paths.push(`M${point(cx + Math.cos(angle) * reach, cy + Math.sin(angle) * reach)}`
      + `L${point(cx + wobble(BALL_RADIUS * .6), cy + wobble(BALL_RADIUS * .6))}`
      + `L${point(cx + Math.cos(back) * reach * .4, cy + Math.sin(back) * reach * .4)}`);
  }
  for (let i = 0; i < 8; i += 1) {
    const angle = Math.random() * Math.PI * 2;
    const radius = BALL_RADIUS * (.2 + Math.random() * .55);
    const x = cx + Math.cos(angle) * radius;
    const y = cy + Math.sin(angle) * radius;
    const turn = angle + Math.PI / 2 + wobble(.8);
    const half = 4 + Math.random() * 6;
    paths.push(`M${point(x - Math.cos(turn) * half, y - Math.sin(turn) * half)}`
      + `L${point(x + wobble(2), y + wobble(2))}`
      + `L${point(x + Math.cos(turn) * half, y + Math.sin(turn) * half)}`);
  }
  return paths;
}

function paperColor(style) {
  const color = style.backgroundColor;
  return !color || color === "transparent" || /^rgba\(.*,\s*0\)$/.test(color) ? "var(--page)" : color;
}

/**
 * 把一张纸揉成团丢掉：元素本身逐步收成带墨边和折痕的纸团，落下淡出；
 * collapse 时随后收起占位，让下面的内容补上来。减少动态、页面隐藏或元素不在视口里时直接返回。
 * 结束后元素保持隐藏状态，调用方负责把它从页面上移除或离开页面。
 */
export async function crumpleAway(element, { collapse = false } = {}) {
  if (!element || !paperMotionAllowed()) return;
  const illustrationReady = await paperBallReady;
  // 先等确认框收起、提示条插入后的布局稳定，再量尺寸。
  await new Promise((resolve) => window.requestAnimationFrame(resolve));
  if (!element.isConnected || !paperMotionAllowed()) return;
  const rect = element.getBoundingClientRect();
  if (!rect.width || !rect.height || rect.bottom <= 0 || rect.top >= window.innerHeight) return;

  const { width, height } = rect;
  // 纸团落在元素可见部分的中央，长纸页也不会揉到屏幕外。
  const visibleTop = Math.max(rect.top, 0) - rect.top;
  const visibleBottom = Math.min(rect.bottom, window.innerHeight) - rect.top;
  const center = [width / 2, (visibleTop + visibleBottom) / 2];
  const style = window.getComputedStyle(element);
  const paper = paperColor(style);

  const sheet = outline(width, height);
  const ballArt = createPaperBallArt();
  ballArt.classList.add("paper-crumple-ball");
  ballArt.style.setProperty("--crumple-paper", paper);
  Object.assign(ballArt.style, {
    left: `${fixed(center[0] - BALL_RADIUS)}px`, top: `${fixed(center[1] - BALL_RADIUS)}px`,
    width: `${BALL_RADIUS * 2}px`, height: `${BALL_RADIUS * 2}px`,
  });
  // 外缘来自真实插画，翘起的纸角也随这张纸一起收拢。
  const ball = PAPER_BALL_EDGE.map(([x, y]) => {
    return [center[0] + (x - 60) * BALL_RADIUS / 60, center[1] + (y - 60) * BALL_RADIUS / 60];
  });
  const stage = (amount, roughness) => sheet.map(([x, y], index) => {
    const pull = Math.min(1, Math.max(0, amount + wobble(.06)));
    return [lerp(x, ball[index][0], pull) + wobble(roughness), lerp(y, ball[index][1], pull) + wobble(roughness)];
  });
  const frames = [sheet, stage(.22, 6), stage(.66, 8), ball];

  const art = document.createElement("span");
  art.className = "paper-crumple";
  art.setAttribute("aria-hidden", "true");
  const sheetPaper = document.createElement("span");
  sheetPaper.className = "paper-crumple-paper";
  const veil = document.createElement("span");
  veil.className = "paper-crumple-veil";
  for (const layer of [sheetPaper, veil]) layer.style.background = paper;
  const creases = document.createElementNS(SVG_NS, "svg");
  creases.setAttribute("class", "paper-crumple-creases");
  creases.setAttribute("viewBox", `0 0 ${fixed(width)} ${fixed(height)}`);
  creases.setAttribute("width", fixed(width));
  creases.setAttribute("height", fixed(height));
  for (const d of creasePaths(width, height, center)) {
    const path = document.createElementNS(SVG_NS, "path");
    path.setAttribute("d", d);
    creases.append(path);
  }
  art.append(sheetPaper, veil, creases, ballArt);

  Object.assign(element.style, {
    position: style.position === "static" ? "relative" : style.position,
    zIndex: "3",
    isolation: "isolate",
    background: "var(--text)",
    pointerEvents: "none",
    transformOrigin: `${fixed(center[0])}px ${fixed(center[1])}px`,
  });
  element.append(art);

  const options = { duration: CRUMPLE_MS, easing: "cubic-bezier(.55, 0, .25, 1)", fill: "forwards" };
  const inner = frames.map((points, index) => polygon(inset(points, center, index ? INK_LINE : 0)));
  try {
    const crumple = element.animate(frames.map((points, index) => ({
      offset: STAGES[index], clipPath: polygon(points), transform: `rotate(${TILT[index]}deg)`,
    })), options);
    sheetPaper.animate(inner.map((clipPath, index) => ({ offset: STAGES[index], clipPath })), options);
    veil.animate(inner.map((clipPath, index) => ({ offset: STAGES[index], clipPath, opacity: [0, .15, .92, 1][index] })), options);
    creases.animate([0, .35, .45, illustrationReady ? 0 : .85].map((opacity, index) => ({ offset: STAGES[index], opacity })), options);
    ballArt.animate([
      { offset: 0, opacity: 0, transform: "scale(1.22)" },
      { offset: .55, opacity: 0, transform: "scale(1.22)" },
      { offset: .86, opacity: illustrationReady ? .9 : 0, transform: "scale(1.05)" },
      { offset: 1, opacity: illustrationReady ? 1 : 0, transform: "scale(1)" },
    ], options);
    await crumple.finished;
    if (illustrationReady) {
      // 收拢后只留下插画自身的透明外缘，撤去临时纸面和几何墨边。
      element.style.visibility = "hidden";
      art.style.visibility = "visible";
      for (const layer of [sheetPaper, veil, creases]) layer.style.visibility = "hidden";
    }

    const drop = element.animate([
      { transform: `rotate(${TILT.at(-1)}deg)`, opacity: 1 },
      { transform: "translateY(40px) rotate(130deg)", opacity: 0 },
    ], { duration: DROP_MS, easing: "cubic-bezier(.5, 0, .9, .5)", fill: "forwards" });
    if (!collapse) {
      await drop.finished;
      return;
    }
    const box = window.getComputedStyle(element);
    const keep = ["height", "minHeight", "paddingTop", "paddingBottom", "marginTop", "marginBottom", "borderTopWidth", "borderBottomWidth"];
    const from = Object.fromEntries(keep.map((key) => [key, key === "height" ? `${element.offsetHeight}px` : box[key]]));
    const to = Object.fromEntries(keep.map((key) => [key, "0px"]));
    element.style.boxSizing = "border-box";
    await element.animate([from, to], { duration: COLLAPSE_MS, delay: DROP_MS / 2, easing: "cubic-bezier(.4, 0, .2, 1)", fill: "forwards" }).finished;
  } catch {
    // 元素中途被移除或动画被取消时，交给调用方的后续流程。
  }
}
