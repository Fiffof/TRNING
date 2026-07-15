# Trning — PWA

Adaptive daily training. Dark/teal/mono. All data stays on-device (localStorage).

## Host it (one-time, ~2 minutes)
The `dist/` folder is the finished site — static files, no server logic.

1. Easiest: drag the `dist/` folder onto https://app.netlify.com/drop (or use Cloudflare Pages / Vercel).
   Must be served over HTTPS at the domain root — required for the service worker and Add to Home Screen.
2. Open the URL on your phone.
3. iOS Safari: Share → Add to Home Screen. Android Chrome: the install prompt, or menu → Install app.

It then launches full-screen with its own icon and works offline (the service worker
precaches the whole app; new deploys auto-update on next online launch).

## Notes
- Data lives in that browser's localStorage: per device, not synced. iOS can evict
  storage for sites unused for weeks — open the app now and then, and consider an
  export feature before the history becomes precious.
- Hosting under a sub-path (e.g. GitHub Pages project sites) needs `base` set in
  vite.config.js; root-domain hosts need nothing.

## Rebuild after editing
npm install
npm run build        # output in dist/
The app itself is src/App.jsx (edit zones marked inside).
