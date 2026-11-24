import { KIND_LABEL, day, frameOf, isGap, type Lane, type Manifest } from "./data";

const FONT = `-apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif`;
const INK = "#18181b";
const MUTED = "#52525b";
const LINE = "#dcdce0";
const STRIP = "#f4f4f5";
const SURFACE = "#ebebed";
const KIND_INK: Record<string, string> = { positive: "#166534", negative: "#b91c1c", edge: "#4338ca", gap: "#71717a" };

const picture = async (src: string) => createImageBitmap(await (await fetch(src)).blob());

const toPng = (c: HTMLCanvasElement) =>
  new Promise<Blob>((done, fail) => c.toBlob((b) => (b ? done(b) : fail(new Error("the picture couldn't be made"))), "image/png"));

/** a picture onto the clipboard; the blob is handed over as a promise so the click still counts as the reason */
export async function toClipboard(make: () => Promise<Blob>) {
  await navigator.clipboard.write([new ClipboardItem({ "image/png": make() })]);
}

/** words broken into lines no wider than `width` */
function wrap(ctx: CanvasRenderingContext2D, text: string, width: number): string[] {
  const lines: string[] = [];
  let line = "";
  for (const word of text.split(/\s+/)) {
    const next = line ? `${line} ${word}` : word;
    if (ctx.measureText(next).width > width && line) {
      lines.push(line);
      line = word;
    } else line = next;
  }
  if (line) lines.push(line);
  return lines;
}

/**
 * One frame as a picture with a line under it saying what it is and when it
 * was taken: a picture pasted into a ticket won't follow the build, so it
 * says where it came from.
 */
export async function frameImage(o: { src: string; lines: string[] }): Promise<Blob> {
  const shot = await picture(o.src);
  // a phone's frame is narrow: drawn twice as large, so its words are as legible as a desktop's
  const s = shot.width < 600 ? 2 : 1;
  const c = document.createElement("canvas");
  const ctx = c.getContext("2d")!;
  const size = 13 * s;
  const lh = 20 * s;
  const pad = 12 * s;
  ctx.font = `${size}px ${FONT}`;
  const lines = o.lines.flatMap((l) => wrap(ctx, l, shot.width * s - pad * 2));
  const strip = lh * lines.length + pad;
  c.width = shot.width * s;
  c.height = shot.height * s + strip;
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, c.width, c.height);
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(shot, 0, 0, shot.width * s, shot.height * s);
  ctx.fillStyle = STRIP;
  ctx.fillRect(0, shot.height * s, c.width, strip);
  ctx.fillStyle = LINE;
  ctx.fillRect(0, shot.height * s, c.width, s);
  ctx.fillStyle = INK;
  ctx.font = `${size}px ${FONT}`;
  ctx.textBaseline = "middle";
  lines.forEach((t, i) => ctx.fillText(t, pad, shot.height * s + pad / 2 + lh * (i + 0.5)));
  return toPng(c);
}

/**
 * One lane as a picture for its ticket: its ticket and story, its rows by
 * name, each frame with its action and title, and the arrows between them.
 * Frames are drawn at half size on desktop, whole on a phone.
 */
