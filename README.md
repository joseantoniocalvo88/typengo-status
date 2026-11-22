# TypeNGo Status

Independent public GitHub Pages host: https://status.typengo.com/ . This repository contains only the static status UI, HTTP probes and workflow; no CMS/customer data or credentials.

Run `node --test tests.mjs`. The enabled cron is configured for minutes 7,22,37,52 UTC. Actual scheduled dispatch and private notification delivery have not yet been verified; manual/push runs are not schedule evidence. Production release accepted on 2026-11-22; monitor target is https://typengo.com/api/health. The installer is pending and HTTP checks do not establish full functional availability.

See OPERATIONS.md for probe boundaries, real historical persistence verification, incident/recovery rules and deployment procedure.
