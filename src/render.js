// Turns content/issues/NN/issue.json into HTML. Pure string functions with no DOM, so the
// same module runs in the Node build and in the Studio's live preview.

import { SECTIONS, isShown, pad2, momentKind, youtubeId, nextSeasons, DEFAULT_STAMPS, DEFAULT_COLOR, audienceFriends, scopeIssue } from './schema.js';

export const FONTS_URL = 'https://fonts.googleapis.com/css2?family=Archivo:wdth,wght@62..125,100..900&family=Bodoni+Moda:ital,opsz,wght@0,6..96,400..900;1,6..96,400..900&family=IBM+Plex+Mono:ital,wght@0,400;0,500;0,600;1,400&family=Nanum+Pen+Script&display=swap';

/* ---------- text ---------- */

const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ESC[c]);

// A tiny, safe subset of Markdown: *italic*, **bold** and [links](https://…).
export function inline(s) {
  return esc(s)
    .replace(/\[([^\]\n]+)\]\(((?:https?:\/\/|mailto:)[^\s)]+)\)/g, '<a href="$2" rel="noopener">$1</a>')
    .replace(/\*\*(?=\S)([^*\n]*?\S)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[^*\w])\*(?=\S)([^*\n]*?\S)\*(?![*\w])/g, '$1<em>$2</em>');
}

export function paras(s) {
  return String(s ?? '').trim().split(/\n\s*\n/).filter(p => p.trim())
    .map(p => `<p>${inline(p.trim()).replace(/\n/g, '<br>')}</p>`).join('');
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

function parseDate(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || ''));
  return m ? { y: +m[1], m: +m[2] - 1, d: +m[3] } : null;
}
export function fmtDate(iso) {
  const p = parseDate(iso);
  return p ? `${p.d} ${MONTHS[p.m]} ${p.y}` : '';
}
function postmarkDate(iso) {
  const p = parseDate(iso);
  return p ? [`${pad2(p.d)} ${MONTHS[p.m].slice(0, 3).toUpperCase()}`, String(p.y)] : ['', ''];
}
const num = v => (v === '' || v == null || Number.isNaN(Number(v)) ? null : Number(v));
export function fmtCoords(lat, lon) {
  const a = num(lat), o = num(lon);
  if (a == null || o == null) return '';
  return `${Math.abs(a).toFixed(2)}° ${a >= 0 ? 'N' : 'S'}, ${Math.abs(o).toFixed(2)}° ${o >= 0 ? 'E' : 'W'}`;
}
const fmtDur = s => `${Math.floor(s / 60)}:${pad2(Math.round(s % 60))}`;
const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;
const ROMAN = ['i', 'ii', 'iii', 'iv', 'v', 'vi', 'vii', 'viii'];
const TILTS = [-2.2, 1.6, -1.1, 2.4, -1.7, 1.2, -2.6, 0.9];
const digits = s => String(s || '').replace(/\D/g, '');

/* ---------- colour ---------- */

