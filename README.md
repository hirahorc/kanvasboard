# kanvas

Every state of your app on one board, as static frames, each with its rules and its changelog.

kanvas opens your running app in a headless browser, puts each page in each state you describe (seeded storage, a few clicks), and freezes it into a static HTML+CSS frame with its images. Frames sit on a board by flow, story and kind of state. Click one for the rules it follows and what changed in it, commit by commit.

Early days: see [docs/plan.md](docs/plan.md) for what it is, how it's built and what comes next. [`kanvas.config.example.ts`](kanvas.config.example.ts) shows what an app describes.
