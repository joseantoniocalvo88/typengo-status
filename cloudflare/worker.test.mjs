import assert from "node:assert/strict";
import test from "node:test";
import { DatabaseSync } from "node:sqlite";
import { INTERVAL, PRODUCTION_TARGET, allIncidents, current, mergeHistories } from "../model.mjs";
import { buildHistory, newEvents } from "../collect.mjs";
import worker, { collectScheduled, readHistory } from "./worker.mjs";

const START = Date.UTC(2026, 10, 24, 17);
const at = slot => new Date(START + slot * INTERVAL).toISOString();
const history = samples => ({ version: 2, target: PRODUCTION_TARGET, samples });
const http = (state = "ok") => ({ state, httpStatus: state === "ok" ? 200 : 503, latencyMs: null });
const sample = (slot, state = "ok", source) => ({ checkedAt: at(slot), source, checks: { cms: http(state) } });

function database() {
  const sqlite = new DatabaseSync(":memory:");
  const prepare = sql => {
    const bind = (...values) => {
      const statement = () => sqlite.prepare(sql);
      return {
        async run() { return { meta: statement().run(...values) }; },
        async first() { return statement().get(...values) ?? null; },
        async all() { return { results: statement().all(...values) }; }
      };
    };
    return { ...bind(), bind };
  };
  return { prepare, batch: statements => Promise.all(statements.map(statement => statement.run())) };
}

function endpoints(baseline, state = "ok", calls = []) {
  return async (url, options) => {
    calls.push(String(url));
    assert.equal(options.method, undefined);
    assert.equal(options.redirect, "error");
    if (url === "https://status.typengo.com/status-history.json") return Response.json(baseline);
    if (state !== "ok") return new Response("unavailable", { status: 503 });
    if (url === PRODUCTION_TARGET) return Response.json({service:"typengo-cms",scope:"http-liveness",status:"ok"});
    if (url.endsWith("/api/tigo")) return Response.json({mode:"demo",suggestions:[]});
    return new Response('<title>TypeNGo</title><input type="password">', { headers: {"content-type":"text/html"} });
  };
}

test("archives real legacy data once and commits actual samples atomically per interval", async () => {
  const db = database();
  const baseline = history([sample(-4), sample(-2, "unverified")]);
  const calls = [];
  for (const slot of [0, 1, 2]) {
    const scheduled = START + slot * INTERVAL;
    const options = { now: () => scheduled + 2000, fetchImpl: endpoints(baseline, "ok", calls) };
    const result = await collectScheduled(scheduled, db, options);
    assert.equal(result.recorded, true);
    assert.equal(result.sample.scheduledAt, at(slot));
    assert.equal(result.sample.checkedAt, new Date(scheduled + 2000).toISOString());
    assert.equal(Object.keys(result.sample.checks).length, 4);
    assert.equal(Object.values(result.sample.checks).every(check => check.state === "ok"), true);
    if (slot === 1) assert.equal((await collectScheduled(scheduled, db, options)).recorded, false);
  }
  assert.equal(calls.filter(url => url.startsWith("https://status.typengo.com")).length, 1);
  const actual = (await readHistory(db, START + 3 * INTERVAL)).samples;
  assert.equal(actual.length, 5);
  assert.equal(actual[0].checkedAt, at(-4));
  assert.equal(actual[1].checks.cms.state, "unverified");
  assert.deepEqual(actual.slice(2).map(s => s.scheduledAt), [at(0), at(1), at(2)]);
});

test("detects two separate failures, only one opening and recovery, and missing periods remain unknown", async () => {
  const db = database();
  const baseline = history([sample(-1)]);
  const observed = [];
  for (const [slot, state] of [[0, "unverified"], [1, "unverified"], [2, "ok"], [3, "ok"]]) {
    const time = START + slot * INTERVAL;
    const result = await collectScheduled(time, db, { now: () => time, fetchImpl: endpoints(baseline, state) });
    observed.push(...result.events.filter(event => event.id === "cms").map(event => event.state));
  }
  assert.deepEqual(observed, ["investigating", "resolved"]);
  const data = await readHistory(db, START + 4 * INTERVAL);
  assert.equal(allIncidents(data.samples)[0].state, "resolved");
  assert.equal(current(data.samples, "cms", START + 8 * INTERVAL), "unknown");
  const notification = newEvents(data, history(data.samples.slice(0, 2)));
  assert.deepEqual(notification.filter(e => e.id === "cms").map(e => e.state), ["investigating", "resolved"]);
  assert.deepEqual(newEvents(data, data), []);
});

test("merges duplicate time slots in favor of Cloudflare and runs the GitHub fallback when primary is stale", () => {
  const archived = history([sample(-2), sample(0, "unverified", "github")]);
  const direct = history([sample(0, "ok", "cloudflare")]);
  const combined = mergeHistories(archived, direct);
  assert.equal(combined.samples.length, 2);
  assert.equal(combined.samples.at(-1).checks.cms.state, "ok");
  assert.equal(buildHistory(archived, direct, PRODUCTION_TARGET, START + INTERVAL).wantsBackup, false);
  assert.equal(buildHistory(archived, direct, PRODUCTION_TARGET, START + 2 * INTERVAL).wantsBackup, true);
  const recentBackup = history([...archived.samples, sample(2, "ok", "github")]);
  assert.equal(buildHistory(recentBackup, direct, PRODUCTION_TARGET, START + 2 * INTERVAL).wantsBackup, false);
});

test("provides read-only public history and RSS with restricted browser access", async () => {
  const db = database();
  await collectScheduled(Date.now(), db, { fetchImpl: endpoints(history([sample(-1)])) });
  const env = { STATUS_DB: db };
  const result = await worker.fetch(new Request("https://example.com/status-history.json"), env);
  assert.equal(result.status, 200);
  assert.equal(result.headers.get("Access-Control-Allow-Origin"), "https://status.typengo.com");
  assert.ok((await result.json()).samples.some(sample => sample.source === "cloudflare"));
  const rss = await worker.fetch(new Request("https://example.com/feed.xml"), env);
  assert.match(rss.headers.get("content-type"), /rss/);
  assert.match(await rss.text(), /<rss/);
  assert.equal((await worker.fetch(new Request("https://example.com/"), env)).status, 404);
  assert.equal((await worker.fetch(new Request("https://example.com/status-history.json", { method: "POST" }), env)).status, 404);
  assert.equal((await worker.fetch(new Request("https://example.com/status-history.json"), { STATUS_DB: database() })).status, 503);
});
