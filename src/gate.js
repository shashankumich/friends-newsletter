// The passcode gate on a sealed page: turn the passcode into the key, open the page, and remember
// the key on this device so the next issue opens straight away.

import { deriveKey, exportKey, importKey, unseal } from './seal.js';

const STORE = 'pc.key';
const sealed = JSON.parse(document.getElementById('pc-sealed')?.textContent || 'null');
const form = document.querySelector('[data-pc-gate]');
const status = document.querySelector('[data-pc-gate-status]');
const root = document.documentElement;

const remembered = () => { try { return localStorage.getItem(STORE); } catch { return null; } };
const remember = v => { try { localStorage.setItem(STORE, v); } catch { /* private mode: ask again next time */ } };
const forget = () => { try { localStorage.removeItem(STORE); } catch { /* ignore */ } };

async function mountWhenReady(tries = 0) {
  if (window.Postcards) return window.Postcards.mount();
  if (tries < 100) setTimeout(() => mountWhenReady(tries + 1), 30);
}

async function open(key) {
  const html = await unseal(key, sealed);
  document.body.removeAttribute('data-sealed');
  document.body.innerHTML = html;
  root.classList.remove('pc-has-key');
  await mountWhenReady();
  if (location.hash) document.getElementById(decodeURIComponent(location.hash.slice(1)))?.scrollIntoView();
}

function showForm() {
  root.classList.remove('pc-has-key');
  form?.querySelector('input')?.focus();
}

if (sealed) {
  const saved = remembered();
  if (saved) {
    importKey(saved).then(open).catch(() => { forget(); showForm(); }); // the passcode changed since last time
  } else showForm();

  form?.addEventListener('submit', async e => {
    e.preventDefault();
    const input = form.querySelector('input');
    const button = form.querySelector('button');
    button.disabled = true;
    status.textContent = 'Opening…';
    try {
      const key = await deriveKey(input.value, sealed.salt);
      await open(key);
      remember(await exportKey(key));
    } catch {
      status.textContent = "That's not it. The passcode is in the message I sent you.";
      form.classList.remove('is-wrong');
      void form.offsetWidth; // restart the shake
      form.classList.add('is-wrong');
      input.select();
    } finally {
      button.disabled = false;
    }
  });
}
