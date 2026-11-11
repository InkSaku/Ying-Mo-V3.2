// Text turning into ink: glyphs flake off the page as small ink dots, drift on
// a light wind, then gather into an ink drawing. Native canvas 2D and rAF only.
const TAU = Math.PI * 2;
const MAX_PARTICLES = 5200;
const SVG_PROPS = [
  "fill", "fill-opacity", "fill-rule", "stroke", "stroke-width", "stroke-opacity", "stroke-linecap",
  "stroke-linejoin", "stroke-dasharray", "opacity", "display", "visibility", "transform",
  "transform-origin", "transform-box", "vector-effect",
];

export const prefersReducedMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const clamp01 = (value) => Math.min(1, Math.max(0, value));
const smoothstep = (from, to, value) => { const x = clamp01((value - from) / (to - from)); return x * x * (3 - 2 * x); };
const easeInOut = (x) => (x < .5 ? 4 * x * x * x : 1 - ((-2 * x + 2) ** 3) / 2);
function hash(seed) { const s = Math.sin(seed * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); }

function newCanvas(width, height, dpr) {
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.ceil(width * dpr));
  canvas.height = Math.max(1, Math.ceil(height * dpr));
  return canvas;
}

// An inline SVG styled by stylesheets loses its look when serialised; carry
// the computed paint and transforms so the bitmap matches what is on screen.
async function rasterizeLiveSvg(svg) {
  const bounds = svg.getBoundingClientRect();
  if (!bounds.width || !bounds.height) return null;
  const clone = svg.cloneNode(true);
  const source = [svg, ...svg.querySelectorAll("*")];
  const copy = [clone, ...clone.querySelectorAll("*")];
  source.forEach((element, index) => {
    const style = getComputedStyle(element);
    const props = index === 0 ? SVG_PROPS.filter((name) => !name.startsWith("transform")) : SVG_PROPS;
    copy[index].setAttribute("style", props.map((name) => `${name}:${style.getPropertyValue(name)}`).join(";"));
    copy[index].removeAttribute("class");
  });
  clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  clone.setAttribute("width", String(bounds.width));
  clone.setAttribute("height", String(bounds.height));
  const image = new Image();
  image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(new XMLSerializer().serializeToString(clone))}`;
  await image.decode();
  return { image, bounds };
}

function drawText(ctx, element, frame) {
  const clip = element.getBoundingClientRect();
  const range = document.createRange();
  const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const style = getComputedStyle(node.parentElement);
    if (style.visibility !== "visible" || style.display === "none") continue;
    ctx.font = `${style.fontStyle} ${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
    ctx.fillStyle = style.color;
    const metrics = ctx.measureText("永");
    const size = parseFloat(style.fontSize) || 16;
    const ascent = metrics.fontBoundingBoxAscent ?? size * .88;
    const descent = metrics.fontBoundingBoxDescent ?? size * .12;
    const upper = style.textTransform === "uppercase";
    const text = node.data;
    for (let index = 0; index < text.length;) {
      const length = text.codePointAt(index) > 0xffff ? 2 : 1;
      const char = text.slice(index, index + length);
      if (char.trim()) {
        range.setStart(node, index);
        range.setEnd(node, index + length);
        const rect = range.getBoundingClientRect();
        // Skip glyphs cut off by line clamps or overflow.
        if (rect.width && rect.bottom <= clip.bottom + 1 && rect.right <= clip.right + 1) {
          const baseline = rect.top + (rect.height - ascent - descent) / 2 + ascent;
          ctx.fillText(upper ? char.toUpperCase() : char, rect.left - frame.left, baseline - frame.top);
        }
      }
      index += length;
    }
  }
  range.detach?.();
}

// Grid cells over the painted pixels: every inked cell is erased when it
// flakes off; cells with enough ink also become dots.
function scanCells(canvas, dpr, step, area, offset = { x: 0, y: 0 }) {
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  const left = Math.max(0, Math.floor(area.left * dpr));
  const top = Math.max(0, Math.floor(area.top * dpr));
  const width = Math.min(canvas.width - left, Math.ceil(area.width * dpr));
  const height = Math.min(canvas.height - top, Math.ceil(area.height * dpr));
  if (width <= 0 || height <= 0) return [];
  const { data } = ctx.getImageData(left, top, width, height);
  const cell = Math.max(1, Math.round(step * dpr));
  const cells = [];
  for (let y = 0; y < height; y += cell) {
    for (let x = 0; x < width; x += cell) {
      let sum = 0;
      let count = 0;
      for (let yy = y; yy < Math.min(height, y + cell); yy += 1) {
        for (let xx = x; xx < Math.min(width, x + cell); xx += 1) {
          sum += data[(yy * width + xx) * 4 + 3];
          count += 1;
        }
      }
      if (!sum) continue;
      cells.push({
        x: (left + x + cell / 2) / dpr + offset.x,
        y: (top + y + cell / 2) / dpr + offset.y,
        ink: sum / count / 255,
      });
    }
  }
  return cells;
}

