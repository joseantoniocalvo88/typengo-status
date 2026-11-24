import {TARGETS,COMPONENTS,mergeHistories,current,daily,allIncidents,latest,STALE} from "./model.mjs";
import {checkCms} from "./monitor.mjs";
const $=id=>document.getElementById(id),el=(tag,cls,text)=>{const e=document.createElement(tag);if(cls)e.className=cls;if(text!==undefined)e.textContent=text;return e;};
const fmt=s=>new Date(s).toLocaleString("es-ES",{dateStyle:"medium",timeStyle:"short"});
let data=null,days=90,liveCms={state:"pending",checkedAt:null},browserCheckInProgress=false,historyInProgress=false;
const productionHealth="https://typengo.com/api/health";
const label=s=>s==="ok"?"HTTP correcto":s==="unverified"?"No verificado":"Sin datos recientes";
function render(){
 const samples=data?.samples||[],now=Date.now(),monitored=COMPONENTS.filter(c=>c.monitored),states=monitored.map(c=>current(samples,c.id,now));
 const mark=$("mark"),all=states.every(s=>s==="ok"),warn=states.some(s=>s==="unverified");
 const liveRecent=liveCms.checkedAt&&now-Date.parse(liveCms.checkedAt)>=0&&now-Date.parse(liveCms.checkedAt)<2*60*1000;
 const liveOk=liveRecent&&liveCms.state==="ok",liveFailed=liveRecent&&liveCms.state==="unverified";
 mark.className="status-mark"+(all?" ok":warn?" warn":"");mark.textContent=all?"✓":warn?"!":"–";
 $("overview").textContent=all?"Servicios HTTP verificados operativos":warn?"Respuesta HTTP no verificada":liveOk?"CMS accesible ahora · monitor sin datos recientes":liveFailed?"CMS no verificable ahora · histórico sin datos recientes":"Datos insuficientes o no recientes";
 const live=$("live-check");live.className="live-check"+(liveOk?" ok":liveFailed?" warn":"");
 live.textContent=liveOk?"Verificación directa desde este navegador: CMS HTTP correcto · "+fmt(liveCms.checkedAt)+" (el histórico se muestra aparte).":liveFailed?"No se pudo verificar el CMS desde este navegador · "+fmt(liveCms.checkedAt)+"; no confirma una caída.":"Comprobando el CMS en directo desde tu navegador…";
 $("environment").textContent=data?.target?.startsWith("https://typengo.com/")?"PRODUCCIÓN / HTTP":data?.target?.startsWith("https://typengo-staging.netlify.app/")?"STAGING / HTTP":data?"PREVIEW / HTTP":"ENTORNO SIN VERIFICAR";
 const last=samples.at(-1);$("updated").textContent=last?"Última comprobación: "+fmt(last.checkedAt)+(now-Date.parse(last.checkedAt)>STALE?" · Datos desactualizados":""):"No hay comprobaciones registradas";
 $("coverage").textContent=monitored.length+" de "+COMPONENTS.length+" componentes con monitor HTTP · muestreo objetivo cada 15 min";
 const root=$("components");root.replaceChildren();
 for(const c of COMPONENTS){
 const section=el("article","component"),head=el("div","component-head"),name=el("div");name.append(el("h3","",c.name),el("p","",c.description));head.append(name);
 const state=c.monitored?current(samples,c.id,now):"disabled";
 head.append(el("span","state"+(state==="ok"?" ok":state==="unverified"?" warn":""),c.monitored?label(state):"Sin monitor"));section.append(head);
 if(c.monitored){const b=daily(samples,c.id,days,now),bars=el("div","bars"),info=el("p","bar-info","Selecciona un día para consultar las comprobaciones.");bars.style.setProperty("--days",days);bars.setAttribute("role","group");bars.setAttribute("aria-label","Histórico diario de "+c.name);
 for(const d of b){const state=d.unverified?"warn":d.ok?"ok":"none";const bar=el("button","bar "+state+(d.slots&&d.slots<d.expected?" partial":""));const desc=d.date+" UTC · "+d.ok+" correctas, "+d.unverified+" no verificadas, "+d.slots+" de "+d.expected+" intervalos con datos";bar.type="button";bar.title=desc;bar.setAttribute("aria-label",desc);bar.addEventListener("click",()=>{info.textContent=desc;});bar.addEventListener("focus",()=>{info.textContent=desc;});bars.append(bar);}
 const observed=b.reduce((a,d)=>a+d.slots,0),expected=b.reduce((a,d)=>a+d.expected,0),healthy=b.reduce((a,d)=>a+d.ok,0);
 const cap=el("div","bar-caption");cap.append(el("span","",days+" días atrás"),el("span","",(observed && 100*observed/expected<.1?"<0,1":(100*observed/expected).toFixed(1).replace(".",","))+"% cobertura · "+(observed?(100*healthy/observed).toFixed(2)+"% comprobaciones correctas":"sin datos")),el("span","","Hoy"));section.append(bars,cap,info);
 const last=latest(samples,c.id);if(last?.checks[c.id].state==="ok"&&last.checks[c.id].latencyMs!=null)section.append(el("p","","Última respuesta registrada: "+last.checks[c.id].latencyMs+" ms"));}
 if(c.id==="cms"&&liveRecent)section.append(el("p","live-component"+(liveOk?" ok":""),
   liveOk?"Comprobación actual desde el navegador: HTTP correcto; no contabilizada como dato histórico.":"Comprobación del navegador no verificada; no es una caída confirmada."));
 root.append(section);
 }
 const events=$("events");events.replaceChildren();const items=allIncidents(samples).filter(e=>now-Date.parse(e.lastSeen)<=90*86400000).slice(0,30);
 if(!items.length)events.textContent=samples.length?"No hay incidencias automáticas registradas en el histórico disponible.":"Todavía no hay histórico suficiente.";
 for(const e of items){const box=el("article","event");const name=COMPONENTS.find(c=>c.id===e.id).name;const status=e.state==="resolved"?"Respuesta recuperada":e.state==="unknown"||now-Date.parse(e.lastSeen)>STALE?"Seguimiento sin datos recientes":"Respuesta no verificada";box.append(el("strong","",name+" · "+status),el("p","", "Primera señal: "+fmt(e.startedAt)+(e.resolvedAt?" · Recuperación: "+fmt(e.resolvedAt):"")));events.append(box);}
 $("check").disabled=browserCheckInProgress;
}
async function refreshBrowserCheck(){
 if(browserCheckInProgress)return;
 browserCheckInProgress=true;render();
 try{
  const result=await checkCms(fetch,productionHealth);
  liveCms={state:result.state,checkedAt:new Date().toISOString()};
 }catch{
  liveCms={state:"unverified",checkedAt:new Date().toISOString()};
 }finally{browserCheckInProgress=false;render();}
}
document.querySelectorAll("[data-days]").forEach(b=>b.addEventListener("click",()=>{days=Number(b.dataset.days);document.querySelectorAll("[data-days]").forEach(x=>x.setAttribute("aria-pressed",String(x===b)));render();}));
$("check").addEventListener("click",async()=>{$("manual-detail").textContent="Comprobando…";await refreshBrowserCheck();$("manual-detail").textContent=(liveCms.state==="ok"?"CMS HTTP correcto.":"CMS no verificado.")+" · "+fmt(liveCms.checkedAt)+" · No modifica el histórico.";});
const workerEndpoint="https://typengo-status-clock.joseantonio-calvo88.workers.dev";
async function readHistory(url){
 const response=await fetch(url,{cache:"no-store",signal:AbortSignal.timeout(7000)});
 if(!response.ok)throw Error("Missing history");
 const raw=await response.json();
 if(![1,2].includes(raw.version)||!TARGETS.includes(raw.target)||!Array.isArray(raw.samples))throw Error("Invalid history");
 return raw;
}
async function refreshHistory(){
 if(historyInProgress)return;
 historyInProgress=true;
 try{
  const [primary,backup]=await Promise.allSettled([readHistory(workerEndpoint+"/status-history.json"),readHistory("./status-history.json")]);
  const remote=primary.status==="fulfilled"?primary.value:null;
  const fallback=backup.status==="fulfilled"?backup.value:null;
  if(remote||fallback){
   data=mergeHistories(remote,fallback,data);
   const cloudflare=remote?.samples.findLast(sample=>sample.source==="cloudflare");
   const age=cloudflare?Date.now()-Date.parse(cloudflare.checkedAt):Infinity;
   const feed=age>=0&&age<27*60*1000?workerEndpoint+"/feed.xml":"./feed.xml";
   document.querySelectorAll("[data-status-rss]").forEach(link=>link.href=feed);
   render();
  }else if(!data){
   $("updated").textContent="El histórico no está disponible; no se puede confirmar el estado.";
  }
 }finally{historyInProgress=false;}
}
function refreshVisible(){
 if(document.visibilityState==="visible"){refreshBrowserCheck();refreshHistory();}
}
render();
refreshBrowserCheck();
refreshHistory();
setInterval(refreshVisible,60*1000);
document.addEventListener("visibilitychange",refreshVisible);
