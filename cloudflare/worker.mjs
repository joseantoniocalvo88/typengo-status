// External clock only. The existing GitHub workflow owns real probes/history.
const DISPATCH_URL = "https://api.github.com/repos/joseantoniocalvo88/typengo-status/actions/workflows/status.yml/dispatches";
export async function dispatchStatus(env, fetchImpl = fetch) {
  const token = env.GITHUB_STATUS_TOKEN;
  if (typeof token !== "string" || !token.trim()) throw new Error("Missing GITHUB_STATUS_TOKEN");
  const response = await fetchImpl(DISPATCH_URL, {
    method: "POST",
    redirect: "error",
    headers: {
      "Authorization": "Bearer " + token,
      "Accept": "application/vnd.github+json",
      "Content-Type": "application/json",
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "TypeNGo-Status-Clock"
    },
    body: JSON.stringify({ ref: "main", inputs: { source: "cloudflare" } }),
    signal: AbortSignal.timeout(15000)
  });
  // 204 and 200 are accepted responses, not evidence that a probe succeeded.
  if (![200, 204].includes(response.status)) throw new Error("GitHub dispatch rejected: HTTP " + response.status);
  return response.status;
}
export default {
  async scheduled(controller, env) {
    const status = await dispatchStatus(env);
    console.log("TypeNGo status dispatch accepted", status, new Date(controller.scheduledTime).toISOString());
  },
  async fetch() {
    // Do not expose a public action or any credentials.
    return new Response("Not found", { status: 404, headers: { "Cache-Control": "no-store" } });
  }
};
