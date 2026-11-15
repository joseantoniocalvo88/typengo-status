# Independent TypeNGo Status operations

Authoritative deployed host: https://status.typengo.com/ on separate GitHub Pages repository joseantoniocalvo88/typengo-status. No CMS hosting dependency. The synchronized export is generated with node tooling/status/export.mjs /new/directory and includes its model, UI, collector, tests and workflow.

The enabled workflow has cron 7,22,37,52 * * * * (UTC). A cron declaration/enabled menu is NOT proof that scheduled jobs are actually being dispatched. No schedule event was observed during this session. Do not claim continuous monitoring until one is visible in Actions. GitHub may delay scheduled workflows; gaps remain unknown.

Four GET probes each run: /api/health, /, /login form HTML, /api/tigo public configuration. These do not test credential authentication, database content, storage persistence or model inference. API/database components remain unverified. No direct DB polling, no POST inference, no customer website scanning. At the configured regular interval this is 384 public GETs/day, plus manual/operator runs.

History is a v2 status-history.json artifact retained for 30 days, bounded at 12,000 samples. Download by artifact ID uses merge-multiple:true so the file is restored at the expected root. A missing/corrupt prior artifact fails the job instead of silently starting over. Target changes intentionally start separate history. Two consecutive failures open an incident; two recoveries resolve it; gaps over 45 minutes become unknown. RSS is feed.xml. A new confirmed incident fails the separate notification job after deployment to signal through GitHub Actions. Actual private delivery depends on the owner's notification settings and has not been verified.

Real run 43743562346 exposed a download-layout bug. Fixed at 461f9d01a6f668bc20937f43593c929bb008e7fd; successful run 43744617366 preserved the earlier sample and added the new one. No missing old sample was fabricated. Six model/probe tests cover migration, coverage, incidents/recovery/gaps, target changes and GET-only behavior.

Current target is https://typengo-staging.netlify.app/api/health. Change repository variable TYPENGO_HEALTH_URL to https://typengo.com/api/health only after exact production release acceptance. Never show the staging probes as production health.
