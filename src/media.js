// Browser-only media tools for the Studio: shrink photos before they're committed, read a video's
// size and grab a poster frame, and draw the 1200×630 social card used in link previews.

import { pad2 } from './schema.js';
import { palette } from './render.js';

const toBlob = (canvas, type, q) => new Promise(resolve => canvas.toBlob(resolve, type, q));

function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

let webp;
async function webpSupported() {
  if (webp === undefined) {
    const b = await toBlob(canvas(2, 2), 'image/webp', 0.8);
    webp = b?.type === 'image/webp';
  }
  return webp;
}

export async function loadImage(source) {
  if (source instanceof Blob && typeof createImageBitmap === 'function') {
    try { return await createImageBitmap(source, { imageOrientation: 'from-image' }); } catch { /* fall back to <img> */ }
  }
  const url = source instanceof Blob ? URL.createObjectURL(source) : source;
  try {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.src = url;
    await img.decode();
    return img;
  } finally {
    if (source instanceof Blob) URL.revokeObjectURL(url);
  }
}

// Encode a canvas as WebP (JPEG where the browser can't write WebP) under `kb`, stepping quality down.
async function encode(c, kb, { last = false } = {}) {
  const type = (await webpSupported()) ? 'image/webp' : 'image/jpeg';
  let blob;
  for (const q of [0.84, 0.78, 0.72, 0.66, 0.6, 0.54]) {
    blob = await toBlob(c, type, q);
    if (blob.size <= kb * 1024) return { blob, ok: true };
  }
  return { blob, ok: last };
}

const extFor = type => (type === 'image/webp' ? 'webp' : type === 'image/png' ? 'png' : 'jpg');

export async function compressImage(file, { maxEdge = 2000, kb = 260 } = {}) {
  if (!/^image\//.test(file.type) && !/\.(heic|heif|jpe?g|png|webp|avif|gif)$/i.test(file.name || '')) {
    throw new Error("That file isn't a photo.");
  }
  let img;
  try {
    img = await loadImage(file);
  } catch {
    throw new Error(/hei[cf]/i.test(`${file.type} ${file.name}`)
      ? "This browser can't open HEIC photos. On an iPhone, choose the photo from your library (it converts automatically), or open the Studio in Safari."
      : "Couldn't open that photo.");
  }
  const iw = img.width, ih = img.height;
  let edge = Math.min(maxEdge, Math.max(iw, ih));
  for (let round = 0; round < 4; round++) {
    const s = edge / Math.max(iw, ih);
    const w = Math.max(1, Math.round(iw * s)), h = Math.max(1, Math.round(ih * s));
    const c = canvas(w, h);
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#FFFFFF'; // JPEG has no transparency
    ctx.fillRect(0, 0, w, h);
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, 0, 0, w, h);
    const { blob, ok } = await encode(c, kb, { last: round === 3 });
    if (ok) {
      img.close?.();
      return { blob, w, h, type: blob.type, ext: extFor(blob.type), before: file.size };
    }
    edge = Math.round(edge * 0.82);
  }
  throw new Error("Couldn't shrink that photo enough.");
}

const once = (el, ok, fail = 'error') => new Promise((resolve, reject) => {
  const done = e => { el.removeEventListener(ok, done); el.removeEventListener(fail, bad); resolve(e); };
  const bad = () => { el.removeEventListener(ok, done); el.removeEventListener(fail, bad); reject(new Error('media error')); };
  el.addEventListener(ok, done);
  el.addEventListener(fail, bad);
});

// { w, h, duration, poster: { blob, w, h, ext } }. The poster is a frame half a second in.
export async function videoInfo(file, { posterEdge = 1600, posterKb = 200 } = {}) {
  const url = URL.createObjectURL(file);
  const v = document.createElement('video');
  v.muted = true;
  v.playsInline = true;
  v.preload = 'auto';
  v.src = url;
  try {
    await once(v, 'loadedmetadata');
  } catch {
    URL.revokeObjectURL(url);
    throw new Error("This browser can't read that video. An MP4 from your phone's camera roll works best.");
  }
  const w = v.videoWidth, h = v.videoHeight, duration = Number.isFinite(v.duration) ? v.duration : 0;
  let poster = null;
  try {
    v.currentTime = Math.min(0.5, duration / 3 || 0);
    await Promise.race([once(v, 'seeked'), new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 6000))]);
    const s = Math.min(1, posterEdge / Math.max(w, h));
    const c = canvas(Math.round(w * s), Math.round(h * s));
    c.getContext('2d').drawImage(v, 0, 0, c.width, c.height);
    const { blob } = await encode(c, posterKb, { last: true });
    poster = { blob, w: c.width, h: c.height, ext: extFor(blob.type) };
  } catch {
    poster = null; // some browsers won't hand over a frame; the Studio asks for a poster photo instead
  } finally {
    URL.revokeObjectURL(url);
  }
  return { w, h, duration: Math.round(duration * 10) / 10, poster };
}

