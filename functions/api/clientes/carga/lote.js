import { json, badRequest, requireRole } from "../../../_lib/helpers.js";
import { ROLES_CLIENTES, filaCliente, SQL_INSERT_CLIENTE } from "../../../_lib/clientes.js";

const MAX_LOTE = 500;
// Posiciones de filaCliente(): 0 clave, 1 carga_id, 2 cuenta, ... (carga_id no cuenta como cambio)
const COLS = ["clave", "carga_id", "cuenta", "estado_contrato", "fecha_creacion", "sucursal", "cedula", "cedula_norm", "tipo_cliente",
  "nombre", "nombre_norm", "genero", "telefono_casa", "telefono_oficina", "correo", "correo_iptv", "serial_onu", "serial_norm",
  "estado_geo", "direccion", "municipio", "parroquia", "sector", "sector_norm", "plan"];

// POST /api/clientes/carga/lote   Body: { carga_id, filas: [ {cuenta, nombre, ...} ] }
// La base de cada sucursal se REEMPLAZA con el archivo, pero solo se escribe lo que cambió (plan gratuito de D1):
//   * ONU nueva                          -> se agrega
//   * misma ONU, mismos datos            -> se salta (no cuesta escritura)
//   * misma ONU, algún dato distinto     -> se actualiza (cliente nuevo en la ONU, teléfono, dirección, etc.)
//   * esa ONU ya está en OTRA sucursal con otra cuenta -> gana la de fecha de contrato más reciente (si empatan, la que ya estaba) y se reporta
// Respuesta: { nuevas, cambiadas, existentes, conflictos: [{serial, conservada:{...}, descartada:{...}}] }
export async function onRequestPost({ request, env }) {
  const no = await requireRole(env.DB, request, ROLES_CLIENTES);
  if (no) return no;
  const b = await request.json();
  const filas = Array.isArray(b.filas) ? b.filas : [];
  if (!filas.length) return badRequest("El lote viene vacío.");
  if (filas.length > MAX_LOTE) return badRequest(`El lote no puede pasar de ${MAX_LOTE} filas.`);
  const carga = await env.DB.prepare("SELECT id, sucursal, estado FROM cargas_base WHERE id = ?").bind(Number(b.carga_id)).first();
  if (!carga) return badRequest("La carga no existe.");
  if (carga.estado !== "cargando") return badRequest("Esta carga ya no admite más filas.");

  const params = [];
  const vistas = new Set();
  for (const f of filas) {
    const p = filaCliente(f || {}, carga.id, carga.sucursal);
    if (!p || vistas.has(p[0])) continue;
    vistas.add(p[0]); params.push(p);
  }
  const existentes = new Map();
  const claves = params.map((p) => p[0]);
  const lecturas = [];
  for (let i = 0; i < claves.length; i += 90) {
    const parte = claves.slice(i, i + 90);
    lecturas.push(env.DB.prepare(`SELECT ${COLS.join(", ")} FROM clientes_base WHERE clave IN (${parte.map(() => "?").join(",")})`).bind(...parte));
  }
  if (lecturas.length) (await env.DB.batch(lecturas)).forEach((r) => r.results.forEach((x) => existentes.set(x.clave, x)));

  let nuevas = 0, cambiadas = 0, iguales = 0;
  const conflictos = [];
  const stmts = [];
  const resumen = (cuenta, nombre, sucursal, fecha) => ({ cuenta, nombre, sucursal, fecha_creacion: fecha });
  for (const p of params) {
    const previa = existentes.get(p[0]);
    if (!previa) { nuevas++; stmts.push(env.DB.prepare(SQL_INSERT_CLIENTE).bind(...p)); continue; }
    if (previa.sucursal !== p[5] && previa.cuenta !== p[2]) {
      // misma ONU en otra sucursal con otra cuenta: gana el contrato más reciente
      const fNueva = p[4] || "", fPrev = previa.fecha_creacion || "";
      const nuevaGana = fNueva > fPrev;
      conflictos.push({ serial: p[17] || p[0],
        conservada: nuevaGana ? resumen(p[2], p[9], p[5], p[4]) : resumen(previa.cuenta, previa.nombre, previa.sucursal, previa.fecha_creacion),
        descartada: nuevaGana ? resumen(previa.cuenta, previa.nombre, previa.sucursal, previa.fecha_creacion) : resumen(p[2], p[9], p[5], p[4]) });
      if (!nuevaGana) { iguales++; continue; }
      cambiadas++; stmts.push(env.DB.prepare(SQL_INSERT_CLIENTE).bind(...p)); continue;
    }
    const igual = COLS.every((c, i) => i === 1 || (previa[c] ?? null) === (p[i] ?? null));
    if (igual) { iguales++; continue; }
    cambiadas++; stmts.push(env.DB.prepare(SQL_INSERT_CLIENTE).bind(...p));
  }
  if (stmts.length) await env.DB.batch(stmts);
  return json({ recibidas: filas.length, nuevas, cambiadas, existentes: iguales, conflictos });
}
