import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { SparkDoorArt } from "./SparkDoorArt";
import { PAPER_EASE } from "../lib/paperMotion";

const OPEN_DURATION = 180;
const WALK_DURATION = 280;

function preloadSparkPage() {
  void import("../pages/SparkPage").catch(() => undefined);
}

export function HomeSparkEntry() {
  const navigate = useNavigate();
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
    aria-label="续火花，抖音好友的每日问候"
    aria-busy={phase !== "idle" || undefined}
    onClick={enter}
    onPointerEnter={preloadSparkPage}
    onPointerDown={(event) => { pointerType.current = event.pointerType; preloadSparkPage(); }}
    onFocus={preloadSparkPage}
  >
    <SparkDoorArt />
    <span className="home-spark-entry-copy">
      <strong>续火花</strong>
      <span className="home-spark-entry-hint">抖音好友的每日问候</span>
    </span>
    <span className="home-spark-entry-action" aria-hidden="true">
      <span>进入</span>
      <svg viewBox="0 0 24 16" fill="none"><path d="M2 8h19m-6-5 6 5-6 5" /></svg>
    </span>
  </Link>;
}
