import { json } from "../_lib/helpers.js";

const MS_HORA = 3600000;

function semaforo(horasAbierta) {
  const dias = horasAbierta / 24;
  if (dias < 1) return "VERDE";
  if (dias < 2) return "AMARILLO";
  if (dias < 3) return "NARANJA";
  return "ROJO";
}

function grupoHorario(fechaIso) {
  if (!fechaIso) return null;
  const hora = new Date(fechaIso).getHours();
  if (hora >= 6 && hora < 12) return "MAÑANA";
  if (hora >= 12 && hora < 18) return "TARDE";
  return "NOCHE";
}

function partesFecha(fechaIso) {
  if (!fechaIso) return { dia: null, mes: null, anio: null };
  const d = new Date(fechaIso);
  return { dia: d.getDate(), mes: d.getMonth() + 1, anio: d.getFullYear() };
}

// GET /api/consulta
// Filtros por query string: ticket_cmr, tickets_vinculados (texto, LIKE),
// dia_apertura, mes_apertura, anio_apertura, dia_cierre, mes_cierre, anio_cierre,
// categoria_afectacion, afectacion, grupo_horario, semaforo, estado_ticket
// (valor especial "__ABIERTOS__" = distinto de CERRADO), unidad_resolutoria,
// oficina_id, region (Estado/provincia de la oficina), olt.
export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);
  const p = (nombre) => url.searchParams.get(nombre) || "";

  let sql = `
    SELECT
      t.id AS ticket_id, t.ticket_cmr, t.tickets_vinculados,
      t.fecha_apertura_cda, t.fecha_apertura_cmr,
      t.fecha_solucion_cmr, t.estado_ticket, t.unidad_resolutoria,
      t.categoria_afectacion, t.afectacion, t.comentario, t.descripcion, t.avance_cmr,
      p.id AS puerto_id, p.oficina_id, o.nombre AS oficina_nombre, o.estado AS region, o.localidad,
      p.olt, p.sector, p.edificio, p.tarjeta, p.puerto,
      p.no_clientes_reportaron, p.nro_clientes_afectados, p.estado_puerto
    FROM ticket_puertos p
    JOIN tickets t ON t.id = p.ticket_id
    LEFT JOIN oficinas o ON o.id = p.oficina_id
    WHERE 1 = 1
  `;
  const binds = [];

  if (p("ticket_cmr")) { sql += " AND t.ticket_cmr LIKE ?"; binds.push(`%${p("ticket_cmr")}%`); }
  if (p("tickets_vinculados")) { sql += " AND t.tickets_vinculados LIKE ?"; binds.push(`%${p("tickets_vinculados")}%`); }
  if (p("categoria_afectacion")) { sql += " AND t.categoria_afectacion = ?"; binds.push(p("categoria_afectacion")); }
  if (p("afectacion")) { sql += " AND t.afectacion = ?"; binds.push(p("afectacion")); }
  if (p("unidad_resolutoria")) { sql += " AND t.unidad_resolutoria = ?"; binds.push(p("unidad_resolutoria")); }
  if (p("oficina_id")) { sql += " AND p.oficina_id = ?"; binds.push(p("oficina_id")); }
  if (p("region")) { sql += " AND o.estado = ?"; binds.push(p("region")); }
  if (p("olt")) { sql += " AND p.olt = ?"; binds.push(p("olt")); }

  const estadoTicket = p("estado_ticket");
  if (estadoTicket === "__ABIERTOS__") {
    sql += " AND t.estado_ticket <> 'CERRADO'";
  } else if (estadoTicket) {
    sql += " AND t.estado_ticket = ?"; binds.push(estadoTicket);
  }

  sql += " ORDER BY t.ticket_cmr DESC, p.olt, p.tarjeta, p.puerto";

  const { results } = await env.DB.prepare(sql).bind(...binds).all();

  const ahora = Date.now();
  let filas = results.map((r) => {
    const inicio = r.fecha_apertura_cmr ? new Date(r.fecha_apertura_cmr).getTime() : null;
    const fin = r.fecha_solucion_cmr ? new Date(r.fecha_solucion_cmr).getTime() : ahora;
    const horasAbierta = inicio ? (fin - inicio) / MS_HORA : null;

    const ap = partesFecha(r.fecha_apertura_cmr);
    const ci = partesFecha(r.fecha_solucion_cmr);

    return {
      ...r,
      dia_apertura: ap.dia, mes_apertura: ap.mes, anio_apertura: ap.anio,
      dia_cierre: ci.dia, mes_cierre: ci.mes, anio_cierre: ci.anio,
      grupo_horario: grupoHorario(r.fecha_apertura_cmr),
      semaforo: horasAbierta !== null ? semaforo(horasAbierta) : null,
      horas_abierta: horasAbierta,
      tiempo_cierre_horas: r.fecha_solucion_cmr && inicio ? (new Date(r.fecha_solucion_cmr).getTime() - inicio) / MS_HORA : null,
    };
  });

  // Filtros que dependen de campos calculados, aplicados en memoria.
  const filtroNum = (v) => (v === "" ? null : Number(v));
  const diaAp = filtroNum(p("dia_apertura")), mesAp = filtroNum(p("mes_apertura")), anioAp = filtroNum(p("anio_apertura"));
  const diaCi = filtroNum(p("dia_cierre")), mesCi = filtroNum(p("mes_cierre")), anioCi = filtroNum(p("anio_cierre"));
  const grupoH = p("grupo_horario");
  const sem = p("semaforo");

  if (diaAp !== null) filas = filas.filter((f) => f.dia_apertura === diaAp);
  if (mesAp !== null) filas = filas.filter((f) => f.mes_apertura === mesAp);
  if (anioAp !== null) filas = filas.filter((f) => f.anio_apertura === anioAp);
  if (diaCi !== null) filas = filas.filter((f) => f.dia_cierre === diaCi);
  if (mesCi !== null) filas = filas.filter((f) => f.mes_cierre === mesCi);
  if (anioCi !== null) filas = filas.filter((f) => f.anio_cierre === anioCi);
  if (grupoH) filas = filas.filter((f) => f.grupo_horario === grupoH);
  if (sem) filas = filas.filter((f) => f.semaforo === sem);

  return json({ filas });
}
