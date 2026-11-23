# TypeNGo Status

Independent public GitHub Pages host: https://status.typengo.com/ . This repository contains only the static status UI, HTTP probes and workflow; no CMS/customer data or credentials.

Run `node --test tests.mjs`. GitHub Actions now requests a dispatch every five minutes and skips duplicate samples newer than 12 minutes, targeting approximately 15-minute historical sampling. GitHub may still delay/skip cron events, so the page also checks CMS HTTP directly from each visitor's browser; this live result is clearly separate and never written to history. Private notification delivery has not been verified. Production release accepted on 2026-11-22; monitor target is https://typengo.com/api/health. The installer is pending and HTTP checks do not establish full functional availability.

See OPERATIONS.md for probe boundaries, real historical persistence verification, incident/recovery rules and deployment procedure.
