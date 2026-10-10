// The content model. Shared by the build (Node), the renderer and the Studio (browser).
// An issue lives in content/issues/NN/issue.json with its photos and video in content/issues/NN/media/.

export const pad2 = n => String(n).padStart(2, '0');

export const DEFAULT_COLOR = '#2D3FE3';

// Curated issue colours. Each one holds up as text on paper and as a full-bleed band.
export const SWATCHES = [
  { name: 'Cobalt', hex: '#2D3FE3' },
  { name: 'Tomato', hex: '#E5412D' },
  { name: 'Racing green', hex: '#1E6B4C' },
  { name: 'Marigold', hex: '#E9A515' },
  { name: 'Plum', hex: '#7B2D6F' },
  { name: 'Lagoon', hex: '#0D7F8A' },
  { name: 'Coral', hex: '#F07152' },
  { name: 'Moss', hex: '#5F7420' },
  { name: 'Rose', hex: '#D64C7A' },
  { name: 'Midnight', hex: '#1E2A55' },
];

export const DEFAULT_STAMPS = ['Miss you', 'Call me', 'Loved it', 'Visit soon'];

/* ---------- seasons ---------- */

export const SEASONS = ['Winter', 'Spring', 'Summer', 'Autumn'];

export function seasonFor(date) {
  const d = new Date(`${date}T12:00:00Z`);
  if (Number.isNaN(d.getTime())) return '';
  const m = d.getUTCMonth();
  const i = m === 11 || m < 2 ? 0 : m < 5 ? 1 : m < 8 ? 2 : 3;
  return `${SEASONS[i]} ${d.getUTCFullYear()}`;
}

// "Autumn 2026" -> ["Winter 2026", "Spring 2027", ...]. Unknown formats give bare season names.
export function nextSeasons(season, count) {
  const m = /^(Winter|Spring|Summer|Autumn)\s+(\d{4})/i.exec(String(season || '').trim());
  const out = [];
  if (!m) return out;
  let i = SEASONS.findIndex(s => s.toLowerCase() === m[1].toLowerCase());
  let y = Number(m[2]);
  for (let k = 0; k < count; k++) {
    i = (i + 1) % 4;
    if (i === 1) y++; // Winter belongs to the year it starts in; Spring rolls the year over
    out.push(`${SEASONS[i]} ${y}`);
  }
  return out;
}

