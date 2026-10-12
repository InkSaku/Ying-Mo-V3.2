import { useLocation } from "react-router-dom";
import { InkSketch } from "./InkSketch";
import { inkSceneForPath } from "../lib/inkScenes";

export function InkPageSketch({ className = "" }) {
  const { pathname } = useLocation();
  return <InkSketch variant={inkSceneForPath(pathname)} className={`ink-page-sketch ${className}`} />;
}
