# Postcards: setup and day-to-day guide

Postcards is a static website hosted on GitHub Pages, plus a no-code editor (the **Studio**) that lives on the same site at `/studio/`. Everything you write is saved to this repository as plain files, and every save rebuilds the site automatically.

```
You, in the Studio ──save──▶ GitHub repo (content/) ──Actions──▶ GitHub Pages site ──link──▶ friends
                                                                                  ◀──WhatsApp / email replies──
```

- **Site:** `https://shashankumich.github.io/friends-newsletter/`. The newest issue is on the home page, every issue is at `/issues/NN/`, and all of them are listed at `/archive/`.
- **Studio:** `https://shashankumich.github.io/friends-newsletter/studio/`
- **No servers, no database, no dependencies.** The build is one small Node script with nothing to install.

---

## 1. One-time setup (about 15 minutes)

### a. Public repository, free hosting

The repository is **public**, which is what lets GitHub Pages host the site for free. Anyone can see the issue text, photos, and friends' first names and cities on GitHub, but all of that is on the site anyway. Friends' email addresses and phone numbers are never saved to the repository.

To make the repository private later, Pages then needs a paid plan (GitHub Pro, about $4/month). The other way is to host the site on Cloudflare Pages or Netlify, both free, which needs a different deploy step in `.github/workflows/deploy.yml`. The Studio works either way: it reads the repository through your token, so it doesn't care whether the repo is private.

### b. The `main` branch

The site deploys from `main`. Every push to it, including every save from the Studio, runs the tests, rebuilds the site and deploys it.

### c. Turn on GitHub Pages

1. On GitHub, open the repo's **Settings → Pages**.
2. Under **Build and deployment → Source**, choose **GitHub Actions**.
3. Open the **Actions** tab, pick **Deploy to GitHub Pages**, and press **Run workflow** (any push to `main` also starts it).
4. After about a minute, the site is live at the address above. The workflow runs the tests before every deploy, so a broken change never goes live.

### d. Sign in to the Studio

