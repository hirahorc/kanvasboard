/**
 * The contract between an app and kanvas: one file in the app's repo
 * (kanvas.config.ts) that says which states the app has and how to reach
 * each. Everything specific to the app lives here; kanvas itself never
 * imports the app's code.
 */

/** a screen size every scene is snapped at, unless the scene narrows it */
export interface Device {
  id: string;
  label: string;
  width: number;
  height: number;
  /** touch, and the page's viewport meta honoured */
  mobile?: boolean;
  /** device pixel ratio of the frame's picture (default 1: the picture is for comparing and thumbnails) */
  scale?: number;
}

/**
 * What a step acts on, found the way a person finds it. A string is the
 * words on something pressable (a button, a link), or failing that any text.
 * Only what's visible counts, so a copy a breakpoint hides is never the one used.
 */
export type Target =
  | string
  | {
      /** an ARIA role (a `<button>` is a button), with `name` */
      role?: string;
      /** the accessible name: aria-label, else the words on it */
      name?: string;
      /** a field, by its label's words */
      label?: string;
      /** anything, by its words */
      text?: string;
      placeholder?: string;
      css?: string;
      /** look only inside this (a CSS selector) */
      within?: string;
      /** which match, from 0 (default: the first) */
      nth?: number;
      /** match part of the words instead of all of them */
      contains?: boolean;
    };

/** one thing done on the page after it loads, in order */
export type Step =
  | { click: Target }
  /** type into a field as a keyboard would, so the field hears each change */
  | { fill: Target; text: string }
  /** move focus out of a field, so what it says on being left shows */
  | { leave: Target }
  /** wait until it's on the screen */
  | { see: Target }
  /** bring it to the middle of the screen (a "screen" frame shows what's there) */
  | { show: Target }
  | { top: true }
  /** a key, as Playwright names it ("Enter", "Escape", "Shift+Tab") */
  | { press: string }
  | { wait: number }
  /** from here on, timers longer than this (ms) never fire, so what they would end (a toast) stays */
  | { hold: number };

/** what the browser holds before the page loads: how a scene is put in its state */
export interface Seed {
  localStorage?: Record<string, string>;
  sessionStorage?: Record<string, string>;
  cookies?: { name: string; value: string; path?: string }[];
}

/**
 * What a frame shows:
 * - "page": the whole page, as tall as it is;
 * - "screen": one screen, for what's pinned to it (a dialog, a sheet, a toast);
 * - { section }: one part of a long page, from its top to its end.
 */
export type View = "page" | "screen" | { section: Target };

export interface Scene {
  /** unique across the config: a scene on two boards is snapped once */
  id: string;
  title: string;
  /** the path on `baseUrl` the scene opens */
  path: string;
  /** the action that leads here, said over the frame and on its arrow */
  via?: string;
  /** the scene this one follows; absent, the one before it in its row; null, none */
  from?: string | null;
  /** how it's reached and what it shows, for the frame's drawer */
  note?: string;
  /** the rules this state follows, for the frame's drawer (markdown) */
  rules?: string[];
  /** a function is called at the frozen clock, so dates it works out match the page's */
  seed?: Seed | (() => Seed | Promise<Seed>);
  steps?: Step[];
  view?: View;
  /** from the page's first moment, timers longer than this (ms) never fire */
  hold?: number;
  /** only these devices (ids); every device when absent */
  devices?: string[];
}

/** a state the brief asks for that isn't built yet: a placeholder on the board */
export interface Gap {
  id: string;
  title: string;
  gap: true;
  note?: string;
  via?: string;
  from?: string | null;
}

export interface Row {
  kind: "positive" | "negative" | "edge";
  scenes: (Scene | Gap)[];
}

/** one story or ticket: its states, row by row */
export interface Lane {
  id: string;
  title: string;
  /** e.g. "PROJ-290" */
  ticket?: string;
  story?: string;
  /** rules that hold for every state in the lane (markdown) */
  rules?: string[];
  /** more for the lane's drawer, each a titled list: "Departs from the brief", "To confirm" */
  lists?: { title: string; items: string[] }[];
  rows: Row[];
}

/** one page or flow of the app */
export interface Board {
  id: string;
  title: string;
  /** the page it's of, as a reader knows it */
  path?: string;
  lead?: string;
  lanes: Lane[];
}

export interface KanvasConfig {
  /** where the running app answers, e.g. http://localhost:3000 */
  baseUrl: string;
  /**
   * The "now" every scene runs at (ISO). Seeds are worked out at it and the
   * page's clock starts at it, so a date on a page doesn't change from one
   * snapshot to the next and make every frame look changed.
   */
  clock: string;
  /** the time zone pages and seeds run in, e.g. "Europe/Lisbon" (default: this machine's) */
  timezone?: string;
  /** the browser's language, e.g. "en-US" (default: the browser's) */
  locale?: string;
  devices: Device[];
  boards: Board[];
  /** where frames, assets and the manifest are written (default "kanvas") */
  out?: string;
  /** CSS selectors hidden in every frame: a dev badge, a cookie banner */
  hide?: string[];
  /** open pages with reduced motion, so what animates in is simply there (default true) */
  reducedMotion?: boolean;
}

export const isGap = (s: Scene | Gap): s is Gap => (s as Gap).gap === true;

export function defineConfig(config: KanvasConfig): KanvasConfig {
  return config;
}
