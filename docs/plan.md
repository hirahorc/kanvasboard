# kanvas: the plan

kanvas puts every state of an app on one board, the way a design file would: a board per page or flow, a lane per story, a row per kind of state (positive, negative, edge), and an arrow from a state to the one an action leads to. Each frame is a **static snapshot** of the real page, 1:1 in HTML and CSS with its images, so a board of a hundred frames opens light and never scrolls inside a frame. A frame opens a drawer with **the rules it follows** and **its changelog**.

It started as the canvas inside one prototype (a multi-step order flow, the first app here), where every frame was the live page in an iframe. That worked, and cost gigabytes of memory (about 1.5 to 1.9 GB per board once its frames were up, more on every hot reload, and frames were never let go), frames that scrolled inside, and a canvas that had to be built into the app itself. kanvas keeps the idea and drops all three. It's Hira's own product, written from scratch: no code comes over from that prototype, and kanvas never imports an app's code.

## Who it's for

People who build apps with a coding agent. The agent writes and keeps the scene file (which states exist, how to reach each), so the board stays a true map of the app, and each frame's rules and changelog are the spec memory an AI-built app usually loses.

## 1. Frames

- **Static, 1:1.** Each frame is the page's DOM after its steps, frozen into HTML with the page's CSS and its images and fonts saved beside it, plus a PNG of it. No scripts, no live app.
- **Nothing scrolls inside a frame, nothing animates.** Animations and transitions are settled at their end before freezing.
- **A frame is as tall as what it shows**, by its kind:
  - *page*: the whole page, as tall as it is;
  - *screen*: one screen, for what's pinned to the viewport (a dialog, a sheet, a toast), since it's placed against the screen;
  - *section*: one part of a long page (a landing section), with the rest of the page left out, not scrolled past.
- **A state that opens something is a frame of its own.** An accordion open, an answer expanded, an error shown, a package added: each is its own frame, with an arrow from the state before. A static frame never grows; the board shows both states side by side.
- **Time is frozen.** Every scene runs at the config's `clock`, so dates on a page don't change from one snapshot to the next.
- **What can't be frozen** (a `<canvas>`, video, a map, an embed) makes that frame fall back to its PNG.
- **Light.** Zoomed out, the board shows the PNGs; zoomed in, the static HTML in a sandboxed frame with no scripts; frames far from the screen are let go. Target: the ~85 frames of the first app's flow open together under ~500 MB.

## 2. The drawer

Clicking a frame slides a drawer over from the side. It holds:

- **Rules**: what this state follows (from the config; their source is the app's docs and tickets).
- **Changelog**: what changed in this frame, newest first (section 3).
- **How it's reached and what it shows**, with the frame it comes from.
- **Open live**: the real app in this state (see Open decisions).
- **Copy image** (the frame with a line under it: ticket, state, screen size, date) and **copy link**, for pasting into a ticket: comments live on the tickets, the board is a map.

Clicking a lane's name opens the lane's drawer: its story, the rules that hold for all its states, where the build departs from the brief, what the team still has to confirm, the lane's and the board's changelog, and **copy lane as a picture**.

## 3. Updates and the changelog

- **Frames update on every commit to the main branch**, not while editing. Main is what's deployed, so frames show what's live, and work in progress never shows.
- After a commit, the boards are snapped again and compared with the committed snapshots (PNG pixels plus a hash of the frozen HTML). **Only frames that actually changed** are replaced and get an entry.
- **An entry**: the date, one line on what changed (in English), its source (the PM, marketing, the designer, a ticket number), and the commit.
- **A change across many frames** (a button's colour, a shared header) is **one entry on the board**, not one per frame, so a frame's changelog stays about that frame.
- **A rule that changes** changes in the same commit as the build, and the entry says so.
- **`kanvas check`** fails when a scene can't be reached (a step's target is gone), so a broken scene is caught at the commit, not on the board.

## 4. The board

What the prototype's canvas does well, kept:

- A board per page, and an overview of the happy path.
- A lane per ticket or story (say PROJ-281 to PROJ-297), rows for positive, negative and edge states, arrows from a state to the one an action leads to, the action's words over the frame.
- Desktop and phone widths, switched for the whole board.
- A dashed placeholder for a state the brief asks for that isn't built.
- Names that stay readable at any zoom (far out, the action drops and the title stays), a mark beside each title for its kind, a side list of every lane and frame.
- Its own look, apart from any app's design system on purpose (it frames the product, so it mustn't pass for it), to WCAG 2.2 AA.
- Titles, notes and arrow labels in English: they travel into pasted pictures.

