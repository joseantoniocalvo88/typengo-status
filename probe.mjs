import { TARGETS, COMPONENTS, allIncidents } from "./model.mjs";

export async function probe(url,kind="cms",fetchImpl=globalThis.fetch){
 if(!TARGETS.includes(url))throw Error("Unknown target");
 if(!["cms","web","auth","ai"].includes(kind))throw Error("Unknown component");
 const destination=kind==="web"?new URL("/",url).href:kind==="auth"?new URL("/login",url).href:kind==="ai"?new URL("/api/tigo",url).href:url;
 const start=performance.now();let status=null;
 try{
 const res=await fetchImpl(destination,{redirect:"manual",cache:"no-store",credentials:"omit",signal:AbortSignal.timeout(8000)});
 status=res.status;if(!res.ok)throw Error("HTTP");
 let valid=false;
 if(kind==="cms"){const body=await res.json();valid=body?.service==="typengo-cms"&&body?.scope==="http-liveness"&&body?.status==="ok";}
 else if(kind==="ai"){const body=await res.json();valid=["live","demo"].includes(body?.mode)&&Array.isArray(body?.suggestions)&&(body.mode!=="live"||typeof body.turnstileSiteKey==="string"&&body.turnstileSiteKey.length>0);}
 else{const html=await res.text();valid=(res.headers.get("content-type")||"").includes("text/html")&&/TypeNGo/i.test(html)&&(kind!=="auth"||/tn-login-title|type="password"/i.test(html));}
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

export async function collectChecks(target, fetchImpl = globalThis.fetch) {
  const monitored = COMPONENTS.filter(component => component.monitored);
  const entries = await Promise.all(monitored.map(async ({ id }) => [id, await probe(target, id, fetchImpl)]));
  return Object.fromEntries(entries);
}