/* ---------- social card ---------- */

const FONT = {
  hand: '"Nanum Pen Script", "Bradley Hand", cursive',
  sans: 'Archivo, "Helvetica Neue", Arial, sans-serif',
  serif: '"Bodoni Moda", Didot, Georgia, serif',
  mono: '"IBM Plex Mono", Menlo, monospace',
};

function cover(ctx, img, x, y, w, h, focusY = 0.6) {
  const s = Math.max(w / img.width, h / img.height);
  const sw = w / s, sh = h / s;
  ctx.drawImage(img, (img.width - sw) / 2, (img.height - sh) * focusY, sw, sh, x, y, w, h);
}

function airmailBorder(ctx, W, H, t) {
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 0, W, H);
  ctx.rect(t, t, W - 2 * t, H - 2 * t);
  ctx.clip('evenodd');
  ctx.fillStyle = '#FBF9F4';
  ctx.fillRect(0, 0, W, H);
  ctx.translate(W / 2, H / 2);
  ctx.rotate(-Math.PI / 4);
  const span = W + H;
  for (let x = -span, i = 0; x < span; x += 20, i++) {
    ctx.fillStyle = i % 2 ? '#1F2E6E' : '#D7392B';
    ctx.fillRect(x, -span, 13, span * 2);
  }
  ctx.restore();
}

