import { useEffect, useRef, useState } from "react";
import { copiedOn, frameImage, laneImage, toClipboard } from "./copy";
import { KIND_LABEL, changesOf, day, frameOf, isGap, liveUrl, routeHash, type Board, type ChangeEntry, type Data, type Kind } from "./data";

interface Props {
  data: Data;
  board: Board;
  device: string;
  scene?: string;
  lane?: string;
  onPick: (p: { scene?: string; lane?: string }) => void;
  onClose: () => void;
}

/** a button whose result is said where it was pressed, and aloud */
function Act({ label, run, quiet }: { label: string; run: () => Promise<string | void>; quiet?: boolean }) {
  const [said, setSaid] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <button
      type="button"
      className={quiet ? "k-act" : "k-act k-act-main"}
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        try {
          setSaid((await run()) || "Done");
        } catch (e) {
          setSaid(`Couldn't: ${(e as Error).message}`);
        } finally {
          setBusy(false);
          window.setTimeout(() => setSaid(null), 2400);
        }
      }}
    >
      <span aria-live="polite">{busy ? "Working…" : (said ?? label)}</span>
    </button>
  );
}

function Changes({ entries }: { entries: (ChangeEntry & { wide: boolean })[] }) {
  if (!entries.length) return <p className="k-quiet">No changes recorded yet. They're written on each commit to the main branch.</p>;
  return (
    <ol className="k-changes">
      {entries.map((e, i) => (
        <li key={i}>
          <p className="k-change-head">
            <time dateTime={e.date}>{day(e.date)}</time>
            {e.commit && <code>{e.commit.slice(0, 7)}</code>}
            {e.wide && <span className="k-pill">Whole board</span>}
            {e.added && <span className="k-pill">New</span>}
            {e.rule && <span className="k-pill">Rule</span>}
          </p>
          <p>{e.summary}</p>
          {e.source && <p className="k-quiet">From {e.source}</p>}
        </li>
      ))}
    </ol>
  );
}

/**
 * What's in hand, over the board's right side: a frame (how it's reached, what
 * it shows, the rules it follows, what changed in it) or a lane (its story,
 * its rules and lists, what changed across it). Esc closes it.
 */