export async function laneImage(o: { manifest: Manifest; lane: Lane; device: string; taken: string }): Promise<Blob> {
  const { manifest, lane, device } = o;
  const dev = manifest.devices.find((d) => d.id === device) ?? manifest.devices[0]!;
  const scale = dev.width > 600 ? 0.5 : 1;
  const W = dev.width * scale;
  const GAP = 64;
  const PAD = 40;
  const ROW_NAME = 120;
  const LABEL = 44;
  const MAX_H = 1400; // a page's frame is cut off this far down, so the lane stays a picture
  const c = document.createElement("canvas");
  const ctx = c.getContext("2d")!;

  // where everything goes: the picture is as wide as its widest row, and the story wraps to that
  const rowsWidth = Math.max(...lane.rows.map((r) => PAD + ROW_NAME + r.cells.length * (W + GAP) - GAP + PAD));
  const pictureWidth = Math.min(16000, Math.max(rowsWidth, 900));
  ctx.font = `15px ${FONT}`;
  const story = lane.story ? wrap(ctx, lane.story, pictureWidth - PAD * 2) : [];
  const head = PAD + 34 + story.length * 22 + 28;
  type Placed = { x: number; y: number; w: number; h: number; id: string; kind: string; from: string | null; img?: ImageBitmap; title: string; via?: string };
  const placed: Placed[] = [];
  let y = head;
  for (const row of lane.rows) {
    let x = PAD + ROW_NAME;
    let tallest = 0;
    for (const cell of row.cells) {
      const gap = isGap(cell);
      const frame = gap ? undefined : frameOf(manifest, cell.scene, device);
      const h = Math.min(MAX_H, frame ? frame.height * scale : dev.height * scale * 0.6);
      const scene = gap ? undefined : manifest.scenes[cell.scene];
      placed.push({
        x,
        y: y + LABEL,
        w: W,
        h,
        id: gap ? cell.gap.id : cell.scene,
        kind: gap ? "gap" : row.kind,
        from: cell.from,
        img: frame?.png ? await picture(frame.png) : undefined,
        title: gap ? cell.gap.title : (scene?.title ?? cell.scene),
        via: gap ? cell.gap.via : scene?.via,
      });
      tallest = Math.max(tallest, h);
      x += W + GAP;
    }
    y += LABEL + tallest + GAP;
  }
  c.width = pictureWidth;
  c.height = y - GAP + PAD;

  // the ground and the head
  ctx.fillStyle = SURFACE;
  ctx.fillRect(0, 0, c.width, c.height);
  ctx.fillStyle = INK;
  ctx.textBaseline = "alphabetic";
  ctx.font = `600 22px ${FONT}`;
  ctx.fillText([lane.ticket, lane.title].filter(Boolean).join("  ·  "), PAD, PAD + 22);
  ctx.font = `15px ${FONT}`;
  ctx.fillStyle = MUTED;
  story.forEach((l, i) => ctx.fillText(l, PAD, PAD + 50 + i * 22));
  ctx.font = `12px ${FONT}`;
  ctx.fillText(`${dev.label} · ${o.taken}`, PAD, head - 10);

  // the rows' names
  let ry = head;
  for (const row of lane.rows) {
    const inRow = placed.filter((p) => p.y === ry + LABEL);
    ctx.font = `600 12px ${FONT}`;
    ctx.fillStyle = KIND_INK[row.kind]!;
    ctx.fillText(KIND_LABEL[row.kind].toUpperCase(), PAD, ry + LABEL + 14);
    ry += LABEL + Math.max(0, ...inRow.map((p) => p.h)) + GAP;
  }

  // the frames, each with its action and title over it
  for (const p of placed) {
    ctx.font = `12px ${FONT}`;
    ctx.fillStyle = MUTED;
    if (p.via) ctx.fillText(`${p.from ? "→" : "↳"} ${p.via}`.slice(0, 70), p.x, p.y - 26);
    ctx.font = `600 13px ${FONT}`;
    ctx.fillStyle = INK;
    ctx.fillText(p.title.slice(0, 64), p.x, p.y - 8);
    ctx.save();
    ctx.beginPath();
    ctx.roundRect(p.x, p.y, p.w, p.h, 6);
    ctx.clip();
    ctx.fillStyle = "#fff";
    ctx.fillRect(p.x, p.y, p.w, p.h);
    if (p.img) ctx.drawImage(p.img, 0, 0, p.img.width, Math.min(p.img.height, p.h / scale), p.x, p.y, p.w, Math.min(p.h, p.img.height * scale));
    else {
      ctx.fillStyle = MUTED;
      ctx.font = `13px ${FONT}`;
      ctx.fillText("Not built yet", p.x + 16, p.y + 28);
    }
    ctx.restore();
    ctx.strokeStyle = p.kind === "gap" ? "#a1a1aa" : LINE;
    ctx.setLineDash(p.kind === "gap" ? [6, 4] : []);
    ctx.lineWidth = 1;
    ctx.strokeRect(p.x + 0.5, p.y + 0.5, p.w - 1, p.h - 1);
    ctx.setLineDash([]);
  }

  // the arrows, from the frame a state follows
  for (const t of placed) {
    const s = t.from ? placed.find((p) => p.id === t.from) : undefined;
    if (!s) continue;
    ctx.strokeStyle = KIND_INK[t.kind]!;
    ctx.fillStyle = KIND_INK[t.kind]!;
    ctx.lineWidth = 2;
    ctx.setLineDash(t.kind === "negative" ? [8, 5] : []);
    const sy = s.y + Math.min(s.h / 2, 160);
    const ty = t.y + Math.min(t.h / 2, 160);
    let end: [number, number, number];
    ctx.beginPath();
    if (t.x >= s.x + s.w) {
      const x1 = s.x + s.w + 4;
      const x2 = t.x - 6;
      const k = (x2 - x1) / 2;
      ctx.moveTo(x1, sy);
      ctx.bezierCurveTo(x1 + k, sy, x2 - k, ty, x2, ty);
      end = [x2, ty, 0];
    } else {
      const x1 = s.x + s.w / 2;
      const y1 = s.y + s.h + 4;
      const x2 = t.x + t.w / 2;
      const y2 = t.y - LABEL - 4;
      const k = Math.max(30, (y2 - y1) / 2);
      ctx.moveTo(x1, y1);
      ctx.bezierCurveTo(x1, y1 + k, x2, y2 - k, x2, y2);
      end = [x2, y2, Math.PI / 2];
    }
    ctx.stroke();
    ctx.setLineDash([]);
    const [ex, ey, a] = end;
    ctx.save();
    ctx.translate(ex, ey);
    ctx.rotate(a);
    ctx.beginPath();
    ctx.moveTo(4, 0);
    ctx.lineTo(-6, -5);
    ctx.lineTo(-6, 5);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }
  return toPng(c);
}

/** when a picture was copied: it says so, since the board may be older than the build */
export const copiedOn = () => `copied ${day(new Date().toISOString())}`;
