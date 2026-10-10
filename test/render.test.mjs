import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { esc, inline, paras, palette, contrast, renderIssuePage, renderIssueBody, renderArchivePage, pageData, shownSections, mediaUrl, fmtCoords, coverFontSize } from '../src/render.js';

const read = p => JSON.parse(readFileSync(new URL(`../content/${p}`, import.meta.url)));
const site = { ...read('site.json'), reply: { whatsapp: '+44 7700 900123', email: 'me@example.com' } };
const friends = read('friends.json');
const sample = () => read('issues/01/issue.json');
const ctx = (extra = {}) => ({ site, friends, issues: [sample()], root: '../../', ...extra });
const hex = h => h.match(/\w\w/g).map(x => parseInt(x, 16));

test('text is escaped, and only the small Markdown subset turns into HTML', () => {
  assert.equal(esc(`<script>"'&`), '&lt;script&gt;&quot;&#39;&amp;');
  assert.equal(inline('*a* and **b**'), '<em>a</em> and <strong>b</strong>');
  assert.equal(inline('[site](https://example.com)'), '<a href="https://example.com" rel="noopener">site</a>');
  assert.equal(inline('[x](javascript:alert(1))'), '[x](javascript:alert(1))');
  assert.equal(inline('<img src=x onerror=alert(1)>'), '&lt;img src=x onerror=alert(1)&gt;');
  assert.ok(!inline('[a](https://x.com/"onmouseover="alert(1))').includes('"onmouseover'));
  assert.equal(inline('2 * 3 * 4'), '2 * 3 * 4');
  assert.equal(paras('One\nline\n\nTwo'), '<p>One<br>line</p><p>Two</p>');
});

test('issue colours stay readable on light and dark paper', () => {
  for (const c of ['#2D3FE3', '#E9A515', '#F07152', '#FFFF00', '#111111', 'not-a-colour']) {
    const p = palette(c);
    assert.ok(contrast(hex(p.light), [242, 238, 230]) >= 4.5, `${c} light`);
    assert.ok(contrast(hex(p.dark), [19, 18, 16]) >= 4.5, `${c} dark`);
    assert.ok(contrast(hex(p.c), hex(p.onC)) >= 3, `${c} on-colour`);
  }
});

test('the sample issue renders every section, numbered in order', () => {
  const html = renderIssueBody(sample(), ctx());
  const ids = shownSections(sample(), friends).map(s => s.id);
  assert.deepEqual(ids, ['letter', 'lately', 'moment', 'roll', 'currently', 'next-stop', 'mailbag', 'awake', 'write-back']);
  ids.forEach((id, i) => assert.match(html, new RegExp(`id="${id}"[\\s\\S]*?rail-no">${String(i + 1).padStart(2, '0')}<`)));
  assert.match(html, /class="cover-word"/);
  assert.match(html, /Greetings from<\/span> <span class="cover-word"/);
  assert.match(html, /class="stock"/);
});

test('switched-off sections disappear from the page and the contents list', () => {
  const i = sample();
  i.roll.on = false;
  i.currently.on = false;
  const html = renderIssueBody(i, ctx());
  assert.doesNotMatch(html, /id="roll"/);
  assert.doesNotMatch(html, /href="#roll"/);
  assert.doesNotMatch(html, /Customs declaration/);
});

test('content is escaped everywhere it lands', () => {
  const i = sample();
  i.cover.place = '<b>Lis"bon</b>';
  i.letter.body = '<script>alert(1)</script>';
  i.lately.items[0].title = '<img onerror=x>';
  i.moment.caption = '"><svg onload=alert(1)>';
  const html = renderIssueBody(i, ctx({ friends: [...friends, { name: '<x>', city: 'a"b', tz: 'Europe/Paris', lat: 1, lon: 1 }] }));
  assert.doesNotMatch(html, /<script>alert/);
  assert.doesNotMatch(html, /<img onerror/);
  assert.doesNotMatch(html, /<svg onload/);
  assert.doesNotMatch(html, /<b>Lis/);
  assert.match(html, /&lt;b&gt;Lis&quot;bon&lt;\/b&gt;/);
  // The page data must not be able to close its <script> tag.
  const page = renderIssuePage({ ...i, yourTurn: { question: '</script><script>alert(1)</script>' } }, ctx());
  assert.doesNotMatch(page, /<\/script><script>alert/);
});

