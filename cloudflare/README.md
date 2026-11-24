# Monitor directo de TypeNGo en Cloudflare

- Worker `typengo-status-clock`, cron `*/15 * * * *` en UTC y binding D1 `STATUS_DB` a `typengo-status-history`.
- El Worker recoge las cuatro sondas HTTP de producción y registra la hora real de inicio y la hora programada. D1 conserva las muestras por día y admite una escritura por intervalo efectivo de 15 minutos. Los intervalos omitidos quedan sin datos.
- La primera ejecución que obtiene el histórico de GitHub Pages lo archiva en D1 con las horas originales. Se conserva la fuente estática de respaldo. La página combina los dos orígenes y, ante una coincidencia de intervalo, usa la muestra directa de Cloudflare.
- El Worker transmite `/status-history.json` por días con deduplicación en SQLite. El navegador pide los datos recientes tras la primera carga y el RSS conserva su URL en GitHub Pages. El navegador continúa con su comprobación HTTP individual cada 60 segundos para la pestaña visible. Las peticiones HTTP públicas del Worker son de lectura.
- GitHub Pages sigue sirviendo la aplicación estática. El cron de GitHub conserva su programación original y sincroniza las muestras de Cloudflare. Si el último dato de Cloudflare lleva 27 minutos sin actualizarse, el flujo puede tomar una muestra de respaldo cuando haya pasado un intervalo desde la última observación. Los dispatch manuales permiten una comprobación inmediata.
- Cloudflare registra aperturas y recuperaciones en los logs privados del Worker. GitHub Actions señala las nuevas aperturas al sincronizarlas. El flujo `notification-test` verifica la señal de Actions de forma aislada. Su entrega privada depende de la configuración de notificaciones del propietario de la cuenta.

## Implementación y pruebas

```sh
node --test tests.mjs cloudflare/worker.test.mjs
node cloudflare/bundle.mjs > worker-dashboard.mjs
node --check worker-dashboard.mjs
```

Wrangler usa directamente `cloudflare/wrangler.jsonc`. El bundle reproduce el despliegue manual en el editor de Cloudflare. Después de un despliegue desde el editor del panel, revisa el cron y vuelve a guardarlo si falta. El segundo despliegue manual retiró el trigger anterior. El código comparte contratos HTTP y reglas de incidencias con GitHub. Este despliegue usa el binding de la base y prescinde de credenciales de GitHub.

## Verificación operativa

1. Ejecutar **Verify Cloudflare Status cron** en GitHub Actions con el inicio de la ventana UTC. Confirmar tres cron consecutivos con `recorded: true` en Observability. Comparar `scheduledAt` y `checkedAt`.
2. Consultar el JSON público y verificar que incluye las tres muestras con `source: "cloudflare"`, los cuatro resultados por muestra y las fechas anteriores a la migración.
3. Comprobar que el fallback de GitHub restaura el artefacto anterior y publica una instantánea funcional.
4. La prueba de notificaciones se dispara manualmente con `source=notification-test`. Falla a propósito y omite colector y despliegue. Confirmar por separado la recepción privada si está habilitada.

[Panel del Worker](https://dash.cloudflare.com/3807084ce9844c9a23f0d96f810484b5/workers/services/view/typengo-status-clock/production) · [Histórico directo](https://typengo-status-clock.joseantonio-calvo88.workers.dev/status-history.json) · [GitHub Actions](https://github.com/joseantoniocalvo88/typengo-status/actions)