export function todayISO(now = new Date()) {
  const p = n => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}`;
}

/* ---------- sections ---------- */

// Body sections in reading order. `id` is the anchor on the page; `fixed` sections are always shown.
export const SECTIONS = [
  { key: 'letter', id: 'letter', label: 'The letter', fixed: true },
  { key: 'lately', id: 'lately', label: 'Lately' },
  { key: 'moment', id: 'moment', label: 'The moment' },
  { key: 'roll', id: 'roll', label: 'Camera roll' },
  { key: 'currently', id: 'currently', label: 'Currently' },
  { key: 'nextStop', id: 'next-stop', label: 'Next stop' },
  { key: 'mailbag', id: 'mailbag', label: 'Mailbag' },
  { key: 'awake', id: 'awake', label: "Who's awake" },
  { key: 'yourTurn', id: 'write-back', label: 'Your turn', fixed: true },
];

const filled = v => typeof v === 'string' ? v.trim() !== '' : v != null;

export function momentKind(m = {}) {
  if (m.kind === 'video' && m.video) return 'video';
  if (m.kind === 'youtube' && m.youtube) return 'youtube';
  if (m.kind === 'photo' && m.photo) return 'photo';
  if (!m.kind || !m[m.kind]) return m.video ? 'video' : m.youtube ? 'youtube' : m.photo ? 'photo' : '';
  return '';
}

// Does this section have enough content to show? `friends` matters only for "Who's awake".
export function hasContent(key, s, friends = []) {
  if (!s) return false;
  switch (key) {
    case 'letter': return filled(s.body);
    case 'opening': return filled(s.quote);
    case 'lately': return (s.items || []).some(i => filled(i.title) || filled(i.text));
    case 'moment': return momentKind(s) !== '';
    case 'roll': return (s.photos || []).some(p => filled(p.src));
    case 'currently': return (s.items || []).some(i => filled(i.value));
    case 'nextStop': return filled(s.place);
    case 'mailbag': return (s.notes || []).some(n => filled(n.text));
    case 'awake': return friends.length > 0;
    case 'yourTurn': return true;
    default: return false;
  }
}

export function isShown(issue, key, friends = []) {
  const def = SECTIONS.find(s => s.key === key);
  const s = issue[key];
  if (!s) return key === 'yourTurn';
  if (!def?.fixed && s.on === false) return false;
  return hasContent(key, s, friends);
}

/* ---------- new issues ---------- */

export function blankIssue({ number, date, previous } = {}) {
  const day = date || todayISO();
  return {
    number,
    status: 'draft',
    season: seasonFor(day),
    date: day,
    color: SWATCHES[(number - 1) % SWATCHES.length].hex,
    opening: { on: false, quote: '', source: '', note: '' },
    cover: { greeting: 'Greetings from', place: '', country: '', lat: null, lon: null, photo: '', w: 0, h: 0, alt: '', dek: '' },
    letter: { greeting: 'Dear', body: '', signoff: 'Love,' },
    lately: {
      on: true,
      title: 'Three things since we last talked',
      items: [{ tag: 'Work', title: '', text: '' }, { tag: 'Home', title: '', text: '' }, { tag: 'Travel', title: '', text: '' }],
    },
    moment: { on: true, kind: 'photo', title: '', video: '', poster: '', duration: 0, youtube: '', photo: '', w: 0, h: 0, caption: '', story: '' },
    roll: { on: false, title: '', photos: [] },
    currently: {
      on: false,
      title: 'Contents of this season',
      items: ['Reading', 'Listening', 'Cooking', 'Obsessed with'].map(label => ({ label, value: '', note: '' })),
    },
    nextStop: { on: false, place: '', country: '', code: '', dates: '', gate: '', line: '' },
    mailbag: { on: true, title: 'What you said last time', question: previous?.yourTurn?.question || '', notes: [] },
    awake: { on: true },
    yourTurn: { question: '', stamps: [...(previous?.yourTurn?.stamps || DEFAULT_STAMPS)] },
    groups: {}, // per-group extras, keyed by group id: { ps }
  };
}

/* ---------- friend groups ---------- */
// content/groups.json: [{ id, name, salutation, slug }]. Friends list their group ids in `groups`.
// Each group gets its own page per issue at issues/NN/<slug>/, showing only that group's friends
// and replies, so names never cross between groups. The slug's random tail stops casual guessing.

export const slugify = s => String(s || '').toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '')
  .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 24) || 'group';

export function newGroup(name, existing = [], rand = () => Math.random().toString(36).slice(2, 7)) {
  let id = slugify(name);
  for (let i = 2; existing.some(g => g.id === id); i++) id = `${slugify(name)}-${i}`;
  return { id, name: String(name).trim(), salutation: `${String(name).trim()} crew`, slug: `${id}-${rand()}` };
}

// The friends one page shows: a group's members, or, on the shared page, everyone in no group.
export function audienceFriends(friends = [], groups = [], groupId = '') {
  if (groupId) return friends.filter(f => (f.groups || []).includes(groupId));
  return groups.length ? friends.filter(f => !(f.groups || []).some(id => groups.some(g => g.id === id))) : friends;
}

// The issue as one audience sees it: their P.S., and only replies tagged for them (or untagged).
export function scopeIssue(issue, groupId = '') {
  const notes = (issue.mailbag?.notes || []).filter(n => !n.group || n.group === groupId);
  return {
    ...issue,
    letter: { ...issue.letter, ps: groupId ? issue.groups?.[groupId]?.ps || '' : '' },
    mailbag: issue.mailbag ? { ...issue.mailbag, notes } : issue.mailbag,
  };
}

export function validateGroups(groups = [], friends = []) {
  const problems = [];
  const seen = new Set();
  for (const g of groups) {
    if (!/^[a-z0-9-]+$/.test(g.id || '')) problems.push(`groups.json: "${g.name || g.id}" needs an id of lowercase letters, numbers and dashes.`);
    if (!/^[a-z0-9-]{6,}$/.test(g.slug || '')) problems.push(`groups.json: "${g.name || g.id}" needs a slug of at least 6 lowercase letters, numbers and dashes.`);
    if (seen.has(g.id) || seen.has(g.slug)) problems.push(`groups.json: "${g.name || g.id}" is listed twice.`);
    seen.add(g.id);
    seen.add(g.slug);
  }
  for (const f of friends) {
    for (const id of f.groups || []) if (!groups.some(g => g.id === id)) problems.push(`friends.json: ${f.name} is in a group "${id}" that isn't in groups.json.`);
  }
  return problems;
}

