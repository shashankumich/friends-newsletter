import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { waLink, mailLink, replyMessage, aroundMessage } from '../src/links.js';
import { issueUrl, whatsappText, emailParts, bccMailto, personalLinks, MAILTO_LIMIT } from '../src/share.js';

const read = p => JSON.parse(readFileSync(new URL(`./fixtures/content/${p}`, import.meta.url)));
const site = read('site.json');
const friends = read('friends.json');
const issue = read('issues/01/issue.json');
const base = 'https://example.github.io/friends-newsletter';

test('wa.me links keep only digits and encode the message', () => {
  assert.equal(waLink('+44 7700-900123', 'Hi & bye?'), 'https://wa.me/447700900123?text=Hi%20%26%20bye%3F');
  assert.equal(waLink('', ''), 'https://wa.me/');
});

test('mailto links put everyone in BCC and use CRLF line breaks', () => {
  const href = mailLink({ to: 'me@example.com', bcc: ['a@x.com', 'b+tag@y.org'], subject: 'Hi there', body: 'one\ntwo' });
  assert.equal(href, 'mailto:me@example.com?bcc=a@x.com,b+tag@y.org&subject=Hi%20there&body=one%0D%0Atwo');
  assert.equal(mailLink({ to: 'a@x.com, evil?cc=z@z.com' }).includes('?cc='), false);
});

test('a reply carries the question, the answer, stamps and consent', () => {
  const m = replyMessage({ n: 1, title: 'Postcards', question: 'Best meal?', text: 'Dal.', stamps: ['Miss you'], from: 'Priya, Bengaluru', quoteOk: false });
  assert.match(m.body, /Q: Best meal\?\nA: Dal\./);
  assert.match(m.body, /Stamped: Miss you/);
  assert.match(m.body, /Please don't quote me/);
  assert.match(m.body, /— Priya, Bengaluru$/);
  assert.equal(m.subject, 'Re: Postcards No. 01 (from Priya)');
  assert.equal(m.empty, false);
  assert.equal(replyMessage({ n: 1, question: 'q', text: '', stamps: [] }).empty, true);
});

test('"I\'m around" names the place and dates', () => {
  const m = aroundMessage({ n: 1, place: 'Tokyo', dates: '12–20 Nov', from: 'Aiko' });
  assert.match(m.body, /I'm around Tokyo \(12–20 Nov\)!/);
  assert.equal(m.subject, "I'm around Tokyo, 12–20 Nov");
});

test('share messages link to the issue, personal links greet by name', () => {
  assert.equal(issueUrl(`${base}/`, 1), `${base}/issues/01/`);
  assert.equal(issueUrl(base, 1, 'Ji-woo Kim'), `${base}/issues/01/?to=Ji-woo%20Kim`);
  const wa = whatsappText({ site, issue, url: issueUrl(base, 1), name: 'Aiko' });
  assert.match(wa, /^Hi Aiko! ✉️ Postcards No. 01 is here: Greetings from Lisbon\./);
  assert.match(wa, /https:\/\/example\.github\.io\/friends-newsletter\/issues\/01\//);
  const rows = personalLinks({ friends, contacts: { Priya: { email: 'p@example.com', whatsapp: '+91 98765 43210' } }, siteUrl: base, site, issue });
  const priya = rows.find(r => r.name === 'Priya');
  assert.equal(priya.url, `${base}/issues/01/?to=Priya`);
  assert.match(priya.wa, /^https:\/\/wa\.me\/919876543210\?text=Hi%20Priya!/);
  assert.match(priya.mail, /^mailto:p@example\.com\?subject=/);
  assert.equal(rows.find(r => r.name === 'Aiko').mail, '');
});

test('the copyable email escapes content and points at the live issue', () => {
  const evil = { ...issue, cover: { ...issue.cover, dek: '<script>x</script>' } };
  const { html, text, subject } = emailParts({ site, issue: evil, url: `${base}/issues/01/`, imageUrl: `${base}/issues/01/media/card.jpg` });
  assert.doesNotMatch(html, /<script>/);
  assert.match(html, /href="https:\/\/example\.github\.io\/friends-newsletter\/issues\/01\/"/);
  assert.match(html, /src="https:\/\/example\.github\.io\/friends-newsletter\/issues\/01\/media\/card\.jpg"/);
  assert.match(text, /Read it here: https:\/\/example/);
  assert.equal(subject, 'Postcards No. 01: Greetings from Lisbon');
});

test('BCC links flag when they get too long for some mail apps', () => {
  const few = bccMailto({ emails: ['a@x.com'], site, issue, url: base });
  assert.equal(few.tooLong, false);
  const many = bccMailto({ emails: Array.from({ length: 80 }, (_, i) => `friend${i}@example.com`), site, issue, url: base });
  assert.ok(many.length > MAILTO_LIMIT);
  assert.equal(many.tooLong, true);
});
