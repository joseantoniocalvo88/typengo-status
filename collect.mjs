import {readFile,writeFile,rename} from "node:fs/promises";
import {fileURLToPath} from "node:url";
import {resolve,dirname,join} from "node:path";
import {TARGETS,COMPONENTS,STALE,normalize,append,allIncidents} from "./model.mjs";
export async function probe(url,kind="cms",fetchImpl=globalThis.fetch){
 if(!TARGETS.includes(url))throw Error("Unknown target");
 const destination=kind==="web"?new URL("/",url).href:url;
 const start=performance.now();let status=null;
 try{
 const res=await fetchImpl(destination,{redirect:"error",cache:"no-store",credentials:"omit",signal:AbortSignal.timeout(8000)});
 status=res.status;if(!res.ok)throw Error("HTTP");
 let valid=false;
 if(kind==="cms"){const body=await res.json();valid=body?.service==="typengo-cms"&&body?.scope==="http-liveness"&&body?.status==="ok";}
 else{const html=await res.text();valid=(res.headers.get("content-type")||"").includes("text/html")&&/TypeNGo/i.test(html);}
 if(!valid)throw Error("Invalid response");
 return {state:"ok",httpStatus:status,latencyMs:Math.round(performance.now()-start)};
 }catch{return {state:"unverified",httpStatus:status,latencyMs:null};}
}
const xml=s=>String(s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&apos;"}[c]));
export function makeFeed(data){
 const environment=data.target.startsWith("https://typengo.com/")?"Producción":"Pruebas";
 const events=allIncidents(data.samples).flatMap(i=>[{i,at:i.confirmedAt,kind:"Respuesta no verificada"},...(i.resolvedAt?[{i,at:i.resolvedAt,kind:"Respuesta recuperada"}]:[]) ]).sort((a,b)=>b.at.localeCompare(a.at)).slice(0,100);
 return '<?xml version="1.0" encoding="UTF-8"?><rss version="2.0"><channel><title>TypeNGo Status</title><link>https://status.typengo.com/</link><description>Eventos automáticos HTTP de '+xml(environment)+'</description>'+events.map(({i,at,kind})=>'<item><title>'+xml(environment+" · "+COMPONENTS.find(c=>c.id===i.id).name+" · "+kind)+'</title><link>https://status.typengo.com/#incidents</link><guid isPermaLink="false">'+xml(data.target+"|"+i.id+"|"+i.startedAt+"|"+kind)+'</guid><pubDate>'+new Date(at).toUTCString()+'</pubDate><description>Evento detectado por dos comprobaciones consecutivas; no confirma una caída general.</description></item>').join("")+'</channel></rss>\n';
}
if(process.argv[1]&&fileURLToPath(import.meta.url)===resolve(process.argv[1])){
 const target=process.env.TYPENGO_HEALTH_URL||TARGETS[0],file=process.argv[2]||"status-history.json";
 if(!TARGETS.includes(target))throw Error("Unknown target");
 let previous={samples:[]};try{previous=JSON.parse(await readFile(file,"utf8"));}catch(e){if(e.code!=="ENOENT")throw e;}
 const checkedAt=new Date().toISOString();
 const [cms,web]=await Promise.all([probe(target,"cms"),probe(target,"web")]);
 const data=append(previous,{checkedAt,checks:{cms,web}},target);
 await writeFile(file+".tmp",JSON.stringify(data)+"\n");await rename(file+".tmp",file);
 await writeFile(join(dirname(file),"feed.xml"),makeFeed(data));
 console.log(JSON.stringify({checkedAt,checks:{cms,web}}));
}
