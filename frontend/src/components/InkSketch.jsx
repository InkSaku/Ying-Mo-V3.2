import { useEffect, useState } from "react";
import { INK_SKETCH_RATIOS, inkSketchLibrary, loadInkSketches } from "../lib/inkSketchLoader";
import "../styles/ink-sketches.css";

export function InkSketch({ variant = "letter", className = "" }) {
  const [, setReady] = useState(() => Boolean(inkSketchLibrary()));
  useEffect(() => {
    if (inkSketchLibrary()) return undefined;
    let active = true;
    loadInkSketches().then(() => { if (active) setReady(true); }).catch(() => undefined);
    return () => { active = false; };
  }, []);
  const library = inkSketchLibrary();
  const key = Object.hasOwn(INK_SKETCH_RATIOS, variant) ? variant : "letter";
  const markup = library ? library[key] : "";
  return <span
    className={`ink-sketch ink-sketch-${variant} ${className}`}
    aria-hidden="true"
    style={markup ? undefined : { aspectRatio: INK_SKETCH_RATIOS[key] }}
    dangerouslySetInnerHTML={{ __html: markup }}
  />;
}
