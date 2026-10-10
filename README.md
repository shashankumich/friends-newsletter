# friends-newsletter

**Postcards from Shashank** is a short, seasonal, airmail-style postcard for friends around the world: life updates, photos and video, and an easy way for friends to write back.

Each issue is a page on a static site (GitHub Pages) that mixes postcard, editorial, scrapbook and film styles: a large-letter "Greetings from" cover, a letter addressed to each friend by name, a film-strip video, taped polaroids, a customs-form "Currently", a boarding-pass "Next stop", a live "Who's awake" world map, and the back of a postcard to reply on, by WhatsApp or email, in one tap.

Friends can be split into **groups** (college, work, family…): each group gets its own copy of every issue, with its own greeting and P.S., and only its own friends on the map.

Issues are written in the **Studio** at `/studio/`, a no-code editor with live preview. It shrinks photos in the browser, saves each change as one commit, follows the deploy until the issue is live, and prepares the WhatsApp message, the email and a personal link for every friend.

- [`docs/SETUP.md`](docs/SETUP.md): one-time setup, making and sending an issue, privacy, local development, troubleshooting
- [`docs/product-vision.md`](docs/product-vision.md): research, product principles, anatomy of an issue, the reply loop, roadmap
- [`content/`](content/): the newsletter itself, as plain JSON and media files
- [`src/`](src/): the shared renderer, the issue page's CSS and JS, and the Studio
- [`prototype/issue-01.html`](prototype/issue-01.html): the original design prototype, kept for reference

```bash
npm run serve      # preview at http://localhost:8080
npm run practice   # also starts a pretend GitHub so the Studio works offline
npm test
```

No dependencies; Node 20 or newer.
