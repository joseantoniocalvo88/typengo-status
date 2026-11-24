# Activar el reloj externo de TypeNGo Status

El Worker dispara el flujo de comprobaciones existente desde Cloudflare cada 15 minutos. El colector, histórico real, RSS y publicación en GitHub Pages siguen en GitHub. Los retrasos de la cola de Actions siguen siendo posibles; no se promete una periodicidad exacta.

## Activación (propietario de las cuentas)

1. Crear un fine-grained personal access token de GitHub, restringido exclusivamente a `joseantoniocalvo88/typengo-status`, con permiso de repositorio Actions: Read and write (Metadata: Read automático). Establecer una fecha de caducidad y renovarlo antes de ella. No incluir el repositorio privado CMS. No compartir el token ni escribirlo en Git.
2. En Cloudflare Workers & Pages, crear un Worker independiente llamado `typengo-status-clock`.
3. Copiar el código completo de `cloudflare/worker.mjs` al editor del Worker y desplegarlo.
4. En Settings > Variables and Secrets, crear un secreto `GITHUB_STATUS_TOKEN` con el token de GitHub.
5. Añadir el Cron Trigger `*/15 * * * *` (UTC) en la configuración de Triggers. El Worker no necesita ruta pública. Alternativamente, usar Wrangler desde el directorio cloudflare, con el archivo wrangler.jsonc incluido, y configurar el secreto mediante `npx wrangler secret put GITHUB_STATUS_TOKEN`.
6. Verificar en Cloudflare los eventos programados y en GitHub Actions las ejecuciones workflow_dispatch con source=cloudflare. Confirmar al menos tres ciclos consecutivos, que collect y deploy completan, y que status-history.json conserva las muestras anteriores y añade muestras nuevas.

El código acepta únicamente el endpoint de dispatch del repositorio público de estado y la rama main. El token solo se usa como cabecera de autenticación hacia GitHub. La ruta HTTP devuelve 404. No utiliza credenciales de npm, Supabase ni del CMS.

Durante el cambio se mantiene el cron existente como respaldo. El workflow serializa las ejecuciones y omite una nueva muestra automática cuando la última es de hace menos de 12 minutos. Tras comprobar que el reloj de Cloudflare funciona, se puede reducir o retirar el cron de GitHub. No desactivar el workflow completo.

Un dispatch HTTP 200/204 acredita que GitHub aceptó la solicitud, no que las comprobaciones o el despliegue hayan terminado. Si falla el envío, el Worker registra el código HTTP sin mostrar el cuerpo de la respuesta ni el token.

## Referencias

- https://developers.cloudflare.com/workers/configuration/cron-triggers/
- https://docs.github.com/en/rest/actions/workflows#create-a-workflow-dispatch-event
