import { DAY, INTERVAL, PRODUCTION_TARGET, allIncidents, dateKey, mergeHistories, normalize } from "../model.mjs";
import { collectChecks, makeFeed } from "../probe.mjs";

const SITE = "https://status.typengo.com";
const HISTORY_URL = SITE + "/status-history.json";
const CORS = { "Access-Control-Allow-Origin": SITE };
const SOURCE = "cloudflare";

const CREATE_DAYS = `CREATE TABLE IF NOT EXISTS status_days (
  day TEXT NOT NULL,
  source TEXT NOT NULL,
  samples TEXT NOT NULL,
  PRIMARY KEY (source, day)
)`;

const INDEX_DAYS = "CREATE INDEX IF NOT EXISTS status_days_day ON status_days (day)";
const CREATE_METADATA = "CREATE TABLE IF NOT EXISTS status_metadata (key TEXT PRIMARY KEY)";
const SAVE_PROBE = `INSERT INTO status_days (day, source, samples)
VALUES (?, 'cloudflare', json_object(?, json(?)))
ON CONFLICT (source, day) DO UPDATE
SET samples = json_insert(status_days.samples, ?, json(?))
WHERE json_type(status_days.samples, ?) IS NULL`;
const SAVE_ARCHIVE = `INSERT OR IGNORE INTO status_days (day, source, samples)
SELECT json_extract(value, '$.day'), 'github', json_extract(value, '$.samples')
FROM json_each(?)`;

export async function seedHistory(db, fetchImpl = globalThis.fetch) {
  const imported = await db.prepare("SELECT key FROM status_metadata WHERE key = 'baseline'").first();
  if (imported) return 0;

  const response = await fetchImpl(HISTORY_URL, {
    cache: "no-store",
    redirect: "error",
    signal: AbortSignal.timeout(8000)
  });
  if (!response.ok) throw new Error("Previous history unavailable: HTTP " + response.status);
  const previous = normalize(await response.json(), PRODUCTION_TARGET);
  if (!previous.samples.length) throw new Error("Previous production history is empty");

  const days = new Map();
  for (const sample of previous.samples) {
    const day = dateKey(Date.parse(sample.checkedAt));
    if (!days.has(day)) days.set(day, []);
    days.get(day).push(sample);
  }
  const rows = [...days].map(([day, samples]) => ({ day, samples }));
  for (let i = 0; i < rows.length; i += 8) {
    await db.prepare(SAVE_ARCHIVE).bind(JSON.stringify(rows.slice(i, i + 8))).run();
  }
  await db.prepare("INSERT OR IGNORE INTO status_metadata (key) VALUES ('baseline')").run();
  return previous.samples.length;
}

export async function readHistory(db, now = Date.now(), days = 126) {
  const { results } = await db.prepare(
    "SELECT source, samples FROM status_days WHERE day >= ? ORDER BY day DESC"
  ).bind(dateKey(now - days * DAY)).all();
  const samples = { cloudflare: [], github: [] };
  for (const row of results) {
    samples[row.source].push(...Object.values(JSON.parse(row.samples)));
  }
  return mergeHistories(
    { version: 2, target: PRODUCTION_TARGET, samples: samples.cloudflare },
    { version: 2, target: PRODUCTION_TARGET, samples: samples.github }
  );
}

export async function collectScheduled(scheduledTime, db, { now = Date.now, fetchImpl = globalThis.fetch } = {}) {
  await db.batch([db.prepare(CREATE_DAYS), db.prepare(INDEX_DAYS), db.prepare(CREATE_METADATA)]);
  const checkedAt = new Date(now()).toISOString();
  const scheduledAt = new Date(scheduledTime).toISOString();
  const slot = String(Math.floor(Date.parse(checkedAt) / INTERVAL));
  const path = '$."' + slot + '"';
  const sample = { source: SOURCE, checkedAt, scheduledAt, checks: await collectChecks(PRODUCTION_TARGET, fetchImpl) };
  const json = JSON.stringify(sample);
  const result = await db.prepare(SAVE_PROBE)
    .bind(dateKey(Date.parse(checkedAt)), slot, json, path, json, path).run();

  let imported = 0;
  try {
    imported = await seedHistory(db, fetchImpl);
  } catch (error) {
    console.warn("status archive unavailable", error.message);
  }

  const recorded = result.meta.changes > 0;
  const events = recorded
    ? allIncidents((await readHistory(db, now(), 7)).samples)
        .filter(event => event.confirmedAt === checkedAt || event.resolvedAt === checkedAt)
    : [];
  return { recorded, imported, sample, events };
}

export default {
  async scheduled(controller, env) {
    const { recorded, imported, sample, events } = await collectScheduled(controller.scheduledTime, env.STATUS_DB);
    console.log(JSON.stringify({ type: "status-probe", recorded, imported, ...sample }));
    for (const { id, state, confirmedAt, resolvedAt } of events) {
      const event = JSON.stringify({ type: "status-incident", id, state, confirmedAt, resolvedAt });
      if (state === "investigating") console.error(event);
      else console.log(event);
    }
  },
  async fetch(request, env, ctx) {
    const path = new URL(request.url).pathname;
    const routes = ["/status-history.json", "/feed.xml"];
    if (request.method !== "GET" || !routes.includes(path)) return new Response("Not found", { status: 404 });

    // Normalize the cache key so arbitrary query strings cannot multiply database reads.
    const cacheKey = new Request(new URL(path, request.url).href);
    const cache = globalThis.caches?.default;
    const cached = await cache?.match(cacheKey);
    if (cached) return cached;

    try {
      const history = await readHistory(env.STATUS_DB);
      if (!history.samples.length) throw new Error("No samples");
      const isFeed = path === "/feed.xml";
      const body = isFeed ? makeFeed(history) : JSON.stringify(history);
      const response = new Response(body, {
        headers: {
          ...CORS,
          "Cache-Control": "public, max-age=60",
          "Content-Type": isFeed ? "application/rss+xml; charset=utf-8" : "application/json; charset=utf-8",
          "X-Content-Type-Options": "nosniff"
        }
      });
      if (cache) ctx.waitUntil(cache.put(cacheKey, response.clone()));
      return response;
    } catch {
      return new Response("Status history unavailable", { status: 503, headers: { ...CORS, "Cache-Control": "no-store" } });
    }
  }
};
