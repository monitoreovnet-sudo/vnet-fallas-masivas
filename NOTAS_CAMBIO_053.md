# Cambio 053 — Sin cruce con Grafana ni mapa; flujo 1 (archivo ya cruzado) y flujo 2 (SmartOLT solo)

No requiere migración: las columnas cli_* de ticket_onus ya existen (migración 040).

## Qué cambia
1. El cruce con Grafana y el mapa de clientes quedan desactivados al crear/editar tickets (interruptor en functions/_lib/config-cruce.js).
2. Al cargar archivos en Crear Ticket y Editar Ticket, la app reconoce el tipo por sus encabezados:
   - Flujo 2: CSV de SmartOLT -> llena OLT, tarjeta, puerto, afectados. Sin datos de clientes.
   - Flujo 1: archivo ya cruzado (Excel o CSV con "Nro. de contrato" y "Serial ONU") -> además guarda los datos del cliente con las ONU del ticket.
   - Mezclar ambos tipos en una misma carga se rechaza con un mensaje.

## Archivos (copiar respetando carpetas)
- functions/_lib/config-cruce.js (nuevo)
- functions/_lib/onus-ticket.js (nuevo)
- functions/api/tickets/index.js
- functions/api/tickets/[id]/smartolt.js
- functions/api/tickets/[id]/cruzar.js
- functions/api/clientes/mapa/lote.js
- functions/api/clientes/cruce-tickets.js
- public/app.js (incluye los ajustes del cambio 052)
- public/index.html

## No se tocó
Módulo de Auditoría (clientes/auditoria/*), cron nocturno de Grafana, base de Grafana en D1, consulta.js y recalcularConteos.

## Reversible
Poner CRUCE_GRAFANA_ACTIVO = true en config-cruce.js reactiva el servidor; las llamadas del navegador se quitaron de app.js.