export function Drawer({ data, board, device, scene, lane, onPick, onClose }: Props) {
  const { manifest, changes, live } = data;
  const ref = useRef<HTMLElement>(null);
  const open = !!(scene || lane);
  const dev = manifest.devices.find((d) => d.id === device) ?? manifest.devices[0]!;

  useEffect(() => {
    if (!open) return;
    ref.current?.querySelector<HTMLElement>("h2")?.focus({ preventScroll: true });
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, scene, lane, onClose]);

  // where it stands: the lane and row of the scene, on this board
  const place = (() => {
    for (const l of board.lanes)
      for (const r of l.rows)
        for (const c of r.cells) if (!isGap(c) && c.scene === scene) return { lane: l, kind: r.kind as Kind, from: c.from };
    return undefined;
  })();
  const theLane = lane ? board.lanes.find((l) => l.id === lane) : place?.lane;

  let body: React.ReactNode = null;
  if (scene) {
    const s = manifest.scenes[scene];
    const f = frameOf(manifest, scene, device);
    // what it follows: a scene (a link to its frame) or a state not built yet (its name)
    const fromScene = place?.from && manifest.scenes[place.from] ? place.from : undefined;
    // it may be on another board (the overview borrows states): then the link goes there
    const onBoard = (b: Board, id: string) => b.lanes.some((l) => l.rows.some((r) => r.cells.some((c) => !isGap(c) && c.scene === id)));
    const fromBoard = fromScene ? (onBoard(board, fromScene) ? board.id : manifest.boards.find((b) => onBoard(b, fromScene))?.id) : undefined;
    const fromTitle = (() => {
      if (!place?.from) return undefined;
      if (fromScene) return manifest.scenes[fromScene]!.title;
      for (const l of board.lanes) for (const r of l.rows) for (const c of r.cells) if (isGap(c) && c.gap.id === place.from) return c.gap.title;
      return undefined;
    })();
    const link = `${location.origin}${location.pathname}${routeHash({ board: board.id, scene, device })}`;
    body = (
      <>
        <p className="k-eyebrow">
          {place && (
            <>
              <i className="k-mark" data-kind={place.kind} role="img" aria-label={KIND_LABEL[place.kind]} /> {KIND_LABEL[place.kind]}
            </>
          )}
          {theLane?.ticket && <span className="k-code">{theLane.ticket}</span>}
        </p>
        <h2 tabIndex={-1}>{s?.title ?? scene}</h2>
        {f?.error && <p className="k-alert">This scene stopped at {f.error}. The frame shows where it got to.</p>}
        <div className="k-acts">
          {f?.png && (
            <Act
              label="Copy image"
              run={async () => {
                await toClipboard(() => frameImage({ src: f.png, lines: [[theLane?.ticket, s?.title].filter(Boolean).join(" · "), `${dev.label} · ${copiedOn()}`] }));
                return "Copied";
              }}
            />
          )}
          <Act
            quiet
            label="Copy link"
            run={async () => {
              await navigator.clipboard.writeText(link);
              return "Copied";
            }}
          />
          {live ? (
            <Act
              quiet
              label="Open live"
              run={async () => {
                const res = await fetch("api/open", { method: "POST", body: JSON.stringify({ scene, device }) });
                if (!res.ok) throw new Error(await res.text());
                return "Opening in a browser…";
              }}
            />
          ) : s && liveUrl(manifest, s.path, scene) ? (
            <a className="k-act" href={liveUrl(manifest, s.path, scene)} target="_blank" rel="noopener">
              Open live ↗
            </a>
          ) : (
            <p className="k-quiet k-hint">
              Open live: <code>kanvas open {scene}</code> on your machine
            </p>
          )}
        </div>
        <dl className="k-facts">
          {(s?.via || fromTitle) && (
            <>
              <dt>Reached by</dt>
              <dd>
                {s?.via}
                {fromTitle && (
                  <>
                    {s?.via ? ", from " : "From "}
                    {fromScene && fromBoard && fromBoard !== board.id ? (
                      <a className="k-link" href={routeHash({ board: fromBoard, scene: fromScene, device })}>
                        {fromTitle}
                      </a>
                    ) : fromScene ? (
                      <button type="button" className="k-link" onClick={() => onPick({ scene: fromScene })}>
                        {fromTitle}
                      </button>
                    ) : (
                      <>{fromTitle} (not built yet)</>
                    )}
                  </>
                )}
              </dd>
            </>
          )}
          {s?.note && (
            <>
              <dt>What it shows</dt>
              <dd>{s.note}</dd>
            </>
          )}
        </dl>
        <section aria-labelledby="k-rules">
          <h3 id="k-rules">Rules</h3>
          {s?.rules?.length || theLane?.rules?.length ? (
            <ul className="k-list">
              {s?.rules?.map((r, i) => <li key={`s${i}`}>{r}</li>)}
              {theLane?.rules?.map((r, i) => (
                <li key={`l${i}`}>
                  {r} <span className="k-quiet">(the whole lane)</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="k-quiet">No rules written for this state yet.</p>
          )}
        </section>
        <section aria-labelledby="k-changes">
          <h3 id="k-changes">Changelog</h3>
          <Changes entries={changesOf(changes, { scene, board: board.id })} />
        </section>
        <section aria-labelledby="k-frame">
          <h3 id="k-frame">Frame</h3>
          <p className="k-quiet">
            {f ? `${f.view === "page" ? "The whole page" : f.view === "screen" ? "One screen" : "One section"}, ${dev.label}, ${f.width} × ${f.height}` : `Not snapped at ${dev.label}`}
            {s?.path && (
              <>
                {" · "}
                <code>{s.path}</code>
              </>
            )}
          </p>
          {f?.fallback?.length ? <p className="k-quiet">Shown as its picture up close: {f.fallback.join(", ")} can't be frozen faithfully.</p> : null}
        </section>
        {theLane && (
          <button type="button" className="k-link" onClick={() => onPick({ lane: theLane.id })}>
            Its lane: {theLane.ticket ? `${theLane.ticket} · ` : ""}
            {theLane.title}
          </button>
        )}
      </>
    );
  } else if (theLane) {
    const scenes = theLane.rows.flatMap((r) => r.cells.filter((c) => !isGap(c)).map((c) => (isGap(c) ? "" : c.scene)));
    body = (
      <>
        <p className="k-eyebrow">{theLane.ticket && <span className="k-code">{theLane.ticket}</span>} Lane</p>
        <h2 tabIndex={-1}>{theLane.title}</h2>
        <div className="k-acts">
          <Act
            label="Copy lane as a picture"
            run={async () => {
              await toClipboard(() => laneImage({ manifest, lane: theLane, device, taken: copiedOn() }));
              return "Copied";
            }}
          />
        </div>
        {theLane.story && <p className="k-story">{theLane.story}</p>}
        {theLane.rules?.length ? (
          <section aria-labelledby="k-lrules">
            <h3 id="k-lrules">Rules</h3>
            <ul className="k-list">
              {theLane.rules.map((r, i) => (
                <li key={i}>{r}</li>
              ))}
            </ul>
          </section>
        ) : null}
        {theLane.lists?.map((list, i) => (
          <section key={i} aria-labelledby={`k-list-${i}`}>
            <h3 id={`k-list-${i}`}>{list.title}</h3>
            <ul className="k-list">
              {list.items.map((it, j) => (
                <li key={j}>{it}</li>
              ))}
            </ul>
          </section>
        ))}
        <section aria-labelledby="k-lchanges">
          <h3 id="k-lchanges">Changelog</h3>
          <Changes entries={changesOf(changes, { scenes, board: board.id })} />
        </section>
        <section aria-labelledby="k-lframes">
          <h3 id="k-lframes">States</h3>
          <ul className="k-states">
            {theLane.rows.flatMap((r) =>
              r.cells.map((c) =>
                isGap(c) ? (
                  <li key={c.gap.id}>
                    <i className="k-mark" data-kind="gap" role="img" aria-label={KIND_LABEL.gap} /> {c.gap.title}
                  </li>
                ) : (
                  <li key={c.scene}>
                    <i className="k-mark" data-kind={r.kind} role="img" aria-label={KIND_LABEL[r.kind]} />{" "}
                    <button type="button" className="k-link" onClick={() => onPick({ scene: c.scene })}>
                      {manifest.scenes[c.scene]?.title ?? c.scene}
                    </button>
                  </li>
                ),
              ),
            )}
          </ul>
        </section>
      </>
    );
  }

  return (
    <aside ref={ref} className="k-drawer" data-open={open || undefined} aria-label={scene ? "The frame" : "The lane"} inert={!open}>
      <button type="button" className="k-close" onClick={onClose}>
        Close
      </button>
      {body}
    </aside>
  );
}
