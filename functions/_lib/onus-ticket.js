// Guardado de las ONUs de un ticket (ticket_onus).
// Flujo 2 (SmartOLT solo): solo los datos de la ONU.
// Flujo 1 (archivo ya cruzado): la ONU trae además el bloque "cli" y se guardan los datos del cliente en las columnas cli_*.
import { normCedula, normSerial } from "./clientes.js";

const t = (v, n) => String(v ?? "").trim().slice(0, n) || null;

export function sentenciaOnuTicket(db, ticketId, o, ahora) {
  const base = [ticketId, t(o.olt, 80), t(o.tarjeta, 30), t(o.puerto, 30), normSerial(o.serial) || null, t(String(o.cuenta ?? "").replace(/\D/g, ""), 20),
    normCedula(o.cedula), t(o.nombre, 200), t(o.estado, 40), t(o.direccion, 300), ahora];
  const c = o.cli && typeof o.cli === "object" ? o.cli : null;
  const cuenta = c ? t(String(c.cuenta ?? "").replace(/\D/g, ""), 20) : null;
  if (!cuenta) {
    return db.prepare("INSERT INTO ticket_onus (ticket_id, olt, tarjeta, puerto, serial, cuenta, cedula, nombre, estado, direccion, creado_en) VALUES (?,?,?,?,?,?,?,?,?,?,?)").bind(...base);
  }
  return db.prepare(
    `INSERT INTO ticket_onus (ticket_id, olt, tarjeta, puerto, serial, cuenta, cedula, nombre, estado, direccion, creado_en,
       cli_cuenta, cli_nombre, cli_cedula, cli_correo, cli_tel_casa, cli_tel_oficina, cli_direccion, cli_municipio, cli_sector,
       cli_estado_contrato, cli_sucursal, cruce_metodo, cruce_fecha)
     VALUES (?,?,?,?,?,?,?,?,?,?,?, ?,?,?,?,?,?,?,?,?, ?,?,?,?)`)
    .bind(...base, cuenta, t(c.nombre, 200), normCedula(c.cedula) || t(c.cedula, 20), t(c.correo, 120), t(c.tel_casa, 40), t(c.tel_oficina, 40),
      t(c.direccion, 300), t(c.municipio, 80), t(c.sector, 120), t(c.estado_contrato, 40), t(c.sucursal, 60), "archivo_cruzado", ahora);
}
