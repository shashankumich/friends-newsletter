// Issue page behaviour: the personal greeting (?to=Name), live clocks, the photo lightbox,
// the video player, and replies that go out as wa.me / mailto links. The page works without it.

import { waLink, mailLink, replyMessage, aroundMessage } from './links.js';

const STORE = 'pc.to';
const pad2 = n => String(n).padStart(2, '0');
let cleanups = [];

function on(el, type, fn, opts) {
  if (!el) return;
  el.addEventListener(type, fn, opts);
  cleanups.push(() => el.removeEventListener(type, fn, opts));
}

export function unmount() {
  cleanups.forEach(fn => fn());
  cleanups = [];
}

// opts.to overrides the URL (the Studio's "Preview as"); opts.preview keeps localStorage untouched.
export function mount(opts = {}) {
  unmount();
  const doc = document;
  const el = doc.getElementById('pc-data');
  if (!el) return;
  const data = JSON.parse(el.textContent);
  const me = resolve(opts.to !== undefined ? clean(opts.to) : readTo(), data.friends);
  personalise(doc, data, me);
  clocks(doc, me);
  roll(doc);
  players(doc);
  nextStop(doc, data, me);
  reply(doc, data, me);
  fab(doc);
}

/* ---------- who's reading ---------- */

const clean = s => String(s ?? '').replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, 40);

function readTo() {
  const p = new URLSearchParams(location.search).get('to');
  try {
    if (p !== null) {
      const v = clean(p);
      if (v) localStorage.setItem(STORE, v); else localStorage.removeItem(STORE);
      return v;
    }
    return clean(localStorage.getItem(STORE) || '');
  } catch {
    return clean(p || '');
  }
}

function resolve(name, friends = []) {
  if (!name) return null;
  const f = friends.find(x => x.name.toLowerCase() === name.toLowerCase());
  return f ? { name: f.name, city: f.city, known: true } : { name, city: '', known: false };
}
const fromLine = me => (me ? (me.city ? `${me.name}, ${me.city}` : me.name) : '');

function personalise(doc, data, me) {
  doc.querySelectorAll('[data-pc-dear]').forEach(n => {
    n.textContent = `${n.dataset.greeting || 'Dear'} ${me ? me.name : 'friend'},`;
  });
}

/* ---------- who's awake ---------- */

const fmts = new Map();
function fmt(tz, o) {
  const key = tz + JSON.stringify(o);
  if (!fmts.has(key)) fmts.set(key, new Intl.DateTimeFormat('en-US', { timeZone: tz, ...o }));
  return fmts.get(key);
}
function localTime(tz, now) {
  try {
    return {
      h: Number(fmt(tz, { hour: 'numeric', hourCycle: 'h23' }).format(now)) % 24,
      t: fmt(tz, { hour: 'numeric', minute: '2-digit' }).format(now),
      d: fmt(tz, { weekday: 'short' }).format(now),
    };
  } catch {
    return null; // unknown time zone
  }
}
const statusFor = h =>
  h >= 9 && h < 21 ? ['is-good', 'Good time to call'] :
  h >= 7 && h < 9 ? ['is-warn', 'Just waking up'] :
  h >= 21 && h < 23 ? ['is-warn', 'Winding down'] : ['is-off', 'Probably asleep'];

function clocks(doc, me) {
  const rows = [...doc.querySelectorAll('.clock[data-pc-tz]')];
  const pins = [...doc.querySelectorAll('.pin[data-pc-tz]')];
  if (!rows.length && !pins.length) return;
  const isMe = n => me?.known && n.dataset.pcName === me.name;
  rows.forEach(li => {
    const b = li.querySelector('.clock-who b');
    b.textContent = li.dataset.pcName;
    if (isMe(li)) b.insertAdjacentHTML('beforeend', '<span class="you-tag">You</span>');
  });
  const tick = () => {
    const now = new Date();
    rows.forEach(li => {
      const s = localTime(li.dataset.pcTz, now);
      if (!s) return;
      const [cls, label] = statusFor(s.h);
      li.querySelector('[data-pc-t]').textContent = s.t;
      li.querySelector('[data-pc-d]').textContent = s.d;
      const chip = li.querySelector('[data-pc-chip]');
      chip.className = `chip ${cls}`;
      chip.textContent = label;
    });
    pins.forEach(g => {
      const s = localTime(g.dataset.pcTz, now);
      if (!s) return;
      const [cls] = statusFor(s.h);
      const awake = s.h >= 7 && s.h < 23;
      g.setAttribute('class', `pin${awake ? ' is-awake' : ''}${cls === 'is-good' ? ' is-good' : ''}${isMe(g) ? ' is-you' : ''}`);
      g.querySelector('.pin-nm').textContent = isMe(g) ? 'You' : g.dataset.pcName;
      g.querySelector('.pin-t').textContent = ` · ${s.t}`;
    });
  };
  tick();
  const id = setInterval(tick, 20000);
  cleanups.push(() => clearInterval(id));
}