## 5. The product

- **Runs outside the app**, in a headless browser: any app works (Next, Vite, Vue, a Lovable or v0 export) without changing its code.
- **The app describes itself** in one `kanvas.config.ts` in its own repo (boards, lanes, scenes: path, seed, steps, view, rules). The coding agent keeps it; `kanvas init` writes the config's start and a short instruction block for `AGENTS.md`/`CLAUDE.md` ("after a commit to main, snap and log; a new state gets a scene").
- **What it writes is committed in the app's repo**, so the changelog's history is the repo's:

  ```text
  kanvas/
    manifest.json          every frame: board, lane, row, device, hash, size
    changelog.json         entries by frame and by board
    frames/<board>/<scene>@<device>.html | .png
    assets/                images and fonts, by content hash, shared across frames
  ```

- **Commands**

  | Command | Does |
  | --- | --- |
  | `kanvas init` | Writes a starting config and the agent instructions |
  | `kanvas snap [board…]` | Opens each scene at each device, at the frozen clock, seeds it, plays its steps, freezes it |
  | `kanvas diff` | Which frames changed against the committed snapshots |
  | `kanvas log` | Changelog entries for the changed frames, from the last commit |
  | `kanvas build` | The viewer and the snapshots as one static site |
  | `kanvas check` | Fails if a scene can't be reached |
  | `kanvas open <scene>` | Opens the live app in that state in a real browser |

## 6. The first app moves over (phase 4)

- Its scenes (today in its own canvas code) become its `kanvas.config.ts`; the seeds keep using the app's own fixtures, in the app's repo.
- The old canvas goes: the live-iframe board, its scene boot script, its scene runner, its scene checker and the flag that gated them.
- The board is served at the same `/canvas` address, so the links the PM and marketing already have keep working.
- The "Prototype | Canvas" switch on the pages stays and points at the board.
- Its `AGENTS.md` rule becomes: after a commit to main that touches the flow, `kanvas snap` and `kanvas log`; a state a change adds gets a scene.
- Until then the old canvas isn't developed further. One optional stopgap for its memory: let go of frames that are far from the screen.

## Stack

- **TypeScript**, ESM, Node 20 or later.
- **Runner: Playwright** (`playwright-core`), driving the Chrome already on the machine (nothing extra to download locally), Playwright's Chromium on CI. Its clock API freezes time, init scripts seed storage before the page loads, its locators find a step's target by role and name.
- **Freezing: our own in-page serializer.**
- **Comparing: `pixelmatch` + `pngjs`**, plus a hash of the frozen HTML.
- **Viewer: Vite + React**, built once into static files.
- **CLI:** `node:util` `parseArgs`, no framework.
- **One package** for now; split only if it earns it.

## Phases

| Phase | Work | Done when |
| --- | --- | --- |
| 0 | This repo, the config's first shape, this plan | Done (2026-11-24) |
| 1 | Runner: the config settles; `snap` with the three kinds of frame, the frozen clock, the PNG fallback | Done (2026-11-24), see "Phase 1" below |
| 2 | Viewer: board, lanes, rows, arrows, devices, placeholders, zoom levels, the frame and lane drawers (rules, note, copy image and link, open live) | Done (2026-11-24), see "Phase 2" below |
| 3 | `diff`, `log` and `check`: the changelog from git, board-level entries, rule changes | Done (2026-11-25), see "Phase 3" below |
| 4 | The first app moves over (section 6) | Built (2026-11-25), see "Phase 4" below |
| 5 | `init` and the agent instructions, a second app (a vibe-coded one), docs, the npm name, a licence, publish | Someone else sets it up without help |

## Phase 1: the runner (done 2026-11-24)

`kanvas snap` and `kanvas verify` work, run against the first app's flow through a test config outside both repos (its existing canvas scenes, described to kanvas).

