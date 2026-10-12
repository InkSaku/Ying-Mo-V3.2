import { InkSketch } from "./InkSketch";
export function TaxonomySketch({ kind = "category" }) {
  return <div className={`taxonomy-opening-sketch ${kind === "tag" ? "taxonomy-opening-sketch-tag" : ""}`} aria-hidden="true"><p>{kind === "tag" ? "Follow a word." : "A place for every story."}</p><InkSketch variant={kind === "tag" ? "thread" : "archive"} /></div>;
}
