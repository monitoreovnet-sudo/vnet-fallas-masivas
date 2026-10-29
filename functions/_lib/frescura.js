import { normSucursal } from "./clientes.js";

// Semáforo de frescura de la base de clientes por sucursal (días calendario, hora de Caracas):
// 0-1 verde · 2 amarillo · 3 naranja · 4 o más rojo · sin base: rojo.
export function semaforoDias(dias) { return dias === null ? "sin_base" : dias <= 1 ? "verde" : dias === 2 ? "amarillo" : dias === 3 ? "naranja" : "rojo"; }
export function diasEntre(fechaBase, ahoraCaracasISO) {
  const a = /^(\d{4})-(\d{2})-(\d{2})/.exec(fechaBase || ""), b = /^(\d{4})-(\d{2})-(\d{2})/.exec(ahoraCaracasISO);
  if (!a || !b) return null;
  return Math.round((Date.UTC(+b[1], +b[2] - 1, +b[3]) - Date.UTC(+a[1], +a[2] - 1, +a[3])) / 86400000);
}
export function armarFrescura(oficinas, bases, ahoraCaracasISO) {
  const porNombre = new Map(bases.map((b) => [normSucursal(b.sucursal), b]));
  const grupos = new Map();
  for (const o of oficinas) {
    // Todo lo de estado DISTRITO CAPITAL es "Caracas" para la base de Grafana
    const estado = normSucursal(o.estado);
    const alias = [normSucursal(String(o.nombre).replace(/^.*?\s-\s/, "")), normSucursal(o.localidad), normSucursal(o.nombre),
      estado === "DISTRITO CAPITAL" ? "CARACAS" : estado].filter(Boolean);
    const base = alias.map((a) => porNombre.get(a)).find(Boolean) || null;
    const clave = base ? base.sucursal : normSucursal(o.localidad) || normSucursal(o.nombre);
    if (!grupos.has(clave)) grupos.set(clave, { sucursal: clave, base, oficinas: [], tickets: 0 });
    const g = grupos.get(clave);
    g.oficinas.push(o.nombre); g.tickets += o.tickets;
  }
  return [...grupos.values()].map((g) => {
    const dias = g.base ? diasEntre(g.base.fecha_base, ahoraCaracasISO) : null;
    return { sucursal: g.sucursal, oficinas: g.oficinas, tickets_activos: g.tickets, fecha_base: g.base ? g.base.fecha_base : null,
      archivo: g.base ? g.base.archivo : null, dias, semaforo: semaforoDias(dias) };
  }).sort((a, b) => (b.dias ?? 999) - (a.dias ?? 999) || a.sucursal.localeCompare(b.sucursal));
}

