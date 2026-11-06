// Mapa de clientes por OLT / tarjeta / puerto: cada ONU de SmartOLT (en cualquier estado) que cruza con Grafana se guarda aquí.
// Solo se escribe lo nuevo o lo que cambió de lugar o de cuenta (1 escritura por cliente nuevo + 1 del índice); lo repetido no cuesta nada.
import { escrituras } from "./uso-d1.js";
const trozos = (a, n) => { const r = []; for (let i = 0; i < a.length; i += n) r.push(a.slice(i, i + n)); return r; };

const SQL_REEMPLAZAR =
  `INSERT OR REPLACE INTO clientes_olt (clave, sn_norm, cuenta, olt, tarjeta, puerto, onu_num, estado_onu, visto, nombre, telefono_casa, telefono_oficina, correo, sector, direccion,
     municipio, parroquia, estado_contrato, sucursal, cedula, estado_geo, ubicacion) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`;
const SQL_ESTADO = "UPDATE clientes_olt SET estado_onu = ?, visto = ?, ubicacion = COALESCE(?, ubicacion) WHERE clave = ?";
const SQL_CONTEO = "INSERT INTO olt_conteo (olt, n) VALUES (?, ?) ON CONFLICT(olt) DO UPDATE SET n = n + excluded.n";

const fila = (clave, it, c, olt, tar, pue, ubic) => [clave, it.sn_norm || null, c.cuenta, olt, tar, pue, it.onu_num || null, it.status || null, it.visto || null,
  c.nombre || null, c.telefono_casa || null, c.telefono_oficina || null, c.correo || null, c.sector || null, c.direccion || null,
  c.municipio || null, c.parroquia || null, c.estado_contrato || null, c.sucursal || null, c.cedula || null, c.estado_geo || "", ubic];

// items: [{ sn_norm, cliente: {cuenta, nombre, ...}, olt, tarjeta, puerto, onu_num, status, visto }]  (solo ONUs que cruzaron)
export async function registrarMapa(db, items) {
  const porClave = new Map();
  for (const it of items) {
    if (!it || !it.cliente || !it.cliente.cuenta || !it.olt) continue;
    porClave.set(it.sn_norm || "C-" + it.cliente.cuenta, it);
  }
  if (!porClave.size) return { nuevos: 0, actualizados: 0, escrituras: 0 };
  const claves = [...porClave.keys()];
  const previas = new Map();
  const lecturas = trozos(claves, 90).map((p) => db.prepare(`SELECT clave, olt, tarjeta, puerto, cuenta, estado_onu, visto, estado_geo FROM clientes_olt WHERE clave IN (${p.map(() => "?").join(",")})`).bind(...p));
  (await db.batch(lecturas)).forEach((r) => r.results.forEach((x) => previas.set(x.clave, x)));

  const stmts = [], delta = new Map();
  let nuevos = 0, actualizados = 0;
  const sumar = (olt, n) => delta.set(olt, (delta.get(olt) || 0) + n);
  for (const [clave, it] of porClave) {
    const c = it.cliente, olt = String(it.olt).trim().toUpperCase();
    const tar = Number.isInteger(it.tarjeta) ? it.tarjeta : null, pue = Number.isInteger(it.puerto) ? it.puerto : null;
    const p = previas.get(clave);
    const ubic = it.ubicacion ? String(it.ubicacion).slice(0, 300) : null;
    if (p) {
      // Una auditoría más vieja que lo ya guardado no pisa el estado más reciente
      const vieja = it.visto && p.visto && String(it.visto) < String(p.visto);
      const mismoLugar = p.olt === olt && p.tarjeta === tar && p.puerto === pue && p.cuenta === c.cuenta;
      if (vieja) continue;
      if (mismoLugar) {
        // Solo cambia el estado de la ONU (o falta completar los datos nuevos): una escritura
        const cambioEstado = (it.status || null) !== (p.estado_onu || null);
        const faltaDatos = p.estado_geo === null && c.estado_geo;
        if (!cambioEstado && !faltaDatos) continue;
        if (faltaDatos) { actualizados++; stmts.push(db.prepare(SQL_REEMPLAZAR).bind(...fila(clave, it, c, olt, tar, pue, ubic))); continue; }
        actualizados++; stmts.push(db.prepare(SQL_ESTADO).bind(it.status || null, it.visto || null, ubic, clave)); continue;
      }
      actualizados++; if (p.olt !== olt) { sumar(p.olt, -1); sumar(olt, 1); }
    } else { nuevos++; sumar(olt, 1); }
    stmts.push(db.prepare(SQL_REEMPLAZAR).bind(...fila(clave, it, c, olt, tar, pue, ubic)));
  }
  for (const [olt, n] of delta) if (n) stmts.push(db.prepare(SQL_CONTEO).bind(olt, n));
  let esc = 0;
  for (const parte of trozos(stmts, 90)) esc += escrituras(await db.batch(parte));
  return { nuevos, actualizados, escrituras: esc };
}
