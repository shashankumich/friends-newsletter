// Passcode sealing. At build time every page's content is encrypted (AES-GCM, with a key derived
// from the passcode by PBKDF2); in the browser the gate turns the passcode back into that key and
// opens the page. Web Crypto only, so the same code runs in Node and in the browser.

const encoder = new TextEncoder();
const decoder = new TextDecoder();
export const ITERATIONS = 310000;

// "Par Avion " and "paravion" are the same passcode: phones love to capitalise and add spaces.
export const normalizePasscode = s => String(s ?? '').toLowerCase().replace(/\s+/g, '');

// A fixed salt per site, so a key remembered on one visit still opens next season's issue.
export const sealSalt = siteKey => `postcards:${siteKey || 'site'}`;

const toB64 = bytes => {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(s);
};
const fromB64 = b64 => Uint8Array.from(atob(b64), c => c.charCodeAt(0));

export async function deriveKey(passcode, salt) {
  const base = await crypto.subtle.importKey('raw', encoder.encode(normalizePasscode(passcode)), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: encoder.encode(salt), iterations: ITERATIONS, hash: 'SHA-256' },
    base, { name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt'],
  );
}

export const exportKey = async key => toB64(new Uint8Array(await crypto.subtle.exportKey('raw', key)));
export const importKey = b64 => crypto.subtle.importKey('raw', fromB64(b64), 'AES-GCM', true, ['encrypt', 'decrypt']);

export async function seal(key, text, salt) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, encoder.encode(text)));
  return { salt, iv: toB64(iv), ct: toB64(ct) };
}

// Throws if the key is wrong: AES-GCM checks integrity, so a bad passcode can't produce garbage.
export async function unseal(key, { iv, ct }) {
  return decoder.decode(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: fromB64(iv) }, key, fromB64(ct)));
}
