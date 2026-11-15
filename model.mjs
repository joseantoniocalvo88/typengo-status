export const INTERVAL=15*60*1000, DAY=24*60*60*1000, STALE=45*60*1000;
export const TARGETS=["https://deploy-preview-98--josecalvo-cms.netlify.app/api/health","https://typengo-staging.netlify.app/api/health","https://typengo.com/api/health"];
export const COMPONENTS=[{id:"cms",name:"CMS · HTTP",description:"Respuesta del endpoint de salud",monitored:true},{id:"web",name:"Web pública",description:"Respuesta HTML de TypeNGo",monitored:true},{id:"api",name:"API de contenidos",description:"Lectura y publicación de contenido",monitored:false},{id:"auth",name:"Acceso al CMS · HTTP",description:"Carga del formulario; no verifica credenciales ni permisos",monitored:true},{id:"db",name:"Base de datos y medios",description:"Persistencia y almacenamiento",monitored:false},{id:"ai",name:"Tigo AI · configuración",description:"Respuesta de configuración pública; no verifica inferencia",monitored:true}];
export const dateKey=t=>new Date(t).toISOString().slice(0,10);
export const validResult=r=>r&&["ok","unverified"].includes(r.state);
export function normalize(data,target){
 const samples=data?.target===target&&Array.isArray(data.samples)?data.samples:[];
 const result=new Map();
 for(const s of samples){const t=Date.parse(s?.checkedAt);if(!Number.isFinite(t))continue;
 const checks={};for(const c of COMPONENTS.filter(c=>c.monitored)){const v=data.version===1?(c.id==="cms"?s:null):s.checks?.[c.id];if(validResult(v))checks[c.id]={state:v.state,httpStatus:Number.isInteger(v.httpStatus)?v.httpStatus:null,latencyMs:Number.isFinite(v.latencyMs)&&v.latencyMs>=0?Math.round(v.latencyMs):null};}
 if(Object.keys(checks).length)result.set(t,{checkedAt:new Date(t).toISOString(),checks});}
 return {version:2,target,samples:[...result.values()].sort((a,b)=>a.checkedAt.localeCompare(b.checkedAt)).slice(-12000)};
}
export function append(data,sample,target){if(!TARGETS.includes(target))throw Error("Unknown target");return normalize({version:2,target,samples:[...normalize(data,target).samples,sample]},target);}
export function latest(samples,id){return [...samples].reverse().find(s=>validResult(s.checks?.[id]));}
export function current(samples,id,now=Date.now()){const s=latest(samples,id);if(!s||now-Date.parse(s.checkedAt)>STALE||now<Date.parse(s.checkedAt))return "unknown";return s.checks[id].state;}
export function daily(samples,id,days=90,now=Date.now()){
 const end=Date.parse(dateKey(now)), first=end-(days-1)*DAY;
 const buckets=Array.from({length:days},(_,i)=>({date:dateKey(first+i*DAY),ok:0,unverified:0,slots:0,expected:i===days-1?Math.max(1,Math.floor((now-end)/INTERVAL)+1):96}));
 const slots=new Map();
 for(const s of samples){const t=Date.parse(s.checkedAt),v=s.checks?.[id];if(!validResult(v)||t<first||t>now)continue;const k=Math.floor(t/INTERVAL);const old=slots.get(k);if(!old||v.state==="unverified")slots.set(k,v.state);}
 for(const [k,v] of slots){const i=Math.floor((k*INTERVAL-first)/DAY);if(buckets[i]){buckets[i][v]++;buckets[i].slots++;}}
 return buckets;
}
export function incidents(samples,id){
 const output=[];let previous=null,streak=0,open=null,success=0;
 for(const s of samples){const v=s.checks?.[id];if(!validResult(v))continue;const t=Date.parse(s.checkedAt);
 if(previous&&t-Date.parse(previous.checkedAt)>STALE){if(open){open.lastSeen=previous.checkedAt;open.state="unknown";open=null;}streak=0;success=0;previous=null;}
 if(v.state==="unverified"){success=0;streak++;if(streak===2&&!open){open={id,startedAt:previous.checkedAt,confirmedAt:s.checkedAt,lastSeen:s.checkedAt,state:"investigating"};output.push(open);}if(open)open.lastSeen=s.checkedAt;}
 else{streak=0;if(open){success++;open.lastSeen=s.checkedAt;if(success>=2){open.state="resolved";open.resolvedAt=s.checkedAt;open=null;success=0;}}}
 previous=s;}
 return output;
}
export function allIncidents(samples){return COMPONENTS.filter(c=>c.monitored).flatMap(c=>incidents(samples,c.id)).sort((a,b)=>b.startedAt.localeCompare(a.startedAt));}
