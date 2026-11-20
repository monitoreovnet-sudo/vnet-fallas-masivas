# Cambio 052 — Sincronización eficiente de la Pizarra

## Archivos modificados

- `migration_052_sync_estado.sql`: crea `sync_estado` y nueve triggers para `tickets`, `ticket_puertos` y `oficinas`.
- `functions/api/cambios.js`: reemplaza los tres cálculos de conteo/fecha por un `SELECT version` sobre la fila `id = 1`.
- `public/app.js`: cambia el sondeo de TV a 60 segundos, lo limita al horario 05:45–00:15 de `America/Caracas`, distingue `401` de errores de conexión y conserva la Pizarra visible ante fallos de red.
- `public/index.html` y `public/styles.css`: agregan un aviso de estado de conexión para la TV.

## Orden de aplicación (cuando se autorice)

1. Respaldar la base D1.
2. Desde la carpeta del proyecto, aplicar una sola vez la migración:

   ```bash
   npx wrangler d1 execute vnet_fallas_masivas --remote --file=./migration_052_sync_estado.sql
   ```

3. Verificar que `sync_estado` tenga una fila con `id = 1` y que los nueve triggers existan.
4. Desplegar el código actualizado.
5. Abrir la TV autenticada y comprobar que la huella cambia al crear, editar o eliminar tickets, puertos y oficinas.

**No se ha ejecutado ninguno de estos pasos contra Cloudflare.** La migración solo fue probada en una base SQLite temporal.

## Pruebas locales realizadas

- `node --check public/app.js`: correcto.
- `node --check functions/api/cambios.js`: correcto.
- Ejecución de `schema.sql` y `migration_052_sync_estado.sql` en SQLite temporal: correcta.
- Inserción, actualización y eliminación de `tickets`: incremento detectado.
- Inserción, actualización y eliminación de `ticket_puertos`: incremento detectado.
- Inserción, actualización y eliminación de `oficinas`: incremento detectado.
- Reejecución de la migración: correcta; mantiene una sola fila en `sync_estado`.

## Alcance y pendientes

Este cambio optimiza el sondeo de la TV. No modifica todavía la consulta pesada de auditoría de ONUs ni la agrupación global de puertos en `/api/consulta`; esas consultas requieren una optimización independiente. Tampoco cambia la duración general de las sesiones de usuario.
