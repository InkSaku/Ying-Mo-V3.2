import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { SparkDoorArt } from "./SparkDoorArt";
import { RollingNumber } from "./RollingNumber";
import { SparkSeal } from "./SparkSeal";
import { PAPER_EASE } from "../lib/paperMotion";
import { api } from "../lib/api";
import { useAuth } from "../contexts/AuthContext";

const OPEN_DURATION = 180;
const WALK_DURATION = 280;

function preloadSparkPage() {
  void import("../pages/SparkPage").catch(() => undefined);
}

// 本机记住上次看到的天数和盖章日期：每天第一次打开首页时，数字从昨天滚到今天，印章只盖一次。
const seenKey = (userId) => `ym-spark-seen:${userId}`;

function readSeen(userId) {
  try {
    return JSON.parse(window.localStorage.getItem(seenKey(userId)) || "{}") || {};
  } catch {
    return {};
  }
}

function writeSeen(userId, value) {
  try {
    window.localStorage.setItem(seenKey(userId), JSON.stringify(value));
  } catch {
    // 隐私模式或存储被禁用时，只是每次都不播放过渡。
  }
}

function sparkView(userId, data) {
  if (!data?.bound || !data.selected) return null;
  const seen = readSeen(userId);
  const sameDay = seen.day === data.local_day;
  const done = data.delivered_today >= data.selected;
  writeSeen(userId, {
    day: data.local_day,
    streak: data.longest_streak,
    delivered: data.delivered_today,
    sealDay: done ? data.local_day : seen.sealDay,
  });
  return {
    ...data,
    done,
    deliveredFrom: sameDay && Number.isFinite(seen.delivered) ? seen.delivered : 0,
    streakFrom: Number.isFinite(seen.streak) ? seen.streak : data.longest_streak,
    pressing: done && seen.sealDay !== data.local_day,
  };
}

export function HomeSparkEntry() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const userId = user?.id;
  const [view, setView] = useState(null);
  const [phase, setPhase] = useState("idle");
  const pending = useRef(false);
  const timers = useRef([]);
  const pointerType = useRef("");

  useEffect(() => {
    const clearTimers = () => {
      timers.current.forEach(window.clearTimeout);
      timers.current = [];
      pending.current = false;
    };
    const cancel = () => {
      clearTimers();
      setPhase("idle");
    };
    const onVisibility = () => { if (document.hidden) cancel(); };
    const onKeyDown = (event) => { if (event.key === "Escape" && pending.current) cancel(); };
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const onMotionChange = () => {
      if (!reducedMotion.matches || !pending.current) return;
      clearTimers();
      navigate("/tools/spark");
    };
    window.addEventListener("pagehide", cancel);
    window.addEventListener("pageshow", cancel);
    window.addEventListener("popstate", cancel);
    window.addEventListener("keydown", onKeyDown);
    document.addEventListener("visibilitychange", onVisibility);
    reducedMotion.addEventListener("change", onMotionChange);
    return () => {
      clearTimers();
      window.removeEventListener("pagehide", cancel);
      window.removeEventListener("pageshow", cancel);
      window.removeEventListener("popstate", cancel);
      window.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("visibilitychange", onVisibility);
      reducedMotion.removeEventListener("change", onMotionChange);
    };
  }, [navigate]);

  useEffect(() => {
    if (!userId) return undefined;
    const controller = new AbortController();
    api.get("/spark/summary", { signal: controller.signal })
      .then((result) => setView(sparkView(userId, result.data)))
      .catch(() => undefined);
    return () => controller.abort();
  }, [userId]);

  const enter = (event) => {
    // Keyboard activation, new tabs and reduced motion keep normal link navigation.
    if (event.defaultPrevented || event.button !== 0 || event.detail === 0
      || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey
      || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    event.preventDefault();
    if (pending.current) return;
    pending.current = true;
    preloadSparkPage();
    const alreadyOpen = pointerType.current !== "touch"
      && window.matchMedia("(hover: hover) and (pointer: fine)").matches
      && event.currentTarget.matches(":hover");
    const openingTime = alreadyOpen ? 0 : OPEN_DURATION;
    setPhase("opening");
    timers.current.push(window.setTimeout(() => setPhase("walking"), openingTime));
    // Keep these timings aligned with the two local illustration transitions.
    timers.current.push(window.setTimeout(() => navigate("/tools/spark"), openingTime + WALK_DURATION));
  };

  return <Link
    className={"home-spark-entry" + (phase === "idle" ? "" : " is-" + phase)}
    style={{ "--spark-ease-out": PAPER_EASE }}
    to="/tools/spark"
    aria-label={`续火花，抖音好友的每日问候${view ? `，今日已续 ${view.delivered_today}／${view.selected} 位好友${view.longest_streak ? `，最长火花 ${view.longest_streak} 天` : ""}` : ""}`}
    aria-busy={phase !== "idle" || undefined}
    onClick={enter}
    onPointerEnter={preloadSparkPage}
    onPointerDown={(event) => { pointerType.current = event.pointerType; preloadSparkPage(); }}
    onFocus={preloadSparkPage}
  >
    <span className="home-spark-entry-art">
      <SparkDoorArt />
      {view?.done ? <SparkSeal pressing={view.pressing} /> : null}
    </span>
    <span className="home-spark-entry-copy">
      <strong>续火花</strong>
      <span className="home-spark-entry-hint">抖音好友的每日问候</span>
      {view ? <span className="home-spark-entry-status">
        今日已续 <RollingNumber value={view.delivered_today} from={view.deliveredFrom} delay={360} /> / {view.selected}
        {view.longest_streak ? <> · 最长 <RollingNumber value={view.longest_streak} from={view.streakFrom} delay={360} /> 天</> : null}
      </span> : null}
    </span>
    <span className="home-spark-entry-action" aria-hidden="true">
      <span>进入</span>
      <svg viewBox="0 0 24 16" fill="none"><path d="M2 8h19m-6-5 6 5-6 5" /></svg>
    </span>
  </Link>;
}
