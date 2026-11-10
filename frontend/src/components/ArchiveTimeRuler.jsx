import { useEffect, useMemo, useRef, useState } from "react";

// 键盘逐月挪动时先预览，停手片刻再真正换范围，免得每按一下都重新载入。
const KEY_COMMIT_MS = 450;
const pad = (value) => String(value).padStart(2, "0");

// 从最早一年的一月排到最近一个有记录的月份，空月也留一道细刻度，时间的疏密才看得出来。
function rulerMonths(groups) {
  const counts = new Map();
  for (const group of groups) {
    for (const facet of group.months) counts.set(facet.year * 12 + facet.month - 1, facet.count);
  }
  if (!counts.size) return [];
  const keys = [...counts.keys()];
  const first = Math.floor(Math.min(...keys) / 12) * 12;
  const last = Math.max(...keys);
  const months = [];
  for (let key = first; key <= last; key += 1) {
    months.push({ key, index: key - first, year: Math.floor(key / 12), month: key % 12 + 1, count: counts.get(key) || 0 });
  }
  return months;
}

function tickHeight(entry, maxCount) {
  if (entry.count) return 6 + 18 * Math.sqrt(entry.count / maxCount);
  return entry.month === 1 ? 9 : 3;
}

// 手机上的归档时间标尺：每月一道刻度，刻度高低是那个月的记录数；拖动或点按吸附到有记录的月份，松手才换范围。
export function ArchiveTimeRuler({ groups, year, month, total, disabled, onSelect }) {
  const months = useMemo(() => rulerMonths(groups), [groups]);
  const filled = useMemo(() => months.filter((entry) => entry.count), [months]);
  const [preview, setPreview] = useState(null);
  const track = useRef(null);
  const dragging = useRef(false);
  const keyTimer = useRef(0);

  useEffect(() => () => window.clearTimeout(keyTimer.current), []);

  if (filled.length < 2) return null;
  const count = months.length;
  const maxCount = Math.max(...filled.map((entry) => entry.count));
  const selected = months.find((entry) => String(entry.year) === year && String(entry.month) === month) || null;
  const shown = preview ?? selected;
  const at = (index) => `${(index + .5) / count * 100}%`;
  const nearest = (index) => filled.reduce((best, entry) => (Math.abs(entry.index - index) < Math.abs(best.index - index) ? entry : best), filled[0]);
  const fromPointer = (event) => {
    const rect = track.current.getBoundingClientRect();
    const raw = Math.floor((event.clientX - rect.left) / rect.width * count);
    return nearest(Math.min(count - 1, Math.max(0, raw)));
  };
  const commit = (entry) => {
    window.clearTimeout(keyTimer.current);
    setPreview(null);
    if (entry && entry !== selected) onSelect(String(entry.year), String(entry.month));
  };

  const firstYear = months[0].year;
  const lastYear = months[count - 1].year;
  const yearSpan = lastYear - firstYear + 1;
  const yearStep = yearSpan <= 6 ? 1 : yearSpan <= 12 ? 2 : 5;
  const years = [];
  for (let value = firstYear; value <= lastYear; value += 1) {
    if ((value - firstYear) % yearStep === 0) years.push(value);
  }
  const yearOnly = year && !month ? months.filter((entry) => String(entry.year) === year) : [];
  const position = shown ? filled.indexOf(nearest(shown.index)) : -1;

  return <div className="archive-ruler">
    <div className="archive-ruler-head">
      <span>时间标尺</span>
      <button type="button" className={!year ? "active" : ""} aria-pressed={!year} disabled={disabled} onClick={() => onSelect("", "")}>
        全部 <span className="tabular">{total}</span>
      </button>
    </div>
    <div
      ref={track}
      className={`archive-ruler-track${preview ? " is-scrubbing" : ""}`}
      role="slider"
      tabIndex={0}
      aria-label="按月份选择归档范围"
      aria-valuemin={1}
      aria-valuemax={filled.length}
      aria-valuenow={position >= 0 ? position + 1 : undefined}
      aria-valuetext={shown ? `${shown.year} 年 ${shown.month} 月，${shown.count} 则` : "未选择月份"}
      aria-disabled={disabled || undefined}
      onPointerDown={(event) => {
        if (disabled || (event.pointerType === "mouse" && event.button !== 0)) return;
        dragging.current = true;
        track.current.setPointerCapture?.(event.pointerId);
        setPreview(fromPointer(event));
      }}
      onPointerMove={(event) => { if (dragging.current) setPreview(fromPointer(event)); }}
      onPointerUp={(event) => {
        if (!dragging.current) return;
        dragging.current = false;
        commit(fromPointer(event));
      }}
      onPointerCancel={() => {
        dragging.current = false;
        setPreview(null);
      }}
      onKeyDown={(event) => {
        if (disabled) return;
        const current = filled.indexOf(nearest((shown ?? filled[filled.length - 1]).index));
        const targets = {
          ArrowLeft: current - 1, ArrowDown: current - 1, ArrowRight: current + 1, ArrowUp: current + 1,
          Home: 0, End: filled.length - 1,
        };
        if (event.key === "Enter" && preview) {
          event.preventDefault();
          commit(preview);
          return;
        }
        if (!(event.key in targets)) return;
        event.preventDefault();
        const next = filled[Math.min(filled.length - 1, Math.max(0, targets[event.key]))];
        setPreview(next);
        window.clearTimeout(keyTimer.current);
        keyTimer.current = window.setTimeout(() => commit(next), KEY_COMMIT_MS);
      }}
      onBlur={() => { if (!dragging.current && preview) commit(preview); }}
    >
      <svg viewBox={`0 0 ${count} 40`} preserveAspectRatio="none" aria-hidden="true" focusable="false">
        <path className="archive-ruler-base" d={`M0 30.6L${count * .31} 30.1L${count * .64} 30.8L${count} 30.3`} />
        {months.map((entry) => <line
          key={entry.key}
          className={entry === shown ? (preview ? "is-preview" : "is-selected") : entry.count ? "is-filled" : entry.month === 1 ? "is-year" : ""}
          x1={entry.index + .5}
          x2={entry.index + .5}
          y1={30}
          y2={30 - tickHeight(entry, maxCount)}
        />)}
      </svg>
      {yearOnly.length ? <span className="archive-ruler-span" aria-hidden="true" style={{ left: `${yearOnly[0].index / count * 100}%`, width: `${yearOnly.length / count * 100}%` }} /> : null}
      {shown ? <span className="archive-ruler-marker" aria-hidden="true" style={{ left: at(shown.index) }} /> : null}
      {preview ? <span className="archive-ruler-bubble" aria-hidden="true" style={{ "--at": at(preview.index) }}>{preview.year} 年 {pad(preview.month)} 月 · {preview.count} 则</span> : null}
    </div>
    <div className="archive-ruler-years">
      {years.map((value) => {
        const january = months.find((entry) => entry.year === value && entry.month === 1) || months[0];
        const active = String(value) === year && !month;
        return <button key={value} type="button" className={active ? "active" : ""} aria-pressed={active} disabled={disabled}
          style={{ left: `${january.index / count * 100}%` }} onClick={() => onSelect(String(value), "")}>
          <span className="tabular">{value}</span>
        </button>;
      })}
    </div>
  </div>;
}
