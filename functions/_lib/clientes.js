// Utilidades compartidas del módulo "Clientes Afectados" (cruce SmartOLT × Grafana).

// Datos personales (cédulas, teléfonos): SOLO estos roles, validado SIEMPRE en el servidor.
export const ROLES_CLIENTES = ["administrador", "supervisor"];

const sinTildes = (s) => String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "");
const limpio = (v, max = 300) => {
  const s = String(v ?? "").replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "").trim();
  return s ? s.slice(0, max) : null;
};

// Sucursal: mayúsculas y espacios simples ("Caracas  2" -> "CARACAS 2")
export function normSucursal(v) {
  return sinTildes(v).toUpperCase().replace(/\s+/g, " ").trim();
}
// Serial: mayúsculas, sin espacios ni signos
export function normSerial(v) {
  return sinTildes(v).toUpperCase().replace(/[^A-Z0-9]/g, "");
}
// Cédula: letra + 9 dígitos (V025213642). Sin letra: solo dígitos rellenados a 9.
export function normCedula(v) {
  const s = sinTildes(v).toUpperCase().replace(/[^A-Z0-9]/g, "");
  const m = /^([A-Z])?0*(\d+)$/.exec(s);
  if (!m) return null;
  const d = m[2].padStart(9, "0");
  return d.length > 9 ? null : (m[1] || "") + d;
}
// Nombre: sin tildes, ñ=n, guiones bajos como espacios, sin números ni signos
export function normNombre(v) {
  return sinTildes(v).toUpperCase().replace(/_/g, " ").replace(/[^A-Z\s]/g, " ").replace(/\s+/g, " ").trim();
}
// Sector: mayúsculas y espacios (para que no aparezca duplicado)
export function normSector(v) {
  return sinTildes(v).toUpperCase().replace(/\s+/g, " ").trim();
}
// dd-mm-aaaa -> aaaa-mm-dd (si no se reconoce, se guarda tal cual)
export function fechaISO(v) {
  const s = String(v ?? "").trim();
  const m = /^(\d{1,2})[-/](\d{1,2})[-/](\d{4})/.exec(s);
  return m ? `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}` : s || null;
}

// Convierte una fila del navegador en la fila de clientes_base (la normalización la hace el servidor).
export function filaCliente(r, cargaId, sucursal) {
  const cuenta = limpio(r.cuenta, 40);
  if (!cuenta) return null;
  return [
    cargaId, cuenta, limpio(r.estado_contrato, 30), fechaISO(r.fecha_creacion), sucursal,
    limpio(r.cedula, 30), normCedula(r.cedula), limpio(r.tipo_cliente, 60),
    limpio(r.nombre), normNombre(r.nombre), limpio(r.genero, 30),
    limpio(r.telefono_casa, 60), limpio(r.telefono_oficina, 60), limpio(r.correo, 200), limpio(r.correo_iptv, 200),
    limpio(r.serial_onu, 80), normSerial(r.serial_onu) || null,
    limpio(r.estado_geo, 100), limpio(r.direccion, 600), limpio(r.municipio, 100), limpio(r.parroquia, 100),
    limpio(r.sector, 150), normSector(r.sector) || null, limpio(r.plan, 150),
  ];
}
export const SQL_INSERT_CLIENTE =
  `INSERT OR IGNORE INTO clientes_base (carga_id, cuenta, estado_contrato, fecha_creacion, sucursal, cedula, cedula_norm, tipo_cliente,
     nombre, nombre_norm, genero, telefono_casa, telefono_oficina, correo, correo_iptv, serial_onu, serial_norm,
     estado_geo, direccion, municipio, parroquia, sector, sector_norm, plan)
   VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`;

export const FECHA_BASE_OK = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/;
