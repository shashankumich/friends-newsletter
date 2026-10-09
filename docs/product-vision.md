# Postcards from Shashank: product vision

A short, beautifully designed postcard sent every season to friends around the world. It shares what I've been up to, and its main job is to get friends replying.

Prototype of issue No. 01: [`prototype/issue-01.html`](../prototype/issue-01.html)

---

## 1. The goal, and how we'll know it works

**Goal:** keep real friendships going across countries and time zones.

A newsletter alone only tells friends what I'm doing. Staying in touch means they reply and conversations start. So success is measured in conversations, not opens.

| Metric | Target |
|---|---|
| Friends who reply with anything (a line, a stamp, a voice note) | 30% or more per issue |
| One-to-one conversations started by an issue | 5 or more |
| Meetups arranged through "Next stop" | 1 or more per year |
| Issues sent on schedule | 4 a year, for 2+ years |
| Friends who ask to stop receiving it | About zero |

No open-tracking pixels. They're unreliable now, since Apple Mail pre-loads images, and they feel wrong between friends.

---

## 2. What's out there

| Category | Examples | Good at | Weak for this goal | Idea we borrow |
|---|---|---|---|---|
| Creator newsletters | Substack, Buttondown, Ghost, beehiiv, Kit | Reliable email, archives, easy editors | Built to grow a public audience. Templated look, video only as links, replies are one email at a time | Use one as the email pipe (Buttondown is free up to 100 subscribers) |
| Group newsletters | Letterloop | Everyone answers the same prompts, compiled into one email, no app | It's a collage of everyone, not your voice or your design | Prompt questions; a friend-written section |
| Private photo circles | Retro, Locket, BeReal, Google/iCloud shared albums | Low effort, frequent, intimate | Need an app or one phone ecosystem. Feeds scroll away and don't tell a story | Retro's reciprocity: you see more when you share |
| Async voice/video | Marco Polo, WhatsApp voice notes | Feels like a real conversation | One-to-one or small groups, no archive | Voice-note replies |
| Slow and tangible | Slowly (letters "delivered" based on distance), Touchnote (phone photos printed as real postcards), Storyworth (weekly questions bound into a book) | Ritual, anticipation, keepsakes | Not designed for one-to-many life updates | The postcard metaphor, distance as a feature, a printed yearbook |
| Personal sites | /now pages, Postcard (postcard.page), Bear Blog | You own it | Passive; nothing nudges anyone to respond | Own the archive |
| Personal CRMs | Dex, Clay, Monica | Remind you who you haven't talked to | Private tools; friends never see anything | "You haven't heard from Lena in two issues" nudges for the author |

TinyLetter, the classic tool for small personal newsletters, shut down in 2024, and nothing has replaced it for this use.

### The gap

No existing product combines all five of these:

1. Your own voice and design, not a template
2. Rich media, including video
3. Nothing for friends to install, no accounts, and it works in whatever chat app they use
4. Built-in, low-effort reasons to reply
5. An archive you own

### What shaped the design

1. **A broadcast doesn't keep you in touch.** Every design decision should lower the cost of replying.
2. **The author is the bottleneck.** Personal newsletters usually stop around issue 3, so each issue has to take under an hour.
3. **Friends use different apps.** WhatsApp leads in most countries, but Japan uses LINE, South Korea KakaoTalk, China WeChat, and Messenger leads in places like Australia and Canada. The issue is a web link that works in any app, with email alongside.
4. **Distance is the emotional core.** Lean into it with postmarks, local times, "who's awake" and "next stop".
5. **The archive becomes a keepsake.** After a few years the back issues are a visual record of a life, and of a friendship group.

---

## 3. Product principles

1. **A postcard, not a blog.** About three minutes to read, five or six sections.
2. **Every issue asks for something back,** and replying can take a single tap.
3. **Nothing to install.** No accounts; works on any phone and on slow connections.
4. **An hour to make,** start to finish.
5. **Private by default.**
6. **Built to last.** Plain files I own; no lock-in.

---

## 4. Anatomy of an issue

**Core, in every issue:**

