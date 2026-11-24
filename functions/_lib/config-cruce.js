// Interruptor del cruce con la base de Grafana dentro de ESTA app.
// false = la app ya no cruza las ONUs con Grafana ni alimenta el "mapa de clientes" al cargar archivos en los tickets.
// Los datos del cliente ahora llegan en el archivo ya cruzado (flujo 1, app "Clientes por OLT").
// Para reactivar el cruce interno basta cambiar a true (y restaurar las llamadas del navegador en public/app.js).
export const CRUCE_GRAFANA_ACTIVO = false;
export const MSG_CRUCE_DESACTIVADO = "El cruce con Grafana está desactivado en esta aplicación: los datos del cliente vienen en el archivo ya cruzado.";