1. Open `/studio/` on your site.
2. Press **Open GitHub**. This opens GitHub's form for a fine-grained token, already filled in: named "Postcards Studio", expiring in a year, with **Contents: Read and write** and **Actions: Read**.
3. Under **Repository access**, choose **Only select repositories** and pick **friends-newsletter**. (GitHub can't fill this part in for you.)
4. Press **Generate token**, copy it, paste it into the Studio and press **Sign in**.

The token is kept only in that browser (tick off "Remember me" on a shared computer) and is only ever sent to `api.github.com`. Do this once on each device you write from. When the token expires, the Studio asks for a new one.

### e. Fill in Settings and Friends

- **Settings:** your name, plus the **WhatsApp number** and **email** friends reply to. Both go into the page so the reply buttons work, so anyone with the link can see them. Until at least one is set, the reply card says replies aren't switched on yet.
- **Friends:** replace the eight sample friends with your real ones. Type a city and press **Find** to fill in the map pin and time zone. Names and cities show on the site in "Who's awake", so first names are best. Each friend's **email and WhatsApp number** are optional and **stay on this device only**. Use **Back up private details** to move them to another device.

### f. Replace the sample issue

No. 01 is a sample: made-up friends, placeholder illustrations, and a "Sample issue" banner. Either rewrite it as your real first issue (publishing removes the banner), or press **New issue** and take No. 01 off the site from the bottom of its form.

---

## 2. Making an issue (the hour)

1. **New issue.** It starts as a draft with your last question carried into the Mailbag, the stamps from last time, and the next colour in the palette.
2. **Fill the sections.** Every section has an on/off switch. Aim for five or six: the cover, letter and "Your turn" are always there; pick two or three of the others.
   - Photos are shrunk in the browser (around 200 KB each, WebP) before they're saved, and re-encoding strips their location data.
   - Videos: an MP4 of 30 seconds or less from your phone, up to 40 MB. A poster frame is made for you. Videos are uploaded as they are, metadata included. For anything longer, upload to YouTube as unlisted and paste the link.
   - The preview updates as you type. Use **Preview as** to see the page the way a particular friend will, greeted by name and marked on the map.
3. **Save** whenever you like. Drafts never appear on the site. Every change, photos included, goes into a single commit. Unsaved work is also kept in the browser, so closing the tab doesn't lose anything.
4. **Publish.** The Studio checks for anything missing, draws the link-preview card, saves, and shows the deploy until it's live. Edits to an issue that's already live go out the same way when you press **Update live**.

---

## 3. Sending it

Press **Share** (or **Send it to friends** after publishing):

- **WhatsApp:** a ready-made message with the link. Copy it into a chat, a group or a broadcast list, or press **Open WhatsApp**. WhatsApp shows the social card as the link preview.
- **Email:** **Copy email** copies a designed email (cover image, two lines and a "Read No. 02" button) to paste into a new Gmail or Apple Mail message. **Open in mail app** starts a message with every friend who has an email address in **BCC**. With a lot of friends the link can get too long for some mail apps; the Studio warns you, and **Copy addresses** is the fallback.
- **Personal links:** one per friend, like `…/issues/02/?to=Priya`. The page greets them by name, puts "You" on their map pin, and fills in the From line on their reply. If you've saved their WhatsApp number or email, there are one-tap buttons to send their link directly.
- **Social card:** the 1200×630 image used in link previews. It's redrawn on every publish, and **Redraw it now** makes a new one.

## 4. Friend groups

Groups let you send one issue to several circles at once (college friends, work friends, family) while keeping them apart. Set them up under **Friends → Groups**, then tick the groups each friend belongs to. A friend can be in more than one.

- **Each group gets its own page for every issue**, like `/issues/02/college-k3f9q/`. The short random ending stops anyone guessing another group's address.
- **Separate on purpose.** A group's page shows only that group's friends on the "Who's awake" map, and only replies tagged for that group (or for every page) in the Mailbag. When you type a quoted friend's name, their reply is tagged with their group automatically; change it under **Shown to**.
- **Its own greeting and P.S.** The page opens "Dear college crew," (set the greeting per group), and you can add a short P.S. per group at the end of the letter. Personal links still greet each person by name.
- **A permanent link per group**, like `/g/college-k3f9q/`, always shows the newest issue. Pin it in the group chat once.
- **Sending:** in **Share**, pick the group at the top. The WhatsApp message, the BCC email and the personal links all point at that group's page.
- **Friends in no group** see the shared page (`/issues/02/`), which shows only them on the map. If everyone is in a group, the shared page has no map.
- **Preview as** lets you see each group's page, or any friend's, before you publish.

A group page isn't password-protected: anyone you forward its link to can read it. The shared pages and the archive never link to group pages, though, and their addresses aren't listed anywhere public.

## 5. How friends reply

Everything works with nothing to install and no accounts.

- **Your turn:** they write a line and/or tap rubber stamps ("Miss you", "Call me"…), then press **Send on WhatsApp** or **Send by email**. Their app opens with the postcard written out to you: the question, their answer, their stamps, whether you may quote them in the Mailbag, and their name. They press send.
- **Next stop:** "I'm around" writes you a note the same way.
- **Who's awake:** live local times with "good time to call" chips.

To feature replies in the next issue, add them under **Mailbag**, only for friends who said OK.

---

## 6. Privacy, in plain terms

- **The site is public but unlisted.** Every page carries `noindex`, `robots.txt` blocks crawlers, and nothing links to it except what you send. Anyone who has a link can open it and can guess other issue addresses (`/issues/01/`, `/issues/02/`…).
- **`?to=Name` is a greeting, not a login.** Anyone can type any name.
- **In the repository:** issue text, photos, videos, friends' names, cities, time zones and groups, the group page addresses, and your reply number and email.
- **Only in your browser:** friends' email addresses and phone numbers, your GitHub token, and unsaved drafts.
- **Drafts** never appear on the site, but they are in the repository.

---

## 7. Working on the code

Requires Node 20 or newer. Nothing to install.

```bash
npm run serve      # builds, serves http://localhost:8080 and rebuilds on every change
npm run practice   # the same, plus a pretend GitHub so the Studio works offline
npm test           # renderer, build, links, share messages and the GitHub client
npm run build      # writes dist/ (SITE_URL=https://… for absolute link-preview URLs)
```

In practice mode, open `http://localhost:8080/studio/?api=http://127.0.0.1:8081` and sign in with any made-up token. Saves go to an in-memory copy of `content/`, deploys "finish" after a few seconds, and nothing leaves your computer.

### Where things live

| Path | What it is |
|---|---|
| `content/site.json` | Title, your name, reply WhatsApp/email, repo and branch the Studio saves to, optional custom domain (`baseUrl`) |
| `content/friends.json` | The friend list: name, city, country, time zone, map position, groups |
| `content/groups.json` | Friend groups: name, greeting and the random page address (`slug`) |
| `content/issues/NN/issue.json` | One issue. `status` is `draft` or `published`; each section has an `on` switch; `groups` holds each group's P.S. |
| `content/issues/NN/media/` | That issue's photos, video, poster frame and social card |
| `src/schema.js` | The content model: sections, defaults, validation, and the Studio's form fields |
| `src/render.js` | Turns an issue into HTML. The same file runs in the Node build and in the Studio preview |
| `src/issue.css`, `src/issue.js` | The issue page's design and behaviour (personal greeting, clocks, lightbox, video, replies) |
| `src/links.js`, `src/share.js` | wa.me and mailto links, reply messages, WhatsApp/email/BCC share text |
| `src/studio.*`, `src/github.js`, `src/media.js` | The Studio, its GitHub client (one commit per save via the Git Data API) and its photo/video/social-card tools |
| `scripts/build.mjs` | The build: validates content, renders every page, fingerprints assets, writes `dist/` |
| `scripts/serve.mjs`, `scripts/mock-github.mjs` | Local preview server and the pretend GitHub API |
| `.github/workflows/deploy.yml` | Test, build and deploy to Pages on every push to `main` |
| `test/` | `node:test` suites |

### Custom domain

Add it under **Settings → Pages → Custom domain** on GitHub, then put the full address (for example `https://postcards.example.com`) in the Studio under **Settings → Site address** so share links and link previews use it.

---

## 8. Troubleshooting

| Problem | Fix |
|---|---|
| The deploy fails at **Configure Pages** | Pages isn't turned on, or the repo is private on the free plan. See 1a and 1c. |
| "GitHub didn't accept that token" | It expired or was revoked. Make a new one from the sign-in screen. |
| "This token isn't allowed to do that" | The token needs **Contents: Read and write** and access to this repository. |
| The Studio can't show deploy progress | Add **Actions: Read** to the token. Saving still works without it. |
| A new issue gives a 404 right after publishing | Give it a minute. GitHub Pages caches for up to ten minutes. |
| A video won't play for some friends | `.mov` files from iPhones (HEVC) don't play everywhere. Use MP4, or YouTube. |
| "This browser can't open HEIC photos" | Choose the photo from your phone's photo library (iPhones convert it), or use Safari. |
| The build stops with a list of problems | Each line names the file and the fix, such as a missing photo or a wrong folder number. Fix it in the Studio and save. |
