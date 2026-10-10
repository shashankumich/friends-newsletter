// Everything for sending an issue out: the WhatsApp message, a copyable email, a BCC mailto link,
// and a personal link per friend. Friends' email addresses and numbers are passed in from the
// Studio's local address book; nothing here stores them.

import { pad2 } from './schema.js';
import { esc, palette } from './render.js';
import { waLink, mailLink, phoneDigits } from './links.js';

// Some mail apps silently cut mailto links much past this length.
export const MAILTO_LIMIT = 1900;

export function issueUrl(siteUrl, n, to = '') {
  const base = `${String(siteUrl || '').replace(/\/+$/, '')}/issues/${pad2(n)}/`;
  return to ? `${base}?to=${encodeURIComponent(to)}` : base;
}

const headline = issue => `${issue.cover?.greeting || 'Greetings from'} ${issue.cover?.place || ''}`.trim();
const label = (site, issue) => `${site.title || 'Postcards'} No. ${pad2(issue.number)}`;

export function whatsappText({ site, issue, url, name = '' }) {
  return [
    `${name ? `Hi ${name}! ` : ''}✉️ ${label(site, issue)} is here: ${headline(issue)}.`,
    issue.cover?.dek ? `\n${issue.cover.dek}` : '',
    `\n${url}`,
    "\nIt's a three-minute read, and there's a question for you at the end.",
  ].join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

export function emailParts({ site, issue, url, imageUrl = '', name = '' }) {
  const subject = `${label(site, issue)}: ${headline(issue)}`;
  const author = site.author || '';
  const text = [
    `${name ? `Dear ${name},` : 'Hello!'}`,
    '',
    `${label(site, issue)} is here: ${headline(issue)}.`,
    issue.cover?.dek || '',
    '',
    `Read it here: ${url}`,
    '',
    "It's a three-minute read, and there's a question for you at the end. Reply to this email or on WhatsApp, whichever's easier.",
    '',
    issue.letter?.signoff || 'Love,',
    author,
  ].join('\n').replace(/\n{3,}/g, '\n\n');

  const p = palette(issue.color);
  const serif = "'Bodoni Moda', Didot, 'Bodoni 72', Georgia, 'Times New Roman', serif";
  const sans = "Archivo, 'Helvetica Neue', Helvetica, Arial, sans-serif";
  const mono = "'IBM Plex Mono', Menlo, Consolas, monospace";
  const html = `<div style="background:#F2EEE6;padding:24px 12px;">
<div style="display:none;max-height:0;overflow:hidden;">${esc(issue.cover?.dek || '')}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;margin:0 auto;background:#FBF9F4;border-top:6px solid ${p.c};">
<tr><td style="padding:22px 28px 0;font:600 11px/1.4 ${mono};letter-spacing:2px;text-transform:uppercase;color:#55514A;">${esc(label(site, issue))} &nbsp;·&nbsp; ${esc(issue.season || '')}</td></tr>
${imageUrl ? `<tr><td style="padding:16px 28px 0;"><a href="${esc(url)}"><img src="${esc(imageUrl)}" width="504" alt="${esc(headline(issue))}" style="display:block;width:100%;max-width:504px;height:auto;border:0;"></a></td></tr>` : ''}
<tr><td style="padding:22px 28px 0;font:400 34px/1.1 ${serif};color:#151413;">${esc(headline(issue))}</td></tr>
${issue.cover?.dek ? `<tr><td style="padding:12px 28px 0;font:italic 400 19px/1.45 ${serif};color:#55514A;">${esc(issue.cover.dek)}</td></tr>` : ''}
<tr><td style="padding:24px 28px 0;"><table role="presentation" cellpadding="0" cellspacing="0"><tr><td style="background:${p.c};border-radius:999px;"><a href="${esc(url)}" style="display:inline-block;padding:14px 24px;font:700 13px/1 ${sans};letter-spacing:2px;text-transform:uppercase;color:${p.onC};text-decoration:none;">Read No. ${pad2(issue.number)} &rarr;</a></td></tr></table></td></tr>
<tr><td style="padding:22px 28px 0;font:400 15px/1.55 ${sans};color:#55514A;">It's a three-minute read, and there's a question for you at the end. Reply to this email or on WhatsApp, whichever's easier.</td></tr>
<tr><td style="padding:20px 28px 28px;font:400 17px/1.4 ${serif};color:#151413;">${esc(issue.letter?.signoff || 'Love,')}<br>${esc(author)}</td></tr>
</table>
</div>`;
  return { subject, text, html };
}

// One mailto with everyone in BCC, so friends don't see each other's addresses.
export function bccMailto({ emails, site, issue, url, self = '' }) {
  const { subject, text } = emailParts({ site, issue, url });
  const href = mailLink({ to: self, bcc: emails, subject, body: text });
  return { href, length: href.length, tooLong: href.length > MAILTO_LIMIT, count: emails.length };
}

// contacts: { [friendName]: { email, whatsapp } }, kept only in the browser.
export function personalLinks({ friends, contacts = {}, siteUrl, site, issue }) {
  return friends.map(f => {
    const c = contacts[f.name] || {};
    const url = issueUrl(siteUrl, issue.number, f.name);
    const { subject, text } = emailParts({ site, issue, url, name: f.name });
    return {
      name: f.name,
      city: f.city || '',
      url,
      email: c.email || '',
      whatsapp: phoneDigits(c.whatsapp),
      wa: waLink(c.whatsapp, whatsappText({ site, issue, url, name: f.name })),
      mail: c.email ? mailLink({ to: c.email, subject, body: text }) : '',
    };
  });
}
