export function NoteSketch() {
  return (
    <div className="notes-opening-sketch" aria-hidden="true">
      <p>A passing thought.</p>
      <svg viewBox="0 0 260 160" focusable="false">
        <g fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="m106 65 119-43-38 94-29-35-52-16Z" />
          <path d="m106 65 65 2 54-45-67 59-2 23 15-14m0-23 16 49" />
          <path d="m113 60 109-37m-34 86 31-75" opacity=".35" />
        </g>
        <path className="notes-sketch-trail" d="M14 131c22 9 57 2 62-17 7-24-27-23-26-4 2 22 40 19 56 3 10-10 14-21 15-28" />
      </svg>
    </div>
  );
}
