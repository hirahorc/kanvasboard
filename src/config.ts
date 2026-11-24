/**
 * The contract between an app and kanvas: one file in the app's repo
 * (kanvas.config.ts) that says which states the app has and how to reach
 * each. Everything specific to the app lives here; kanvas itself never
 * imports the app's code.
 *
 * A first draft (phase 0). It settles in phase 1, against a real app.
 */

/** a screen size every scene is snapped at, unless the scene narrows it */
export interface Device {
  id: string;
  label: string;
  width: number;
  height: number;
  /** touch, a mobile user agent, and the viewport meta honoured */
  mobile?: boolean;
  /** device pixel ratio of the snapshot's picture (default 2) */
  scale?: number;
}

/** what the browser holds before the page loads: how a scene is put in its state */
export interface Seed {
  localStorage?: Record<string, string>;
  sessionStorage?: Record<string, string>;
  cookies?: { name: string; value: string; path?: string }[];
}

/**
 * One thing done on the page after it loads, in order. Targets are found the
 * way a person finds them, by role and name or by visible text, so a step
 * keeps working when the markup changes underneath.
 */
export type Step =
  | { click: string | { role: string; name: string } }
  | { fill: { label: string; value: string } }
  | { press: string }
  | { scrollTo: string }
  /** milliseconds, or a selector to wait for */
  | { wait: number | string };

/**
 * What a frame shows:
 * - "page": the whole page, as tall as it is
 * - "screen": one screen, for what's pinned to the viewport (a dialog, a sheet, a toast)
 * - { section }: one part of a long page, found by a selector
 */
export type View = "page" | "screen" | { section: string };

export interface Scene {
  id: string;
  title: string;
  /** the path on `baseUrl` the scene opens */
  path: string;
  /** the action that leads here, said over the frame */
  via?: string;
  /** the scene this one is reached from: the board draws an arrow */
  from?: string;
  /** how it's reached and what it shows, for the frame's drawer */
  note?: string;
  /** the rules this state follows, for the frame's drawer (markdown) */
  rules?: string[];
  seed?: Seed | (() => Seed | Promise<Seed>);
  steps?: Step[];
  view?: View;
  /** only these devices (ids); every device when absent */
  devices?: string[];
}

/** a state the brief asks for that isn't built yet: a placeholder on the board */
export interface Gap {
  id: string;
  title: string;
  gap: true;
  note?: string;
}

export interface Row {
  kind: "positive" | "negative" | "edge";
  scenes: (Scene | Gap)[];
}

/** one story or ticket: its states, row by row */
export interface Lane {
  id: string;
  title: string;
  story?: string;
  /** rules that hold for every state in the lane (markdown) */
  rules?: string[];
  rows: Row[];
}

/** one page or flow of the app */
export interface Board {
  id: string;
  title: string;
  lanes: Lane[];
}

export interface KanvasConfig {
  /** where the running app answers, e.g. http://localhost:3000 */
  baseUrl: string;
  /**
   * The "now" every scene runs at (ISO date). Frozen, so a date on a page
   * doesn't change from one snapshot to the next and every frame looks changed.
   */
  clock: string;
  devices: Device[];
  boards: Board[];
  /** where snapshots, the manifest and the changelog are written (default "kanvas") */
  out?: string;
}

export function defineConfig(config: KanvasConfig): KanvasConfig {
  return config;
}
