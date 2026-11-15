import {TARGETS} from "./model.mjs";
export async function checkCms(fetchImpl=globalThis.fetch,url){
 if(!TARGETS.includes(url))return {state:"unverified",message:"No hay un destino verificado."};
 try{const res=await fetchImpl(url,{cache:"no-store",credentials:"omit",redirect:"error",signal:AbortSignal.timeout(8000)});
 const data=await res.json();if(!res.ok||data?.service!=="typengo-cms"||data?.scope!=="http-liveness"||data?.status!=="ok")throw Error("contract");
 return {state:"ok",message:"Respuesta HTTP correcta desde tu navegador."};
 }catch{return {state:"unverified",message:"Respuesta no verificada desde tu navegador."};}
}