/* ---------- camera roll ---------- */

function roll(doc) {
  const lb = doc.querySelector('[data-pc-lb]');
  const buttons = [...doc.querySelectorAll('[data-pc-photo]')];
  if (!lb || !buttons.length) return;
  const img = lb.querySelector('.lb-img');
  const text = lb.querySelector('.lb-text');
  const count = lb.querySelector('.lb-count');
  const prev = lb.querySelector('.lb-prev');
  const next = lb.querySelector('.lb-next');
  const items = buttons.map(b => {
    const im = b.querySelector('img');
    return { src: im.currentSrc || im.src, alt: im.alt, cap: b.querySelector('.pol-cap')?.textContent.trim() || '' };
  });
  let i = 0;
  let opener = null;
  prev.hidden = next.hidden = items.length < 2;
  const show = k => {
    i = (k + items.length) % items.length;
    img.src = items[i].src;
    img.alt = items[i].alt;
    text.textContent = items[i].cap;
    count.textContent = `${pad2(i + 1)} / ${pad2(items.length)}`;
  };
  const open = (k, b) => {
    opener = b;
    show(k);
    if (typeof lb.showModal === 'function') lb.showModal(); else lb.setAttribute('open', '');
    lb.querySelector('.lb-close').focus();
  };
  const close = () => (typeof lb.close === 'function' ? lb.close() : lb.removeAttribute('open'));
  buttons.forEach((b, k) => on(b, 'click', () => open(k, b)));
  on(prev, 'click', () => show(i - 1));
  on(next, 'click', () => show(i + 1));
  on(lb.querySelector('.lb-close'), 'click', close);
  on(lb, 'click', e => { if (e.target === lb) close(); });
  on(lb, 'close', () => opener?.focus());
  on(lb, 'keydown', e => {
    if (e.key === 'ArrowLeft') show(i - 1);
    if (e.key === 'ArrowRight') show(i + 1);
  });
  let x0 = null;
  on(lb, 'touchstart', e => { x0 = e.touches[0].clientX; }, { passive: true });
  on(lb, 'touchend', e => {
    if (x0 === null) return;
    const dx = e.changedTouches[0].clientX - x0;
    if (Math.abs(dx) > 50) show(i + (dx < 0 ? 1 : -1));
    x0 = null;
  });
}

/* ---------- the moment ---------- */

function players(doc) {
  doc.querySelectorAll('[data-pc-player]').forEach(p => {
    const v = p.querySelector('video');
    on(p.querySelector('.player-play'), 'click', () => {
      p.classList.add('is-playing');
      v.controls = true;
      v.play().catch(() => {});
    });
    on(v, 'ended', () => {
      p.classList.remove('is-playing');
      v.controls = false;
    });
  });
  doc.querySelectorAll('[data-pc-yt]').forEach(p => {
    on(p.querySelector('.player-play'), 'click', () => {
      const f = doc.createElement('iframe');
      f.src = `https://www.youtube-nocookie.com/embed/${encodeURIComponent(p.dataset.pcYt)}?autoplay=1&rel=0&playsinline=1`;
      f.title = p.dataset.title || 'Video';
      f.allow = 'autoplay; encrypted-media; picture-in-picture; fullscreen';
      f.allowFullscreen = true;
      p.classList.add('is-playing');
      p.append(f);
    });
  });
}

/* ---------- replies ---------- */

function sendLinks(data, msg) {
  const out = [];
  if (data.reply.wa) out.push({ kind: 'wa', href: waLink(data.reply.wa, msg.body) });
  if (data.reply.email) out.push({ kind: 'mail', href: mailLink({ to: data.reply.email, subject: msg.subject, body: msg.body }) });
  return out;
}

const sameCity = (a, b) => a && b && a.trim().toLowerCase() === b.trim().toLowerCase();

