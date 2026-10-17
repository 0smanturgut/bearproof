# builds.bearproof.app

A standalone build log: every build so far, tonight's vote, the milestones. It is its own Worker
(`bearproof-builds`), so the main site is untouched and nothing on it links here.

- `worker.js` renders the page on the server from the main site's public data (`/devlog.json`, `/api/stats`,
  `/api/vote`, through the `MAIN` service binding) and three read-only counts from D1 (players, verified runs,
  $ANSEM paid). It writes nothing. `/assets/*` (fonts, icon) is passed through to the main site. Cached 2 minutes.
- Deploy by hand, it is not part of the main site's CI deploy:

```sh
npx wrangler deploy -c recap/wrangler.jsonc
```

The first deploy creates the `builds.bearproof.app` custom domain on the bearproof.app zone.
