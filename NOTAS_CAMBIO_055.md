# Cambio 055

1. Oculta también "Repositorio de clientes" (TABS_OCULTAS en public/app.js). No borra nada; para mostrarla, quitar "repositorio" de esa lista.
2. Aviso al crear/editar: mientras una escritura de tickets espera respuesta se muestra un aviso fijo arriba con las instrucciones.
   Si se repite exactamente la misma solicitud mientras la anterior sigue en curso, no se envía otra vez (evita tickets duplicados por doble clic).
3. Diagnóstico de la demora: functions/_middleware.js agrega la cabecera Server-Timing (F12 > Network > la solicitud > Timing / Headers)
   y deja un registro "[lento]" en Cloudflare si el servidor tarda más de 5 s. En el navegador, la consola avisa "[lento]" si una escritura tarda más de 15 s.

Archivos: public/app.js (incluye 052, 053 y 054) y functions/_middleware.js. Sin migración.
