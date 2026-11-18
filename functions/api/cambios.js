import { json } from "../_lib/helpers.js";

// GET /api/cambios   (requiere sesión)
// Devuelve una "huella" muy liviana de la información de tickets: cambia cada vez que se crea, edita o elimina algo.
// La pantalla de la TV la consulta cada pocos segundos y solo recarga la Pizarra cuando la huella cambia.
export async function onRequestGet({ env }) {
  const r = await env.DB.batch([
    env.DB.prepare("SELECT COUNT(*) AS n, MAX(actualizado_en) AS m FROM tickets"),
    env.DB.prepare("SELECT COUNT(*) AS n, MAX(actualizado_en) AS m FROM ticket_puertos"),
    env.DB.prepare("SELECT MAX(id) AS m FROM ticket_log"),
  ]);
  const [t, p, l] = r.map((x) => x.results[0] || {});
  return json({ huella: `${t.n}|${t.m}|${p.n}|${p.m}|${l.m}` });
}
