export async function checkCms(fetchImpl=globalThis.fetch,url="https://typengo.com/api/health"){
  if(!["https://typengo.com/api/health","https://deploy-preview-98--josecalvo-cms.netlify.app/api/health"].includes(url))return {state:"unverified",message:"Destino no autorizado."};
  try{
    const response=await fetchImpl(url,{cache:"no-store",credentials:"omit",redirect:"error",signal:AbortSignal.timeout(5000)});
    if(!response.ok)return {state:"unverified",message:"No se ha podido verificar el servicio (HTTP "+response.status+")."};
    const data=await response.json();
    return data?.service==="typengo-cms"&&data?.scope==="http-liveness"&&data?.status==="ok"?
      {state:"ok",message:"El CMS responde correctamente por HTTP."}:
      {state:"unverified",message:"La respuesta no coincide con el contrato de monitorización."};
  }catch{return {state:"unverified",message:"Sin respuesta verificable desde este navegador."};}
}