/**
 * Create the dot field on a canvas that covers `frame` (a client rect).
 * Call prepareSource, then setTargets, then draw(t) every frame.
 */
export function createInkScatter(canvas, frame, { ink = "#242520", paper = "#f8f7f3" } = {}) {
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  canvas.width = Math.ceil(frame.width * dpr);
  canvas.height = Math.ceil(frame.height * dpr);
  const ctx = canvas.getContext("2d");
  let sprite;
  let spriteCtx;
  let step = 2.4;
  let cells = [];
  let erased = 0;
  let particles = [];
  let arrival = Infinity;

  async function prepareSource(elements, { cellSize = 2.4, sweepStart = 0, sweepDuration = 600 } = {}) {
    step = cellSize;
    sprite = newCanvas(frame.width, frame.height, dpr);
    spriteCtx = sprite.getContext("2d", { willReadFrequently: true });
    spriteCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
    spriteCtx.textAlign = "left";
    spriteCtx.textBaseline = "alphabetic";
    let area;
    for (const element of elements) {
      const bounds = element.getBoundingClientRect();
      if (!bounds.width || bounds.bottom < frame.top || bounds.top > frame.bottom) continue;
      if (element instanceof SVGSVGElement) {
        const raster = await rasterizeLiveSvg(element).catch(() => null);
        if (raster) spriteCtx.drawImage(raster.image, bounds.left - frame.left, bounds.top - frame.top, bounds.width, bounds.height);
      } else {
        drawText(spriteCtx, element, frame);
      }
      const local = { left: bounds.left - frame.left - 4, top: bounds.top - frame.top - 4, right: bounds.right - frame.left + 4, bottom: bounds.bottom - frame.top + 4 };
      area = area ? {
        left: Math.min(area.left, local.left), top: Math.min(area.top, local.top),
        right: Math.max(area.right, local.right), bottom: Math.max(area.bottom, local.bottom),
      } : local;
    }
    if (!area) return 0;
    cells = scanCells(sprite, dpr, step, { ...area, width: area.right - area.left, height: area.bottom - area.top });
    // A wind from the left: cells flake off in a slightly ragged sweep.
    const w = Math.max(1, area.right - area.left);
    const h = Math.max(1, area.bottom - area.top);
    cells.forEach((cell, index) => {
      cell.order = .74 * (cell.x - area.left) / w + .26 * (cell.y - area.top) / h + (hash(index + .3) - .5) * .2;
    });
    const orders = cells.map((cell) => cell.order);
    const low = Math.min(...orders);
    const span = Math.max(.001, Math.max(...orders) - low);
    cells.forEach((cell) => { cell.release = sweepStart + sweepDuration * (cell.order - low) / span; });
    cells.sort((a, b) => a.release - b.release);
    erased = 0;

    const inked = cells.filter((cell) => cell.ink > .16);
    const keep = Math.min(1, MAX_PARTICLES / Math.max(1, inked.length));
    particles = inked.filter((_, index) => hash(index * 1.7) < keep).map((cell, index) => makeParticle(cell, index));
    return particles.length;
  }

  function makeParticle(cell, index) {
    const r = hash(index + 11.1);
    return {
      ox: cell.x, oy: cell.y, release: cell.release,
      vx: 34 + 120 * hash(index + 2.2), vy: -(10 + 64 * hash(index + 3.3)),
      wob: 3 + 13 * hash(index + 4.4), phase: TAU * hash(index + 5.5),
      size: step * (.34 + .26 * r) * (.7 + .3 * cell.ink),
      tone: r < .2 ? .55 : r < .45 ? .78 : 1,
      tx: cell.x, ty: cell.y, tsize: 0, start: Infinity, duration: 1, born: -Infinity, arc: 0,
    };
  }

  function driftAt(particle, t) {
    const tau = Math.max(0, t - particle.release) / 1000;
    const settle = Math.min(1, tau * 2.5);
    return [
      particle.ox + particle.vx * tau + particle.wob * Math.sin(particle.phase + tau * 2.3) * settle,
      particle.oy + particle.vy * tau - 18 * tau * tau + particle.wob * Math.cos(particle.phase * 1.3 + tau * 1.9) * settle,
    ];
  }

  /** points: [{x, y}] in client coordinates; dots fly there from `start` ms. */
  function setTargets(points, { start, stagger = 280, duration = 700, size = 1.2 } = {}) {
    if (!points.length || !particles.length) return;
    const local = points.map((point) => ({ x: point.x - frame.left, y: point.y - frame.top, ink: point.ink ?? 1 }));
    // Extra dots split off existing ones so a dense drawing still fills in.
    const base = particles.length;
    for (let index = base; index < local.length && particles.length < MAX_PARTICLES * 1.3; index += 1) {
      const parent = particles[Math.floor(hash(index * .91) * base)];
      particles.push({ ...parent, born: start, tone: parent.tone * .9 });
    }
    // Pair dots and points along a shared angle so the gather reads as one inward pull.
    const cx = local.reduce((sum, point) => sum + point.x, 0) / local.length;
    const cy = local.reduce((sum, point) => sum + point.y, 0) / local.length;
    const angle = (x, y) => Math.atan2(y - cy, x - cx);
    const targets = local.map((point, index) => ({ ...point, key: angle(point.x, point.y) + hash(index + 7.7) * .6 })).sort((a, b) => a.key - b.key);
    const order = particles.map((particle, index) => {
      const [x, y] = driftAt(particle, start);
      return { particle, key: angle(x, y) + hash(index + 8.8) * .6 };
    }).sort((a, b) => a.key - b.key);
    arrival = start;
    order.forEach(({ particle }, index) => {
      const target = targets[Math.floor(index * targets.length / order.length)];
      const jitter = hash(index + 9.9);
      particle.tx = target.x + (jitter - .5) * size * .8;
      particle.ty = target.y + (hash(index + 10.1) - .5) * size * .8;
      particle.tsize = size * (.42 + .22 * jitter) * (.75 + .25 * target.ink);
      particle.start = start + stagger * hash(index + 12.3);
      particle.duration = duration * (.82 + .36 * hash(index + 13.4));
      particle.arc = (hash(index + 14.5) - .5) * 70;
      arrival = Math.max(arrival, particle.start + particle.duration);
    });
  }

  function draw(t, { backdrop = 0, dots = 1, text = 1 } = {}) {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, frame.width, frame.height);
    if (backdrop > 0) {
      ctx.globalAlpha = backdrop;
      ctx.fillStyle = paper;
      ctx.fillRect(0, 0, frame.width, frame.height);
    }
    if (sprite) {
      const size = step * dpr + 1;
      while (erased < cells.length && cells[erased].release <= t) {
        const cell = cells[erased];
        spriteCtx.clearRect((cell.x - step / 2) - .5 / dpr, (cell.y - step / 2) - .5 / dpr, size / dpr, size / dpr);
        erased += 1;
      }
      if (text > 0 && erased < cells.length) {
        ctx.globalAlpha = text;
        ctx.drawImage(sprite, 0, 0, frame.width, frame.height);
      }
    }
    if (dots <= 0) return;
    ctx.fillStyle = ink;
    for (const tone of [.55, .78, 1, .9 * .55, .9 * .78, .9]) {
      ctx.globalAlpha = tone * dots;
      ctx.beginPath();
      for (const particle of particles) {
        if (particle.tone !== tone || t < particle.release) continue;
        let [x, y] = driftAt(particle, t);
        let radius = particle.size * (1 - .25 * smoothstep(0, 600, t - particle.release));
        if (t > particle.start) {
          const progress = clamp01((t - particle.start) / particle.duration);
          const eased = easeInOut(progress);
          const bend = Math.sin(progress * Math.PI) * particle.arc;
          x += (particle.tx - x) * eased + bend * .6;
          y += (particle.ty - y) * eased - bend * .4;
          radius += (particle.tsize - radius) * eased;
          if (particle.born > -Infinity && progress < .3) radius *= progress / .3;
        } else if (particle.born > -Infinity) continue;
        if (radius < .15) continue;
        ctx.moveTo(x + radius, y);
        ctx.arc(x, y, radius, 0, TAU);
      }
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  return { prepareSource, setTargets, draw, get arrival() { return arrival; }, get count() { return particles.length; } };
}

/** Sample an on-screen SVG drawing into target points (client coordinates). */
export async function sampleSvgTargets(svg, { cellSize = 2.2 } = {}) {
  const raster = await rasterizeLiveSvg(svg);
  if (!raster) return [];
  const { image, bounds } = raster;
  const canvas = newCanvas(bounds.width, bounds.height, 1);
  canvas.getContext("2d", { willReadFrequently: true }).drawImage(image, 0, 0, bounds.width, bounds.height);
  return scanCells(canvas, 1, cellSize, { left: 0, top: 0, width: bounds.width, height: bounds.height }, { x: bounds.left, y: bounds.top })
    .filter((cell) => cell.ink > .12);
}

export { smoothstep };
