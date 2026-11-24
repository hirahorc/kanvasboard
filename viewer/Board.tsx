import { useCallback, useEffect, useImperativeHandle, useLayoutEffect, useMemo, useRef, useState, type Ref } from "react";
import { KIND_LABEL, cellId, frameOf, isGap, type Board as BoardT, type Cell, type Data, type FrameRecord, type Kind } from "./data";

/** closer than this, a frame near the screen is its frozen page; further, its small picture */
const PAGE_ZOOM = 0.3;
/** frozen pages at once: each is a document of its own */
const PAGES_MAX = 12;
const ZOOM_MIN = 0.02;
const ZOOM_MAX = 2;
const PAD = 48;
/** the drawer's width on a wide window (styles.css, .k-drawer) */
const DRAWER = 400;

/** how much bigger than the world's own size the board's words are drawn, so they stay readable as it zooms out */
const lift = (z: number) => Math.min(8, Math.max(1, 1 / z));

export interface BoardControls {
  zoomBy(f: number): void;
  zoomTo(z: number): void;
  fitAll(): void;
  fitWidth(): void;
  /** the frame of this scene on screen, as large as it fits */
  show(scene: string): void;
}

interface Props {
  data: Data;
  board: BoardT;
  device: string;
  selected?: string;
  lane?: string;
  onPick: (p: { scene?: string; lane?: string }) => void;
  onZoom: (z: number) => void;
  controls: Ref<BoardControls>;
}

interface Edge {
  d: string;
  kind: Kind;
}

/** a card's key: a scene can stand in two lanes of a board */
const keyOf = (lane: string, c: Cell) => `${lane}/${cellId(c)}`;