// Draws the cover as a link-preview image: the large-letter postcard, an airmail border and the stamp.
export async function socialCard({ issue, site, photo }) {
  const W = 1200, H = 630, B = 18;
  await Promise.all([
    `900 100px ${FONT.sans}`, `400 80px ${FONT.hand}`, `500 20px ${FONT.mono}`, `italic 400 40px ${FONT.serif}`,
  ].map(f => document.fonts?.load(f).catch(() => {})));
  const p = palette(issue.color);
  const c = canvas(W, H);
  const ctx = c.getContext('2d');
  const img = photo ? await loadImage(photo).catch(() => null) : null;

  // Photo ground, darkened like the cover.
  ctx.fillStyle = p.c;
  ctx.fillRect(0, 0, W, H);
  if (img) cover(ctx, img, 0, 0, W, H);
  ctx.fillStyle = 'rgba(0,0,0,.42)';
  ctx.fillRect(0, 0, W, H);
  const vg = ctx.createRadialGradient(W / 2, H / 2, H * 0.3, W / 2, H / 2, W * 0.7);
  vg.addColorStop(0, 'rgba(0,0,0,0)');
  vg.addColorStop(1, 'rgba(0,0,0,.4)');
  ctx.fillStyle = vg;
  ctx.fillRect(0, 0, W, H);

  // The big word, sized to fit.
  const place = String(issue.cover?.place || '').toUpperCase() || 'SOMEWHERE';
  const condensed = 'fontStretch' in ctx;
  const setFont = size => {
    ctx.font = `900 ${size}px ${FONT.sans}`;
    if (condensed) ctx.fontStretch = 'ultra-condensed';
  };
  const squeeze = condensed ? 1 : 0.72; // faux-condense where canvas can't pick the condensed width
  let size = 300;
  setFont(size);
  while (size > 60 && ctx.measureText(place).width * squeeze > W - 200) setFont((size -= 6));
  const tw = ctx.measureText(place).width * squeeze;
  const x0 = (W - tw) / 2, base = H / 2 + size * 0.36 + 10;
  const word = (context, dx, dy) => {
    context.save();
    context.translate(x0 + dx, base + dy);
    context.scale(squeeze, 1);
    context.fillText(place, 0, 0);
    context.restore();
  };
  const depth = Math.round(size * 0.06);
  for (let i = depth; i > 0; i--) {
    ctx.fillStyle = i > depth - 3 ? p.deep : p.c;
    word(ctx, i * 0.85, i);
  }
  ctx.save();
  ctx.strokeStyle = '#FFFFFF';
  ctx.lineWidth = Math.max(6, size * 0.045);
  ctx.lineJoin = 'round';
  ctx.translate(x0, base);
  ctx.scale(squeeze, 1);
  ctx.strokeText(place, 0, 0);
  ctx.restore();
  // Letters filled with the photo.
  const face = canvas(W, H);
  const f = face.getContext('2d');
  setFont(size);
  f.font = ctx.font;
  if (condensed) f.fontStretch = 'ultra-condensed';
  f.fillStyle = '#FFFFFF';
  word(f, 0, 0);
  if (img) {
    f.globalCompositeOperation = 'source-in';
    cover(f, img, x0, base - size * 0.78, tw, size * 0.8, 0.62);
  }
  ctx.drawImage(face, 0, 0);

  // "Greetings from"
  ctx.save();
  ctx.translate(x0 + 10, base - size * 0.78);
  ctx.rotate(-0.11);
  ctx.font = `400 ${Math.round(Math.min(110, size * 0.42))}px ${FONT.hand}`;
  ctx.fillStyle = '#FFFFFF';
  ctx.shadowColor = 'rgba(0,0,0,.45)';
  ctx.shadowBlur = 18;
  ctx.fillText(issue.cover?.greeting || 'Greetings from', 0, 0);
  ctx.restore();

  // Footer line.
  ctx.font = `500 19px ${FONT.mono}`;
  ctx.fillStyle = 'rgba(255,255,255,.9)';
  if ('letterSpacing' in ctx) ctx.letterSpacing = '4px';
  const foot = `${(site.title || 'Postcards').toUpperCase()} FROM ${(site.author || '').toUpperCase()}  ·  NO. ${pad2(issue.number)}  ·  ${(issue.season || '').toUpperCase()}`;
  ctx.fillText(foot, B + 34, H - B - 34);
  if ('letterSpacing' in ctx) ctx.letterSpacing = '0px';

  // The stamp, top right.
  const sw = 132, sh = 164, sx = W - B - 40 - sw, sy = B + 34;
  ctx.save();
  ctx.translate(sx + sw / 2, sy + sh / 2);
  ctx.rotate(0.07);
  ctx.translate(-sw / 2, -sh / 2);
  ctx.shadowColor = 'rgba(0,0,0,.35)';
  ctx.shadowBlur = 10;
  ctx.shadowOffsetY = 3;
  ctx.fillStyle = '#FCFBF8';
  ctx.fillRect(0, 0, sw, sh);
  ctx.shadowColor = 'transparent';
  ctx.globalCompositeOperation = 'destination-out';
  const r = 5;
  for (let x = r; x < sw; x += r * 3) { ctx.beginPath(); ctx.arc(x, 0, r, 0, 7); ctx.arc(x, sh, r, 0, 7); ctx.fill(); }
  for (let y = r; y < sh; y += r * 3) { ctx.beginPath(); ctx.arc(0, y, r, 0, 7); ctx.arc(sw, y, r, 0, 7); ctx.fill(); }
  ctx.globalCompositeOperation = 'source-over';
  ctx.fillStyle = p.c;
  ctx.fillRect(11, 11, sw - 22, sh - 22);
  if (img) cover(ctx, img, 16, 30, sw - 32, sh - 46);
  ctx.fillStyle = '#FFFFFF';
  ctx.font = `700 13px ${FONT.sans}`;
  ctx.textAlign = 'center';
  ctx.fillText(place.slice(0, 12), sw / 2, 25);
  ctx.textAlign = 'left';
  ctx.font = `italic 500 44px ${FONT.serif}`;
  ctx.shadowColor = 'rgba(0,0,0,.4)';
  ctx.shadowBlur = 6;
  ctx.fillText(pad2(issue.number), 22, sh - 22);
  ctx.restore();

  airmailBorder(ctx, W, H, B);
  img?.close?.();
  const blob = await toBlob(c, 'image/jpeg', 0.86);
  return { blob, w: W, h: H, ext: 'jpg', type: 'image/jpeg' };
}
