# TypeNGo Status

Independent public GitHub Pages host: https://status.typengo.com/ . This repository contains only the static status UI, HTTP probes and workflow; no CMS/customer data or credentials.

Run `node --test tests.mjs`. The enabled cron is configured for minutes 7,22,37,52 UTC. Actual scheduled dispatch and private notification delivery have not yet been verified; manual/push runs are not schedule evidence. Current target is isolated staging. Do not switch to production before exact release acceptance.

See OPERATIONS.md for probe boundaries, real historical persistence verification, incident/recovery rules and deployment procedure.
