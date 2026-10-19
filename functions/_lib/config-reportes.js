// Configuración del "Generador de reportes": qué columnas se ven, en qué orden, con qué ancho y tipografía.
export const REPORTES_VALIDOS = ["piz", "rep"];

export async function asegurarTablaConfig(db) {
  await db.prepare(
    `CREATE TABLE IF NOT EXISTS config_reportes (
       reporte TEXT PRIMARY KEY, config TEXT NOT NULL, actualizado_por TEXT, actualizado_en TEXT)`
  ).run();
}

// Valida y normaliza lo que llega del navegador (nunca se guarda tal cual). Devuelve { config } o { error }.
export function sanearConfigReporte(entrada) {
  if (!entrada || !Array.isArray(entrada.columnas)) return { error: "Configuración inválida: faltan las columnas." };
  if (entrada.columnas.length < 1 || entrada.columnas.length > 40) return { error: "Cantidad de columnas inválida." };
  const vistos = new Set();
  const columnas = [];
  for (const c of entrada.columnas) {
    const id = String((c && c.id) ?? "");
    if (!/^[a-z0-9_]{1,40}$/.test(id) || vistos.has(id)) return { error: `Columna inválida o repetida: "${id}".` };
    vistos.add(id);
    const entero = (v, min, max) => {
      if (v === null || v === undefined || v === "") return null;
      const n = Math.round(Number(v));
      if (!Number.isFinite(n) || n < min || n > max) return undefined;
      return n;
    };
    const ancho = entero(c.ancho, 30, 900);
    const fontSize = entero(c.fontSize, 8, 28);
    if (ancho === undefined) return { error: `Ancho fuera de rango (30–900 px) en "${id}".` };
    if (fontSize === undefined) return { error: `Tamaño de letra fuera de rango (8–28) en "${id}".` };
    columnas.push({
      id,
      visible: c.visible !== false,
      titulo: String(c.titulo ?? "").trim().slice(0, 60),
      ancho,
      fontSize,
      negrita: !!c.negrita,
      cursiva: !!c.cursiva,
      subrayado: !!c.subrayado,
    });
  }
  if (!columnas.some((c) => c.visible)) return { error: "Debe quedar al menos una columna visible." };
  return { config: { version: 1, columnas } };
}
