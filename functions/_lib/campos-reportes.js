// Catálogo de columnas disponibles para el Generador de reportes.
// Se lee de la propia base de datos (PRAGMA table_info), así que cualquier columna que se agregue
// a las tablas en el futuro aparece sola en el panel de administración.
export const TABLAS_REPORTE = {
  tickets: { alias: "t", etiqueta: "Ticket" },
  ticket_puertos: { alias: "p", etiqueta: "Detalle OLT / Tarjeta / Puerto" },
  oficinas: { alias: "o", etiqueta: "Oficina" },
};

// Campos calculados (no existen como columna): los arma /api/consulta o el propio informe.
export const CAMPOS_CALCULADOS = [
  { db_column_name: "calc.fila", etiqueta: "Fila" },
  { db_column_name: "calc.tiempo_abierto", etiqueta: "Tiempo Abierto CMR" },
  { db_column_name: "calc.semaforo", etiqueta: "Semáforo" },
  { db_column_name: "calc.grupo_horario", etiqueta: "Grupo Horario CMR" },
  { db_column_name: "calc.tiempo_cierre_horas", etiqueta: "Tiempo hasta el cierre (h)" },
  { db_column_name: "calc.tipo", etiqueta: "Tipo (columna vacía)" },
  { db_column_name: "calc.clientes_falla", etiqueta: "Clientes afectados (falla)" },
  { db_column_name: "calc.clientes_sin_luz", etiqueta: "Sin electricidad" },
];

// Nombres amables para las columnas conocidas; el resto se "humaniza" (fecha_apertura_cmr → Fecha apertura cmr).
const ETIQUETAS = {
  "tickets.ticket_cmr": "N° Ticket", "tickets.tickets_vinculados": "Ticket de Incidencia previa",
  "tickets.fecha_apertura_cda": "Fecha del registro del CDA", "tickets.fecha_apertura_cmr": "Apertura CMR", "tickets.fecha_falla": "Fecha de la Falla",
  "tickets.fecha_solucion_cmr": "Solución CMR", "tickets.fecha_solucion_cda": "Solución CDA",
  "tickets.estado_ticket": "Estado del Ticket", "tickets.unidad_resolutoria": "Unidad Resolutoria",
  "tickets.categoria_afectacion": "Categoría de la Afectación", "tickets.afectacion": "Afectación",
  "tickets.comentario": "Comentario", "tickets.descripcion": "Descripción", "tickets.avance_cmr": "Avance CMR",
  "tickets.creado_por": "Creado por", "tickets.creado_en": "Creado en", "tickets.actualizado_en": "Actualizado en",
  "ticket_puertos.olt": "OLT", "ticket_puertos.tarjeta": "Tarjeta", "ticket_puertos.puerto": "Puerto",
  "ticket_puertos.sector": "Sector / Ubicación", "ticket_puertos.edificio": "Edificio",
  "ticket_puertos.no_clientes_reportaron": "N° Cltes Reportaron", "ticket_puertos.nro_clientes_afectados": "N° Cltes Afectados",
  "ticket_puertos.estado_puerto": "Estado del Puerto", "ticket_puertos.fecha_cierre_cmr": "Cierre CMR (puerto)",
  "ticket_puertos.fecha_cierre_cda": "Cierre CDA (puerto)",
  "oficinas.nombre": "Oficina", "oficinas.codigo": "Código de Oficina", "oficinas.estado": "Estado", "oficinas.localidad": "Localidad",
  "oficinas.tipo": "Tipo de Oficina",
};
export function etiquetaSugerida(clave) {
  if (ETIQUETAS[clave]) return ETIQUETAS[clave];
  const col = clave.split(".")[1] || clave;
  const t = col.replace(/_/g, " ");
  return t.charAt(0).toUpperCase() + t.slice(1);
}

let cache = null;   // el esquema no cambia mientras corre la función; se lee una vez por instancia
export async function columnasBD(db) {
  if (cache) return cache;
  const salida = [];
  for (const tabla of Object.keys(TABLAS_REPORTE)) {
    const { results } = await db.prepare(`PRAGMA table_info(${tabla})`).all();
    for (const c of results) {
      const clave = `${tabla}.${c.name}`;
      salida.push({ db_column_name: clave, tabla, columna: c.name, tipo: c.type || "", etiqueta: etiquetaSugerida(clave) });
    }
  }
  cache = salida;
  return salida;
}
export function _limpiarCacheColumnas() { cache = null; }   // solo para pruebas

export async function clavesPermitidas(db) {
  const bd = await columnasBD(db);
  return new Set([...bd.map((c) => c.db_column_name), ...CAMPOS_CALCULADOS.map((c) => c.db_column_name)]);
}