function parseHex(h) {
  let s = String(h || '').trim().replace(/^#/, '');
  if (s.length === 3) s = [...s].map(x => x + x).join('');
  return /^[0-9a-f]{6}$/i.test(s) ? [0, 2, 4].map(i => parseInt(s.slice(i, i + 2), 16)) : null;
}
const toHex = rgb => '#' + rgb.map(v => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')).join('').toUpperCase();
const mix = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);
function luminance(rgb) {
  const [r, g, b] = rgb.map(v => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
export function contrast(a, b) {
  const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
}

const PAPER = [242, 238, 230];
const NIGHT = [19, 18, 16];

// The issue colour plus variants that stay readable as text on paper (light) and night paper (dark).
export function palette(hex) {
  const c = parseHex(hex) || parseHex(DEFAULT_COLOR);
  const toward = (target, bg) => {
    for (let t = 0; t <= 1.0001; t += 0.04) { const v = mix(c, target, t); if (contrast(v, bg) >= 4.6) return v; }
    return target;
  };
  const onC = contrast(c, [255, 255, 255]) >= 3.2 ? '#FFFFFF' : '#141414';
  return { c: toHex(c), onC, light: toHex(toward([0, 0, 0], PAPER)), dark: toHex(toward([255, 255, 255], NIGHT)), deep: toHex(mix(c, [8, 8, 20], 0.42)) };
}
export function colorVars(hex) {
  const p = palette(hex);
  return `--c:${p.c};--on-c:${p.onC};--c-l:${p.light};--c-d:${p.dark};--c-deep:${p.deep}`;
}

/* ---------- urls ---------- */

export const issueDir = n => `issues/${pad2(n)}/`;
// An issue's page for one audience: the shared page, or a friend group's own copy.
export const audiencePath = (n, slug = '') => `${issueDir(n)}${slug ? `${slug}/` : ''}`;

// Where a page's links go. Group pages link to the group's own copies, never to the shared ones.
function links(ctx) {
  const r = ctx.root || '';
  const slug = ctx.group?.slug || '';
  return {
    home: slug ? `${r}g/${slug}/` : r || './',
    issue: n => `${r}${audiencePath(n, slug)}`,
    archive: slug ? `${r}archive/${slug}/` : `${r}archive/`,
  };
}

// A render context for one audience: the shared pages (no group) or one friend group, with that
// audience's friends only. The friend count in the intro still covers everyone.
export function forAudience(ctx, group = null) {
  const all = ctx.allFriends || ctx.friends || [];
  return { ...ctx, group, allFriends: all, friends: audienceFriends(all, ctx.groups || [], group?.id || '') };
}

export function mediaUrl(issue, src, ctx = {}) {
  if (!src) return '';
  if (/^(https?:|data:|blob:)/.test(src)) return src;
  if (ctx.media) return ctx.media(issue, src);
  return `${ctx.root || ''}${issueDir(issue.number)}${src}`;
}
const cssUrl = u => `url("${String(u).replace(/["\\\n]/g, encodeURIComponent)}")`;
export const absUrl = (siteUrl, path = '') => siteUrl ? `${String(siteUrl).replace(/\/+$/, '')}/${path}` : '';

export function friendsSummary(friends = []) {
  const countries = new Set(friends.map(f => (f.country || '').trim().toLowerCase()).filter(Boolean));
  return { count: friends.length, countries: countries.size };
}
function reachLine(friends) {
  const { count, countries } = friendsSummary(friends);
  if (!count) return 'A three-minute letter to friends';
  return `A three-minute letter to ${plural(count, 'friend', 'friends')}${countries > 1 ? ` in ${countries} countries` : ''}`;
}

/* ---------- world map ---------- */
// 180 × 68 land bitmap at 2° per cell, latitude 80°N to 56°S, packed LSB-first per row.
const MAP_B64 = 'AAAAAGC4D////wAAHwAAAAA8AAAAAAAAAADAAOTD////AQAEAAAAAGAAAAAAAAAAAAAc9QPg//8AAAAAwADg/wOAGwAAAAAAcBHtDcD/fwAAAAAwAPz/fwMAAAABGACQP8w/AP9fAADAACC4////9z8BCAD/339OuvEA/x8AAPgPALf//////78PB///////4YP/AQAA/n/9v////////w+M/////7/4AT+ABwCf1///////////DwD/////H8ACHgAAwOf///////////8PgL////8HeAAcAADg5///////////9AAAHuD//wd4AgAAAODH/////////0EEAAAIgP//H/AHAACAQeP///////9/AA8AAAEA/v//+R8AAMBB8P///////z8ABwAAAAD+///5PwAAYPP//////////wMBAAAAAPz///8/AAAA+///////////AgAAAAAA6P///2IAAAD+//////////8CAAAAAADw////gwAAAP7/////////fwIAAAAAAPD///8GAAAA/v7p8/////8/AAAAAAAA8P//fwAAAOCP+cDz/////x8DAAAAAADw//8/AAAAwEP2/uf/////BwEAAAAAAPD//w8AAADgA7T/5////x8CAQAAAAAA4P//DwAAAIDhAv/n////f8YAAAAAAADA//8PAAAAgH9A9P////8/8gAAAAAAAID//wMAAADA/wDw/////z8YAAAAAAAAAP//AQAAAOD/9/7/////fwAAAAAAAAAA/AMCAAAA4P////v///9/AAAAAAAAAAD6AQIAAAD4///35////z8AAAAAAAAAAPQBAAAAAPj//+cv+P//PwAAAAAAAAAA4AEDAAAA/P//7//g//9PAAAAAAAAAADgYQgAAAD+///ff+A//wAAAAAAAAAAAMAzQAAAAPz//59/wA9+AQAAAAAAAAAAAD8AAAAA/P//nx+AB/5AAAAAAAAAAAAA8AAAAAD+//+/B4AD+EAAAAAAAAAAAADAAAAAAPz//38BgAP4QQAAAAAAAAAAAIDwAAAA/P///wwAA8gAAQAAAAAAAAAAAPUPAAD4////BwAFSAAAAAAAAAAAAAAA+B8AAPD///8HAAQAAAEAAAAAAAAAAAD4/wAAYOH//wMAADQYAAAAAAAAAAAAAPj/AQAAgP//AQAAKBwAAAAAAAAAAAAA/P8BAACA//8AAAAYXgAAAAAAAAAAAAD8/wcAAMD/fwAAADAeGAAAAAAAAAAAAPz/PwAAgP8/AAAAYG7UAQAAAAAAAAAA/v//AAAA/z8AAABAgIAHAAAAAAAAAAD8//8BAAD/PwAAAIADgA8BAAAAAAAAAPj//wAAAP8/AAAAABABCwQAAAAAAAAA+P9/AAAA/j8AAAAAAAAAAAAAAAAAAADw/38AAAD/PwQAAAAAOAIAAAAAAAAAAPD/fwAAAP8/BAAAAAA/BiAAAAAAAAAAwP8/AAAA/x8HAAAAgH8GAAAAAAAAAACA/z8AAAD/DwcAAACA/wcAAAAAAAAAAID/PwAAAP4PAwAAAPD/HxAAAAAAAAAAgP8PAAAA/g8DAAAA+P8fAAAAAAAAAACA/wMAAAD+BwEAAAD4/z8AAAAAAAAAAID/AwAAAPwDAAAAAPj/fwAAAAAAAAAAwP8BAAAA/AMAAAAA+P9/AAAAAAAAAADA/wEAAAD4AQAAAADw/38AAAAAAAAAAMD/AAAAAPgAAAAAAPDgPwAAAAAAAAAAwB8AAAAAAAAAAAAAEIAfAAEAAAAAAADgPwAAAAAAAAAAAAAAAB8AAgAAAAAAAOAHAAAAAAAAAAAAAAAAAAAGAAAAAAAA4AUAAAAAAAAAAAAAAAAMAAMAAAAAAADAAwAAAAAAAAAAAAAAAAiAAQAAAAAAAOABAAAAAAAAAAAAAAAAAMAAAAAAAAAA4AEAAAAAAAAAAAAAAAAAAAAAAAAAAADwAAAAAAAAAAAQAAAAAAAAAAAAAAAAAHAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA4AAAAAAAAAAAAAAAAAAAAAAAAAAAAADAAAAAAAAAAAAAAAAAAAAAAA==';
const MAP_W = 360, MAP_H = 136, MAP_TOP = 80;
let landCache = '';

// Each run of land cells becomes one horizontal line; a 0/2 dash with round caps draws it as dots.
function landPath() {
  if (landCache) return landCache;
  const bin = atob(MAP_B64), cols = 180, rows = 68, nb = Math.ceil(cols / 8);
  const on = (r, c) => (bin.charCodeAt(r * nb + (c >> 3)) >> (c & 7)) & 1;
  let d = '';
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (!on(r, c)) continue;
      const s = c;
      while (c + 1 < cols && on(r, c + 1)) c++;
      d += `M${s * 2 + 1} ${r * 2 + 1}h${(c - s) * 2}`;
    }
  }
  return (landCache = d);
}
export const project = (lat, lon) => [Math.max(1, Math.min(MAP_W - 1, lon + 180)), Math.max(1, Math.min(MAP_H - 1, MAP_TOP - lat))];
const r1 = n => Math.round(n * 10) / 10;

// Pick a label side for each pin so labels don't overlap each other or run off the map.
function placeLabels(points, blocked = []) {
  const placed = [...blocked];
  const hit = b => b[0] < 0 || b[0] + b[2] > MAP_W || b[1] < 0 || b[1] + b[3] > MAP_H ||
    placed.some(p => b[0] < p[0] + p[2] && p[0] < b[0] + b[2] && b[1] < p[1] + p[3] && p[1] < b[1] + b[3]);
  return points.map(p => {
    const w = p.chars * 3.3 + 2;
    const opt = {
      right: [r1(p.x + 4.2), r1(p.y + 1.9), 'start', [p.x + 4, p.y - 3.6, w, 7]],
      left: [r1(p.x - 4.2), r1(p.y + 1.9), 'end', [p.x - 4 - w, p.y - 3.6, w, 7]],
      above: [r1(p.x), r1(p.y - 4.6), 'middle', [p.x - w / 2, p.y - 10.5, w, 7]],
      below: [r1(p.x), r1(p.y + 8.4), 'middle', [p.x - w / 2, p.y + 3, w, 7]],
    };
    const order = [p.lab, p.x > 270 ? 'left' : 'right', 'left', 'right', 'above', 'below'].filter(k => opt[k]);
    const pick = order.find(k => !hit(opt[k][3])) || order[0];
    placed.push(opt[pick][3]);
    return opt[pick];
  });
}

/* ---------- small pieces ---------- */

const ICON = {
  play: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5.5v13l10.5-6.5z" fill="currentColor"/></svg>',
  plane: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M21 15.5v-2l-8-5V3.5a1.5 1.5 0 0 0-3 0V8.5l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5z" fill="currentColor"/></svg>',
  wa: '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2Zm0 18.2a8.2 8.2 0 0 1-4.2-1.2l-.3-.2-3 .8.8-2.9-.2-.3A8.2 8.2 0 1 1 12 20.2Zm4.5-6.1c-.2-.1-1.5-.7-1.7-.8-.2-.1-.4-.1-.6.1l-.8 1c-.1.2-.3.2-.5.1a6.7 6.7 0 0 1-3.3-2.9c-.2-.4.2-.4.7-1.3.1-.2 0-.3 0-.4l-.8-1.8c-.2-.5-.4-.4-.6-.4h-.5a1 1 0 0 0-.7.3 3 3 0 0 0-.9 2.2 5.2 5.2 0 0 0 1.1 2.7 11.8 11.8 0 0 0 4.5 4c1.7.7 2.3.8 3.2.6.5-.1 1.5-.6 1.7-1.2.2-.6.2-1.1.2-1.2-.1-.1-.2-.2-.5-.3Z"/></svg>',
  mail: '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="1.8" d="M3.5 6.5h17v11h-17zM3.8 7l8.2 6.2L20.2 7"/></svg>',
  arrow: '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="1.8" d="M4 12h15M13 6l6 6-6 6"/></svg>',
};

export function stamp(issue, ctx, cls = '') {
  const src = mediaUrl(issue, issue.stamp || issue.cover?.photo, ctx);
  return `<span class="stamp${cls ? ` ${cls}` : ''}" style="--sc:${palette(issue.color).c}"><span class="stamp-art">${src ? `<img src="${esc(src)}" alt="" loading="lazy" decoding="async">` : ''}<span class="stamp-name">${esc(issue.cover?.place || '')}</span><span class="stamp-no">${pad2(issue.number)}</span></span></span>`;
}

function postmark(issue) {
  const c = issue.cover || {};
  const words = [c.place, c.country].filter(Boolean).map(s => String(s).toUpperCase());
  let ring = '';
  if (words.length) { const unit = words.join(' · ') + ' · '; while (ring.length < 34) ring += unit; }
  const [day, year] = postmarkDate(issue.date);
  const id = `pm-${pad2(issue.number)}`;
  return `<svg class="postmark" viewBox="0 0 236 112" aria-hidden="true">
<defs><path id="${id}" d="M178 56m-41 0a41 41 0 1 1 82 0a41 41 0 1 1-82 0"/></defs>
<g fill="none" stroke="currentColor" stroke-width="2.2"><circle cx="178" cy="56" r="52"/><circle cx="178" cy="56" r="31"/><path d="M4 26q12-9 24 0t24 0 24 0 24 0 24 0M4 44q12-9 24 0t24 0 24 0 24 0 24 0M4 62q12-9 24 0t24 0 24 0 24 0 24 0M4 80q12-9 24 0t24 0 24 0 24 0 24 0"/></g>
<g fill="currentColor" font-family="IBM Plex Mono, ui-monospace, monospace" font-weight="600">${ring ? `<text font-size="9.6" letter-spacing="1.4"><textPath href="#${id}">${esc(ring.slice(0, 36))}</textPath></text>` : ''}<text x="178" y="54" font-size="12.5" text-anchor="middle">${esc(day)}</text><text x="178" y="70" font-size="12.5" text-anchor="middle">${esc(year)}</text></g>
</svg>`;
}

const airmail = () => '<div class="airmail" aria-hidden="true"></div>';

function masthead(ctx, issue) {
  const s = ctx.site || {};
  return `<header class="mast wrap">
<a class="brand" href="${links(ctx).home}"><span class="brand-word">${esc(s.title || 'Postcards')}</span><span class="brand-from">from ${esc(s.author || 'a friend')}</span></a>
${issue ? `<p class="mast-meta"><span>No.&nbsp;${pad2(issue.number)}</span><span>${esc(issue.season)}</span><span class="mast-date">${esc(fmtDate(issue.date))}</span></p>` : ''}
<nav class="mast-nav" aria-label="Site"><a href="${links(ctx).archive}">Archive</a>${issue ? '<a class="mast-cta" href="#write-back">Write back</a>' : ''}</nav>
</header>`;
}

function section({ id, no, kick, meta, title, titleHidden, body, cls = '' }) {
  return `<section class="sec${cls ? ` ${cls}` : ''}" id="${id}" aria-labelledby="h-${id}">
<div class="wrap sec-grid">
<header class="rail"><div class="rail-in"><span class="rail-no">${no}</span><p class="rail-kick">${kick}</p>${meta ? `<p class="rail-meta">${meta}</p>` : ''}</div></header>
<div class="sec-body">
<h2 class="${titleHidden ? 'sr-only' : 'sec-title'}" id="h-${id}">${title}</h2>
${body}
</div>
</div>
</section>`;
}

/* ---------- cover + intro ---------- */

// Advance widths, in em, of the cover lettering (Archivo 900 at its narrowest width, uppercase),
// measured in the browser. They let the renderer size any place name to fill the card.
const CAP_W = { A: .53, B: .5, C: .51, D: .51, E: .46, F: .4, G: .54, H: .51, I: .26, J: .45, K: .51, L: .43, M: .71, N: .52, O: .55, P: .49, Q: .55, R: .51, S: .47, T: .48, U: .5, V: .49, W: .73, X: .5, Y: .48, Z: .48, ' ': .11, '-': .24, '.': .22, "'": .21, '&': .57 };
const capsWidth = s => [...String(s).toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')]
  .reduce((t, c) => t + (CAP_W[c] ?? (/\d/.test(c) ? .44 : .5)), 0);

// The narrowest the widest line can be when `words` are split into `k` lines.
function widestLine(words, k) {
  let best = Infinity;
  const line = (a, b) => capsWidth(words.slice(a, b).join(' '));
  const walk = (start, left, worst) => {
    if (left === 1) { best = Math.min(best, Math.max(worst, line(start, words.length))); return; }
    for (let end = start + 1; end <= words.length - left + 1; end++) walk(end, left - 1, Math.max(worst, line(start, end)));
  };
  walk(0, k, 0);
  return best;
}

// A font-size that fills the postcard: for one, two and three lines, the largest size that fits
// both the card's width (cqi) and its height (cqb); the browser takes the biggest. Wrapping then
// falls into that many lines on its own, so a tall phone card and a wide desktop card each get
// their best layout ("NEW / YORK / CITY" on a phone, "NEW YORK / CITY" on a laptop).
export function coverFontSize(place) {
  const words = String(place).trim().split(/\s+/).filter(Boolean);
  const r2 = n => Math.round(n * 100) / 100;
  const terms = [];
  for (let k = 1; k <= Math.min(words.length, 3); k++) {
    terms.push(`min(${r2(88 / (widestLine(words, k) + 0.14))}cqi, ${r2(56 / k)}cqb)`);
  }
  return `max(40px, ${terms.join(', ')})`;
}

function cover(issue, ctx) {
  const c = issue.cover || {};
  const src = mediaUrl(issue, c.photo, ctx);
  const place = String(c.place || '').trim() || 'Somewhere';
  const coords = fmtCoords(c.lat, c.lon);
  return `<section class="cover wrap" aria-label="Cover">
<div class="cover-card${src ? '' : ' no-photo'}">
${src ? `<img class="cover-photo" src="${esc(src)}" alt="${esc(c.alt || '')}"${c.w && c.h ? ` width="${c.w}" height="${c.h}"` : ''} fetchpriority="high" decoding="async">` : ''}
<h1 class="cover-h"><span class="cover-greet">${esc(c.greeting || 'Greetings from')}</span> <span class="cover-word" style="font-size:${coverFontSize(place)}"><span class="cw cw-shadow" aria-hidden="true">${esc(place)}</span><span class="cw cw-face"${src ? ` style="background-image:${esc(cssUrl(src))}"` : ''}>${esc(place)}</span></span></h1>
<p class="cover-loc">${coords ? `<span>${coords}</span>` : ''}${c.country ? `<span>${esc(c.country)}</span>` : ''}<span>No. ${pad2(issue.number)}</span></p>
</div>
<div class="franking" aria-hidden="true">${stamp(issue, ctx, 'franking-stamp')}${postmark(issue)}</div>
</section>`;
}

// The opening quote: a dark band before the cover, like the cold open of a film. Each sentence
// fades in on its own, the *emphasised* words are underlined last, and the author answers in hand.
export function quoteSentences(text) {
  return (String(text).match(/[^.!?…]+(?:[.!?…]+["”’)*_]*\s*|$)/g) || []).map(t => t.trim()).filter(Boolean);
}

function opening(issue) {
  const o = issue.opening || {};
  const text = String(o.quote || '').replace(/^[\s"“”„]+|[\s"“”]+$/g, '').replace(/\s*\n+\s*/g, ' ');
  if (o.on === false || !text) return '';
  const lines = quoteSentences(text);
  return `<section class="op" aria-label="Opening quote" data-pc-opening style="--n:${lines.length}">
<div class="wrap op-in">
<figure class="op-fig">
<blockquote class="op-quote"><p>${lines.map((l, i) => `<span class="op-line" style="--i:${i}">${inline(l)}</span>`).join(' ')}</p></blockquote>
${o.source ? `<figcaption class="op-src">${esc(o.source)}</figcaption>` : ''}
</figure>
${o.note ? `<p class="op-note"><span class="hand">${inline(o.note)}</span><svg class="op-arrow" viewBox="0 0 120 96" aria-hidden="true"><path d="M10 12c30-8 78 2 88 58" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round"/><path d="M82 58l16 16 10-22" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"/></svg></p>` : ''}
</div>
</section>`;
}

function intro(issue, ctx, shown) {
  const c = issue.cover || {};
  const toc = shown.map((s, i) => `<li><a href="#${s.id}"><span class="toc-no">${pad2(i + 1)}</span><span class="toc-name">${esc(s.label)}</span></a></li>`).join('');
  return `<section class="intro wrap" aria-label="Introduction">
<div class="intro-main">${c.dek ? `<p class="dek">${inline(c.dek)}</p>` : ''}<p class="intro-reach">${reachLine(ctx.allFriends || ctx.friends)}</p></div>
<nav class="toc" aria-label="In this issue"><p class="toc-h">In this issue</p><ol>${toc}</ol></nav>
</section>`;
}

/* ---------- body sections ---------- */

const BODY = {
  letter(issue, ctx) {
    const l = issue.letter || {};
    const where = issue.cover?.place;
    const dearTo = ctx.group?.salutation || 'friend';
    return {
      kick: 'The letter', meta: where ? esc(where) : '', title: 'The letter', titleHidden: true,
      body: `<article class="letter">
<p class="letter-date">${[where, fmtDate(issue.date)].filter(Boolean).map(esc).join(' · ')}</p>
<p class="letter-dear hand"><span data-pc-dear data-greeting="${esc(l.greeting || 'Dear')}" data-fallback="${esc(dearTo)}">${esc(l.greeting || 'Dear')} ${esc(dearTo)},</span></p>
<div class="prose letter-body">${paras(l.body)}</div>
<p class="letter-sign"><span class="letter-signoff">${esc(l.signoff || 'Love,')}</span><span class="hand letter-name">${esc(ctx.site?.author || '')}</span></p>
${l.ps ? `<aside class="letter-ps" aria-label="P.S."><span class="tape" aria-hidden="true"></span><p class="hand"><b>P.S.</b> ${inline(l.ps).replace(/\n/g, '<br>')}</p></aside>` : ''}
</article>`,
    };
  },

  lately(issue) {
    const s = issue.lately;
    const items = (s.items || []).filter(i => (i.title || '').trim() || (i.text || '').trim());
    return {
      kick: 'Lately', meta: plural(items.length, 'update', 'updates'), title: inline(s.title || 'Lately'),
      body: `<ol class="lately">${items.map((it, i) => `<li class="lately-item"><span class="lately-n" aria-hidden="true">${ROMAN[i]}.</span>${it.tag ? `<p class="tag">${esc(it.tag)}</p>` : ''}<h3>${inline(it.title)}</h3>${it.text ? `<p>${inline(it.text)}</p>` : ''}</li>`).join('')}</ol>`,
    };
  },

  moment(issue, ctx) {
    const m = issue.moment;
    const kind = momentKind(m);
    const ar = m.w && m.h ? `${m.w}/${m.h};--arn:${r1(m.w / m.h * 100) / 100}` : '16/9';
    const label = esc(m.title || 'the moment');
    let media = '';
    if (kind === 'video') {
      const poster = mediaUrl(issue, m.poster, ctx);
      media = `<div class="player" data-pc-player>
<video class="player-media" src="${esc(mediaUrl(issue, m.video, ctx))}"${poster ? ` poster="${esc(poster)}"` : ''} preload="none" playsinline></video>
<button class="player-play" type="button" aria-label="Play video: ${label}">${ICON.play}</button>
<span class="player-tag">${m.duration ? `Video · ${fmtDur(m.duration)}` : 'Video'}</span>
</div>`;
    } else if (kind === 'youtube') {
      const id = youtubeId(m.youtube);
      media = `<div class="player" data-pc-yt="${esc(id)}" data-title="${label}">
<img class="player-media" src="https://i.ytimg.com/vi/${esc(id)}/hqdefault.jpg" alt="" loading="lazy">
<button class="player-play" type="button" aria-label="Play video: ${label}">${ICON.play}</button>
<span class="player-tag">YouTube</span>
</div>`;
    } else {
      media = `<img class="film-photo" src="${esc(mediaUrl(issue, m.photo, ctx))}" alt="${esc(m.caption || m.title || '')}" loading="lazy" decoding="async"${m.w && m.h ? ` width="${m.w}" height="${m.h}"` : ''}>`;
    }
    const n = pad2(issue.number);
    const edge = `<span>POSTCARDS 400</span><span>▸ ${n}</span><span>${n}A</span><span>▸ ${pad2(issue.number + 1)}</span><span>SAFETY FILM</span><span>▸ ${n}</span><span>${n}A</span><span>POSTCARDS 400</span>`;
    return {
      kick: 'The moment', meta: kind === 'photo' ? 'Photo' : kind === 'youtube' ? 'Video' : m.duration ? `Video · ${fmtDur(m.duration)}` : 'Video',
      title: inline(m.title || 'The moment'),
      body: `<figure class="film${kind === 'photo' ? ' is-photo' : ''}" style="--ar:${ar}">
<div class="film-strip"><div class="film-edge" aria-hidden="true">${edge}</div><div class="film-frame">${media}</div><div class="film-edge" aria-hidden="true">${edge}</div></div>
${m.caption ? `<figcaption class="film-cap hand">${inline(m.caption)}</figcaption>` : ''}
</figure>
${m.story ? `<div class="prose story">${paras(m.story)}</div>` : ''}`,
    };
  },

  roll(issue, ctx) {
    const s = issue.roll;
    const photos = (s.photos || []).filter(p => p.src);
    const n = photos.length;
    return {
      kick: 'Camera roll', meta: plural(n, 'frame', 'frames'), title: inline(s.title || 'Camera roll'), cls: 'sec-roll',
      body: `<div class="roll"><ol class="roll-track" data-pc-roll>${photos.map((p, i) => `<li class="pol" style="--tilt:${TILTS[i % TILTS.length]}deg">
<button class="pol-btn" type="button" data-pc-photo="${i}" aria-label="Photo ${i + 1} of ${n}${p.caption ? `: ${esc(p.caption)}` : ''}. Open larger.">
<span class="tape" aria-hidden="true"></span><img src="${esc(mediaUrl(issue, p.src, ctx))}" alt="${esc(p.caption || '')}" loading="lazy" decoding="async" width="600" height="600">
<span class="pol-cap hand">${inline(p.caption || '')}</span><span class="pol-no" aria-hidden="true">${pad2(i + 1)}/${pad2(n)}</span>
</button></li>`).join('')}</ol></div>
<p class="roll-hint">Tap a photo to see it bigger${n > 3 ? '. Swipe for more.' : '.'}</p>
<dialog class="lb" data-pc-lb aria-label="Photo">
<figure class="lb-fig"><img class="lb-img" alt=""><figcaption class="lb-cap"><span class="hand lb-text"></span><span class="lb-count"></span></figcaption></figure>
<button class="lb-btn lb-prev" type="button" aria-label="Previous photo">${ICON.arrow}</button>
<button class="lb-btn lb-next" type="button" aria-label="Next photo">${ICON.arrow}</button>
<button class="lb-close" type="button">Close</button>
</dialog>`,
    };
  },

  currently(issue, ctx) {
    const s = issue.currently;
    const items = (s.items || []).filter(i => (i.value || '').trim());
    return {
      kick: 'Currently', meta: 'Form CN 22', title: inline(s.title || 'Currently'),
      body: `<div class="customs">
<div class="customs-head"><b>Customs declaration</b><span>CN 22 · May be opened by friends</span></div>
<dl class="customs-rows">${items.map(i => `<div class="crow"><dt>${esc(i.label)}</dt><dd><span class="hand">${inline(i.value)}</span>${i.note ? `<small>${inline(i.note)}</small>` : ''}</dd></div>`).join('')}</dl>
<div class="customs-foot"><span class="box"><i aria-hidden="true">✕</i>Gift</span><span class="box"><i aria-hidden="true"></i>Documents</span><span class="box"><i aria-hidden="true"></i>Commercial sample</span><span class="customs-sign">Sender <span class="hand">${esc(ctx.site?.author || '')}</span></span></div>
</div>`,
    };
  },

  nextStop(issue, ctx) {
    const s = issue.nextStop;
    const code = (s.code || s.place.replace(/[^A-Za-z]/g, '').slice(0, 3)).toUpperCase();
    const line = s.line || `Anywhere near ${s.place} then? Tell me.`;
    return {
      kick: 'Next stop', meta: esc(s.dates || ''), title: `${esc(s.place)}${s.dates ? `, ${esc(s.dates)}` : ''}`,
      body: `<div class="pass" data-pc-pass>
<div class="pass-main">
<div class="pass-top"><span>Boarding pass</span><span>Airmail class</span></div>
<div class="pass-route"><div class="pass-code"><b>HOME</b><small>Wherever I am</small></div><div class="pass-flight" aria-hidden="true">${ICON.plane}</div><div class="pass-code is-to"><b>${esc(code)}</b><small>${esc([s.place, s.country].filter(Boolean).join(', '))}</small></div></div>
<dl class="pass-fields"><div><dt>Passenger</dt><dd>${esc(ctx.site?.author || '')}</dd></div>${s.dates ? `<div><dt>Dates</dt><dd>${esc(s.dates)}</dd></div>` : ''}${s.gate ? `<div><dt>Gate</dt><dd>${esc(s.gate)}</dd></div>` : ''}<div><dt>Seat</dt><dd>Next to you</dd></div></dl>
</div>
<div class="pass-stub">
<p class="pass-line hand" data-pc-around-line data-default="${esc(line)}">${esc(line)}</p>
<div class="pass-actions"><button class="btn btn-c" type="button" aria-pressed="false" data-pc-around="yes">I'm around</button><button class="btn btn-line" type="button" aria-pressed="false" data-pc-around="no">Not this time</button></div>
<div class="pass-send" data-pc-around-send hidden></div>
<p class="status" role="status" data-pc-around-status></p>
<div class="barcode" aria-hidden="true"></div>
</div>
</div>`,
    };
  },

  mailbag(issue) {
    const s = issue.mailbag;
    const notes = (s.notes || []).filter(n => (n.text || '').trim());
    return {
      kick: 'Mailbag', meta: plural(notes.length, 'reply', 'replies'), title: inline(s.title || 'Mailbag'),
      body: `${s.question ? `<p class="mail-q"><span>Last time I asked</span> <q>${inline(s.question)}</q></p>` : ''}
<div class="notes">${notes.map((n, i) => `<blockquote class="note note-${(i % 4) + 1}" style="--tilt:${TILTS[(i + 3) % TILTS.length] * 0.8}deg"><span class="tape" aria-hidden="true"></span><p class="hand">${inline(n.text)}</p><footer>${esc(n.name || 'A friend')}${n.city ? ` · ${esc(n.city)}` : ''}</footer></blockquote>`).join('')}</div>`,
    };
  },

  awake(issue, ctx) {
    const friends = (ctx.friends || []).filter(f => f.name && f.tz);
    const c = issue.cover || {};
    const hereLat = num(c.lat), hereLon = num(c.lon);
    const here = hereLat != null && hereLon != null ? project(hereLat, hereLon) : null;
    const pts = friends.map(f => {
      const [x, y] = project(num(f.lat) ?? 0, num(f.lon) ?? 0);
      return { x, y, lab: f.lab, chars: [...f.name].length + 11 };
    });
    const dot = ([x, y]) => [x - 2.6, y - 2.6, 5.2, 5.2];
    const blocked = [...pts.map(p => dot([p.x, p.y])), ...(here ? [dot(here), [here[0] - 4 - (c.place || '').length * 3.3, here[1] - 9.5, (c.place || '').length * 3.3 + 2, 7]] : [])];
    const labels = placeLabels(pts, blocked);
    const arcs = here ? pts.map(p => {
      const d = Math.hypot(p.x - here[0], p.y - here[1]);
      return `M${r1(here[0])} ${r1(here[1])}Q${r1((here[0] + p.x) / 2)} ${r1((here[1] + p.y) / 2 - d * 0.28)} ${r1(p.x)} ${r1(p.y)}`;
    }).join('') : '';
    const pins = friends.map((f, i) => {
      const [tx, ty, anchor] = labels[i];
      return `<g class="pin" data-pc-tz="${esc(f.tz)}" data-pc-name="${esc(f.name)}" transform="translate(${r1(pts[i].x)} ${r1(pts[i].y)})"><circle class="pin-pulse" r="2.4"/><circle class="pin-dot" r="2.3"/><text x="${r1(tx - pts[i].x)}" y="${r1(ty - pts[i].y)}" text-anchor="${anchor}"><tspan class="pin-nm">${esc(f.name)}</tspan><tspan class="pin-t"></tspan></text></g>`;
    }).join('');
    const zones = new Set(friends.map(f => f.tz)).size;
    return {
      kick: "Who's awake", meta: `${plural(friends.length, 'friend', 'friends')} · ${plural(zones, 'time zone', 'time zones')}`,
      title: 'Where everyone is right now', cls: 'sec-awake',
      body: `<p class="sec-lede">Live local time for everyone on the list. Green means it's a decent hour to call.</p>
<div class="awake">
<figure class="map-card">
<svg class="map" viewBox="0 0 ${MAP_W} ${MAP_H}" role="img" aria-label="World map with a pin for each friend${here ? `, and ${esc(c.place)}, where this postcard was posted` : ''}">
<path class="map-land" d="${landPath()}"/>${arcs ? `<path class="map-arcs" d="${arcs}"/>` : ''}
<g class="map-pins">${pins}</g>
${here ? `<g class="map-here" transform="translate(${r1(here[0])} ${r1(here[1])})"><circle r="2.7"/><text x="-4.2" y="-4.4" text-anchor="end">${esc(c.place || '')}</text></g>` : ''}
</svg>
<figcaption class="map-legend"><span><i class="l-here"></i>Posted from here</span><span><i class="l-awake"></i>Awake</span><span><i class="l-asleep"></i>Probably asleep</span></figcaption>
</figure>
<ul class="clocks">${friends.map(f => `<li class="clock" data-pc-tz="${esc(f.tz)}" data-pc-name="${esc(f.name)}"><span class="clock-who"><b>${esc(f.name)}</b><small>${esc([f.city, f.country].filter(Boolean).join(', '))}</small></span><span class="clock-time"><b data-pc-t>--:--</b><small data-pc-d></small></span><span class="chip" data-pc-chip></span></li>`).join('')}</ul>
</div>`,
    };
  },

  yourTurn(issue, ctx) {
    const y = issue.yourTurn || {};
    const stamps = (y.stamps || []).filter(Boolean).length ? y.stamps.filter(Boolean) : DEFAULT_STAMPS;
    const reply = ctx.site?.reply || {};
    const wa = digits(reply.whatsapp);
    const mail = /@/.test(reply.email || '') ? reply.email.trim() : '';
    const author = esc(ctx.site?.author || 'me');
    const send = wa || mail
      ? `<div class="send">${wa ? `<a class="btn btn-ink" data-pc-send="wa" href="https://wa.me/${wa}" target="_blank" rel="noopener">${ICON.wa}Send on WhatsApp</a>` : ''}${mail ? `<a class="btn btn-line" data-pc-send="mail" href="mailto:${esc(mail)}">${ICON.mail}Send by email</a>` : ''}</div>`
      : `<p class="send-off">Replies aren't switched on yet. For now, just message ${author} directly.</p>`;
    return {
      kick: 'Your turn', meta: 'Reply in one tap', title: 'Write back on the back of this postcard', cls: 'sec-turn',
      body: `<form class="pback" data-pc-reply novalidate>
<div class="pback-l">
<label class="pback-q hand" for="pc-reply">${inline(y.question || "What's new with you?")}</label>
<p class="pback-hint">One sentence is plenty. It comes straight to me and nobody else.</p>
<textarea id="pc-reply" name="reply" rows="4" placeholder="Write here…"></textarea>
<fieldset class="rstamps"><legend>Or just stamp it</legend>${stamps.map((s, i) => `<button type="button" class="rstamp" aria-pressed="false" style="--tilt:${TILTS[(i + 1) % TILTS.length]}deg">${esc(s)}</button>`).join('')}</fieldset>
</div>
<div class="pback-r">
<div class="pback-top"><p class="pback-post">Post card<small>Par avion · Airmail</small></p>${stamp(issue, ctx, 'pback-stamp')}</div>
<dl class="addr"><div><dt>To</dt><dd class="hand">${author}</dd></div><div><dt><label for="pc-from">From</label></dt><dd><input id="pc-from" class="hand" name="from" autocomplete="name" placeholder="Your name" maxlength="60"></dd></div></dl>
<label class="consent"><input type="checkbox" name="quote" checked> You can quote me in the next Mailbag</label>
${send}
<p class="status" role="status" data-pc-reply-status></p>
</div>
<svg class="cancel" data-pc-cancel viewBox="0 0 240 110" aria-hidden="true" hidden><g fill="none" stroke="currentColor" stroke-width="3"><rect x="4" y="18" width="232" height="74" rx="10"/><rect x="11" y="25" width="218" height="60" rx="6" stroke-width="1.5"/></g><g fill="currentColor" font-family="IBM Plex Mono, ui-monospace, monospace" font-weight="600" text-anchor="middle"><text x="120" y="58" font-size="24" letter-spacing="4">POSTED</text><text x="120" y="77" font-size="11" letter-spacing="2.4" data-pc-cancel-via>NOW HIT SEND THERE</text></g></svg>
</form>`,
    };
  },
};

function album(issue, ctx) {
  const list = [...(ctx.issues || [])];
  if (!list.some(i => i.number === issue.number)) list.push(issue);
  list.sort((a, b) => a.number - b.number);
  const latest = list[list.length - 1];
  const slots = 4 - (list.length % 4 || 4) || 4;
  const upcoming = nextSeasons(latest.season, slots);
  while (upcoming.length < slots) upcoming.push('Coming soon');
  const href = i => i.number === issue.number && ctx.isIssuePage ? '#top' : links(ctx).issue(i.number);
  return `<section class="album" id="album" aria-labelledby="h-album">
<div class="wrap">
<div class="album-head"><p class="rail-kick">Stamp album</p><h2 class="album-title" id="h-album">One stamp per issue</h2><p class="album-sub">Every season adds a stamp. Give it a few years and this becomes a whole album of us.</p></div>
<ol class="stock">${list.map(i => `<li class="stock-cell${i.number === issue.number ? ' is-current' : ''}"><a href="${href(i)}"${i.number === issue.number ? ' aria-current="page"' : ''}>${stamp(i, ctx)}<span class="stock-lbl">No. ${pad2(i.number)}<br>${esc(i.season)}</span></a></li>`).join('')}${upcoming.map((s, k) => `<li class="stock-cell is-empty"><span class="slot" aria-hidden="true">${pad2(latest.number + k + 1)}</span><span class="stock-lbl">${esc(s.replace(/\s\d{4}$/, ''))}<span class="sr-only"> (coming)</span></span></li>`).join('')}</ol>
<p class="album-more"><a href="${links(ctx).archive}">Every postcard so far ${ICON.arrow}</a></p>
</div>
</section>`;
}

function colophon(ctx, issue) {
  const place = issue?.cover?.place;
  return `<footer class="colo wrap">
<p class="colo-big">${reachLine(ctx.allFriends || ctx.friends)}. Replies go to ${esc(ctx.site?.author || 'me')} and nobody else.</p>
<p>If you'd rather not get these, just say so. No hard feelings.</p>
<p class="colo-type">Set in Bodoni Moda, Archivo, IBM Plex Mono and Nanum Pen Script.${place ? ` Posted from ${esc(place)}${issue.date ? `, ${esc(fmtDate(issue.date))}` : ''}.` : ''}</p>
</footer>
${airmail()}`;
}

/* ---------- issue ---------- */

export function shownSections(issue, friends = []) {
  return SECTIONS.filter(s => isShown(issue, s.key, friends));
}

// The page data issue.js reads: who it's from, how replies go out, and who's on the friend list.
export function pageData(issue, ctx) {
  const reply = ctx.site?.reply || {};
  const ns = issue.nextStop;
  return {
    n: issue.number,
    author: ctx.site?.author || '',
    title: ctx.site?.title || 'Postcards',
    place: issue.cover?.place || '',
    question: issue.yourTurn?.question || '',
    reply: { wa: digits(reply.whatsapp), email: /@/.test(reply.email || '') ? reply.email.trim() : '' },
    next: isShown(issue, 'nextStop') ? { place: ns.place, dates: ns.dates || '' } : null,
    friends: (ctx.friends || []).map(f => ({ name: f.name, city: f.city || '' })),
  };
}
const jsonScript = (id, data) => `<script type="application/json" id="${id}">${JSON.stringify(data).replace(/</g, '\\u003c')}</script>`;

// Everything inside <body> for one issue. The Studio preview swaps this in place.
export function renderIssueBody(fullIssue, ctx) {
  const issue = scopeIssue(fullIssue, ctx.group?.id || '');
  const friends = ctx.friends || [];
  const shown = shownSections(issue, friends);
  const body = shown.map((def, i) => {
    const s = BODY[def.key](issue, ctx);
    return section({ id: def.id, no: pad2(i + 1), ...s });
  }).join('\n');
  return `${airmail()}
${issue.sample ? '<p class="sample-note"><span>Sample issue</span> Made-up friends and placeholder photos. Replace it from the Studio.</p>' : ''}
<div id="top"></div>
${masthead(ctx, issue)}
<main>
${opening(issue)}
${cover(issue, ctx)}
${intro(issue, ctx, shown)}
${body}
${album(issue, ctx)}
</main>
${colophon(ctx, issue)}
<a class="fab" href="#write-back" data-pc-fab>Write back</a>
${jsonScript('pc-data', pageData(issue, ctx))}`;
}

/* ---------- pages ---------- */

const favicon = hex => `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect x="2" y="2" width="28" height="28" rx="3" fill="#fff"/><rect x="6" y="6" width="20" height="20" fill="${palette(hex).c}"/><path d="M6 21l7-7 5 5 3-3 5 5v5H6z" fill="#fff" opacity=".85"/></svg>`)}`;

export function renderPage({ ctx, title, description = '', body, color, canonical = '', og = {}, bodyClass = '', head = '' }) {
  const r = ctx.root || '';
  const v = ctx.v ? `?v=${ctx.v}` : '';
  const site = ctx.site || {};
  const siteName = `${site.title || 'Postcards'} from ${site.author || 'a friend'}`;
  const metas = [
    ['og:type', og.type || 'website'], ['og:site_name', siteName], ['og:title', og.title || title],
    ['og:description', description], ['og:url', canonical], ['og:image', og.image],
    ['og:image:width', og.image && og.w], ['og:image:height', og.image && og.h], ['og:image:alt', og.image && og.alt],
  ].filter(([, val]) => val).map(([k, val]) => `<meta property="${k}" content="${esc(val)}">`).join('\n');
  return `<!doctype html>
<html lang="en" style="${colorVars(color)}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${esc(title)}</title>
${description ? `<meta name="description" content="${esc(description)}">` : ''}
<meta name="robots" content="noindex, nofollow, noarchive">
<meta name="color-scheme" content="light dark">
<meta name="theme-color" content="#F2EEE6" media="(prefers-color-scheme: light)">
<meta name="theme-color" content="#131210" media="(prefers-color-scheme: dark)">
${canonical ? `<link rel="canonical" href="${esc(canonical)}">` : ''}
${metas}
<meta name="twitter:card" content="${og.image ? 'summary_large_image' : 'summary'}">
<link rel="icon" href="${favicon(color)}">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="${FONTS_URL}">
<link rel="stylesheet" href="${r}assets/issue.css${v}">
<script type="module" src="${r}assets/issue.js${v}"></script>
${head}
</head>
<body class="${bodyClass}">
${body}
</body>
</html>
`;
}

export function issueTitle(issue, site = {}) {
  return `${issue.cover?.greeting || 'Greetings from'} ${issue.cover?.place || ''} · ${site.title || 'Postcards'} No. ${pad2(issue.number)}`;
}

export function renderIssuePage(issue, ctx) {
  const dir = issueDir(issue.number);
  const canonical = absUrl(ctx.siteUrl, audiencePath(issue.number, ctx.group?.slug));
  const img = issue.card || issue.cover?.photo;
  const isCard = !!issue.card;
  const description = issue.cover?.dek || `Postcard No. ${pad2(issue.number)} from ${ctx.site?.author || 'a friend'}.`;
  return renderPage({
    ctx: { ...ctx, isIssuePage: true },
    title: issueTitle(issue, ctx.site),
    description,
    color: issue.color,
    canonical,
    og: {
      type: 'article',
      title: `${issue.cover?.greeting || 'Greetings from'} ${issue.cover?.place || ''}`.trim(),
      image: img && ctx.siteUrl ? absUrl(ctx.siteUrl, dir + img) : '',
      w: isCard ? 1200 : issue.cover?.w, h: isCard ? 630 : issue.cover?.h,
      alt: isCard ? `Postcard No. ${pad2(issue.number)}: ${issue.cover?.greeting || 'Greetings from'} ${issue.cover?.place || ''}` : issue.cover?.alt,
    },
    head: issue.cover?.photo ? `<link rel="preload" as="image" href="${esc(mediaUrl(issue, issue.cover.photo, ctx))}" fetchpriority="high">` : '',
    body: renderIssueBody(issue, { ...ctx, isIssuePage: true }),
  });
}

export function renderArchivePage(ctx) {
  const list = [...(ctx.issues || [])].sort((a, b) => b.number - a.number);
  const latest = list[0];
  const body = `${airmail()}
${masthead(ctx, null)}
<main class="archive wrap">
<header class="arch-head"><p class="rail-kick">The archive</p><h1 class="arch-title">Every postcard so far</h1><p class="arch-sub">${list.length ? `${plural(list.length, 'issue', 'issues')}, newest first.` : 'Nothing posted yet. The first postcard is on its way.'}</p></header>
<ol class="arch-list">${list.map(i => `<li style="${colorVars(i.color)}"><a class="arch-item" href="${links(ctx).issue(i.number)}">
${stamp(i, ctx, 'arch-stamp')}
<span class="arch-text"><span class="arch-meta">No. ${pad2(i.number)} · ${esc(i.season)}</span><span class="arch-place"><em>${esc(i.cover?.greeting || 'Greetings from')}</em> ${esc(i.cover?.place || '')}</span>${i.cover?.dek ? `<span class="arch-dek">${inline(i.cover.dek)}</span>` : ''}</span>
<span class="arch-go" aria-hidden="true">${ICON.arrow}</span></a></li>`).join('')}</ol>
</main>
${colophon(ctx, null)}`;
  return renderPage({
    ctx, title: `Archive · ${ctx.site?.title || 'Postcards'} from ${ctx.site?.author || 'a friend'}`,
    description: ctx.site?.description || '', color: latest?.color || DEFAULT_COLOR,
    canonical: absUrl(ctx.siteUrl, ctx.group ? `archive/${ctx.group.slug}/` : 'archive/'), bodyClass: 'is-archive', body,
  });
}

// What a sealed page shows before the passcode: an envelope with a wax seal in the issue's colour.
// `payload` is the encrypted page; gate.js opens it.
export function renderGate(ctx, payload) {
  const s = ctx.site || {};
  const author = esc(s.author || 'I');
  return `${airmail()}
<main class="gate wrap">
<div class="gate-card">
<div class="gate-env" aria-hidden="true"><span class="gate-flap"></span><span class="gate-seal">${esc((s.title || 'Postcards').trim()[0] || 'P')}</span><span class="gate-stamp">Par avion</span></div>
<p class="rail-kick">${esc(s.title || 'Postcards')} from ${author}</p>
<h1 class="gate-title">A postcard for you</h1>
<p class="gate-text">It's sealed for friends. The passcode is in the message ${author} sent you.</p>
<form class="gate-form" data-pc-gate>
<label class="sr-only" for="pc-pass">Passcode</label>
<input id="pc-pass" class="gate-input" name="passcode" type="text" autocomplete="off" autocapitalize="none" autocorrect="off" spellcheck="false" placeholder="passcode" required>
<button class="btn btn-c" type="submit">Open it</button>
</form>
<p class="gate-status" role="status" data-pc-gate-status></p>
<noscript><p class="gate-text">Switch on JavaScript to open this postcard.</p></noscript>
</div>
</main>
<script type="application/json" id="pc-sealed">${JSON.stringify(payload).replace(/</g, '\\u003c')}</script>`;
}

export function renderNoticePage(ctx, { title, heading, text, link }) {
  const body = `${airmail()}
${masthead(ctx, null)}
<main class="notice wrap">
<p class="rail-kick">${esc(title)}</p>
<h1 class="notice-title">${esc(heading)}</h1>
<p class="notice-text">${esc(text)}</p>
${link ? `<p><a class="btn btn-ink" href="${link.href}">${esc(link.label)}</a></p>` : ''}
</main>
${colophon(ctx, null)}`;
  return renderPage({ ctx, title: `${heading} · ${ctx.site?.title || 'Postcards'}`, description: text, color: DEFAULT_COLOR, bodyClass: 'is-notice', body });
}
