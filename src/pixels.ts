import pixelmatch from "pixelmatch";
import { PNG } from "pngjs";

/**
 * Two pictures compared the way an eye would: at half size, so text smoothed
 * one way on a GPU layer and another way off it (different pixel by pixel,
 * the same to anyone looking) doesn't count, and what's left is what's seen.
 * Pictures of different sizes are compared where they overlap.
 */
export function compare(a: PNG, b: PNG): { ratio: number; sameSize: boolean; diff: PNG } {
  const w = Math.min(a.width, b.width);
  const h = Math.min(a.height, b.height);
  const crop = (p: PNG) => {
    if (p.width === w && p.height === h) return p.data;
    const c = Buffer.alloc(w * h * 4);
    for (let y = 0; y < h; y++) p.data.copy(c, y * w * 4, y * p.width * 4, y * p.width * 4 + w * 4);
    return c;
  };
  const hw = Math.max(1, w >> 1);
  const hh = Math.max(1, h >> 1);
  const half = (d: Buffer) => {
    const out = Buffer.alloc(hw * hh * 4);
    for (let y = 0; y < hh; y++)
      for (let x = 0; x < hw; x++)
        for (let ch = 0; ch < 4; ch++) {
          const at = (yy: number, xx: number) => d[(Math.min(h - 1, yy) * w + Math.min(w - 1, xx)) * 4 + ch]!;
          out[(y * hw + x) * 4 + ch] = (at(2 * y, 2 * x) + at(2 * y, 2 * x + 1) + at(2 * y + 1, 2 * x) + at(2 * y + 1, 2 * x + 1)) >> 2;
        }
    return out;
  };
  const diff = new PNG({ width: hw, height: hh });
  const n = pixelmatch(half(crop(a)), half(crop(b)), diff.data, hw, hh, { threshold: 0.1 });
  return { ratio: n / (hw * hh), sameSize: a.width === b.width && a.height === b.height, diff };
}

/**
 * Whether two pictures (PNG files' bytes) look different: another size, or
 * more than `speck` pixels changed at half size. A count, not a share: a word
 * changed on a long page is a tiny share of it and still a change.
 */
export function looksDifferent(a: Buffer, b: Buffer, speck = 24): boolean {
  const pa = PNG.sync.read(a);
  const pb = PNG.sync.read(b);
  if (pa.width !== pb.width || pa.height !== pb.height) return true;
  const { ratio, diff } = compare(pa, pb);
  return Math.round(ratio * diff.width * diff.height) > speck;
}
