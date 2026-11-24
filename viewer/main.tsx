import { StrictMode, useCallback, useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { Board, type BoardControls } from "./Board";
import { Drawer } from "./Drawer";
import { Side } from "./Side";
import { load, readRoute, routeHash, type Data, type Route } from "./data";
import "./styles.css";

const DEVICE_KEY = "kanvas:device";

function App() {
  const [data, setData] = useState<Data | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const [route, setRoute] = useState<Route>(() => readRoute());
  const [zoom, setZoom] = useState(0.2);
  const [sideOpen, setSideOpen] = useState(false);
  const controls = useRef<BoardControls>(null);

  useEffect(() => {
    load().then(setData, (e: Error) => setFailed(e.message));
    const onHash = () => setRoute(readRoute());
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  const go = useCallback((next: Route, replace = false) => {
    const hash = routeHash(next);
    if (replace) history.replaceState(null, "", hash);
    else history.pushState(null, "", hash);
    setRoute(next);
  }, []);

  if (failed) return <p className="k-empty">{failed}</p>;
  if (!data) return <p className="k-empty">Opening the board…</p>;

  const { manifest } = data;
  if (!manifest.boards.length) return <p className="k-empty">This config has no boards yet.</p>;
  const board = manifest.boards.find((b) => b.id === route.board) ?? manifest.boards[0]!;
  let remembered: string | null = null;
  try {
    remembered = localStorage.getItem(DEVICE_KEY);
  } catch {
    /* storage this page can't use */
  }
  const device = manifest.devices.find((d) => d.id === (route.device ?? remembered))?.id ?? manifest.devices[0]!.id;

  const pick = (p: { scene?: string; lane?: string }) => go({ board: board.id, device, ...p }, true);
  const close = () => go({ board: board.id, device }, true);
  const setDevice = (d: string) => {
    try {
      localStorage.setItem(DEVICE_KEY, d);
    } catch {
      /* not remembered, then */
    }
    go({ ...route, board: board.id, device: d }, true);
  };

  return (
    <div className="k-app" data-side={sideOpen || undefined}>
      <Side data={data} board={board} device={device} scene={route.scene} lane={route.lane} onPick={(p) => (pick(p), setSideOpen(false), p.scene && controls.current?.show(p.scene))} />
      <main className="k-main">
        <header className="k-bar">
          <button type="button" className="k-side-toggle" aria-expanded={sideOpen} onClick={() => setSideOpen((o) => !o)}>
            Boards
          </button>
          <h1>{board.title}</h1>
          {board.path && <code className="k-path">{board.path}</code>}
          <div className="k-bar-end">
            <div className="k-seg" role="group" aria-label="Screen size">
              {manifest.devices.map((d) => (
                <button key={d.id} type="button" aria-pressed={d.id === device} onClick={() => setDevice(d.id)}>
                  {d.label}
                </button>
              ))}
            </div>
            <div className="k-zoom" role="group" aria-label="Zoom">
              <button type="button" aria-label="Zoom out" onClick={() => controls.current?.zoomBy(0.8)}>
                −
              </button>
              <button type="button" className="k-zoom-level" title="Actual size" onClick={() => controls.current?.zoomTo(1)}>
                {Math.round(zoom * 100)}%
              </button>
              <button type="button" aria-label="Zoom in" onClick={() => controls.current?.zoomBy(1.25)}>
                +
              </button>
              <button type="button" title="Fit the board's width" onClick={() => controls.current?.fitWidth()}>
                Fit
              </button>
              <button type="button" title="The whole board" onClick={() => controls.current?.fitAll()}>
                All
              </button>
            </div>
          </div>
        </header>
        <div className="k-stage">
          <Board key={`${board.id}@${device}`} data={data} board={board} device={device} selected={route.scene} lane={route.lane} onPick={pick} onZoom={setZoom} controls={controls} />
          <Drawer data={data} board={board} device={device} scene={route.scene} lane={route.lane} onPick={(p) => (pick(p), p.scene && controls.current?.show(p.scene))} onClose={close} />
        </div>
      </main>
    </div>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
