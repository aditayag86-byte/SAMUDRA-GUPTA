# Pulse ⚡ — Social & Chat (mobile-first PWA)

A real social app: **accounts, news feed (posts / likes / comments) and real-time direct
messages**, built as a single web app that you can publish free with a live public link —
no app store build needed. Installable on phones ("Add to Home screen").

**Stack:** HTML + CSS + vanilla JS · Firebase (Auth + Firestore) · works on GitHub Pages,
Netlify, Vercel, Cloudflare Pages — all free.

**Live:** https://aditayag86-byte.github.io/SAMUDRA-GUPTA/

---

## Setup already done ✔

- The Firebase project config is **baked into `js/app.js`** — visitors sign up directly.
- Email/Password authentication is enabled.
- Firestore database is created. `firestore.rules` in this folder holds the security rules.

## Firestore security rules

Copy everything from **`firestore.rules`** and paste it in
Firebase Console → Firestore Database → **Rules** tab → Publish.

## 2. Publish free (pick one)

### GitHub Pages (uses your existing repo)
```bash
git add social-app
git commit -m "Add Pulse social app"
git push origin main
```
Then on GitHub: **Settings → Pages → Source: Deploy from a branch → main → / (root or folder)**.
Live link: `https://<username>.github.io/<repo>/`

### Netlify Drop (fastest)
Go to <https://app.netlify.com/drop>, drag the `social-app` folder in → instant
`https://random-name.netlify.app` link. Free.

### Vercel / Cloudflare Pages
Import the repo and set the root directory to `social-app` — no build command needed.

## 3. Notes

- The Firebase API key in a web app is public by design — security comes from the
  Firestore rules above.
- Posts, comments and messages update **live** for everyone via Firestore snapshots.
- PWA: on Android Chrome use **Install app**; on iOS Safari use **Share → Add to Home Screen**.
