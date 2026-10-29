import { json } from "../_lib/helpers.js";
import { columnasBD, TABLAS_REPORTE } from "../_lib/campos-reportes.js";
import { usuarioDeSesion } from "../_lib/auth.js";
import { agregarConteosClientes } from "../_lib/clientes-ticket.js";

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
  // Sin sesión (o con sesión limitada de primer ingreso) = acceso público a la Pizarra: datos recortados y sin columnas extra.
  const ses = await usuarioDeSesion(request, env);
  const publico = !ses || !!ses.cambio;

  // Columnas extra pedidas por el Generador de reportes (?extras=tickets.creado_por,ticket_puertos.fecha_cierre_cmr).
  // Solo se aceptan columnas que existen de verdad en la BD (lista blanca leída con PRAGMA); nunca se arma SQL con texto del usuario.
  let extrasSql = "";
  const pedidas = publico ? [] : p("extras").split(",").map((x) => x.trim()).filter(Boolean).slice(0, 40);
  if (pedidas.length) {
    const permitidas = new Map((await columnasBD(env.DB)).map((c) => [c.db_column_name, c]));
    for (const clave of new Set(pedidas)) {
      const c = permitidas.get(clave);
      if (c) extrasSql += `, ${TABLAS_REPORTE[c.tabla].alias}."${c.columna}" AS "${clave}"`;
    }
  }

  let sql = `
    SELECT
      t.id AS ticket_id, t.ticket_cmr, t.tickets_vinculados,
      t.fecha_apertura_cda, t.fecha_apertura_cmr, t.fecha_falla,
      t.fecha_solucion_cmr, t.fecha_solucion_cda, t.estado_ticket, t.unidad_resolutoria,
      t.categoria_afectacion, t.afectacion, t.comentario, t.descripcion, t.avance_cmr,
      p.id AS puerto_id, p.oficina_id, o.nombre AS oficina_nombre, o.estado AS region, o.localidad,
      p.olt, p.sector, p.edificio, p.tarjeta, p.puerto,
      p.no_clientes_reportaron, p.nro_clientes_afectados, p.estado_puerto,
      p.fecha_cierre_cda, p.fecha_cierre_cmr,
      t.creado_por, COALESCE(NULLIF(u.nombre, ''), t.creado_por) AS creado_por_nombre,
      tot.n AS total_registros_ticket${extrasSql}
    FROM ticket_puertos p
    JOIN tickets t ON t.id = p.ticket_id
    JOIN (SELECT ticket_id, COUNT(*) AS n FROM ticket_puertos GROUP BY ticket_id) tot ON tot.ticket_id = t.id
    LEFT JOIN oficinas o ON o.id = p.oficina_id
    LEFT JOIN usuarios u ON u.email = t.creado_por
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
    // Tiempo de afectación real = Fecha de SOLUCIÓN − Fecha de apertura (ya no se usa la fecha de cierre).
    const finCmr = r.fecha_solucion_cmr || null;
    const finCda = r.fecha_solucion_cda || null;
    const inicio = r.fecha_apertura_cmr ? new Date(r.fecha_apertura_cmr).getTime() : null;
    const fin = finCmr ? new Date(finCmr).getTime() : ahora;
    const horasAbierta = inicio ? (fin - inicio) / MS_HORA : null;

    const ap = partesFecha(r.fecha_apertura_cmr);
    const ci = partesFecha(finCmr);

    // Tiempos de gestión (se calculan al momento de la consulta, por eso nunca quedan desactualizados):
    //   En curso  = ahora − apertura, mientras el ticket no tenga fecha de solución (después deja de estar "en curso").
    //   En cerrar = fecha de solución − apertura (solo cuando ya la tiene).
    const horasEntre = (desde, hasta) => {
      const a = desde ? new Date(desde).getTime() : NaN, b = hasta ? new Date(hasta).getTime() : NaN;
      return Number.isFinite(a) && Number.isFinite(b) ? (b - a) / MS_HORA : null;
    };
    const cursoCmr = finCmr ? null : horasEntre(r.fecha_apertura_cmr, ahora);
    const cursoCda = finCda ? null : horasEntre(r.fecha_apertura_cda, ahora);
    const cerrarCmr = finCmr ? horasEntre(r.fecha_apertura_cmr, finCmr) : null;
    const cerrarCda = finCda ? horasEntre(r.fecha_apertura_cda, finCda) : null;
    const sem = (h) => (h === null ? null : semaforo(h));

    // Plazos (horas, pueden salir con decimales; el navegador los muestra en d/h/m o en [h]:mm).
    //   Solución = solución − apertura · Cierre = cierre − apertura · Certificar = cierre − solución (CMR y CDA por separado).
    //   Si falta alguna de las dos fechas, el plazo queda vacío.
    const plazos = {
      plazo_solucion_cmr_h: horasEntre(r.fecha_apertura_cmr, r.fecha_solucion_cmr),
      plazo_solucion_cda_h: horasEntre(r.fecha_apertura_cda, r.fecha_solucion_cda),
      plazo_cierre_cmr_h: horasEntre(r.fecha_apertura_cmr, r.fecha_cierre_cmr),
      plazo_cierre_cda_h: horasEntre(r.fecha_apertura_cda, r.fecha_cierre_cda),
      plazo_certificar_cmr_h: horasEntre(r.fecha_solucion_cmr, r.fecha_cierre_cmr),
      plazo_certificar_cda_h: horasEntre(r.fecha_solucion_cda, r.fecha_cierre_cda),
    };

    return {
      ...plazos,
      ...r,
      tiempo_curso_cmr_h: cursoCmr, tiempo_curso_cda_h: cursoCda,
      tiempo_cerrar_cmr_h: cerrarCmr, tiempo_cerrar_cda_h: cerrarCda,
      semaforo_curso_cmr: sem(cursoCmr), semaforo_cierre_cmr: sem(cerrarCmr),
      dia_apertura: ap.dia, mes_apertura: ap.mes, anio_apertura: ap.anio,
      dia_cierre: ci.dia, mes_cierre: ci.mes, anio_cierre: ci.anio,
      grupo_horario: grupoHorario(r.fecha_apertura_cmr),
      semaforo: horasAbierta !== null ? semaforo(horasAbierta) : null,
      horas_abierta: horasAbierta,
      tiempo_cierre_horas: finCmr && inicio ? (new Date(finCmr).getTime() - inicio) / MS_HORA : null,
    };
  });

  // Filtros que dependen de campos calculados, aplicados en memoria.
  const filtroNum = (v) => (v === "" ? null : Number(v));
  const diaAp = filtroNum(p("dia_apertura")), mesAp = filtroNum(p("mes_apertura")), anioAp = filtroNum(p("anio_apertura"));
  const diaCi = filtroNum(p("dia_cierre")), mesCi = filtroNum(p("mes_cierre")), anioCi = filtroNum(p("anio_cierre"));
  const grupoH = p("grupo_horario");
  const sem = p("semaforo");

  // Los filtros de grupo horario y semáforo no dependen de las fechas: se aplican antes para calcular las fechas disponibles.
  if (grupoH) filas = filas.filter((f) => f.grupo_horario === grupoH);
  if (sem) filas = filas.filter((f) => f.semaforo === sem);

  // Fechas realmente presentes en los registros que cumplen TODOS los demás filtros (sin contar Día/Mes/Año).
  // El navegador arma con esto los selectores de Año, Mes y Día en cascada (solo muestra valores que existen).
  const comb = (a, m, d) => (Number.isFinite(a) && Number.isFinite(m) && Number.isFinite(d) ? `${a}-${m}-${d}` : null);
  const setAp = new Set(filas.map((f) => comb(f.anio_apertura, f.mes_apertura, f.dia_apertura)).filter(Boolean));
  const setCi = new Set(filas.map((f) => comb(f.anio_cierre, f.mes_cierre, f.dia_cierre)).filter(Boolean));
  const aTriples = (set) => [...set].map((x) => x.split("-").map(Number));
  const fechas = { apertura: aTriples(setAp), cierre: aTriples(setCi) };

  if (diaAp !== null) filas = filas.filter((f) => f.dia_apertura === diaAp);
  if (mesAp !== null) filas = filas.filter((f) => f.mes_apertura === mesAp);
  if (anioAp !== null) filas = filas.filter((f) => f.anio_apertura === anioAp);
  if (diaCi !== null) filas = filas.filter((f) => f.dia_cierre === diaCi);
  if (mesCi !== null) filas = filas.filter((f) => f.mes_cierre === mesCi);
  if (anioCi !== null) filas = filas.filter((f) => f.anio_cierre === anioCi);

  // ?limite=N → solo las primeras N filas (la vista previa del Generador de reportes no necesita más)
  const limite = Number(p("limite"));
  if (Number.isInteger(limite) && limite > 0) filas = filas.slice(0, Math.min(limite, 200));

  // Clientes afectados según las auditorías vigentes (solo con sesión): clientes_falla y clientes_sin_luz
  if (!publico) { try { await agregarConteosClientes(env.DB, filas); } catch (e) { /* módulo de clientes no instalado: las columnas quedan vacías */ } }

  if (publico) {
    // Público: se quitan datos internos (quién lo creó, descripción libre, avance).
    const QUITAR = ["creado_por", "creado_por_nombre", "descripcion", "avance_cmr"];
    filas.forEach((f) => QUITAR.forEach((k) => { delete f[k]; }));
  }
  return json({ filas, fechas });
}