export function Board({ data, board, device, selected, lane: laneSel, onPick, onZoom, controls }: Props) {
  const { manifest } = data;
  const dev = manifest.devices.find((d) => d.id === device) ?? manifest.devices[0]!;
  const viewport = useRef<HTMLDivElement>(null);
  const world = useRef<HTMLDivElement>(null);
  const cam = useRef({ x: PAD, y: PAD, z: 0.2 });
  /** the zoom, once it has settled: what's drawn how is decided on it */
  const [z, setZ] = useState(0.2);
  const [near, setNear] = useState<ReadonlySet<string>>(() => new Set());
  const seen = useRef<string[]>([]);
  const [edges, setEdges] = useState<Edge[]>([]);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const settleTimer = useRef(0);

  const apply = useCallback(() => {
    const w = world.current;
    if (!w) return;
    const { x, y, z } = cam.current;
    w.style.transform = `translate(${x}px, ${y}px) scale(${z})`;
    w.style.setProperty("--z", String(z));
    w.dataset.lod = z < 0.08 ? "far" : "near";
    onZoom(z);
    window.clearTimeout(settleTimer.current);
    settleTimer.current = window.setTimeout(() => setZ(cam.current.z), 120);
  }, [onZoom]);

  const clampZ = (v: number) => Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, v));

  const zoomAt = useCallback(
    (px: number, py: number, f: number) => {
      const c = cam.current;
      const nz = clampZ(c.z * f);
      const wx = (px - c.x) / c.z;
      const wy = (py - c.y) / c.z;
      cam.current = { z: nz, x: px - wx * nz, y: py - wy * nz };
      apply();
    },
    [apply],
  );

  /** an element's box in the world's own units */
  const boxOf = (el: Element) => {
    const w = world.current!.getBoundingClientRect();
    const r = el.getBoundingClientRect();
    const zz = cam.current.z;
    return { x: (r.left - w.left) / zz, y: (r.top - w.top) / zz, w: r.width / zz, h: r.height / zz };
  };

  const fit = useCallback(
    (width: boolean) => {
      const v = viewport.current;
      const w = world.current;
      if (!v || !w) return;
      // the words grow as the board shrinks, so its size is measured again at the zoom it gets
      for (let i = 0; i < 3; i++) {
        const W = w.offsetWidth;
        const H = w.offsetHeight;
        const nz = clampZ(width ? (v.clientWidth - PAD * 2) / W : Math.min((v.clientWidth - PAD * 2) / W, (v.clientHeight - PAD * 2) / H));
        cam.current = { z: nz, x: Math.max(PAD, (v.clientWidth - W * nz) / 2), y: PAD };
        apply();
      }
    },
    [apply],
  );

  const show = useCallback(
    (scene: string) => {
      const v = viewport.current;
      const el = world.current?.querySelector(`[data-scene="${CSS.escape(scene)}"] .k-view`);
      if (!v || !el) return;
      // the frame brought up sits clear of the drawer that opens with it (on a wide window, where it doesn't cover all)
      const room = v.clientWidth > 900 ? v.clientWidth - DRAWER : v.clientWidth;
      for (let i = 0; i < 2; i++) {
        const b = boxOf(el);
        const nz = clampZ(Math.min(1, (room - PAD * 2) / b.w, Math.max(0.35, (v.clientHeight - PAD * 2) / b.h)));
        const fits = b.h * nz <= v.clientHeight - PAD * 2;
        cam.current = {
          z: nz,
          x: room / 2 - (b.x + b.w / 2) * nz,
          y: fits ? v.clientHeight / 2 - (b.y + b.h / 2) * nz : PAD * 2 - b.y * nz,
        };
        apply();
      }
    },
    [apply],
  );

  useImperativeHandle(
    controls,
    () => ({
      zoomBy: (f) => {
        const v = viewport.current;
        if (v) zoomAt(v.clientWidth / 2, v.clientHeight / 2, f);
      },
      zoomTo: (nz) => {
        const v = viewport.current;
        if (v) zoomAt(v.clientWidth / 2, v.clientHeight / 2, nz / cam.current.z);
      },
      fitAll: () => fit(false),
      fitWidth: () => fit(true),
      show,
    }),
    [fit, show, zoomAt],
  );

  /* ---------------------------------------------------------- pan and zoom */

  useEffect(() => {
    const v = viewport.current;
    if (!v) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const r = v.getBoundingClientRect();
      // a pinch, or the wheel with Ctrl/⌘, zooms where the pointer is; otherwise it moves the board
      if (e.ctrlKey || e.metaKey) zoomAt(e.clientX - r.left, e.clientY - r.top, Math.exp(-e.deltaY * 0.01));
      else {
        cam.current = { ...cam.current, x: cam.current.x - e.deltaX, y: cam.current.y - e.deltaY };
        apply();
      }
    };
    v.addEventListener("wheel", onWheel, { passive: false });
    return () => v.removeEventListener("wheel", onWheel);
  }, [apply, zoomAt]);

  const drag = useRef<{ x: number; y: number; cx: number; cy: number; moved: boolean; id: number } | null>(null);
  const onPointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    drag.current = { x: e.clientX, y: e.clientY, cx: cam.current.x, cy: cam.current.y, moved: false, id: e.pointerId };
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const dx = e.clientX - d.x;
    const dy = e.clientY - d.y;
    if (!d.moved && Math.hypot(dx, dy) < 4) return;
    if (!d.moved) {
      d.moved = true;
      viewport.current?.setPointerCapture(d.id);
      viewport.current?.setAttribute("data-dragging", "");
    }
    cam.current = { ...cam.current, x: d.cx + dx, y: d.cy + dy };
    apply();
  };
  const endDrag = () => {
    viewport.current?.removeAttribute("data-dragging");
    // a drag isn't a click on what it ended over
    window.setTimeout(() => (drag.current = null), 0);
  };
  const onClickCapture = (e: React.MouseEvent) => {
    if (drag.current?.moved) {
      e.stopPropagation();
      e.preventDefault();
    }
  };

  /* ------------------------------------------------------------ the frames */

  const cards = useMemo(() => {
    const out: { key: string; lane: string; cell: Cell; row: number }[] = [];
    let row = 0;
    for (const l of board.lanes)
      for (const r of l.rows) {
        for (const c of r.cells) out.push({ key: keyOf(l.id, c), lane: l.id, cell: c, row });
        row++;
      }
    return out;
  }, [board]);

  // what's near the screen, as it comes and goes; the order things were first seen decides who gets a page
  useEffect(() => {
    const v = viewport.current;
    const w = world.current;
    if (!v || !w) return;
    seen.current = [];
    setNear(new Set());
    const io = new IntersectionObserver(
      (entries) => {
        setNear((was) => {
          let next: Set<string> | null = null;
          for (const en of entries) {
            const key = (en.target as HTMLElement).dataset.key;
            if (!key || en.isIntersecting === was.has(key)) continue;
            next ??= new Set(was);
            if (en.isIntersecting) {
              next.add(key);
              if (!seen.current.includes(key)) seen.current.push(key);
            } else next.delete(key);
          }
          return next ?? was;
        });
      },
      { root: v, rootMargin: "200px" },
    );
    w.querySelectorAll<HTMLElement>(".k-view[data-key]").forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, [board, device]);

  const frameFor = (c: Cell): FrameRecord | undefined => (isGap(c) ? undefined : frameOf(manifest, c.scene, device));

  /** which frames are their frozen page: near the screen, close enough to read, a dozen at most */
  const pages = useMemo(() => {
    const on = new Set<string>();
    if (z < PAGE_ZOOM) return on;
    const byKey = new Map(cards.map((c) => [c.key, c]));
    const can = (k: string) => {
      const f = byKey.get(k) && frameFor(byKey.get(k)!.cell);
      return !!f?.html && !f.fallback?.length;
    };
    for (const c of cards) if (!isGap(c.cell) && c.cell.scene === selected && near.has(c.key) && can(c.key)) on.add(c.key);
    for (const k of seen.current) {
      if (on.size >= PAGES_MAX) break;
      if (near.has(k) && can(k)) on.add(k);
    }
    return on;
    // frameFor reads manifest and device, both in the deps through cards' board
  }, [z, near, cards, selected, device, manifest]); // eslint-disable-line react-hooks/exhaustive-deps

  /* ------------------------------------------------------------ the arrows */

  useLayoutEffect(() => {
    const w = world.current;
    if (!w) return;
    setSize({ w: w.offsetWidth, h: w.offsetHeight });
    const L = lift(z);
    const boxes = new Map<string, ReturnType<typeof boxOf>>();
    for (const el of w.querySelectorAll<HTMLElement>(".k-view[data-key]")) boxes.set(el.dataset.key!, boxOf(el));
    const out: Edge[] = [];
    for (const l of board.lanes)
      for (const r of l.rows)
        for (const c of r.cells) {
          if (!c.from) continue;
          const t = boxes.get(keyOf(l.id, c));
          // only within its lane: one from another lane would cross every lane between
          // (its label's "→" and its drawer say where it comes from)
          const s = boxes.get(`${l.id}/${c.from}`);
          if (!s || !t) continue;
          const kind: Kind = isGap(c) ? "gap" : r.kind;
          const sy = s.y + Math.min(s.h / 2, 240);
          const ty = t.y + Math.min(t.h / 2, 240);
          if (t.x >= s.x + s.w) {
            const x1 = s.x + s.w + 6 * L;
            const x2 = t.x - 10 * L;
            const k = Math.max(24 * L, (x2 - x1) / 2);
            out.push({ kind, d: `M${x1},${sy} C${x1 + k},${sy} ${x2 - k},${ty} ${x2},${ty}` });
          } else {
            const x1 = s.x + s.w / 2;
            const y1 = s.y + s.h + 6 * L;
            const x2 = t.x + t.w / 2;
            const y2 = t.y - 40 * L;
            const k = Math.max(40 * L, Math.abs(y2 - y1) / 2);
            out.push({ kind, d: `M${x1},${y1} C${x1},${y1 + k} ${x2},${y2 - k} ${x2},${y2}` });
          }
        }
    setEdges(out);
  }, [z, board, device, near]); // eslint-disable-line react-hooks/exhaustive-deps

  /* ----------------------------------------------------------- first view */

  useLayoutEffect(() => {
    apply();
    fit(true);
    if (selected) show(selected);
  }, [board, device]); // eslint-disable-line react-hooks/exhaustive-deps

  /* -------------------------------------------------------------- the keys */

  const onKeyDown = (e: React.KeyboardEvent) => {
    const step = 120;
    if (e.shiftKey && e.key.startsWith("Arrow")) {
      const dx = e.key === "ArrowLeft" ? step : e.key === "ArrowRight" ? -step : 0;
      const dy = e.key === "ArrowUp" ? step : e.key === "ArrowDown" ? -step : 0;
      cam.current = { ...cam.current, x: cam.current.x + dx, y: cam.current.y + dy };
      apply();
      e.preventDefault();
      return;
    }
    if (e.key === "+" || e.key === "=") {
      const v = viewport.current!;
      zoomAt(v.clientWidth / 2, v.clientHeight / 2, 1.25);
    } else if (e.key === "-") {
      const v = viewport.current!;
      zoomAt(v.clientWidth / 2, v.clientHeight / 2, 0.8);
    } else if (e.key === "0") fit(false);
    else if (e.key === "Enter" && selected) show(selected);
    else if (e.key.startsWith("Arrow")) {
      // frame to frame: along a row, or to the row above or below
      const scenes = cards.filter((c) => !isGap(c.cell));
      const at = scenes.findIndex((c) => !isGap(c.cell) && c.cell.scene === selected);
      let next = scenes[0];
      if (at >= 0) {
        const here = scenes[at]!;
        if (e.key === "ArrowRight") next = scenes[at + 1] ?? here;
        else if (e.key === "ArrowLeft") next = scenes[at - 1] ?? here;
        else {
          const rowTo = here.row + (e.key === "ArrowDown" ? 1 : -1);
          const row = scenes.filter((c) => c.row === rowTo);
          const inRow = scenes.filter((c) => c.row === here.row).indexOf(here);
          next = row[Math.min(inRow, row.length - 1)] ?? here;
        }
      }
      if (next && !isGap(next.cell)) {
        onPick({ scene: next.cell.scene });
        show(next.cell.scene);
      }
    } else return;
    e.preventDefault();
  };

  /* ------------------------------------------------------------------ draw */

  const L = lift(z);
  return (
    <div
      ref={viewport}
      className="k-viewport"
      tabIndex={0}
      role="application"
      aria-label={`${board.title}: the board. Drag or scroll to move, ⌘ or Ctrl with scroll to zoom; arrow keys go frame to frame`}
      onKeyDown={onKeyDown}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      onClickCapture={onClickCapture}
    >
      <div ref={world} className="k-world">
        {board.lanes.map((l) => (
          <section key={l.id} className="k-lane" data-lane={l.id} data-current={laneSel === l.id || undefined}>
            <button type="button" className="k-lane-title" onClick={() => onPick({ lane: l.id })}>
              {l.ticket && <span className="k-ticket">{l.ticket}</span>}
              <span>{l.title}</span>
            </button>
            {l.rows.map((r, i) => (
              <div key={i} className="k-row" data-kind={r.kind}>
                <p className="k-row-name">{KIND_LABEL[r.kind]}</p>
                <div className="k-cells">
                  {r.cells.map((c) => {
                    const key = keyOf(l.id, c);
                    const gap = isGap(c);
                    const kind: Kind = gap ? "gap" : r.kind;
                    const scene = gap ? undefined : manifest.scenes[c.scene];
                    const title = gap ? c.gap.title : (scene?.title ?? c.scene);
                    const via = gap ? c.gap.via : scene?.via;
                    const frame = frameFor(c);
                    const isSel = !gap && c.scene === selected;
                    return (
                      <article
                        key={key}
                        className="k-card"
                        data-scene={gap ? undefined : c.scene}
                        data-selected={isSel || undefined}
                        style={{ width: dev.width }}
                        onClick={gap ? undefined : () => onPick({ scene: c.scene })}
                      >
                        <header className="k-label">
                          {via && (
                            <p className="k-via" title={via}>
                              <span aria-hidden>{c.from ? "→ " : "↳ "}</span>
                              {via}
                            </p>
                          )}
                          <h3 title={title}>
                            <i className="k-mark" data-kind={kind} role="img" aria-label={KIND_LABEL[kind]} />
                            {gap ? (
                              <span>{title}</span>
                            ) : (
                              <button type="button" className="k-title" aria-pressed={isSel} onClick={(e) => (e.stopPropagation(), onPick({ scene: c.scene }))}>
                                {title}
                              </button>
                            )}
                            {frame?.error && <b className="k-tag">step failed</b>}
                          </h3>
                        </header>
                        <Frame k={key} frame={frame} gap={gap} height={gap || !frame ? Math.round(dev.height * 0.6) : frame.height} page={pages.has(key)} z={z} note={gap ? "Not built yet" : !frame ? "Not snapped at this size" : undefined} />
                      </article>
                    );
                  })}
                </div>
              </div>
            ))}
          </section>
        ))}
        <svg className="k-arrows" width={size.w} height={size.h} aria-hidden>
          <defs>
            {(["positive", "negative", "edge", "gap"] as const).map((k) => (
              <marker key={k} id={`k-head-${k}`} viewBox="0 0 10 10" refX="1" refY="5" markerWidth="4" markerHeight="4" orient="auto-start-reverse">
                <path d="M0,0 L10,5 L0,10 z" className="k-head" data-kind={k} />
              </marker>
            ))}
          </defs>
          {edges.map((e, i) => (
            <path key={i} d={e.d} data-kind={e.kind} strokeWidth={2 * L} strokeDasharray={e.kind === "negative" ? `${8 * L} ${5 * L}` : e.kind === "gap" ? `${2 * L} ${4 * L}` : undefined} markerEnd={`url(#k-head-${e.kind})`} />
          ))}
        </svg>
      </div>
    </div>
  );
}

