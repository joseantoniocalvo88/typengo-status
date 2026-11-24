import { DAY, INVALID_CLOUDFLARE_OBSERVATION, INTERVAL, PRODUCTION_TARGET, allIncidents, dateKey, normalize } from "../model.mjs";
import { collectChecks } from "../probe.mjs";

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
    redirect: "manual",
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

const READ_DAYS = `
WITH observations AS (
  SELECT day, value AS sample, json_extract(value, '$.checkedAt') AS checked_at,
         CAST(unixepoch(json_extract(value, '$.checkedAt')) / 900 AS INTEGER) AS slot, source
  FROM status_days, json_each(status_days.samples)
  WHERE day >= ? AND (source <> 'cloudflare' OR json_extract(value, '$.checkedAt') <> ?)
),
ranked AS (
  SELECT day, sample, checked_at, row_number() OVER (
    PARTITION BY slot ORDER BY (source = 'cloudflare') DESC, checked_at
  ) AS position
  FROM observations
),
recent AS (
  SELECT day, sample, checked_at FROM ranked WHERE position = 1 ORDER BY checked_at DESC LIMIT 12000
)
SELECT day, json_group_array(json(sample) ORDER BY checked_at) AS samples
FROM recent GROUP BY day ORDER BY day
`;

async function readDays(db, now, days) {
  const { results } = await db.prepare(READ_DAYS).bind(dateKey(now - days * DAY), INVALID_CLOUDFLARE_OBSERVATION).all();
  return results;
}

export async function readHistory(db, now = Date.now(), days = 126) {
  const rows = await readDays(db, now, days);
  return {
    version: 2,
    target: PRODUCTION_TARGET,
    samples: rows.flatMap(row => JSON.parse(row.samples))
  };
}

function streamHistory(rows) {
  const encoder = new TextEncoder();
  let index = -1;
  return new ReadableStream({
    pull(controller) {
      if (index === -1) {
        controller.enqueue(encoder.encode('{"version":2,"target":"' + PRODUCTION_TARGET + '","samples":['));
      } else if (index < rows.length) {
        controller.enqueue(encoder.encode((index ? "," : "") + rows[index].samples.slice(1, -1)));
      } else {
        controller.enqueue(encoder.encode("]}"));
        controller.close();
      }
      index++;
    }
  });
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
    ? allIncidents((await readHistory(db, now(), 1)).samples)
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
    const url = new URL(request.url);
    if (request.method === "GET" && url.pathname === "/feed.xml") return Response.redirect(SITE + "/feed.xml", 302);
    if (request.method !== "GET" || url.pathname !== "/status-history.json") return new Response("Not found", { status: 404 });

    const recent = url.searchParams.get("recent") === "1";
    url.search = recent ? "?recent=1" : "";
    const cacheKey = new Request(url.href);
    const cache = globalThis.caches?.default;
    const cached = await cache?.match(cacheKey);
    if (cached) return cached;

    try {
      const rows = await readDays(env.STATUS_DB, Date.now(), recent ? 2 : 126);
      if (!rows.length) throw new Error("No samples");
      const response = new Response(streamHistory(rows), {
        headers: {
          ...CORS,
          "Cache-Control": "public, max-age=60",
          "Content-Type": "application/json; charset=utf-8",
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
