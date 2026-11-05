import penBench from "../assets/ink/pen-bench-v1.webp";

export function HomeFriendshipArt({ className = "" }) {
  return (
    <svg className={`home-friendship-art ${className}`} viewBox="0 250 1434 550" aria-hidden="true" focusable="false">
      <image href={penBench} width="1434" height="1097" />
    </svg>
  );
}