| Section | What it is |
|---|---|
| Cover | A large-letter "Greetings from ___" postcard (wherever I am this season, home included) with a postmark and the issue's stamp |
| Letter | 3–5 sentences, personally addressed ("Dear Priya,") |
| Lately | Three short updates with a tag each (work, home, body, travel…) |
| The moment | One photo or a video of 30 seconds or less, plus the story behind it |
| Your turn | One easy question, a reply box, and one-tap rubber-stamp reactions |

**Rotating, one or two per issue:**

| Section | What it is |
|---|---|
| Camera roll | 4–6 polaroids you can swipe through and tap to enlarge |
| Currently | Reading / listening / cooking / obsessed with, styled as a customs declaration form |
| Next stop | Upcoming travel as a boarding pass, with "I'm around" / "Not this time" buttons |
| Mailbag | Friends' answers to the last question, quoted only with their OK |
| Friend takeover | One friend writes a section |

**Always in the footer:**
- **Who's awake:** a world map of friends with live local times and "good time to call" chips
- **Stamp album:** the archive, one stamp per issue

---

## 5. The reply loop

This is what makes it two-way.

```mermaid
flowchart LR
  A[Issue sent] --> B[Friend opens their personal link]
  B --> C{Replies}
  C -->|a line| D[My inbox]
  C -->|a stamp: Miss you, Call me...| D
  C -->|I'm around| E[Meetup]
  D --> F[I reply one-to-one]
  D -->|with consent| G[Mailbag in next issue]
  G --> A
  B --> H[Who's awake: sees it's a good time to call]
  H --> F
```

- **Make replying effortless.** One sentence is enough, and stamps take a single tap. Replying to the email works too.
- **Show that replies matter.** The Mailbag puts friends in the next issue, so they also see each other.
- **Get from broadcast to conversation.** "Who's awake" and "Call me" stamps push toward one-to-one calls, which is the real goal.
- **Meet in person.** "Next stop" turns travel plans into meetups.
- **Personal links.** Each friend gets their own link. It powers the greeting, their pin on the map, and the From line on their reply.

---

## 6. The author side (keeping it under an hour)

- **During the season:** keep a "Postcard drafts" photo album and a running notes file on my phone.
- **Two weeks before issue day:** get a reminder (Claude can schedule this).
- **Issue day:** hand Claude the bullet points and photos, get back a draft issue in my voice, edit it, publish.
- **Friend list:** one private file with name, city, time zone, email, preferred chat app and birthday.
- **After sending:** read replies in one inbox, and see who I haven't heard from in two issues so I can message them personally.

---

## 7. Design direction: Airmail

- **Palette:** pale-blue airmail paper, fountain-pen navy, red-and-blue airmail chevrons, marigold stamp yellow. Dark mode is "night mail" navy.
- **Type:** a chunky slab serif (Alfa Slab One) for the large-letter cover, Literata for reading, Kalam handwriting for personal touches, and Courier Prime for postal labels.
- **Postal objects:** the "Greetings from" postcard, postmark, perforated stamp, polaroids, CN22 customs form, boarding pass, rubber stamps, the back of a postcard, and a stamp album.
- **Changes each issue:** the cover city and its illustration or photo, the stamp art, the photos. Everything else stays fixed, so each issue is recognisably part of the series.

---

## 8. How it works technically

All of this is free at the size of a friend group.

| Piece | Recommendation | Why |
|---|---|---|
| Site | Astro static site; one folder per issue (`issue.md` + photos) | Full design control, fast, plain files |
| Hosting | Cloudflare Pages (GitHub Pages also works) | Free; Cloudflare also provides the pieces below |
| Video | Cloudflare Stream, Bunny Stream, or unlisted YouTube | Adaptive streaming for slow connections; keeps big files out of git |
| Replies and stamps | Small Cloudflare Worker + D1 database that also emails me each reply | Friends don't need accounts |
| Personal links | An unguessable token per friend, resolved on the server to their name and city | Names never appear in public code |
| Email | Buttondown sends a short teaser: cover image, two lines, a "Read No. 01" button | Good deliverability; email can't play video, so the page is the real issue |
| Chat apps | A ready-to-paste message and link for each issue | Reaches friends on WhatsApp, LINE, KakaoTalk and the rest |
| Privacy | Default: unlisted URLs + `noindex`. Optional: Cloudflare Access with an emailed one-time PIN (free up to 50 people) | Pick the trade-off between friction and privacy |

