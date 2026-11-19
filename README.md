# Sledování zásilek

Czech-language package tracking site for GitHub Pages. Visitors enter a tracking code and see the shipment's status and history. You manage shipments in an admin panel (`/admin/`): create a shipment, get a generated code, update its status. Every action carries a timestamp.

Plain HTML/CSS/JS. No build step, no server, no third-party services.

## How it works

- Each shipment is one JSON file in this repo: `data/p/<SHA-256 of the code>.json`.
- A visitor knows only the code, so the page hashes it and fetches that one file. The site never lists shipments.
- The admin panel writes those files through the GitHub API using a personal access token you paste into the panel. The token stays in your browser (`localStorage`) and is never committed.
- Saving makes a commit; GitHub Pages redeploys, so a change shows on the site after roughly a minute.

### What is public

The repository has to be public for free GitHub Pages, so **everything in `data/` is publicly readable** by anyone who browses the repo: tracking code, status, history, carrier, cities, delivery dates.

The recipient's name and phone are masked **before** saving (`J*** N*****`, `*** *** 456`). The full values, the street address and the e-mail are never stored anywhere. Don't put sensitive text into the description or into status notes.

## Setup

1. Create an empty public repository on GitHub and push this folder to it.
2. Repo → **Settings → Pages** → *Deploy from a branch* → branch `main`, folder `/ (root)`.
3. Set `githubRepo` in [`js/config.js`](js/config.js) to `your-user/your-repo` and push again.
4. Create a token: GitHub → Settings → Developer settings → **Fine-grained tokens** → *Generate new token*.
   - Repository access: *Only select repositories* → this repo
   - Repository permissions: **Contents: Read and write**
5. Open `https://<user>.github.io/<repo>/admin/`, paste the token, and create your first shipment.

Anyone can open the admin page, but without a valid token it can't read or change anything. Treat the token like a password and set an expiry date.

## Demo mode

While `githubRepo` in `js/config.js` is empty, the site runs on `localStorage` only (no login, nothing is sent anywhere). Try the code `DEMO-BALI-K123`.

## Local preview

```bash
npm run dev
```

Opens a tiny built-in server (no dependencies, nothing to install) at <http://localhost:8080/>; change the port with `PORT=3000 npm run dev`. Open the site through the server, not by double-clicking `index.html`. `npm test` runs the storage-layer test against a simulated GitHub API.

## Customising

- Statuses and their Czech wording: `js/common.js` → `STATUSES`
- Colours: CSS variables at the top of `css/styles.css`

## Notes

- Tracking codes are 12 random characters (`XXXX-XXXX-XXXX`, about 59 bits).
- Status location and notes are shown to the customer. Write them accordingly.
- If two edits to the same shipment collide, the panel asks you to reload and retry.
