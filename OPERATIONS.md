# TypeNGo Status — operations
Independent GitHub Pages site at https://status.typengo.com/. The public repository contains only the monitor, not the CMS.
- Workflow runs manually, on relevant changes and at :07, :22, :37, :52 UTC. GitHub may delay or skip runs.
- Default target remains the previously verified preview health endpoint. Set repository variable TYPENGO_HEALTH_URL to https://typengo-staging.netlify.app/api/health only after verifying that endpoint, or to https://typengo.com/api/health only once production supports it. Targets are allowlisted; changing target starts a separate history, never merges unrelated samples.
- Four credential-free HTTP GET requests per run: /api/health, /, /login (form marker only), and /api/tigo (public config). No sign-in submission, AI inference, direct DB/storage query, or customer-site probe. Config demo mode can be healthy as config; it is not proof of inference.
- Version 1 history migrates without inventing web checks. Bounded storage (12,000 samples); 90 UTC-day display. Missing slots are not uptime. Coverage is observed intervals, not SLA. Data older than 45 minutes is stale.
- Two consecutive unverified responses within 45 minutes create an automatic event; two successes resolve it. A gap longer than 45 minutes makes an unresolved event's follow-up unknown. Feed at /feed.xml can be subscribed to using any RSS reader with alerts enabled. RSS is not email delivery; no external recipient is configured.
- History artifact is kept 30 days per run. If no new run occurs before expiration, history restarts. No incident is a guarantee of absence of failures.
- API content and database/media remain unmonitored; auth and AI rows report HTTP surface only. Actual sign-in and inference are not verified. 
- On deployment check the workflow jobs, published JSON, RSS and HTTPS. Run node --test tests.mjs locally or in CI.

- Newly confirmed events trigger a dedicated failing incident_notification job AFTER deployment; private delivery depends on the GitHub account's Actions notification settings. No email address or webhook added. Scheduled execution still requires real run evidence. RSS remains public.
