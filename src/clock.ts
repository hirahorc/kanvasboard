/**
 * The config's clock, in Node: while a config loads and its seeds are
 * worked out, `new Date()` and `Date.now()` start at the frozen "now" and
 * run on from it, so a seed that says "in five days" means the same day as
 * the page, whose own clock starts there too.
 */
export async function atClock<T>(iso: string, run: () => Promise<T> | T): Promise<T> {
  const Real = Date;
  const at = new Real(iso).getTime();
  if (Number.isNaN(at)) throw new Error(`clock: "${iso}" isn't a date`);
  const began = Real.now();
  const now = () => at + (Real.now() - began);
  class Frozen extends Real {
    constructor(...args: unknown[]) {
      if (args.length === 0) super(now());
      else super(...(args as [string | number | Date]));
    }
    static override now() {
      return now();
    }
  }
  (globalThis as { Date: DateConstructor }).Date = Frozen as unknown as DateConstructor;
  try {
    return await run();
  } finally {
    (globalThis as { Date: DateConstructor }).Date = Real;
  }
}