**Weight budget:** images in AVIF/WebP at 200 KB or less each, and the issue page under 2 MB before video. Videos get poster frames and load only when played.

---

## 9. Roadmap

| Phase | Scope |
|---|---|
| **0. Prototype** (now) | This design, with sample content. React to it. |
| **1. First real issue** (1–2 weeks) | Astro site, issue template, friend list, private hosting, Buttondown email, reply form that emails me |
| **2. Two-way** (next season) | Stored replies and stamps, Mailbag with consent, personal links, live "Who's awake" from the friend list, "I'm around" |
| **3. Keepsakes** (end of year one) | Printable yearbook or print-on-demand zine, one physical postcard per friend each year, voice-note replies |

---

## 10. Risks

| Risk | Mitigation |
|---|---|
| I stop after three issues | Seasonal cadence, a one-hour template, a reminder, Claude drafting |
| Nobody replies | One easy question, one-tap stamps, the Mailbag showing replies matter, personal greeting |
| It reads like a brag reel | Keep it short, include small and honest moments, ask about them |
| It lands in spam | Send from my own domain through Buttondown; ask friends to reply once |
| Privacy (other people's faces, where I am) | Unlisted + `noindex`, ask before posting friends' photos, post locations after leaving |
| Videos are too heavy | Streaming host with adaptive quality, clips of 30 seconds or less, poster frames |

---

## 11. Open decisions

1. **Name:** "Postcards from Shashank", or something else?
2. **Cadence:** seasonal (4 a year) or monthly?
3. **Privacy:** an unlisted link, or an emailed-PIN gate?
4. **Delivery:** email, a chat-app link, or both?
5. **Domain:** a personal domain (about $10 a year) helps email deliverability and looks nicer.

---

## Sources

- [Letterloop](https://www.letterloop.co/) and its [family newsletter guide](https://www.letterloop.co/blog/making-a-family-newsletter-that-people-will-want-to-read)
- [Retro: TechCrunch, 2023](https://techcrunch.com/2023/07/07/retro-is-a-deeply-personal-photo-journaling-app-for-close-friends/), [Retro postcards and recaps](https://techcrunch.com/2023/12/07/retro-lets-you-create-recaps-of-your-most-memorable-photos-and-send-the-best-ones-as-postcards), [Dealroom profile](https://dealroom.co/companies/retro/)
- [Locket: TechCrunch, 2025](https://techcrunch.com/2025/08/06/photo-sharing-app-locket-is-banking-on-a-new-celebrity-focused-feature-to-fuel-its-growth)
- [Slowly: delivery time help article](https://help.slowly.app/hc/en-us/articles/115001835772-When-will-my-penpal-receive-my-letter)
- [Storyworth (Wikipedia)](https://en.wikipedia.org/wiki/Storyworth), [Touchnote review (Cool Tools)](https://kk.org/cooltools/?p=29801)
- [Postcard personal site tool (Product Hunt)](https://www.producthunt.com/posts/postcard-30b7e6cc-35e0-4648-9eee-0e3f60b86e86)
- [Messaging apps by country (Sinch)](https://sinch.com/blog/most-popular-messaging-apps-by-country/)
- [Buttondown pricing (Toolradar)](https://toolradar.com/tools/buttondown/pricing)
- [Cloudflare Zero Trust free plan](https://blog.cloudflare.com/teams-plans)
- [Writing newsletters that get replies (beehiiv)](https://create.beehiiv.com/p/how-to-write-newsletters-that-get-replies)
- Writers moving life updates from Instagram to email: [skyfi](https://skyfi.substack.com/p/the-new-heart-of-instagram), [austinsomewhere](https://austinsomewhere.substack.com/p/704-days-and-counting)
- [Private photo-sharing apps compared (Viallo, 2026)](https://www.viallo.app/blog/photo-sharing-app-friends)