/* ---------- validation ---------- */

const HEX = /^#[0-9a-f]{6}$/i;
const MEDIA_PATH = /^media\/[\w.-]+$/;

// Errors block publishing (and the build, for published issues). Warnings are advice.
export function validateIssue(issue, { friends = [] } = {}) {
  const errors = [];
  const warnings = [];
  const err = (path, msg) => errors.push({ path, msg });
  const warn = (path, msg) => warnings.push({ path, msg });

  if (!Number.isInteger(issue?.number) || issue.number < 1) err('number', 'Issue number must be a whole number, 1 or more.');
  if (!issue || typeof issue !== 'object') return { errors, warnings };
  if (issue.status && !['draft', 'published'].includes(issue.status)) err('status', 'Status must be "draft" or "published".');
  if (issue.color && !HEX.test(issue.color)) err('color', 'Colour must look like #2D3FE3.');
  if (issue.date && Number.isNaN(new Date(`${issue.date}T12:00:00Z`).getTime())) err('date', 'Date must look like 2026-10-09.');

  if (!filled(issue.cover?.place)) err('cover.place', 'Say where you are this season. It becomes the big word on the cover.');
  if (!filled(issue.cover?.photo)) err('cover.photo', 'Add a cover photo.');
  else if (!filled(issue.cover?.alt)) warn('cover.alt', 'Describe the cover photo for friends using screen readers.');
  if (!filled(issue.letter?.body)) err('letter.body', 'Write the letter. Three to five sentences is plenty.');
  if (!filled(issue.yourTurn?.question)) err('yourTurn.question', 'Ask friends one easy question.');
  if (!filled(issue.cover?.dek)) warn('cover.dek', 'A one-line summary makes the link preview in WhatsApp and email much better.');

  const media = [];
  const addMedia = (path, v) => { if (filled(v) && !/^https?:/.test(v)) media.push([path, v]); };
  addMedia('cover.photo', issue.cover?.photo);
  addMedia('card', issue.card);
  addMedia('moment.video', issue.moment?.video);
  addMedia('moment.poster', issue.moment?.poster);
  addMedia('moment.photo', issue.moment?.photo);
  (issue.roll?.photos || []).forEach((p, i) => addMedia(`roll.photos.${i}.src`, p.src));
  for (const [path, v] of media) if (!MEDIA_PATH.test(v)) err(path, `"${v}" should be a file in the issue's media folder, like media/photo.webp.`);

  const on = key => issue[key] && issue[key].on !== false;
  if (on('moment') && !hasContent('moment', issue.moment)) warn('moment', 'The moment is switched on but has no photo or video, so it is hidden.');
  if (on('roll') && !hasContent('roll', issue.roll)) warn('roll', 'Camera roll is switched on but has no photos, so it is hidden.');
  if (on('nextStop') && !hasContent('nextStop', issue.nextStop)) warn('nextStop', 'Next stop is switched on but has no place, so it is hidden.');
  if (on('awake') && !friends.length) warn('awake', "Who's awake needs at least one friend in the friend list.");
  if (issue.moment?.youtube && !youtubeId(issue.moment.youtube)) err('moment.youtube', "That doesn't look like a YouTube link.");
  for (const [path, hole] of placeholders(issue)) err(path, `Fill in "${hole}" before this goes out.`);
  return { errors, warnings };
}

