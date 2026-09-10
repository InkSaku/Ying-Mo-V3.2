export function TaxonomySketch({ kind = "category" }) {
  if (kind === "tag") {
    return (
      <div className="taxonomy-opening-sketch taxonomy-opening-sketch-tag" aria-hidden="true">
        <p>Follow a word.</p>
        <svg viewBox="0 0 250 150" focusable="false">
          <g className="taxonomy-sketch-ink">
            <path d="M42 76c24-25 49-35 76-28 18 5 30 19 49 16 17-2 26-14 41-26" />
            <path d="M51 112c19-19 37-29 56-27 23 2 31 22 53 25 16 2 30-5 43-18" />
            <circle cx="42" cy="76" r="5" /><circle cx="118" cy="48" r="7" />
            <circle cx="167" cy="64" r="4" /><circle cx="208" cy="38" r="6" />
            <circle cx="51" cy="112" r="4" /><circle cx="107" cy="85" r="6" />
            <circle cx="160" cy="110" r="7" /><circle cx="203" cy="92" r="4" />
          </g>
          <path className="taxonomy-sketch-blue" d="m111 40 7-12 6 13m31 63 5 13 7-12M33 85l-12 7" />
        </svg>
      </div>
    );
  }

  return (
    <div className="taxonomy-opening-sketch" aria-hidden="true">
      <p>A place for every story.</p>
      <svg viewBox="0 0 250 150" focusable="false">
        <g className="taxonomy-sketch-ink">
          <path d="M34 36h75l10 13h96v70H34V36Z" />
          <path d="M34 52h181M52 68h145v35H52V68Z" />
          <path d="M65 80h46m-46 11h73m25-11h21m-21 11h13" />
          <path d="M26 125c55 3 115 3 196 0" />
        </g>
        <path className="taxonomy-sketch-blue" d="M146 59v49l9-7 9 7V59m-83 53c30 4 64 4 101 1" />
      </svg>
    </div>
  );
}
