import { readFile, writeFile, rename } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { resolve, dirname, join } from "node:path";
import { TARGETS, INTERVAL, append, allIncidents, mergeHistories } from "./model.mjs";
import { probe, collectChecks, makeFeed } from "./probe.mjs";

export { probe, makeFeed };
export const BACKUP_AFTER = 27 * 60 * 1000;

export function buildHistory(previous, primary, target, now) {
  const merged = mergeHistories(
    { version: 2, target, samples: [] },
    primary,
    previous
  );
  const last = merged.samples.at(-1);
  const lastCloudflare = merged.samples.findLast(observation => observation.source === "cloudflare");
  const age = lastCloudflare ? now - Date.parse(lastCloudflare.checkedAt) : Infinity;
  const githubAge = last ? now - Date.parse(last.checkedAt) : Infinity;
  const wantsBackup = (age < 0 || age >= BACKUP_AFTER) && (githubAge < 0 || githubAge >= INTERVAL);
  return { data: merged, wantsBackup };
}

export function newEvents(data, previous) {
  const last = Date.parse(previous?.samples?.at(-1)?.checkedAt);
  return allIncidents(data.samples).flatMap(({ id, state, confirmedAt, resolvedAt }) => {
    const events = [];
    if ((!Number.isFinite(last) || Date.parse(confirmedAt) > last) && state !== "unknown") {
      events.push({ id, state: "investigating", confirmedAt });
    }
    if (resolvedAt && (!Number.isFinite(last) || Date.parse(resolvedAt) > last)) {
      events.push({ id, state: "resolved", confirmedAt, resolvedAt });
    }
    return events;
  });
}

async function readOptional(file) {
  if (!file) return null;
  try { return JSON.parse(await readFile(file, "utf8")); }
  catch (error) { if (error.code === "ENOENT") return null; throw error; }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  const target = process.env.TYPENGO_HEALTH_URL || TARGETS[1];
  if (!TARGETS.includes(target)) throw new Error("Unknown target");
  const file = process.argv[2] || "status-history.json";
  const previous = await readOptional(file);
  const primary = await readOptional(process.env.STATUS_WORKER_HISTORY);
  const now = Date.now();
  const manual = process.env.STATUS_FORCE === "true";
  const { data: merged, wantsBackup } = buildHistory(previous, primary, target, now);
  const sample = manual || wantsBackup
    ? { checkedAt: new Date(now).toISOString(), source: "github", checks: await collectChecks(target) }
    : null;
  const data = sample
    ? mergeHistories(merged, append({ version: 2, target, samples: [] }, sample, target))
    : merged;
  if (!data.samples.length) throw new Error("No status samples");

  const changed = JSON.stringify(data.samples) !== JSON.stringify(previous?.samples ?? []);
  await writeFile(file + ".tmp", JSON.stringify(data) + "\n");
  await rename(file + ".tmp", file);
  await writeFile(join(dirname(file), "feed.xml"), makeFeed(data));
  const events = previous ? newEvents(data, previous) : [];
  await writeFile(join(dirname(file), "events.json"), JSON.stringify(events) + "\n");
  console.log(JSON.stringify({ changed, sample, last: data.samples.at(-1)?.checkedAt }));
  if (process.env.GITHUB_OUTPUT) {
    const { appendFile } = await import("node:fs/promises");
    await appendFile(process.env.GITHUB_OUTPUT, "should_deploy=" + (manual || changed) + "\n");
  }
}
