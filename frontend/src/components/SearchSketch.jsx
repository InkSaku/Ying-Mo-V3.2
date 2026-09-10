export function SearchSketch() {
  return (
    <div className="search-opening-sketch" aria-hidden="true">
      <p>Look a little closer.</p>
      <svg viewBox="0 0 250 140" focusable="false">
        <g className="search-sketch-ink">
          <path d="M26 39c34-3 71-2 111 1M26 58c22-2 45-2 69 0M26 77c28-2 55-1 83 1M26 96c18-1 38-1 59 1" />
          <circle cx="151" cy="66" r="38" />
          <path d="m178 94 38 35c5 5 13-3 8-8l-38-35" />
          <path d="M136 54c9-8 22-7 31 1" />
        </g>
        <path className="search-sketch-blue" d="M118 66c18-3 39-2 60 2m-49 15c12 2 23 2 35 0M19 112c37 4 70 3 98-2" />
      </svg>
    </div>
  );
}
