# Pulse ⚡ — Social & Chat (mobile-first PWA)

A real social app: **accounts, news feed (posts / likes / comments) and real-time direct
messages**, built as a single web app that you can publish free with a live public link —
no app store build needed. Installable on phones ("Add to Home screen").

**Stack:** HTML + CSS + vanilla JS · Firebase (Auth + Firestore) · works on GitHub Pages,
Netlify, Vercel, Cloudflare Pages — all free.

---

## 1. Get your free Firebase config (2 minutes)

1. Go to <https://console.firebase.google.com> → **Add project** (any name, Analytics off is fine).
2. Click the **Web `</>`** icon → register the app → copy the `firebaseConfig` object.
3. Enable **Authentication → Sign-in method → Email/Password → Enable**.
4. Enable **Firestore Database → Create database** (start in test mode for now).
5. Open the app → paste the config in the setup screen (it's stored in your browser only).

### Firestore security rules (paste in Firestore → Rules)

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /users/{uid} {
      allow read: if request.auth != null;
      allow write: if request.auth != null && request.auth.uid == uid;
    }
    match /posts/{id} {
      allow read, create: if request.auth != null;
      allow update, delete: if request.auth != null &&
        request.auth.uid == resource.data.uid;
      match /comments/{cid} {
        allow read, create: if request.auth != null;
      }
    }
    match /chats/{chatId} {
      allow read, write: if request.auth != null &&
        request.auth.uid in resource.data.members;
      match /messages/{mid} {
        allow read, create: if request.auth != null;
      }
    }
  }
}
```

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
