import { json, requireAdmin } from "../../_lib/helpers.js";
import { columnasBD, CAMPOS_CALCULADOS, TABLAS_REPORTE } from "../../_lib/campos-reportes.js";

// GET /api/admin/campos-reportes → todas las columnas disponibles para armar informes
// { tablas: [{tabla, etiqueta}], columnas: [{db_column_name, tabla, columna, tipo, etiqueta}], calculados: [...] }
export async function onRequestGet({ request, env }) {
  await requireAdmin(request, env);
  const columnas = await columnasBD(env.DB);
  const tablas = Object.entries(TABLAS_REPORTE).map(([tabla, v]) => ({ tabla, etiqueta: v.etiqueta }));
  return json({ tablas, columnas, calculados: CAMPOS_CALCULADOS });
}
