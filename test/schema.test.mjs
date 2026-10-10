import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  placeholders, seasonFor, nextSeasons, validateIssue, youtubeId, blankIssue, isShown, momentKind, getPath, setPath, mediaPaths, EDITOR,
} from '../src/schema.js';

const sample = () => JSON.parse(readFileSync(new URL('./fixtures/content/issues/01/issue.json', import.meta.url)));
const friends = JSON.parse(readFileSync(new URL('./fixtures/content/friends.json', import.meta.url)));

test('seasons follow the calendar', () => {
  assert.equal(seasonFor('2026-10-09'), 'Autumn 2026');
  assert.equal(seasonFor('2026-12-24'), 'Winter 2026');
  assert.equal(seasonFor('2027-02-01'), 'Winter 2027');
  assert.equal(seasonFor('2027-04-01'), 'Spring 2027');
  assert.equal(seasonFor('nope'), '');
  assert.deepEqual(nextSeasons('Autumn 2026', 4), ['Winter 2026', 'Spring 2027', 'Summer 2027', 'Autumn 2027']);
  assert.deepEqual(nextSeasons('Something else', 2), []);
});

test('the sample issue is valid', () => {
  const { errors } = validateIssue(sample(), { friends });
  assert.deepEqual(errors, []);
});

test('a blank issue lists exactly what is missing', () => {
  const { errors, warnings } = validateIssue(blankIssue({ number: 2, date: '2026-12-01' }), { friends });
  assert.deepEqual(errors.map(e => e.path).sort(), ['cover.photo', 'cover.place', 'letter.body', 'yourTurn.question']);
  assert.ok(warnings.some(w => w.path === 'cover.dek'));
});

test('validation catches bad colours, paths and links', () => {
  const i = sample();
  i.color = 'blue';
  i.cover.photo = '../../etc/passwd';
  i.moment.youtube = 'not a link';
  const paths = validateIssue(i).errors.map(e => e.path);
  assert.ok(paths.includes('color'));
  assert.ok(paths.includes('cover.photo'));
  assert.ok(paths.includes('moment.youtube'));
});

test('YouTube links in every common shape', () => {
  for (const s of ['dQw4w9WgXcQ', 'https://youtu.be/dQw4w9WgXcQ', 'https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=3', 'https://youtube.com/shorts/dQw4w9WgXcQ', 'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ']) {
    assert.equal(youtubeId(s), 'dQw4w9WgXcQ', s);
  }
  assert.equal(youtubeId('https://vimeo.com/123'), '');
});

test('sections hide when switched off or empty', () => {
  const i = sample();
  assert.equal(isShown(i, 'roll'), true);
  i.roll.on = false;
  assert.equal(isShown(i, 'roll'), false);
  i.lately.items = [{ tag: 'Work', title: '', text: '' }];
  assert.equal(isShown(i, 'lately'), false);
  assert.equal(isShown(i, 'awake', []), false);
  assert.equal(isShown(i, 'awake', friends), true);
  i.letter.on = false; // fixed sections ignore the switch
  assert.equal(isShown(i, 'letter'), true);
});

test('moment kind falls back to whatever media is there', () => {
  assert.equal(momentKind({ video: 'media/a.mp4' }), 'video');
  assert.equal(momentKind({ kind: 'photo', photo: '', youtube: 'abc' }), 'youtube');
  assert.equal(momentKind({}), '');
});

test('dot paths read and write nested values and arrays', () => {
  const o = {};
  setPath(o, 'a.items.0.title', 'Hi');
  assert.deepEqual(o, { a: { items: [{ title: 'Hi' }] } });
  assert.equal(getPath(o, 'a.items.0.title'), 'Hi');
  assert.equal(getPath(o, 'a.missing.deep'), undefined);
});

test('media paths cover every file an issue uses', () => {
  const p = mediaPaths(sample());
  assert.ok(p.includes('media/cover.webp'));
  assert.ok(p.includes('media/moment.mp4'));
  assert.equal(p.filter(x => x.startsWith('media/roll-')).length, 5);
});

test('every editor field points at a real place in a blank issue', () => {
  const blank = blankIssue({ number: 1, date: '2026-10-09' });
  for (const g of EDITOR) {
    for (const f of g.fields) assert.notEqual(getPath(blank, f.path.split('.').slice(0, 1).join('.')), undefined, f.path);
    if (g.toggle) assert.equal(typeof getPath(blank, g.toggle), 'boolean', g.toggle);
  }
});

test("bracketed draft prompts block publishing, but links and switched-off sections don't", () => {
  const i = sample();
  i.letter.body = 'I spent [how long] in New York. See [the map](https://example.com).';
  i.nextStop = { on: false, place: 'Arcadia', dates: '[when]' };
  assert.deepEqual(placeholders(i), [['letter.body', '[how long]']]);
  assert.ok(validateIssue(i).errors.some(e => e.path === 'letter.body' && e.msg.includes('[how long]')));
  i.letter.body = 'All filled in.';
  assert.deepEqual(placeholders(i), []);
});