/**
 * One frame: its frozen page when it's close enough to read and has a place
 * among the pages; otherwise its picture (the small one from far, the full
 * one close up when the page can't be frozen faithfully). Nothing in it can
 * be clicked: the board keeps the pointer.
 */
function Frame({ k, frame, gap, height, page, z, note }: { k: string; frame?: FrameRecord; gap: boolean; height: number; page: boolean; z: number; note?: string }) {
  const onLoad = (e: React.SyntheticEvent<HTMLIFrameElement>) => {
    const doc = e.currentTarget.contentDocument;
    if (!doc || !frame) return;
    for (const el of doc.querySelectorAll<HTMLElement>("[data-kanvas-scroll]")) {
      const [x = 0, y = 0] = (el.getAttribute("data-kanvas-scroll") ?? "").split(",").map(Number);
      el.scrollTo({ left: x, top: y, behavior: "instant" });
    }
    doc.defaultView?.scrollTo({ left: frame.scroll?.x ?? 0, top: frame.scroll?.y ?? 0, behavior: "instant" });
  };
  if (gap || !frame?.png) {
    return (
      <div className="k-view k-gap" data-key={k} style={{ height }}>
        <p>{note}</p>
      </div>
    );
  }
  const picture = z >= PAGE_ZOOM && frame.fallback?.length ? frame.png : (frame.thumb ?? frame.png);
  return (
    <div className="k-view" data-key={k} style={{ height }}>
      {page ? (
        <iframe src={frame.html} title="" aria-hidden tabIndex={-1} sandbox="allow-same-origin" onLoad={onLoad} />
      ) : (
        <img src={picture} alt="" decoding="async" loading="lazy" draggable={false} />
      )}
      <div className="k-shield" />
    </div>
  );
}
