import {TARGETS,COMPONENTS,normalize,current,daily,allIncidents,latest,STALE} from "./model.mjs";
import {checkCms} from "./monitor.mjs";
const $=id=>document.getElementById(id),el=(tag,cls,text)=>{const e=document.createElement(tag);if(cls)e.className=cls;if(text!==undefined)e.textContent=text;return e;};
const fmt=s=>new Date(s).toLocaleString("es-ES",{dateStyle:"medium",timeStyle:"short"});
let data=null,days=90;
const label=s=>s==="ok"?"HTTP correcto":s==="unverified"?"No verificado":"Sin datos recientes";
function render(){
 const samples=data?.samples||[],now=Date.now(),monitored=COMPONENTS.filter(c=>c.monitored),states=monitored.map(c=>current(samples,c.id,now));
 const mark=$("mark"),all=states.every(s=>s==="ok"),warn=states.some(s=>s==="unverified");
 mark.className="status-mark"+(all?" ok":warn?" warn":"");mark.textContent=all?"✓":warn?"!":"–";
 $("overview").textContent=all?"Servicios HTTP verificados operativos":warn?"Respuesta HTTP no verificada":"Datos insuficientes o no recientes";
 $("environment").textContent=data?.target?.startsWith("https://typengo.com/")?"PRODUCCIÓN / HTTP":data?"ENTORNO DE PRUEBAS / HTTP":"ENTORNO SIN VERIFICAR";
 const last=samples.at(-1);$("updated").textContent=last?"Última comprobación: "+fmt(last.checkedAt)+(now-Date.parse(last.checkedAt)>STALE?" · Datos desactualizados":""):"No hay comprobaciones registradas";
 $("coverage").textContent=monitored.length+" de "+COMPONENTS.length+" componentes con monitor HTTP · cada 15 min";
 const root=$("components");root.replaceChildren();
 for(const c of COMPONENTS){
 const section=el("article","component"),head=el("div","component-head"),name=el("div");name.append(el("h3","",c.name),el("p","",c.description));head.append(name);
 const state=c.monitored?current(samples,c.id,now):"disabled";
 head.append(el("span","state"+(state==="ok"?" ok":state==="unverified"?" warn":""),c.monitored?label(state):"Sin monitor"));section.append(head);
 if(c.monitored){const b=daily(samples,c.id,days,now),bars=el("div","bars"),info=el("p","bar-info","Selecciona un día para consultar las comprobaciones.");bars.style.setProperty("--days",days);bars.setAttribute("role","group");bars.setAttribute("aria-label","Histórico diario de "+c.name);
 for(const d of b){const state=d.unverified?"warn":d.ok?"ok":"none";const bar=el("button","bar "+state+(d.slots&&d.slots<d.expected?" partial":""));const desc=d.date+" UTC · "+d.ok+" correctas, "+d.unverified+" no verificadas, "+d.slots+" de "+d.expected+" intervalos con datos";bar.type="button";bar.title=desc;bar.setAttribute("aria-label",desc);bar.addEventListener("click",()=>{info.textContent=desc;});bar.addEventListener("focus",()=>{info.textContent=desc;});bars.append(bar);}
 const observed=b.reduce((a,d)=>a+d.slots,0),expected=b.reduce((a,d)=>a+d.expected,0),healthy=b.reduce((a,d)=>a+d.ok,0);
 const cap=el("div","bar-caption");cap.append(el("span","",days+" días atrás"),el("span","",Math.round(100*observed/expected)+"% cobertura · "+(observed?(100*healthy/observed).toFixed(2)+"% comprobaciones correctas":"sin datos")),el("span","","Hoy"));section.append(bars,cap,info);
 const last=latest(samples,c.id);if(last?.checks[c.id].state==="ok"&&last.checks[c.id].latencyMs!=null)section.append(el("p","","Última respuesta registrada: "+last.checks[c.id].latencyMs+" ms"));}
 root.append(section);
 }
 const events=$("events");events.replaceChildren();const items=allIncidents(samples).filter(e=>now-Date.parse(e.lastSeen)<=90*86400000).slice(0,30);
 if(!items.length)events.textContent=samples.length?"No hay incidencias automáticas registradas en el histórico disponible.":"Todavía no hay histórico suficiente.";
 for(const e of items){const box=el("article","event");const name=COMPONENTS.find(c=>c.id===e.id).name;const status=e.state==="resolved"?"Respuesta recuperada":e.state==="unknown"||now-Date.parse(e.lastSeen)>STALE?"Seguimiento sin datos recientes":"Respuesta no verificada";box.append(el("strong","",name+" · "+status),el("p","", "Primera señal: "+fmt(e.startedAt)+(e.resolvedAt?" · Recuperación: "+fmt(e.resolvedAt):"")));events.append(box);}
 $("check").disabled=!data;
}
document.querySelectorAll("[data-days]").forEach(b=>b.addEventListener("click",()=>{days=Number(b.dataset.days);document.querySelectorAll("[data-days]").forEach(x=>x.setAttribute("aria-pressed",String(x===b)));render();}));
$("check").addEventListener("click",async()=>{const b=$("check");b.disabled=true;$("manual-detail").textContent="Comprobando…";try{const result=await checkCms(fetch,data?.target);$("manual-detail").textContent=result.message+" · "+fmt(Date.now());}finally{b.disabled=!data;}});
render();
fetch("./status-history.json",{cache:"no-store"}).then(r=>{if(!r.ok)throw Error("Missing history");return r.json();}).then(raw=>{if(![1,2].includes(raw.version)||!TARGETS.includes(raw.target))throw Error("Invalid history");data=normalize(raw,raw.target);render();}).catch(()=>{$("updated").textContent="El histórico no está disponible; no se puede confirmar el estado.";});
