# kanvas.config.ts

The one file an app keeps for kanvas, at its root. It says which states the app has and how to reach each; kanvas never imports the app's code. `kanvas init` writes a start, and [`kanvas.config.example.ts`](../kanvas.config.example.ts) is a whole one.

```ts
import type { KanvasConfig } from "kanvasboard";

const config = {
  baseUrl: "http://localhost:3000",
  clock: "2026-11-25T10:00:00+07:00",
  devices: [{ id: "desktop", label: "Desktop", width: 1280, height: 800 }],
  boards: [/* … */],
} satisfies KanvasConfig;

export default config;
```

The import is a type only, so the config runs even where kanvasboard isn't installed; `defineConfig` from `"kanvasboard"` works too. A config may import the app's own fixtures to build its seeds.

## The config

| Field | | |
| --- | --- | --- |
| `baseUrl` | required | Where the running app answers, e.g. `http://localhost:3000` |
| `clock` | required | The "now" every scene runs at (ISO, with its offset). Seeds are worked out at it and each page's `Date` starts at it, so dates on a page don't change between snapshots. Moving it changes every frame with a date |
| `timezone` | | The time zone pages and seeds run in, e.g. `"Europe/Lisbon"` (default: this machine's) |
| `locale` | | The browser's language, e.g. `"en-US"` |
| `devices` | required | The screen sizes every scene is snapped at ([Device](#device)) |
| `boards` | required | [Board](#board)s |
| `out` | | Where frames, assets, the manifest and the changelog are written (default `"kanvas"`) |
| `site` | | Where the app's pages are for someone looking at the built board, for its links to them (default: the board's own site, as when the board is served by the app) |
| `live` | | `{ query }`: the query parameter the deployed app reads to put itself in a scene, for Open live on a built board |
| `hide` | | CSS selectors hidden in every frame: a dev badge, a cookie banner |
| `reducedMotion` | | Open pages with reduced motion, so what animates in is simply there (default `true`) |

## Device

| Field | | |
| --- | --- | --- |
| `id`, `label` | required | `"mobile"`, `"Mobile"` |
| `width`, `height` | required | The viewport, in CSS pixels |
| `mobile` | | Touch, and the page's viewport meta honoured |
| `scale` | | The device pixel ratio of the frame's picture (default 1) |

## Board

A page or flow of the app.

| Field | | |
| --- | --- | --- |
| `id`, `title` | required | The id is in the board's link (`#/<id>`) |
| `path` | | The page it's of, linked from the board's bar |
| `lead` | | A line under its name in the side list |
| `lanes` | required | [Lane](#lane)s |

## Lane

One story or ticket, with its states row by row.

| Field | | |
| --- | --- | --- |
| `id`, `title` | required | |
| `ticket` | | e.g. `"PROJ-290"`, shown with the lane and on copied pictures |
| `story` | | "As a …, I want …" |
| `rules` | | Rules that hold for every state in the lane (markdown), shown in each frame's drawer |
| `lists` | | More for the lane's drawer, each `{ title, items }`: "Departs from the brief", "To confirm" |
| `rows` | required | `{ kind: "positive" \| "negative" \| "edge", scenes: (Scene \| Gap)[] }` |

## Scene

One state of the app and how to reach it. A scene on two boards is snapped once.

| Field | | |
| --- | --- | --- |
| `id` | required | Unique across the config; in the frame's link and file names |
| `title` | required | The state's name, in English |
| `path` | required | The path on `baseUrl` the scene opens |
| `seed` | | What the browser holds before the page loads ([Seed](#seed)), or a function returning it, called at the clock |
| `steps` | | What's done on the page, in order ([Step](#step)) |
| `view` | | `"page"` (default): the whole page, as tall as it is. `"screen"`: one screen, for what's pinned to it (a dialog, a sheet, a toast). `{ section: target }`: one part of a long page, from its top to its end |
| `from` | | The scene this one follows, on any lane or board, drawn as an arrow (within a lane) or a link (elsewhere). Absent: the one before it in its row. `null`: none |
| `via` | | The action that leads here, written on the arrow |
| `note` | | How it's reached and what it shows, for its drawer |
| `rules` | | What this state must follow (markdown), for its drawer |
| `hold` | | From the page's first moment, timers longer than this (ms) never fire |
| `devices` | | Only these device ids (default: all) |

When a step can't be played, `snap` names the step and why, and exits 1. A scene that was reached before keeps that frame, marked as not reached on the last snapshot, and `log` leaves it out until it's fixed; a scene never reached shows where it stopped.

A **gap** is a state that's asked for but not built yet: `{ id, title, gap: true, note?, via?, from? }`. It's a dashed placeholder on the board.

## Seed

| Field | |
| --- | --- |
| `localStorage` | `{ key: value }`, strings |
| `sessionStorage` | `{ key: value }`, strings |
| `cookies` | `[{ name, value, path? }]` |

Storage is seeded once, before the app's first script runs. A seed function runs at the config's clock and time zone, so `Date.now() - 2 * DAY` is two days before the board's "now".

## Step

| Step | Does |
| --- | --- |
| `{ click: target }` | Clicks it |
| `{ fill: target, text }` | Types into a field as a keyboard would, so the field hears each change |
| `{ select: target, option }` | Picks an option of a `<select>`, by its words or its value |
| `{ leave: target }` | Moves focus out of a field, so what it says on being left shows |
| `{ see: target }` | Waits until it's on the screen |
| `{ show: target }` | Brings it to the middle of the screen (what a `"screen"` frame shows) |
| `{ press: "Enter" }` | A key, as Playwright names it (`"Escape"`, `"Shift+Tab"`) |
| `{ top: true }` | Scrolls back to the top |
| `{ wait: ms }` | Waits |
| `{ hold: ms }` | From here on, timers longer than this never fire, so what they'd end (a toast) stays |

## Target

What a step acts on, found the way a person finds it. Only what's visible counts, so a copy a breakpoint hides is never the one used.

- A string: the words on something pressable (a button, a link), or failing that any text.
- An object, with any of:

| Field | |
| --- | --- |
| `role`, `name` | An ARIA role and its accessible name: `{ role: "button", name: "Add plant" }` |
| `label` | A field, by its label's words (a `<select>` inside its `<label>` too) |
| `text` | Anything, by its words |
| `placeholder` | A field, by its placeholder |
| `css` | A CSS selector |
| `within` | Look only inside this CSS selector |
| `nth` | Which match, from 0 (default: the first) |
| `contains` | Match part of the words instead of all of them |
