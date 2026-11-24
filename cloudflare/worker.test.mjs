import test from "node:test";
import assert from "node:assert/strict";
import worker, {dispatchStatus} from "./worker.mjs";
test("Cloudflare dispatch only targets the status-only repository", async () => {
  let calls=0;
  const code=await dispatchStatus({GITHUB_STATUS_TOKEN:"test-token"},async(url,opts)=>{
    calls++;
    assert.equal(url,"https://api.github.com/repos/joseantoniocalvo88/typengo-status/actions/workflows/status.yml/dispatches");
    assert.equal(opts.method,"POST");
    assert.equal(opts.headers.Authorization,"Bearer test-token");
    assert.equal(opts.redirect,"error");
    assert.deepEqual(JSON.parse(opts.body),{ref:"main",inputs:{source:"cloudflare"}});
    return new Response(null,{status:204});
  });
  assert.equal(code,204);
  assert.equal(calls,1);
});
test("Missing token or rejected dispatch fails visibly without leaking credentials",async()=>{
  await assert.rejects(()=>dispatchStatus({},()=>{throw Error("must not fetch");}),/Missing GITHUB_STATUS_TOKEN/);
  await assert.rejects(()=>dispatchStatus({GITHUB_STATUS_TOKEN:"test-token"},async()=>new Response("sensitive body",{status:403})),/^Error: GitHub dispatch rejected: HTTP 403$/);
});
test("No public trigger endpoint",async()=>assert.equal((await worker.fetch(new Request("https://example.com/"))).status,404));