test('replies use wa.me and mailto, and hide when nothing is set up', () => {
  const on = renderIssueBody(sample(), ctx());
  assert.match(on, /href="https:\/\/wa\.me\/447700900123"/);
  assert.match(on, /href="mailto:me@example\.com"/);
  const off = renderIssueBody(sample(), ctx({ site: { ...site, reply: { whatsapp: '', email: '' } } }));
  assert.doesNotMatch(off, /data-pc-send/);
  assert.match(off, /Replies aren't switched on yet/);
});

test('page data carries what issue.js needs and nothing private', () => {
  const d = pageData(sample(), ctx());
  assert.equal(d.n, 1);
  assert.equal(d.reply.wa, '447700900123');
  assert.equal(d.next.place, 'Tokyo');
  assert.deepEqual(Object.keys(d.friends[0]), ['name', 'city']);
});

test('issue pages are noindex, with Open Graph tags when the site URL is known', () => {
  const issue = { ...sample(), card: 'media/card.jpg' };
  const page = renderIssuePage(issue, ctx({ siteUrl: 'https://example.github.io/friends-newsletter', v: 'abc' }));
  assert.match(page, /<meta name="robots" content="noindex, nofollow, noarchive">/);
  assert.match(page, /<meta property="og:title" content="Greetings from Lisbon">/);
  assert.match(page, /<meta property="og:image" content="https:\/\/example\.github\.io\/friends-newsletter\/issues\/01\/media\/card\.jpg">/);
  assert.match(page, /<meta property="og:image:width" content="1200">/);
  assert.match(page, /<link rel="canonical" href="https:\/\/example\.github\.io\/friends-newsletter\/issues\/01\/">/);
  assert.match(page, /assets\/issue\.css\?v=abc/);
  const local = renderIssuePage(sample(), ctx());
  assert.doesNotMatch(local, /og:image"/);
});

test('media paths resolve from wherever the page lives', () => {
  const i = sample();
  assert.equal(mediaUrl(i, 'media/cover.webp', { root: '' }), 'issues/01/media/cover.webp');
  assert.equal(mediaUrl(i, 'media/cover.webp', { root: '../../' }), '../../issues/01/media/cover.webp');
  assert.equal(mediaUrl(i, 'https://cdn.example/x.jpg', { root: '' }), 'https://cdn.example/x.jpg');
  assert.equal(mediaUrl(i, 'media/x.jpg', { media: () => 'blob:abc' }), 'blob:abc');
});

test('the archive lists published issues newest first', () => {
  const two = { ...sample(), number: 2, cover: { ...sample().cover, place: 'Tokyo' } };
  const html = renderArchivePage({ site, friends, issues: [sample(), two], root: '../' });
  assert.ok(html.indexOf('Tokyo') < html.indexOf('Lisbon'));
  assert.match(html, /href="\.\.\/issues\/02\/"/);
});

test('the moment renders as a video, a YouTube facade or a photo', () => {
  const video = renderIssueBody(sample(), ctx());
  assert.match(video, /<video class="player-media" src="\.\.\/\.\.\/issues\/01\/media\/moment\.mp4" poster="[^"]+" preload="none"/);
  assert.match(video, /--ar:1280\/720;--arn:1\.778/);
  const yt = sample();
  Object.assign(yt.moment, { kind: 'youtube', youtube: 'https://youtu.be/dQw4w9WgXcQ' });
  const ytHtml = renderIssueBody(yt, ctx());
  assert.match(ytHtml, /data-pc-yt="dQw4w9WgXcQ"/);
  assert.doesNotMatch(ytHtml, /<iframe/); // nothing loads from YouTube until a friend presses play
  const photo = sample();
  Object.assign(photo.moment, { kind: 'photo', photo: 'media/roll-1.webp', w: 900, h: 1200 });
  assert.match(renderIssueBody(photo, ctx()), /class="film-photo" src="\.\.\/\.\.\/issues\/01\/media\/roll-1\.webp"/);
});

test('the cover word is sized for one, two and three lines and the browser takes the biggest', () => {
  assert.equal(coverFontSize('Lisbon'), 'max(40px, min(30.66cqi, 56cqb))');
  const nyc = coverFontSize('New York City');
  assert.equal((nyc.match(/min\(/g) || []).length, 3);
  // Wide letters need more room than narrow ones.
  const size = s => parseFloat(/min\(([\d.]+)cqi/.exec(coverFontSize(s))[1]);
  assert.ok(size('WWWW') < size('IIII'));
  assert.match(renderIssueBody(sample(), ctx()), /class="cover-word" style="font-size:max\(40px, min\(30\.66cqi, 56cqb\)\)"/);
});

test('coordinates read like a postmark', () => {
  assert.equal(fmtCoords(38.72, -9.14), '38.72° N, 9.14° W');
  assert.equal(fmtCoords(-33.87, 151.21), '33.87° S, 151.21° E');
  assert.equal(fmtCoords(null, 3), '');
});
