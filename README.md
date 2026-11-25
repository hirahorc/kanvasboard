# kanvas

Every state of your app on one board, as static frames, each with its rules and its changelog.

kanvas opens your running app in a headless browser, puts each page in each state you describe (seeded storage, a few steps), and freezes it into a static HTML+CSS frame with its images. Frames sit on a board by flow, story and kind of state. Click one for the rules it follows and what changed in it, commit by commit.

Early days: the runner, the board and the changelog work; moving its first app over is next. See [docs/plan.md](docs/plan.md) for what it is, how it's built and what comes next.

## Use

Describe your app's states in a `kanvas.config.ts` beside your app ([an example](kanvas.config.example.ts)), start the app, then:

```sh
kanvas snap              # every scene at every device, frozen into ./kanvas
kanvas snap checkout     # one board
kanvas snap --scene cart-empty --device mobile
kanvas view              # the board on this machine, with "Open live"
kanvas open cart-remove  # that state in a real browser, to use
kanvas build --to site   # the board as a static site, for any host
kanvas verify            # each frozen frame against the live page's picture
kanvas check             # every scene can still be reached (for CI)
```

After each change committed to main:

```sh
kanvas snap && kanvas log    # fresh frames, and changelog entries for what looks different
git add kanvas && git commit -m "chore(kanvas): frames"
```

A commit can say who asked with a `Source:` trailer; otherwise the tickets it names (`PROJ-293`) are the source. `kanvas diff` shows what changed without writing anything.

`snap` writes `kanvas/manifest.json` (the boards and every frame), `kanvas/frames/<scene>@<device>.html`, `.png` and `.thumb.webp`, and `kanvas/assets/` (images, fonts and stylesheets, shared by content). It drives the Chrome you have installed; `--browser chromium` uses Playwright's instead.