// Draft prompts like "[how long]" left in any section that's switched on. Markdown links,
// [text](https://…), don't count.
const HOLE = /\[[^\]\n]{1,80}\](?!\()/;
export function placeholders(issue) {
  const found = [];
  const walk = (v, path) => {
    if (typeof v === 'string') { const m = HOLE.exec(v); if (m) found.push([path, m[0]]); }
    else if (Array.isArray(v)) v.forEach((x, i) => walk(x, `${path}.${i}`));
    else if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) walk(x, path ? `${path}.${k}` : k);
  };
  for (const [key, section] of Object.entries(issue || {})) {
    if (section && typeof section === 'object' && section.on === false) continue;
    walk(section, key);
  }
  return found;
}

export function youtubeId(input) {
  const s = String(input || '').trim();
  if (/^[\w-]{11}$/.test(s)) return s;
  const m = /(?:youtu\.be\/|youtube(?:-nocookie)?\.com\/(?:watch\?(?:.*&)?v=|embed\/|shorts\/|live\/))([\w-]{11})/.exec(s);
  return m ? m[1] : '';
}

/* ---------- Studio form schema ---------- */
// Each group maps to one card in the Studio editor. `path` is a dot path into issue.json.

export const EDITOR = [
  {
    key: 'issue', label: 'Issue', hint: 'Number, season and colour.',
    fields: [
      { path: 'season', type: 'text', label: 'Season', placeholder: 'Autumn 2026' },
      { path: 'date', type: 'date', label: 'Postmark date' },
      { path: 'color', type: 'color', label: 'Issue colour', hint: 'Every issue gets its own. It tints the cover, stamp and buttons.' },
    ],
  },
  {
    key: 'opening', label: 'Opening quote', toggle: 'opening.on', hint: 'A few lines friends read before the cover, like the epigraph of a book. It appears one sentence at a time.',
    fields: [
      { path: 'opening.quote', type: 'textarea', rows: 5, label: 'Quote', hint: 'Put *asterisks* around the words that matter most; they get underlined, last.' },
      { path: 'opening.source', type: 'text', label: 'Who said it', placeholder: 'Name, and where it\'s from' },
      { path: 'opening.note', type: 'text', label: 'Your reply to it', placeholder: 'So this is me, doing something about it.', hint: 'In your handwriting under the quote, with an arrow down to the cover.' },
    ],
  },
  {
    key: 'cover', label: 'Cover', hint: 'The large-letter postcard friends see first.',
    fields: [
      { path: 'cover.greeting', type: 'text', label: 'Greeting', placeholder: 'Greetings from' },
      { path: 'cover.place', type: 'place', label: 'Where you are', placeholder: 'Lisbon', required: true, geo: { lat: 'cover.lat', lon: 'cover.lon', country: 'cover.country' } },
      { path: 'cover.country', type: 'text', label: 'Country', placeholder: 'Portugal' },
      { path: 'cover.photo', type: 'image', label: 'Cover photo', required: true, maxEdge: 2000, kb: 260, size: { w: 'cover.w', h: 'cover.h' }, name: 'cover' },
      { path: 'cover.alt', type: 'text', label: 'Describe the photo', hint: 'Read aloud by screen readers.' },
      { path: 'cover.dek', type: 'textarea', rows: 2, label: 'One-line summary', hint: 'Under the cover, and in WhatsApp and email link previews.' },
    ],
  },
  {
    key: 'letter', label: 'The letter', hint: 'Three to five sentences, addressed to each friend by name.',
    fields: [
      { path: 'letter.greeting', type: 'text', label: 'Greeting', placeholder: 'Dear', hint: 'Followed by the friend\'s name, from their personal link.' },
      { path: 'letter.body', type: 'textarea', rows: 9, label: 'Letter', required: true, hint: 'Blank line between paragraphs. *italic* and **bold** work.' },
      { path: 'letter.signoff', type: 'text', label: 'Sign-off', placeholder: 'Love,' },
      { path: 'groups', type: 'groupps', label: 'P.S. for each group', hint: 'Optional. Each group sees only its own, under your signature.' },
    ],
  },
  {
    key: 'lately', label: 'Lately', toggle: 'lately.on', hint: 'A few short updates, each with a tag.',
    fields: [
      { path: 'lately.title', type: 'text', label: 'Heading' },
      { path: 'lately.items', type: 'list', label: 'Updates', max: 4, add: 'Add an update', item: { tag: '', title: '', text: '' },
        fields: [
          { key: 'tag', type: 'text', label: 'Tag', placeholder: 'Work', half: true },
          { key: 'title', type: 'text', label: 'Headline', half: true },
          { key: 'text', type: 'textarea', rows: 2, label: 'A line or two' },
        ] },
    ],
  },
  {
    key: 'moment', label: 'The moment', toggle: 'moment.on', hint: 'One photo or a video of 30 seconds or less, and the story behind it.',
    fields: [
      { path: 'moment.title', type: 'text', label: 'Heading', placeholder: 'Tram 28, golden hour' },
      { path: 'moment.kind', type: 'segmented', label: 'Show', options: [['photo', 'Photo'], ['video', 'Video file'], ['youtube', 'YouTube']] },
      { path: 'moment.photo', type: 'image', label: 'Photo', when: ['moment.kind', 'photo'], maxEdge: 2000, kb: 260, size: { w: 'moment.w', h: 'moment.h' }, name: 'moment' },
      { path: 'moment.video', type: 'video', label: 'Video', when: ['moment.kind', 'video'], poster: 'moment.poster', duration: 'moment.duration', name: 'moment',
        hint: 'MP4 from your phone, 30 seconds or less. Up to 40 MB; a poster frame is made for you.' },
      { path: 'moment.poster', type: 'image', label: 'Poster frame', when: ['moment.kind', 'video'], maxEdge: 1600, kb: 200, name: 'poster', hint: 'Shown before the video plays.' },
      { path: 'moment.youtube', type: 'text', label: 'YouTube link', when: ['moment.kind', 'youtube'], placeholder: 'https://youtu.be/…', hint: 'Unlisted videos work.' },
      { path: 'moment.caption', type: 'text', label: 'Caption', placeholder: 'Graça, 7:48 pm' },
      { path: 'moment.story', type: 'textarea', rows: 3, label: 'The story' },
    ],
  },
  {
    key: 'roll', label: 'Camera roll', toggle: 'roll.on', hint: 'Four to six photos friends can swipe through.',
    fields: [
      { path: 'roll.title', type: 'text', label: 'Heading', placeholder: 'Ten days in Lisbon, five photos' },
      { path: 'roll.photos', type: 'list', label: 'Photos', max: 8, add: 'Add photos', multiImage: 'src', item: { src: '', caption: '' },
        fields: [
          { key: 'src', type: 'image', label: 'Photo', maxEdge: 1600, kb: 220, name: 'roll' },
          { key: 'caption', type: 'text', label: 'Caption' },
        ] },
    ],
  },
  {
    key: 'currently', label: 'Currently', toggle: 'currently.on', hint: 'Reading, listening, cooking… styled as a customs form.',
    fields: [
      { path: 'currently.title', type: 'text', label: 'Heading' },
      { path: 'currently.items', type: 'list', label: 'Lines', max: 6, add: 'Add a line', item: { label: '', value: '', note: '' },
        fields: [
          { key: 'label', type: 'text', label: 'Label', placeholder: 'Reading', half: true },
          { key: 'value', type: 'text', label: 'What', half: true },
          { key: 'note', type: 'text', label: 'Note' },
        ] },
    ],
  },
  {
    key: 'nextStop', label: 'Next stop', toggle: 'nextStop.on', hint: 'Upcoming travel as a boarding pass, so friends can say "I\'m around".',
    fields: [
      { path: 'nextStop.place', type: 'place', label: 'Going to', placeholder: 'Tokyo', geo: { country: 'nextStop.country' } },
      { path: 'nextStop.country', type: 'text', label: 'Country', half: true },
      { path: 'nextStop.code', type: 'text', label: 'Airport code', placeholder: 'TYO', half: true, upper: true, maxlength: 4 },
      { path: 'nextStop.dates', type: 'text', label: 'Dates', placeholder: '12–20 Nov', half: true },
      { path: 'nextStop.gate', type: 'text', label: 'Gate', placeholder: 'Ramen', half: true, hint: 'A joke goes here.' },
      { path: 'nextStop.line', type: 'text', label: 'Line on the stub', placeholder: 'Anywhere near Tokyo then? Tell me.' },
    ],
  },
  {
    key: 'mailbag', label: 'Mailbag', toggle: 'mailbag.on', hint: 'Answers to last issue\'s question. Only quote friends who said OK. Each group sees only its own.',
    fields: [
      { path: 'mailbag.title', type: 'text', label: 'Heading' },
      { path: 'mailbag.question', type: 'text', label: 'Last time\'s question' },
      { path: 'mailbag.notes', type: 'list', label: 'Answers', max: 6, add: 'Add an answer', item: { text: '', name: '', city: '' },
        fields: [
          { key: 'text', type: 'textarea', rows: 2, label: 'What they said' },
          { key: 'name', type: 'text', label: 'Name', half: true },
          { key: 'city', type: 'text', label: 'City', half: true },
          { key: 'group', type: 'groupselect', label: 'Shown to', hint: 'Set automatically from their group.' },
        ] },
    ],
  },
  {
    key: 'awake', label: "Who's awake", toggle: 'awake.on', hint: 'A live world map of friends\' local times. Edit the list under Friends.',
    fields: [],
  },
  {
    key: 'yourTurn', label: 'Your turn', hint: 'One easy question. Friends answer by WhatsApp or email.',
    fields: [
      { path: 'yourTurn.question', type: 'text', label: 'The question', required: true, placeholder: "What's one small thing that made your season?" },
      { path: 'yourTurn.stamps', type: 'tags', label: 'One-tap stamps', max: 5, hint: 'Rubber stamps friends can tap instead of writing.' },
    ],
  },
];

// Every media file an issue points at (relative to its folder), whether or not its section is shown.
export function mediaPaths(issue) {
  const m = issue.moment || {};
  return [issue.cover?.photo, issue.card, issue.stamp, m.video, m.poster, m.photo, ...(issue.roll?.photos || []).map(p => p.src)]
    .filter(v => typeof v === 'string' && v && !/^(https?:|data:|blob:)/.test(v));
}

/* ---------- dot paths ---------- */

export function getPath(obj, path) {
  return String(path).split('.').reduce((o, k) => (o == null ? undefined : o[k]), obj);
}

export function setPath(obj, path, value) {
  const keys = String(path).split('.');
  let o = obj;
  keys.slice(0, -1).forEach((k, i) => {
    if (o[k] == null || typeof o[k] !== 'object') o[k] = /^\d+$/.test(keys[i + 1]) ? [] : {};
    o = o[k];
  });
  o[keys[keys.length - 1]] = value;
  return obj;
}
