import {readFile,writeFile,rename} from "node:fs/promises";
import {fileURLToPath} from "node:url";
import {resolve} from "node:path";
const allowed=new Set(["https://typengo.com/api/health","https://deploy-preview-98--josecalvo-cms.netlify.app/api/health"]);
export async function probe(url,fetchImpl=globalThis.fetch){
  if(!allowed.has(url))throw new Error("Unknown monitoring target");
  const start=performance.now();
  try{
    const res=await fetchImpl(url,{redirect:"error",cache:"no-store",signal:AbortSignal.timeout(5000)});
    if(!res.ok)return {state:"unverified",httpStatus:res.status,latencyMs:null};
    const body=await res.json();
    if(body?.service!=="typengo-cms"||body?.scope!=="http-liveness"||body?.status!=="ok")return {state:"unverified",httpStatus:res.status,latencyMs:null};
    return {state:"ok",httpStatus:res.status,latencyMs:Math.round(performance.now()-start)};
  }catch{return {state:"unverified",httpStatus:null,latencyMs:null};}
}
export function appendSample(previous,sample,target){
  if(target!==undefined&&!allowed.has(target))throw Error("Unknown monitoring target");
  const valid=s=>s&&typeof s.checkedAt==="string"&&Number.isFinite(Date.parse(s.checkedAt))&&["ok","unverified"].includes(s.state);
  if(!valid(sample))throw Error("Invalid sample");
  const list=(target===undefined||previous?.target===target)&&Array.isArray(previous?.samples)?previous.samples.filter(valid):[];
  return {version:1,...(target?{target}:{}),samples:[...list,sample].slice(-2016)};
}
if(process.argv[1] && fileURLToPath(import.meta.url)===resolve(process.argv[1])){
  const url=process.env.TYPENGO_HEALTH_URL||"https://typengo.com/api/health";
  const file=process.argv[2]||"status-history.json";
  let previous={samples:[]};
  try{previous=JSON.parse(await readFile(file,"utf8"));}catch(e){if(e.code!=="ENOENT")throw e;}
  const sample={checkedAt:new Date().toISOString(),...await probe(url)};
  const next=appendSample(previous,sample,url);
  await writeFile(file+".tmp",JSON.stringify(next,null,2)+"\n");
  await rename(file+".tmp",file);
  console.log(JSON.stringify(sample));
}
