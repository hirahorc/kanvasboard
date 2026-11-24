# kanvas

Every state of your app on one board, as static frames, each with its rules and its changelog.

kanvas opens your running app in a headless browser, puts each page in each state you describe (seeded storage, a few steps), and freezes it into a static HTML+CSS frame with its images. Frames sit on a board by flow, story and kind of state. Click one for the rules it follows and what changed in it, commit by commit.

Early days: the runner works; the board's viewer is next. See [docs/plan.md](docs/plan.md) for what it is, how it's built and what comes next.

## Use

Describe your app's states in a `kanvas.config.ts` beside your app ([an example](kanvas.config.example.ts)), start the app, then:

```sh
kanvas snap              # every scene at every device, frozen into ./kanvas
kanvas snap checkout     # one board
kanvas snap --scene cart-empty --device mobile
kanvas verify            # each frozen frame against the live page's picture
```

`snap` writes `kanvas/manifest.json` (the boards and every frame), `kanvas/frames/<scene>@<device>.html` and `.png`, and `kanvas/assets/` (images, fonts and stylesheets, shared by content). It drives the Chrome you have installed; `--browser chromium` uses Playwright's instead.
