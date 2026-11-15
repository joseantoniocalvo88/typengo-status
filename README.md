# TypeNGo Status

Independent, HTTP-only monitor. Enable GitHub Pages using GitHub Actions in this dedicated public repository. The default target is the preview health endpoint; set repository variable `TYPENGO_HEALTH_URL` to `https://typengo.com/api/health` only after production release. Trigger one manual run, verify the page and historical data, then check the scheduled run. No tenant data, credentials or CMS code belong in this repository.

See [OPERATIONS.md](OPERATIONS.md).
