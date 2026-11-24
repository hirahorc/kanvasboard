import { KIND_LABEL, isGap, routeHash, type Board, type Data } from "./data";

/** the boards, then the current one's lanes and states: a way round the board without the board */
export function Side({ data, board, device, scene, lane, onPick }: { data: Data; board: Board; device: string; scene?: string; lane?: string; onPick: (p: { scene?: string; lane?: string }) => void }) {
  const { manifest } = data;
  const count = (b: Board) => b.lanes.reduce((n, l) => n + l.rows.reduce((m, r) => m + r.cells.length, 0), 0);
  const frames = board.lanes.flatMap((l) => l.rows.flatMap((r) => r.cells.filter((c) => !isGap(c))));
  const made = frames.filter((c) => !isGap(c) && manifest.frames[`${c.scene}@${device}`]?.png).length;
  return (
    <nav className="k-side" aria-label="Boards and states">
      <p className="k-brand">kanvas</p>
      <ul className="k-boards">
        {manifest.boards.map((b) => (
          <li key={b.id}>
            <a href={routeHash({ board: b.id, device })} aria-current={b.id === board.id ? "page" : undefined}>
              <span>{b.title}</span>
              <span className="k-count">{count(b)}</span>
            </a>
          </li>
        ))}
      </ul>
      {board.lead && <p className="k-lead">{board.lead}</p>}
      {board.lanes.map((l) => (
        <section key={l.id} className="k-side-lane">
          <button type="button" className="k-side-lane-title" aria-pressed={lane === l.id} onClick={() => onPick({ lane: l.id })}>
            {l.ticket && <span className="k-code">{l.ticket}</span>}
            <span>{l.title}</span>
          </button>
          <ul>
            {l.rows.flatMap((r) =>
              r.cells.map((c) =>
                isGap(c) ? (
                  <li key={c.gap.id} className="k-side-gap">
                    <i className="k-mark" data-kind="gap" role="img" aria-label={KIND_LABEL.gap} />
                    <span>{c.gap.title}</span>
                  </li>
                ) : (
                  <li key={`${l.id}/${c.scene}`}>
                    <button type="button" aria-pressed={scene === c.scene} onClick={() => onPick({ scene: c.scene })}>
                      <i className="k-mark" data-kind={r.kind} role="img" aria-label={KIND_LABEL[r.kind]} />
                      <span>{manifest.scenes[c.scene]?.title ?? c.scene}</span>
                      {manifest.frames[`${c.scene}@${device}`]?.error && <b className="k-tag">failed</b>}
                    </button>
                  </li>
                ),
              ),
            )}
          </ul>
        </section>
      ))}
      <footer className="k-side-foot">
        <p>
          {frames.length} states · {made} snapped at this size
        </p>
        <ul className="k-legend" aria-label="What the marks say">
          {(["positive", "negative", "edge", "gap"] as const).map((k) => (
            <li key={k}>
              <i className="k-mark" data-kind={k} aria-hidden /> {KIND_LABEL[k]}
            </li>
          ))}
        </ul>
        <p className="k-quiet">Drag or scroll to move; ⌘ or Ctrl with scroll, or a pinch, to zoom. On the board: arrow keys go frame to frame, Enter brings one up, 0 shows it all, Shift with an arrow moves it.</p>
      </footer>
    </nav>
  );
}
