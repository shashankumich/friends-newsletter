// wa.me and mailto links, and the messages they carry. Used by the issue page (friends replying)
// and the Studio (sending the issue out), so both speak the same format.

const pad2 = n => String(n).padStart(2, '0');
const addr = s => String(s || '').trim().replace(/[^\w@.+-]/g, c => encodeURIComponent(c));

export const phoneDigits = s => String(s || '').replace(/\D/g, '');

// With no number, wa.me opens a chooser so you can pick the chat or broadcast list yourself.
export function waLink(number, text) {
  return `https://wa.me/${phoneDigits(number)}${text ? `?text=${encodeURIComponent(text)}` : ''}`;
}

export function mailLink({ to = [], cc = [], bcc = [], subject = '', body = '' } = {}) {
  const list = v => (Array.isArray(v) ? v : [v]).map(addr).filter(Boolean).join(',');
  const q = [];
  if (list(cc)) q.push(`cc=${list(cc)}`);
  if (list(bcc)) q.push(`bcc=${list(bcc)}`);
  if (subject) q.push(`subject=${encodeURIComponent(subject)}`);
  if (body) q.push(`body=${encodeURIComponent(body.replace(/\r?\n/g, '\r\n'))}`);
  return `mailto:${list(to)}${q.length ? `?${q.join('&')}` : ''}`;
}

// A friend's reply to "Your turn".
export function replyMessage({ n, title = 'Postcards', question, text, stamps = [], from, quoteOk }) {
  const lines = [`✉️ Re: ${title} No. ${pad2(n)}`];
  if (text) lines.push('', `Q: ${question}`, `A: ${text}`);
  if (stamps.length) lines.push('', `Stamped: ${stamps.join(' · ')}`);
  if (text) lines.push('', quoteOk ? 'OK to quote me in the Mailbag.' : "Please don't quote me in the Mailbag.");
  if (from) lines.push('', `— ${from}`);
  return {
    subject: `Re: ${title} No. ${pad2(n)}${from ? ` (from ${from.split(',')[0]})` : ''}`,
    body: lines.join('\n'),
    empty: !text && !stamps.length,
  };
}

// "I'm around" on the Next stop boarding pass.
export function aroundMessage({ n, title = 'Postcards', place, dates, from }) {
  const lines = [`✈️ Re: ${title} No. ${pad2(n)}, next stop`, '', `I'm around ${place}${dates ? ` (${dates})` : ''}! Let's meet up.`];
  if (from) lines.push('', `— ${from}`);
  return { subject: `I'm around ${place}${dates ? `, ${dates}` : ''}`, body: lines.join('\n') };
}