- **All of the first app's flow:** 154 frames (77 states at desktop and phone) in about 75 seconds, every one made.
- **Faithful:** `verify` renders each frozen frame from its static file and compares it with the picture of the live page, at half size so text smoothed differently on a GPU layer doesn't count. 148 of 154 match (under 0.5% of pixels differ); the other six differ by 0.5 to 1.8%, all of it text smoothing on bottom sheets, nothing moved or missing.
- **Stable:** snapped twice with nothing changed, the frozen HTML is identical on all 154 frames; the PNG differs on 5 (rendering isn't byte-exact). So phase 3 decides "changed" by the HTML's hash, and uses the picture only to show what changed.
- **Size:** about 17 MB of HTML and 24 MB of PNG for 154 frames, plus 2.6 MB of shared files. A page's stylesheets are shared files (the whole flow uses 9), so a frame's HTML is only its DOM.

What it took, for whoever reads the code:

- **Only the date moves.** Playwright's fake clock fakes timers and animation frames too, and made pages crawl (a frame took 15 minutes); the page's `Date` is moved to the config's clock instead, and everything else runs as it does.
- **Seeds run at the clock too**, in Node: the config loads, and a scene's seed is worked out, with `Date` at the config's clock and the process in its time zone.
- **What the config hides is hidden from the first moment**, not only for the picture: a dev toolbar at the foot of a phone screen sat over a button a step pressed.
- **Scrolls are instant** (pages set `scroll-behavior: smooth`), **a page frame is taken from its top** (an app that scrolls to an error left the sticky header mid-page in the picture), **the pointer leaves the page** after the steps (no hover on the last thing pressed), and **the focused element keeps its ring**: it's marked, and every `:focus`, `:focus-visible` and `:focus-within` selector also matches the mark.
- **Viewport units become pixels** of the device, in declarations only (never selectors: `.min-h-[100dvh]` still matches), so a screen-tall hero stays a screen tall in a frame as tall as its page.
- **Pictures are decoded before a frame is taken**, in the page and in `verify`: loaded isn't painted.
- **What can't be frozen** names itself (`shadow DOM in <x>`, `a canvas`, `an iframe`, a modal in the top layer) and only counts when it can be seen: Next's 1-pixel route announcer doesn't.

The config grew from it: targets found like a person finds them (role and name, label, placeholder, text, CSS, `within`, `nth`, `contains`), steps `click`, `fill`, `leave`, `see`, `show`, `top`, `press`, `wait`, `hold`; a scene's `from` (absent: the one before it in its row; null: none) and `hold`; a section found by a target; a lane's `ticket` and titled `lists`; the config's `hide`, `timezone`, `locale` and `reducedMotion` (on by default, so what animates in is simply there).

## Phase 2: the viewer (done 2026-11-24)

The board, built with Vite and React into `dist/viewer` (77 KB gzipped). Three ways to it:

- `kanvas view` serves it beside the frames on this machine, and answers "Open live" by opening the scene in a real browser here;
- `kanvas open <scene>` does that from the terminal: a real window at the device, in the scene's state, with motion as the page has it, open until it's closed;
- `kanvas build` writes it and the frames into one folder for any static host; there, "Open live" says the command to run instead.

What it does: a board per page, lanes and their rows, an arrow from a state to the one it leads to (within its lane: one across lanes would cross every lane between, so the label's "→" and the drawer say where it comes from), desktop and phone switched for the whole board, a dashed placeholder for what isn't built, the board's words drawn larger as it zooms out so they stay readable (the action drops when far), drag or scroll to move, ⌘/Ctrl with scroll or a pinch to zoom, keys (arrows frame to frame, Enter brings one up, 0 the whole board, Shift with an arrow moves it), a side list of boards, lanes and states, a link for every board, lane and frame (`#/<board>/<scene>@<device>`).

The drawer: for a frame, its kind and ticket, Copy image (the picture with a line under it: ticket, state, screen size, the day it was copied), Copy link, Open live, how it's reached (and from which frame), what it shows, its rules and its lane's, its changelog, what kind of frame it is; for a lane, Copy lane as a picture (its story, rows, frames and arrows), its story, rules, titled lists, changelog and states.

Memory, with the first app's plan board (41 states, the largest): about 320 MB opened, 340 MB with the whole board in view, 425 to 440 MB with a frame picked and zoomed in. From far a frame is its small picture (a WebP about 360 wide, made by `snap`); close enough to read (30% and up), the dozen nearest the screen are their frozen page in a sandboxed frame with no script, the rest stay pictures. A frame that can't be frozen faithfully is its full picture up close.

## Phase 3: the changelog from git (done 2026-11-25)

The routine in an app's repo, after a change is committed to main:

```sh
kanvas snap     # the frames as the app is now; a frame whose page is the same keeps its files untouched
kanvas log      # entries for what looks different, from the commits since the frames were last committed
git add kanvas && git commit -m "chore(kanvas): frames for …"
```

- **What counts as a change:** a frame whose frozen page is written differently, and either its words changed (copy, field values, placeholders: a word is a change, however small on a long page) or, past the ids a framework hands out in order (`id`, `for`, `aria-controls` and the like move when anything before them does), its picture differs by more than a few pixels at half size. A picture that differs only by rendering, with the page the same, never counts; such a frame keeps its committed pictures, so a snapshot of nothing new changes no file in the repo.
- **What an entry says:** the date and the newest commit (every commit since the last frames, when there's more than one); a summary, the commits' subjects without their `feat(…):` (or `--summary`); its source, a `Source:`, `Asked-by:` or `Requested-by:` trailer, or failing that the tickets the commits name (or `--source`).
- **Its kinds:** states that look different; the whole board, when at least 60% of a board's states (and at least five) changed at once, so a shared header is one entry and not forty; new states; states whose rules (or their lane's) changed, marked as a rule.
- **Run twice for one commit**, its entries are replaced, not added again.
- **`kanvas diff`** says the same without writing: what looks different, what's new, whose rules changed, what's gone, and what was written differently but looks the same.
- **`kanvas check`** opens every scene and plays its steps, without freezing or writing, finds each section, and checks every arrow points at a state on its board; it exits 1 when something can't be reached, for CI.
- **The clock holds for the config as it loads, too.** A config whose clock is imported from another file is read once on the side for its clock and time zone, then loaded at them, so a date worked out as it loads ("in forty days") doesn't move when the day does. (Found because a test ran across midnight.)

Tested in a throwaway repo on the first app's plan board: the first frames as one board entry; a commit that changed a field's text and wrote two rules as two entries, the text change and the rule (`Source:` read from the commit); a commit that hid the header on all 39 frames as one board entry, its source the ticket in its subject; `log` run twice adding nothing; a snapshot with nothing new changing no file; `check` passing, then failing with exit 1 and the step named once a step's button was renamed. The drawers show each frame's and lane's entries, marked Whole board, New or Rule.

## Phase 4: The first app moves over (built 2026-11-25)

- `kanvas.config.ts` at the first app's root reads the scenes that stay in its own canvas code (seeds, steps, lanes, tickets): one source for the frames and for opening a scene live. It imports nothing from kanvas, so the app builds where kanvas isn't installed; `npm run kanvas` runs `../kanvas/dist/cli.js` until kanvas is published.
- The board's site is the first app's `public/canvas` (`out` and `build` both there), committed and served as the app's own files: 154 frames, about 48 MB. `/canvas` redirects to `/canvas/index.html`, and an old `/canvas/<board>#<scene>` link to `?board=<board>` with its hash, which the viewer reads.
- Open live on the deployed board: The first app already opens a scene by itself (`?scene=<id>`), so its config says `live: { query: "scene" }` and the board links there; the old in-app scene mode stays for that, while the old live-iframe board and its scene checker are gone. A generic in-page player for apps that can't do this is left for later.
- New in kanvas for it: `site` and `live` in the config, page links from the board's bar, a link to a state on another board (the overview borrows states), frames marked noindex, and `check` accepting a state that follows one on another board.
- `check` passes on all 77 scenes at both widths; `snap` made all 154 frames; `/canvas`, an old link, Open live into scene mode and back, and the prototype's switch were each opened on the running app.

## Decided (2026-11-24)

1. **A state that opens something is a frame of its own** (section 1), instead of a frame that grows.
2. **Open live, both ways.** `kanvas open <scene>` in phase 2, which always works on the developer's machine; and in phase 4, for links that open a state on a deployed app (what the first app's PM uses), a small opt-in script the app includes that takes the seed from the link.
3. **The stopgap for the old canvas's memory: done**, in the first app: only frames near the screen stay live, within a budget (16 page frames, a landing section counting 3). The plan board with the whole board in view went from about 1.5 GB to 0.7 to 0.8 GB, and a hot reload's peak from 3 GB to 1.3 GB.

## Open

1. **The name for npm, GitHub and a domain.** `kanvas` itself is taken on npm (an unrelated canvas editor), on GitHub, and as kanvas.dev. Checked 2026-11-24, fully free: **kanvasboard** (npm `kanvasboard`, GitHub `kanvasboard`, kanvasboard.com; kanvasboard.dev has no DNS). Also free on npm and GitHub but not as a .com: `usekanvas`, `kanvashq`, `getkanvas` (their .dev has no DNS). The product can stay "kanvas" with its command `kanvas`, whatever the package is called. Claim them before going public.
2. **Licence.** Before the repo goes public.
3. **The GitHub repo.** Hira creates it; `gh` isn't logged in on this machine.