function nextStop(doc, data, me) {
  const pass = doc.querySelector('[data-pc-pass]');
  if (!pass || !data.next) return;
  const line = pass.querySelector('[data-pc-around-line]');
  line.textContent = me && sameCity(me.city, data.next.place) ? `${me.name}, that's your city! Let's meet.` : line.dataset.default;
  const yes = pass.querySelector('[data-pc-around="yes"]');
  const no = pass.querySelector('[data-pc-around="no"]');
  const send = pass.querySelector('[data-pc-around-send]');
  const status = pass.querySelector('[data-pc-around-status]');
  on(yes, 'click', () => {
    yes.setAttribute('aria-pressed', 'true');
    no.setAttribute('aria-pressed', 'false');
    const from = doc.getElementById('pc-from')?.value.trim() || fromLine(me);
    const links = sendLinks(data, aroundMessage({ n: data.n, title: data.title, place: data.next.place, dates: data.next.dates, from }));
    send.replaceChildren(...links.map(l => {
      const a = doc.createElement('a');
      a.className = l.kind === 'wa' ? 'btn btn-ink' : 'btn btn-line';
      a.href = l.href;
      if (l.kind === 'wa') { a.target = '_blank'; a.rel = 'noopener'; }
      a.textContent = l.kind === 'wa' ? 'Tell me on WhatsApp' : 'Tell me by email';
      return a;
    }));
    send.hidden = !links.length;
    status.textContent = links.length ? `Great! Send me a quick note so I know.` : `Great! Message ${data.author} directly so they know.`;
  });
  on(no, 'click', () => {
    no.setAttribute('aria-pressed', 'true');
    yes.setAttribute('aria-pressed', 'false');
    send.hidden = true;
    status.textContent = 'No worries. Next time.';
  });
}

function reply(doc, data, me) {
  const form = doc.querySelector('[data-pc-reply]');
  if (!form) return;
  const ta = form.querySelector('textarea');
  const from = form.querySelector('#pc-from');
  const quote = form.querySelector('input[name="quote"]');
  const stamps = [...form.querySelectorAll('.rstamp')];
  const wa = form.querySelector('[data-pc-send="wa"]');
  const mail = form.querySelector('[data-pc-send="mail"]');
  const status = form.querySelector('[data-pc-reply-status]');
  const cancel = form.querySelector('[data-pc-cancel]');
  from.value = fromLine(me);

  const compose = () => replyMessage({
    n: data.n, title: data.title, question: data.question,
    text: ta.value.trim(), from: from.value.trim(), quoteOk: quote.checked,
    stamps: stamps.filter(b => b.getAttribute('aria-pressed') === 'true').map(b => b.textContent.trim()),
  });
  const update = () => {
    const msg = compose();
    if (wa) wa.href = waLink(data.reply.wa, msg.body);
    if (mail) mail.href = mailLink({ to: data.reply.email, subject: msg.subject, body: msg.body });
  };
  stamps.forEach(b => on(b, 'click', () => {
    b.setAttribute('aria-pressed', String(b.getAttribute('aria-pressed') !== 'true'));
    update();
  }));
  on(ta, 'input', update);
  on(from, 'input', update);
  on(quote, 'change', update);
  on(form, 'submit', e => e.preventDefault());
  [wa, mail].filter(Boolean).forEach(a => on(a, 'click', e => {
    if (compose().empty) {
      e.preventDefault();
      status.textContent = 'Write a line or tap a stamp first.';
      ta.focus();
      return;
    }
    update();
    cancel.querySelector('[data-pc-cancel-via]').textContent = a === wa ? 'NOW HIT SEND IN WHATSAPP' : 'NOW HIT SEND IN YOUR MAIL';
    cancel.hidden = true;
    void cancel.getBoundingClientRect(); // restart the stamp animation
    cancel.hidden = false;
    status.textContent = a === wa
      ? 'WhatsApp opens with your postcard written out. Just press send.'
      : 'Your email app opens with your postcard written out. Just press send.';
  }));
  update();
}

/* ---------- floating "write back" ---------- */

function fab(doc) {
  const btn = doc.querySelector('[data-pc-fab]');
  const cover = doc.querySelector('.cover');
  const turn = doc.getElementById('write-back');
  if (!btn || !cover || !turn || !('IntersectionObserver' in window)) return;
  let past = false;
  let atTurn = false;
  const io = new IntersectionObserver(entries => {
    entries.forEach(e => {
      if (e.target === cover) past = !e.isIntersecting && e.boundingClientRect.top < 0;
      if (e.target === turn) atTurn = e.isIntersecting;
    });
    btn.classList.toggle('is-on', past && !atTurn);
  });
  io.observe(cover);
  io.observe(turn);
  cleanups.push(() => io.disconnect());
}

window.Postcards = { mount, unmount };
if (!document.documentElement.hasAttribute('data-preview')) mount();
