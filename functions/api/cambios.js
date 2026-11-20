import { json } from "../_lib/helpers.js";

// GET /api/cambios (requiere sesión)
// Lee una única fila. La versión se incrementa mediante triggers de SQLite
// cuando cambian tickets, puertos u oficinas que alimentan la Pizarra.
export async function onRequestGet({ env }) {
  const estado = await env.DB
    .prepare("SELECT version FROM sync_estado WHERE id = 1")
    .first();

  if (!estado) {
    return json({ error: "La sincronización de la Pizarra aún no está inicializada. Aplica la migración 052." }, 503);
  }

  return json({ huella: String(estado.version) });
}
