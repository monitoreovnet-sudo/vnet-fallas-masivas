// Configuración del "Generador de reportes": qué columnas se ven, en qué orden, con qué alias, ancho y tipografía.
// Formato guardado (JSON en config_reportes.config):
//   { version: 2, columnas: [ { db_column_name: "tickets.estado_ticket", display_name: "Estado",
//                               visible, ancho, fontSize, negrita, cursiva, subrayado } ] }
import { etiquetaSugerida } from "./campos-reportes.js";

export const REPORTES_VALIDOS = ["piz", "rep"];

export async function asegurarTablaConfig(db) {
  await db.prepare(
    `CREATE TABLE IF NOT EXISTS config_reportes (
       reporte TEXT PRIMARY KEY, config TEXT NOT NULL, actualizado_por TEXT, actualizado_en TEXT)`
  ).run();
}

// Valida y normaliza lo que llega del navegador (nunca se guarda tal cual).
// "permitidas" = conjunto de db_column_name que existen de verdad (columnas de la BD + campos calculados).
export function sanearConfigReporte(entrada, permitidas) {
  if (!entrada || !Array.isArray(entrada.columnas)) return { error: "Configuración inválida: faltan las columnas." };
  if (entrada.columnas.length < 1 || entrada.columnas.length > 60) return { error: "Cantidad de columnas inválida (1 a 60)." };
  const vistos = new Set();
  const columnas = [];
  for (const c of entrada.columnas) {
    const clave = String((c && c.db_column_name) ?? "");
    if (!/^[a-z_]+\.[a-z0-9_]{1,40}$/.test(clave) || !permitidas.has(clave)) return { error: `Columna desconocida: "${clave}".` };
    if (vistos.has(clave)) return { error: `Columna repetida: "${clave}".` };
    vistos.add(clave);
    const entero = (v, min, max) => {
      if (v === null || v === undefined || v === "") return null;
      const n = Math.round(Number(v));
      if (!Number.isFinite(n) || n < min || n > max) return undefined;
      return n;
    };
    const ancho = entero(c.ancho, 30, 900);
    const fontSize = entero(c.fontSize, 8, 28);
    if (ancho === undefined) return { error: `Ancho fuera de rango (30–900 px) en "${clave}".` };
    if (fontSize === undefined) return { error: `Tamaño de letra fuera de rango (8–28) en "${clave}".` };
    columnas.push({
      db_column_name: clave,
      display_name: String(c.display_name ?? "").trim().slice(0, 60) || etiquetaSugerida(clave),
      visible: c.visible !== false,
      ancho,
      fontSize,
      negrita: !!c.negrita,
      cursiva: !!c.cursiva,
      subrayado: !!c.subrayado,
    });
  }
  if (!columnas.some((c) => c.visible)) return { error: "Debe quedar al menos una columna visible." };
  return { config: { version: 2, columnas } };
}
