import type { KanvasConfig } from "./config.js";
import { scenesOf } from "./load.js";
import { launch, openScene } from "./snap.js";
import { locate, say } from "./target.js";

/**
 * Whether every scene can still be reached: each opened at each device and
 * its steps played (nothing frozen, nothing written), its section found, and
 * every arrow pointing at a state that's on its board. For CI: it fails when
 * one can't, so a broken scene is caught at the commit, not on the board.
 */
export async function check(o: { config: KanvasConfig; boards?: string[]; scenes?: string[]; devices?: string[]; browser?: string; concurrency?: number; log?: (l: string) => void }): Promise<string[]> {
  const log = o.log ?? (() => {});
  const problems: string[] = [];

  for (const b of o.config.boards) {
    const ids = new Set(b.lanes.flatMap((l) => l.rows.flatMap((r) => r.scenes.map((s) => s.id))));
    for (const l of b.lanes)
      for (const r of l.rows)
        for (const s of r.scenes) if (s.from && !ids.has(s.from)) problems.push(`${b.id}: ${s.id} follows "${s.from}", which isn't on the board`);
  }

  let scenes = scenesOf(o.config, o.boards);
  if (o.scenes?.length) scenes = scenes.filter((s) => o.scenes!.includes(s.id));
  const jobs = scenes.flatMap((s) =>
    o.config.devices.filter((d) => (!s.devices || s.devices.includes(d.id)) && (!o.devices?.length || o.devices.includes(d.id))).map((d) => ({ scene: s, device: d })),
  );
  const browser = await launch(o.browser);
  let next = 0;
  const worker = async () => {
    while (next < jobs.length) {
      const { scene, device } = jobs[next++]!;
      const id = `${scene.id}@${device.id}`;
      try {
        const { context, page, error } = await openScene(browser, o.config, scene, device);
        let problem = error;
        if (!problem && typeof scene.view === "object") {
          const found = await locate(page, scene.view.section)
            .waitFor({ state: "visible", timeout: 5000 })
            .then(() => true)
            .catch(() => false);
          if (!found) problem = `the section ${say(scene.view.section)} isn't on the page`;
        }
        await context.close();
        if (problem) problems.push(`${id}: ${problem}`);
        log(`${problem ? "✗" : "✓"} ${id}${problem ? `  ${problem}` : ""}`);
      } catch (e) {
        const m = (e as Error).message.split("\n")[0];
        problems.push(`${id}: ${m}`);
        log(`✗ ${id}  ${m}`);
      }
    }
  };
  try {
    await Promise.all(Array.from({ length: Math.max(1, o.concurrency ?? 4) }, worker));
  } finally {
    await browser.close();
  }
  return problems;
}

