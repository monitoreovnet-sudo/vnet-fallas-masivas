import { TOPE_DIA, MARGEN, usadoHoy, lecturasHoy, sinCupoLectura } from "./uso-d1.js";

export const TOPE_NOCHE = 60000;   // cambios que la cola puede escribir por día (el resto del tope diario queda para el trabajo normal)

// Cupo que queda hoy (día UTC de D1) para la cola: lo que falte del tope de la cola y del tope diario de toda la app
export async function presupuestoNoche(db) {
  let usadoNoche = 0;
  try {
    const r = await db.prepare("SELECT filas FROM uso_d1 WHERE dia = date('now') AND origen = 'cola_noche'").first();
    usadoNoche = Number((r && r.filas) || 0);
  } catch (e) { /* sin migración 043 */ }
  const usado = await usadoHoy(db);
  return { usadoNoche, usado, restante: sinCupoLectura(await lecturasHoy(db)) ? 0 : Math.max(0, Math.min(TOPE_NOCHE - usadoNoche, TOPE_DIA - MARGEN - usado)) };
}
