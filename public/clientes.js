// ---------------------------------------------------------------
// CLIENTES AFECTADOS — Paso 2: carga de la base de clientes (Grafana "Detalle de Cuentas")
// Solo administrador y supervisor (el servidor lo vuelve a validar en cada llamada).
// ---------------------------------------------------------------
// CLI-PURE-START (sin DOM: se prueba aparte)
const CLI_COLUMNAS = {
  cuenta: "numero de cuenta", estado_contrato: "estado del contrato", fecha_creacion: "fecha de creacion de la cuenta",
  sucursal: "sucursal", cedula: "identificacion externo", tipo_cliente: "tipo de cliente", nombre: "nombre / compania",
  genero: "genero", telefono_casa: "telefono de casa", telefono_oficina: "telefono de oficina", correo: "correo electronico",
  correo_iptv: "correo iptv", serial_onu: "serial onu", estado_geo: "estado", direccion: "direccion", municipio: "municipio",
  parroquia: "parroquia", sector: "sector", plan: "plan de internet",
};
const CLI_OBLIGATORIAS = ["cuenta", "estado_contrato", "sucursal", "cedula", "nombre", "serial_onu", "sector"];

function cliNormEncabezado(s) {
  return String(s ?? "").replace(/^﻿/, "").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ").trim().toLowerCase();
}

// Decodifica los bytes del archivo: Grafana "Descargar para Excel" = UTF-16 LE con BOM; también acepta UTF-16 BE y UTF-8.
function cliDecodificar(bytes) {
  const u = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  if (u[0] === 0xFF && u[1] === 0xFE) return new TextDecoder("utf-16le").decode(u);
  if (u[0] === 0xFE && u[1] === 0xFF) return new TextDecoder("utf-16be").decode(u);
  return new TextDecoder("utf-8").decode(u);
}

// Parte UNA línea en campos (con comillas). Devuelve null si la línea está mal formada (comillas sin cerrar).
function cliPartirLinea(linea, delim) {
  const campos = [];
  let i = 0;
  const n = linea.length;
  while (i <= n) {
    if (linea[i] === '"') {
      let j = i + 1, txt = "";
      for (;;) {
        if (j >= n) return null;                                  // comilla sin cerrar
        if (linea[j] === '"') { if (linea[j + 1] === '"') { txt += '"'; j += 2; continue; } break; }
        txt += linea[j++];
      }
      j++;                                                         // comilla de cierre
      if (j < n && linea[j] !== delim) return null;                // basura después de la comilla
      campos.push(txt); i = j + 1;
    } else {
      let j = linea.indexOf(delim, i);
      if (j === -1) j = n;
      campos.push(linea.slice(i, j)); i = j + 1;
    }
    if (i > n) break;
  }
  return campos;
}

// Nombre del archivo de Grafana -> fecha y hora de la base EN HORA DE CARACAS. Ej: "Detalle de Cuentas-data-2026-10-28 20_05_28"
// La hora del nombre viene en UTC (igual que SmartOLT): se le restan 4 horas (Caracas, sin horario de verano).
function cliFechaDeNombre(nombre) {
  const m = /(\d{4})-(\d{2})-(\d{2})[ T_](\d{2})[_:.](\d{2})[_:.](\d{2})/.exec(String(nombre || ""));
  if (!m) return null;
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]) - 4 * 3600 * 1000);
  return d.toISOString().slice(0, 19);
}

// Serial normalizado (mismo criterio del servidor) y llave de la base: serial, o SIN-SN-<cuenta> si no tiene
function cliSerialDesdeCientifico(v) {
  let s = String(v ?? "").trim().replace(/^=?\s*"?'?/, "").replace(/"$/, "").trim();
  const m = /^([+-]?)(\d+)(?:[.,](\d+))?[eE]([+-]?)(\d+)$/.exec(s);
  if (m && (m[3] !== undefined || m[4] === "+")) {
    const frac = m[3] || "", exp = m[4] === "-" ? -Number(m[5]) : Number(m[5]);
    if (exp >= frac.length) return { texto: m[2] + frac + "0".repeat(exp - frac.length), cientifico: true };
  }
  const d = /^(\d+)[.,]0+$/.exec(s);
  if (d) s = d[1];
  return { texto: s, cientifico: false };
}
function cliSerialEsCientifico(v) { return cliSerialDesdeCientifico(v).cientifico; }
function cliNormSerial(v) {
  const n = String(cliSerialDesdeCientifico(v).texto).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  return /^\d+$/.test(n) ? n.replace(/^0+(?=\d)/, "") : n;
}
// Número de cuenta limpio (la llave de cada tabla de sucursal)
function cliCuenta(f) { const c = String(f.cuenta ?? "").replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "").trim().slice(0, 40); return c || null; }
function cliClave(f) { const c = String(f.cuenta ?? "").replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "").trim().slice(0, 40); return c ? (cliNormSerial(f.serial_onu) || "SIN-SN-" + c) : null; }
// "15-03-2023" o "2023-03-15" -> "2023-03-15" (para comparar fechas de contrato como texto)
function cliFechaContrato(v) { const s = String(v ?? "").trim(); const m = /^(\d{1,2})[-/](\d{1,2})[-/](\d{4})/.exec(s); if (m) return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`; const n = /^(\d{4})-(\d{2})-(\d{2})/.exec(s); return n ? n[0] : ""; }

// Texto completo -> { filas, leidas, malformadas:[{linea,texto}], sinCuenta, repetidas, conteos, conSerial, sucursales, faltantes, noActivas, duplicadas }
// Solo entran los clientes con Estado del contrato "Activo". Si una misma ONU (serial) aparece en dos o más cuentas ACTIVAS se conserva la de
// fecha de contrato más reciente (si empatan, la de número de cuenta mayor) y las demás se anotan en "duplicadas" para avisar.
function cliParsearBase(texto) {
  const lineas = texto.replace(/^﻿/, "").split(/\r\n|\n|\r/);
  while (lineas.length && !lineas[0].trim()) lineas.shift();
  if (!lineas.length) throw new Error("El archivo está vacío.");
  const delim = lineas[0].includes("\t") ? "\t" : lineas[0].includes(";") ? ";" : ",";
  const enc = cliPartirLinea(lineas[0], delim);
  if (!enc) throw new Error("No se pudo leer la fila de encabezados.");
  const idx = {};
  const normEnc = enc.map(cliNormEncabezado);
  for (const [k, nombre] of Object.entries(CLI_COLUMNAS)) { const p = normEnc.indexOf(nombre); if (p >= 0) idx[k] = p; }
  const faltantes = CLI_OBLIGATORIAS.filter((k) => idx[k] === undefined).map((k) => CLI_COLUMNAS[k]);
  if (faltantes.length) throw new Error("Faltan columnas en el archivo: " + faltantes.join(", ") + ". ¿Es el \"Detalle de Cuentas\" de Grafana?");

  const res = { filas: [], leidas: 0, malformadas: [], sinCuenta: 0, repetidas: 0, conSerial: 0, noActivas: 0, duplicadas: [],
    conteos: { activo: 0, suspendido: 0, prospecto: 0, otros: 0 }, estados: {}, sucursales: {}, serialesRepetidos: [] };
  const vistas = new Set();
  for (let i = 1; i < lineas.length; i++) {
    const ln = lineas[i];
    if (!ln.trim()) continue;
    res.leidas++;
    const c = cliPartirLinea(ln, delim);
    if (!c || c.length !== enc.length) { res.malformadas.push({ linea: i + 1, texto: ln.slice(0, 120) }); continue; }
    const fila = {};
    for (const k of Object.keys(idx)) fila[k] = String(c[idx[k]] ?? "").trim();
    if (!fila.cuenta) { res.sinCuenta++; continue; }
    if (vistas.has(fila.cuenta)) { res.repetidas++; continue; }
    vistas.add(fila.cuenta);
    const e = fila.estado_contrato.toLowerCase();
    const eNom = fila.estado_contrato || "(vacío)"; res.estados[eNom] = (res.estados[eNom] || 0) + 1;
    if (e === "suspendido") res.conteos.suspendido++; else if (e === "prospecto") res.conteos.prospecto++; else if (e !== "activo") res.conteos.otros++;
    if (e !== "activo") { res.noActivas++; continue; }
    const s = fila.sucursal || "(vacía)";
    res.sucursales[s] = (res.sucursales[s] || 0) + 1;
    res.filas.push(fila);
  }
  // ONU repetida entre cuentas activas: gana la de contrato más reciente
  const porSerial = new Map();
  for (const f of res.filas) { const sn = cliNormSerial(f.serial_onu); if (sn) { if (!porSerial.has(sn)) porSerial.set(sn, []); porSerial.get(sn).push(f); } }
  const pierde = new Set();
  for (const [sn, lista] of porSerial) {
    if (lista.length < 2) continue;
    const orden = lista.slice().sort((a, b) => {
      const fa = cliFechaContrato(a.fecha_creacion), fb = cliFechaContrato(b.fecha_creacion);
      if (fa !== fb) return fa < fb ? 1 : -1;
      return (Number(b.cuenta) || 0) - (Number(a.cuenta) || 0);
    });
    orden.slice(1).forEach((f) => pierde.add(f));
    res.duplicadas.push({ serial: sn, conservada: orden[0], descartadas: orden.slice(1) });
  }
  if (pierde.size) res.filas = res.filas.filter((f) => !pierde.has(f));
  // conteos finales sobre lo que realmente entra
  res.sucursales = {};
  for (const f of res.filas) { const s = f.sucursal || "(vacía)"; res.sucursales[s] = (res.sucursales[s] || 0) + 1; if (cliNormSerial(f.serial_onu)) res.conSerial++; }
  res.conteos.activo = res.filas.length;
  return res;
}

// ---- Auditoría SmartOLT ----
const SM_COLUMNAS = { sn: "sn", name: "name", olt: "olt", board: "board", port: "port", onu: "allocated onu", zone: "zone", address: "address",
  status: "status", lsc: "last status change", contact: "contact", oltid: "olt id" };
const SM_OBLIGATORIAS = ["sn", "olt", "board", "port", "status"];

// SmartOLT_oltid_58_board_6_port_11_status_los_onus_list_2026-10-19_22_01_26.470019.csv
// La hora del nombre viene en UTC: se convierte a hora de Caracas (UTC-4, sin horario de verano).
function cliParsearNombreSmartolt(nombre) {
  const m = /SmartOLT_oltid_(\d+)(?:_board_([\d,]+))?(?:_port_([\d,]+))?(?:_status_([A-Za-z_ ]+?))?_onus_list_(\d{4})-(\d{2})-(\d{2})[_ T](\d{2})[_:](\d{2})[_:](\d{2})/i.exec(String(nombre || ""));
  if (!m) return null;
  const utc = Date.UTC(+m[5], +m[6] - 1, +m[7], +m[8], +m[9], +m[10]);
  const f = (ms) => new Date(ms).toISOString().slice(0, 19);
  // Con varias tarjetas o puertos (board_3,13_port_6,7,8) no hay un único número: se guarda vacío y el texto completo para mostrarlo
  const uno = (t) => (t && /^\d+$/.test(t) ? +t : null);
  return { oltid: m[1], tarjeta: uno(m[2]), puerto: uno(m[3]), tarjetaTxt: m[2] || null, puertoTxt: m[3] || null, estado: m[4] ? m[4].replace(/_/g, " ").toLowerCase() : null,
    utc: f(utc), local: f(utc - 4 * 3600 * 1000) };
}

function cliParsearAuditoria(texto) {
  const lineas = texto.replace(/^\uFEFF/, "").split(/\r\n|\n|\r/);
  while (lineas.length && !lineas[0].trim()) lineas.shift();
  if (!lineas.length) throw new Error("El archivo está vacío.");
  const delim = lineas[0].includes(";") ? ";" : lineas[0].includes("\t") ? "\t" : ",";
  const enc = cliPartirLinea(lineas[0], delim);
  if (!enc) throw new Error("No se pudo leer la fila de encabezados.");
  const norm = enc.map(cliNormEncabezado);
  const idx = {};
  for (const [k, nombre] of Object.entries(SM_COLUMNAS)) { const p = norm.indexOf(nombre); if (p >= 0) idx[k] = p; }
  const faltan = SM_OBLIGATORIAS.filter((k) => idx[k] === undefined).map((k) => SM_COLUMNAS[k]);
  if (faltan.length) throw new Error("Faltan columnas en el archivo: " + faltan.join(", ") + ". ¿Es el exporte de ONUs de SmartOLT?");
  const res = { onus: [], leidas: 0, malformadas: [], olts: {}, estados: {} };
  for (let i = 1; i < lineas.length; i++) {
    const ln = lineas[i];
    if (!ln.trim()) continue;
    res.leidas++;
    const c = cliPartirLinea(ln, delim);
    if (!c || c.length !== enc.length) { res.malformadas.push({ linea: i + 1, texto: ln.slice(0, 120) }); continue; }
    const o = {};
    for (const k of Object.keys(idx)) o[k] = String(c[idx[k]] ?? "").trim();
    res.onus.push(o);
    res.olts[o.olt] = (res.olts[o.olt] || 0) + 1;
    res.estados[o.status] = (res.estados[o.status] || 0) + 1;
  }
  return res;
}
// CLI-PURE-END
if (typeof module !== "undefined") module.exports = { cliNormSerial, cliSerialEsCientifico, cliClave, cliFechaContrato, cliDecodificar, cliPartirLinea, cliParsearBase, cliFechaDeNombre, cliParsearNombreSmartolt, cliParsearAuditoria };

// ---------------- Interfaz (solo navegador) ----------------
if (typeof document !== "undefined" && document.getElementById("cli_archivo")) {
  const CLI_COLA_FILAS = 200, CLI_COLA_CUENTAS = 8000;   // trozos de la cola nocturna
  const CLI_LOTE = 250, CLI_PARALELO = 4, CLI_TOPE_DIA = 79000;   // tope diario de clientes nuevos (plan gratuito de D1: 100.000 escrituras/día; el resto lo usa la app)                          // filas por envío al servidor
  let cliAnalisis = null, cliNombreArchivo = "", cliFechaBase = "";
  const el = (id) => document.getElementById(id);
  const fmtFecha = (iso) => { const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(iso || ""); return m ? `${m[3]}/${m[2]}/${m[1]} ${m[4]}:${m[5]}` : (iso || ""); };
  const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const pausa = () => new Promise((r) => setTimeout(r, 0));
  const ahoraCaracas = () => new Date(Date.now() - 4 * 3600 * 1000).toISOString().slice(0, 19);

  async function cliCargarUso() {
    const u = el("cli_uso_hoy"); if (!u) return;
    try {
      const d = await apiGet("/clientes/uso-hoy");
      u.innerHTML = `Escrituras de D1 de hoy (todo lo que se sube): <strong>${formatearMiles(d.usado)} de ${formatearMiles(d.tope)}</strong> (quedan ${formatearMiles(d.quedan)}). Se reinicia a las 8:00 pm, hora de Caracas.` +
        (d.detalle && d.detalle.length ? `<br>` + d.detalle.map((x) => `${x.nombre}: ${formatearMiles(x.filas)}`).join(" · ") : "") +
        (d.lecturas ? `<br>Lecturas de D1 de hoy: <strong>${formatearMiles(d.lecturas.usado)} de ${formatearMiles(d.lecturas.tope)}</strong>` + (d.lecturas.detalle.length ? " (" + d.lecturas.detalle.map((x) => `${x.nombre.replace("Lecturas: ", "")}: ${formatearMiles(x.filas)}`).join(" · ") + ")" : "") : "");
    } catch (e) { u.textContent = ""; }
  }
  async function cliCargarBases() {
    cliCargarUso();
    if (window.cliCargarCola) window.cliCargarCola();
    const cont = el("cli_bases");
    try {
      const d = await apiGet("/clientes/bases");
      cont.innerHTML = d.vigentes.length
        ? `<table class="rows-table"><thead><tr><th>Sucursal</th><th>Clientes activos en la base</th><th>Última carga</th><th>Cambios en esa carga</th><th>Archivo</th><th>Subida por</th></tr></thead><tbody>${
            d.vigentes.map((b) => `<tr><td>${esc(b.sucursal)}</td><td>${formatearMiles(b.total_acum || 0)}</td><td>${fmtFecha(b.fecha_base)}</td><td>+${formatearMiles(b.nuevas || 0)}${b.cambiadas ? ` · ${formatearMiles(b.cambiadas)} actualizadas` : ""}${b.bajas ? ` · ${formatearMiles(b.bajas)} bajas` : ""}</td><td>${esc(b.archivo)}</td><td>${esc(b.usuario)}</td></tr>`).join("")}</tbody><tfoot><tr><td><strong>Total</strong></td><td><strong>${formatearMiles(d.vigentes.reduce((t, b) => t + (b.total_acum || 0), 0))}</strong></td><td colspan="4"></td></tr></tfoot></table>`
        : '<p class="hint">Todavía no hay ninguna base cargada.</p>';
    } catch (err) { cont.innerHTML = `<p class="msg error">${esc(err.message)}</p>`; }
  }
  window.cliCargarBases = cliCargarBases;


  const NOMBRE_SEM = { verde: "VERDE", amarillo: "AMARILLO", naranja: "NARANJA", rojo: "ROJO", sin_base: "ROJO" };
  async function cliCargarFrescura() {
    const cont = el("cli_frescura");
    if (!cont) return;
    try {
      const d = await apiGet("/clientes/frescura");
      cont.innerHTML = d.filas.length
        ? `<table class="rows-table"><thead><tr><th>Sucursal</th><th>Oficinas con falla activa</th><th>Tickets activos</th><th>Base actualizada</th><th>Sin actualizar</th></tr></thead><tbody>${
            d.filas.map((f) => `<tr class="sem-${NOMBRE_SEM[f.semaforo]}"><td>${esc(f.sucursal)}</td><td>${esc(f.oficinas.join(", "))}</td><td>${f.tickets_activos}</td><td>${f.fecha_base ? fmtFecha(f.fecha_base) : "—"}</td><td>${f.dias === null ? "<strong>Sin base cargada</strong>" : f.dias === 0 ? "hoy" : f.dias === 1 ? "1 día" : f.dias + " días"}</td></tr>`).join("")}</tbody></table>`
        : '<p class="hint">No hay tickets activos con oficina asignada.</p>';
    } catch (err) { cont.innerHTML = `<p class="msg error">${esc(err.message)}</p>`; }
  }
  window.cliCargarFrescura = cliCargarFrescura;

  // Cruce de las ONUs de los tickets abiertos con la base (automático al terminar una carga, o con el botón)
  let cliCruzando = false;
  async function cliCruzarTickets() {
    const msg = el("cli_msg_cruce");
    if (cliCruzando || !window.cruzarTicketGrafana) return;
    cliCruzando = true;
    try {
      showMsg(msg, "Buscando tickets abiertos con ONUs por cruzar…", true);
      const d = await apiGet("/clientes/cruce-tickets");
      if (!d.tickets.length) { showMsg(msg, "No hay tickets abiertos con ONUs pendientes de cruzar.", true); return; }
      let cruzadas = 0, fuera = 0, hechos = 0;
      const detalle = [];
      for (const t of d.tickets) {
        showMsg(msg, `Cruzando ticket ${t.ticket_cmr} (${++hechos} de ${d.tickets.length})…`, true);
        const r = await window.cruzarTicketGrafana(t.ticket_cmr);
        if (!r) { detalle.push(`${t.ticket_cmr}: no se pudo cruzar`); continue; }
        cruzadas += r.cruzadas || 0; fuera += r.fuera_ventana || 0;
        detalle.push(`${t.ticket_cmr}: ${r.con_cliente ?? 0} de ${r.total ?? 0}`);
      }
      showMsg(msg, `Cruce terminado: ${formatearMiles(cruzadas)} ONU(s) cruzadas ahora en ${d.tickets.length} ticket(s)` +
        (fuera ? `; ${formatearMiles(fuera)} ONU(s) quedaron sin cruzar porque la fecha en que se registraron en el ticket (app de fallas masivas) difiere en más de la ventana permitida de la fecha del archivo de Grafana de su sucursal` : "") + `. Con cliente / total por ticket: ${detalle.join(" · ")}.`, true);
    } catch (err) { showMsg(msg, err.message, false); }
    finally { cliCruzando = false; }
  }
  window.cliCruzarTickets = cliCruzarTickets;
  el("cli_btn_cruzar_tickets").addEventListener("click", cliCruzarTickets);

  // Aviso de ONU repetidas entre cuentas activas (se conserva la de contrato más reciente) + descarga del detalle
  let cliAvisoDup = [];
  function cliFilasDuplicadas(lista) {
    const out = [];
    for (const d of lista) {
      const fila = (x, resultado) => ({ "Serial ONU": d.serial, "Resultado": resultado, "Cuenta": x.cuenta, "Nombre": x.nombre || "", "Cédula": x.cedula || "", "Sucursal": x.sucursal || "",
        "Fecha de contrato": x.fecha_creacion || "", "Teléfono": x.telefono_casa || "", "Dirección": x.direccion || "" });
      out.push(fila(d.conservada, "SE CONSERVA (contrato más reciente)"));
      d.descartadas.forEach((x) => out.push(fila(x, "DESCARTADA")));
    }
    return out;
  }
  function cliMostrarDuplicadas(lista, origen) {
    cliAvisoDup = lista;
    const cont = el("cli_duplicadas");
    if (!lista.length) { cont.innerHTML = ""; return; }
    const ej = lista.slice(0, 5).map((d) => `<li>${esc(d.serial)}: se conserva la cuenta ${esc(d.conservada.cuenta)} (${esc(d.conservada.fecha_creacion || "sin fecha")}); descartada${d.descartadas.length > 1 ? "s" : ""}: ${d.descartadas.map((x) => esc(x.cuenta) + " (" + esc(x.fecha_creacion || "sin fecha") + ")").join(", ")}</li>`).join("");
    cont.innerHTML = `<div class="cli-aviso"><h4>⚠ ${formatearMiles(lista.length)} ONU repetida(s) en cuentas activas ${esc(origen)}</h4>
      <p>Una misma ONU no debería estar en dos cuentas activas. Se conservó la de <strong>fecha de contrato más reciente</strong>. Descarga el detalle y repórtalo a tu jefe para que se corrija en el sistema comercial.</p>
      <ul>${ej}${lista.length > 5 ? `<li>… y ${lista.length - 5} más (están en la descarga)</li>` : ""}</ul>
      <button id="cli_dup_xlsx" class="btn-secondary" type="button">Descargar detalle (Excel)</button></div>`;
    el("cli_dup_xlsx").onclick = () => {
      const filas = cliFilasDuplicadas(cliAvisoDup);
      const nombre = `onu_repetidas_${new Date(Date.now() - 4 * 3600 * 1000).toISOString().slice(0, 10)}`;
      if (typeof XLSX !== "undefined") { const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(filas), "ONU repetidas"); XLSX.writeFile(wb, nombre + ".xlsx"); }
      else { const cab = Object.keys(filas[0]); const csv = [cab, ...filas.map((f) => cab.map((k) => f[k]))].map((r) => r.map((v) => '"' + String(v ?? "").replace(/"/g, '""') + '"').join(";")).join("\n");
        const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob(["\ufeff" + csv], { type: "text/csv" })); a.download = nombre + ".csv"; a.click(); }
    };
  }

  const cliAnalizarGrafana = async () => {
    const msg = el("cli_msg_analisis");
    el("cli_preview").classList.add("hidden"); el("cli_resultado").innerHTML = "";
    const f = el("cli_archivo").files[0];
    if (!f) { showMsg(msg, "Elige primero el archivo CSV de Grafana.", false); return; }
    try {
      showMsg(msg, "Leyendo el archivo… (puede tardar unos segundos)", true);
      await pausa();
      const texto = cliDecodificar(new Uint8Array(await f.arrayBuffer()));
      await pausa();
      const a = cliParsearBase(texto);
      cliAnalisis = a; cliNombreArchivo = f.name;
      const deNombre = cliFechaDeNombre(f.name);
      cliFechaBase = deNombre || ahoraCaracas();
      const sucs = Object.entries(a.sucursales).sort((x, y) => y[1] - x[1]);
      el("cli_sucursal").value = sucs.map(([n, c]) => `${n} (${formatearMiles(c)})`).join(" · ");
      const nCient = a.filas.filter((f) => cliSerialEsCientifico(f.serial_onu)).length;
      el("cli_aviso_sucursal").textContent = "Cada sucursal del archivo reemplaza a la suya; las demás no se tocan." + (nCient ? ` Ojo: ${nCient} serial(es) venían en notación científica (p. ej. 4.85E+15); se convirtieron a número completo, pero si Excel los redondeó al guardar el CSV pueden estar incompletos.` : "");
      cliMostrarDuplicadas(a.duplicadas, "de este archivo");
      el("cli_fecha_base").textContent = fmtFecha(cliFechaBase) + (deNombre ? " (del nombre del archivo, convertida a hora de Caracas)" : " (el nombre del archivo no la trae: se usa la hora de subida)");
      el("cli_prev_leidas").textContent = a.leidas;
      el("cli_prev_validas").textContent = a.filas.length;
      el("cli_prev_desc").textContent = a.malformadas.length + a.sinCuenta + a.repetidas;
      el("cli_prev_det_desc").textContent = `${a.malformadas.length} mal formadas · ${a.sinCuenta} sin número de cuenta · ${a.repetidas} cuentas repetidas`;
      el("cli_prev_activos").textContent = a.conteos.activo;
      el("cli_prev_estados").textContent = `(se ignoran ${formatearMiles(a.noActivas)} no activas: Suspendidos ${a.conteos.suspendido} · Prospectos ${a.conteos.prospecto} · Otros ${a.conteos.otros}; y ${a.duplicadas.reduce((t, d) => t + d.descartadas.length, 0)} ONU repetida(s) descartadas)`;
      el("cli_prev_serial").textContent = a.filas.length ? Math.round(100 * a.conSerial / a.filas.length) + " %" : "—";
      el("cli_prev_malas").innerHTML = a.malformadas.length
        ? "<p class=\"hint\">Filas descartadas por estar mal formadas (se pueden corregir en Grafana y volver a cargar):</p><ul>" + a.malformadas.slice(0, 20).map((m) => `<li>Línea ${m.linea}: ${esc(m.texto)}…</li>`).join("") + (a.malformadas.length > 20 ? `<li>… y ${a.malformadas.length - 20} más</li>` : "") + "</ul>"
        : "";
      el("cli_preview").classList.remove("hidden");
      const sinSuc = a.sucursales["(vacía)"] || 0;
      el("cli_btn_cargar").disabled = false;
      if (sinSuc) {
        el("cli_btn_cargar").disabled = true;
        showMsg(msg, `No se puede cargar este archivo: trae ${formatearMiles(sinSuc)} cuentas activas sin sucursal.`, false);
      } else if (!a.filas.length) {
        el("cli_btn_cargar").disabled = true;
        showMsg(msg, "El archivo no trae ningún cliente Activo.", false);
      } else showMsg(msg, "Archivo analizado. Revisa el resumen y confirma la carga.", true);
    } catch (err) { showMsg(msg, err.message, false); }
  };
  el("cli_btn_analizar").addEventListener("click", cliAnalizarGrafana); window.cliAnalizarGrafana = cliAnalizarGrafana;

  async function cliPurgar() {
    for (let i = 0; i < 100; i++) { const r = await apiSend("/clientes/carga/purgar", "POST", {}); if (!r.pendientes) break; }
  }

  // ---- Cola nocturna: el archivo se guarda comprimido en trozos y la app lo aplica de noche (12:00 am Caracas) ----
  const gzipB64 = async (obj) => {
    const flujo = new Blob([JSON.stringify(obj)]).stream().pipeThrough(new CompressionStream("gzip"));
    const u = new Uint8Array(await new Response(flujo).arrayBuffer());
    let b = ""; for (let i = 0; i < u.length; i += 0x8000) b += String.fromCharCode.apply(null, u.subarray(i, i + 0x8000));
    return btoa(b);
  };
  const cliEncolarGrafana = async (lista, a) => {
    const msg = el("cli_msg_carga"), btn = el("cli_btn_cargar");
    if (typeof CompressionStream === "undefined") return showMsg(msg, "Este navegador no puede comprimir el archivo. Desmarca «Aplicar de noche» o usa Chrome/Edge actualizado.", false);
    if (!confirm(`Se guardará el archivo (${formatearMiles(a.filas.length)} clientes activos de ${lista.length} sucursal(es): ${lista.map(([n]) => n.toUpperCase()).join(", ")}) en la cola.\n\nDe noche (12:00 am, hora de Caracas) la app lo aplica solo, hasta ${formatearMiles(60000)} cambios por noche; si falta, continúa la noche siguiente. Cada sucursal reemplaza a la suya cuando termina.\n\nSi para alguna sucursal ya había un archivo esperando en la cola, este lo reemplaza. ¿Continuar?`)) return false;
    btn.disabled = true;
    const hechas = []; let cargaId = null;
    try {
      for (let g = 0; g < lista.length; g++) {
        const [sucursal, filas] = lista[g];
        const etiqueta = `Sucursal ${g + 1} de ${lista.length} (${sucursal})`;
        const ini = await apiSend("/clientes/carga/iniciar", "POST", { sucursal, archivo: cliNombreArchivo, fecha_base: cliFechaBase, filas_leidas: filas.length, filas_descartadas: 0, cola: true });
        cargaId = ini.carga_id;
        await apiSend("/clientes/cola/subir", "POST", { carga_id: cargaId, abrir: true });
        const trozos = []; for (let i = 0; i < filas.length; i += CLI_COLA_FILAS) trozos.push(filas.slice(i, i + CLI_COLA_FILAS));
        const cuentas = filas.map(cliCuenta).filter(Boolean);
        const tcuentas = []; for (let i = 0; i < cuentas.length; i += CLI_COLA_CUENTAS) tcuentas.push(cuentas.slice(i, i + CLI_COLA_CUENTAS));
        const tareas = trozos.map((t, seq) => ({ tipo: "filas", seq, datos: t })).concat(tcuentas.map((t, seq) => ({ tipo: "cuentas", seq, datos: t })));
        let sig = 0, subidos = 0;
        const trabajador = async () => {
          while (sig < tareas.length) {
            const t = tareas[sig++];
            await apiSend("/clientes/cola/subir", "POST", { carga_id: cargaId, tipo: t.tipo, seq: t.seq, n: t.datos.length, datos: await gzipB64(t.datos) });
            subidos++;
            showMsg(msg, `${etiqueta}: guardando en la cola… ${formatearMiles(subidos)} de ${formatearMiles(tareas.length)} trozos`, true);
          }
        };
        await Promise.all(Array.from({ length: Math.min(CLI_PARALELO, tareas.length) }, trabajador));
        await apiSend("/clientes/cola/encolar", "POST", { carga_id: cargaId, total_chunks: trozos.length, cuentas_chunks: tcuentas.length, completa: true, filas: filas.length });
        cargaId = null;
        hechas.push(`${sucursal}: ${formatearMiles(filas.length)} clientes en cola`);
      }
      el("cli_archivo").value = ""; el("cli_preview").classList.add("hidden"); cliAnalisis = null;
      showMsg(msg, `Archivo guardado en la cola. ${hechas.join(" · ")}. Se aplica solo esta noche (12:00 am, hora de Caracas); puedes ver el avance abajo, en «Cola nocturna de Grafana».`, true);
      cliCargarCola();
      return true;
    } catch (err) {
      if (cargaId) { try { await apiSend("/clientes/cola/accion", "POST", { carga_id: cargaId, accion: "cancelar" }); } catch (e) { /* nada */ } }
      showMsg(msg, `No se pudo guardar en la cola: ${err.message}. ` + (hechas.length ? `Ya guardadas: ${hechas.join(" · ")}. ` : "") + "Vuelve a intentarlo con el mismo archivo.", false);
      cliCargarCola();
      return false;
    } finally { btn.disabled = false; }
  };

  const ESTADO_COLA = { subiendo: "Subiendo", pendiente: "Esperando la noche", espera_confirmacion: "Espera tu confirmación", lista: "Aplicada", error: "Descartada", cancelada: "Cancelada" };
  async function cliCargarCola() {
    const cont = el("cli_cola"); if (!cont) return;
    try {
      const d = await apiGet("/clientes/cola/estado");
      const filas = d.cargas.map((c) => {
        const avance = c.estado === "lista" ? "100 %" : c.total_chunks ? Math.min(100, Math.round(100 * c.sig / c.total_chunks)) + " %" : "—";
        const cambios = `+${formatearMiles(c.nuevas)} nuevos` + (c.cambiadas ? `, ${formatearMiles(c.cambiadas)} actualizados` : "") + (c.estado === "lista" && c.bajas ? `, ${formatearMiles(c.bajas)} bajas` : "");
        let accion = "";
        if (c.estado === "espera_confirmacion") accion = `<span class="hint">Deja fuera a ${formatearMiles(c.bajas)} de ${formatearMiles(c.total_base)} clientes.</span> <button type="button" data-cola="confirmar" data-id="${c.carga_id}">Confirmar bajas</button> <button type="button" data-cola="cancelar" data-id="${c.carga_id}">Cancelar carga</button>`;
        else if (c.estado === "pendiente") accion = `<button type="button" data-cola="cancelar" data-id="${c.carga_id}">Cancelar</button>`;
        else if (c.error) accion = `<span class="hint">${esc(c.error)}</span>`;
        return `<tr><td>${esc(c.sucursal)}</td><td>${esc(c.archivo || "")}</td><td>${ESTADO_COLA[c.estado] || c.estado}</td><td>${avance}</td><td>${cambios}</td><td>${accion}</td></tr>`;
      }).join("");
      const hayPend = d.cargas.some((c) => c.estado === "pendiente");
      cont.innerHTML = (filas ? `<table class="tabla"><thead><tr><th>Sucursal</th><th>Archivo</th><th>Estado</th><th>Avance</th><th>Cambios</th><th></th></tr></thead><tbody>${filas}</tbody></table>` : `<p class="hint">No hay archivos en la cola.</p>`) +
        `<p class="hint">Hoy la cola ha escrito ${formatearMiles(d.usado_noche)} de ${formatearMiles(d.tope_noche)} cambios (quedan ${formatearMiles(d.quedan)}).` + (d.cron_configurado ? "" : ` <strong>Aún no está configurado el proceso automático de la noche (CRON_TOKEN): mientras tanto usa «Procesar ahora».</strong>`) + `</p>` +
        (hayPend ? `<button type="button" id="cli_cola_ahora">Procesar ahora</button> <span id="cli_cola_msg" class="hint"></span>` : "");
      const ahora = el("cli_cola_ahora");
      if (ahora) ahora.addEventListener("click", cliProcesarCola);
    } catch (e) { cont.textContent = ""; }
  }
  async function cliProcesarCola() {
    const b = el("cli_cola_ahora"), m = el("cli_cola_msg"); b.disabled = true;
    try {
      for (let i = 0; i < 2000; i++) {
        const r = await apiSend("/clientes/cola/procesar", "POST", {});
        if (m) m.textContent = r.sucursal ? `${r.sucursal}: trozo ${r.sig || 0} de ${r.total_chunks || "?"}` : "";
        if (!r.seguir) { if (m) m.textContent = r.motivo === "sin_cupo" ? "Se acabó el cupo de cambios de hoy; continúa mañana." : "Listo."; break; }
        if (r.motivo === "espera_confirmacion") { await cliCargarCola(); if (el("cli_cola_msg")) el("cli_cola_msg").textContent = "Una carga espera tu confirmación de bajas."; }
      }
    } catch (e) { if (m) m.textContent = "Se detuvo: " + e.message; }
    cliCargarCola(); cliCargarBases(); cliCargarFrescura();
  }
  document.addEventListener("click", async (ev) => {
    const t = ev.target.closest && ev.target.closest("[data-cola]"); if (!t) return;
    const accion = t.dataset.cola, id = Number(t.dataset.id);
    if (accion === "cancelar" && !confirm("¿Cancelar esta carga? La base de la sucursal queda como estaba (lo ya aplicado no se deshace).")) return;
    if (accion === "confirmar" && !confirm("Estos clientes se darán de baja de la base. ¿Es el archivo correcto y completo?")) return;
    t.disabled = true;
    try { await apiSend("/clientes/cola/accion", "POST", { carga_id: id, accion }); } catch (e) { alert(e.message); }
    cliCargarCola();
  });
  window.cliCargarCola = cliCargarCola;

  const cliCargarGrafana = async () => {
    const msg = el("cli_msg_carga"), btn = el("cli_btn_cargar");
    if (!cliAnalisis) return showMsg(msg, "Analiza primero el archivo.", false);
    const a = cliAnalisis;
    if (!a.filas.length || a.filas.some((f) => !f.sucursal)) return showMsg(msg, "El archivo no tiene clientes activos con sucursal: no se puede cargar.", false);
    const grupos = new Map();
    a.filas.forEach((f) => { if (!grupos.has(f.sucursal)) grupos.set(f.sucursal, []); grupos.get(f.sucursal).push(f); });
    const lista = [...grupos.entries()];
    if (el("cli_encolar") && el("cli_encolar").checked) return cliEncolarGrafana(lista, a);
    let uso = null; try { uso = await apiGet("/clientes/uso-hoy"); } catch (e) { /* si falla, se confirma sin el dato */ }
    const lineaUso = uso
      ? `\n\nHoy llevas ${formatearMiles(uso.usado)} de ${formatearMiles(uso.tope)} cambios (quedan ${formatearMiles(uso.quedan)}). Este archivo escribe como máximo ${formatearMiles(a.filas.length)} (los clientes que ya estén iguales en la base no cuentan).` +
        (uso.usado + a.filas.length > uso.tope ? ` Con este archivo podrías pasar el límite: la carga se detiene al llegar y continúas mañana subiendo el MISMO archivo.` : "") +
        ` El contador se reinicia a las 8:00 pm (hora de Caracas).`
      : "";
    if (!confirm(`La base de ${lista.length} sucursal(es) se REEMPLAZARÁ con este archivo (${formatearMiles(a.filas.length)} clientes activos): ${lista.map(([n]) => n.toUpperCase()).join(", ")}.\n\nSolo se escribe lo que cambió (nuevos, modificados y dados de baja). Máximo ${formatearMiles(CLI_TOPE_DIA)} cambios por día (límite del plan gratuito).${lineaUso}\n\n¿Continuar?`)) return;
    btn.disabled = true;
    const hechas = [], conflictos = [];
    let cargaId = null, cambiosHoy = 0, tope = false;
    try {
      for (let g = 0; g < lista.length && !tope; g++) {
        const [sucursal, filas] = lista[g];
        const etiqueta = `Sucursal ${g + 1} de ${lista.length} (${sucursal})`;
        const ini = await apiSend("/clientes/carga/iniciar", "POST", {
          sucursal, archivo: cliNombreArchivo, fecha_base: cliFechaBase, filas_leidas: filas.length, filas_descartadas: 0,
        });
        cargaId = ini.carga_id;
        if (ini.usado_hoy > cambiosHoy) cambiosHoy = ini.usado_hoy;   // lo que ya se cargó hoy cuenta para el tope
        const lotes = []; for (let i = 0; i < filas.length; i += CLI_LOTE) lotes.push(filas.slice(i, i + CLI_LOTE));
        let siguiente = 0, revisadas = 0;
        const t = { nuevas: 0, cambiadas: 0, existentes: 0 };
        const trabajador = async () => {
          while (siguiente < lotes.length && !tope) {
            const mio = lotes[siguiente++];
            const r = await apiSend("/clientes/carga/lote", "POST", { carga_id: cargaId, filas: mio });
            t.nuevas += r.nuevas; t.cambiadas += r.cambiadas; t.existentes += r.existentes;
            (r.conflictos || []).forEach((x) => conflictos.push(x));
            cambiosHoy += r.nuevas + r.cambiadas; revisadas += mio.length;
            if (cambiosHoy >= CLI_TOPE_DIA) tope = true;
            showMsg(msg, `${etiqueta}: revisadas ${formatearMiles(revisadas)} de ${formatearMiles(filas.length)} · cambios hoy: ${formatearMiles(cambiosHoy)} de ${formatearMiles(CLI_TOPE_DIA)}`, true);
          }
        };
        await Promise.all(Array.from({ length: Math.min(CLI_PARALELO, lotes.length) }, trabajador));
        const completa = !tope && revisadas >= filas.length;
        const cuerpo = { carga_id: cargaId, ...t, completa, claves: completa ? filas.map(cliCuenta).filter(Boolean) : undefined, claves_tipo: "cuenta" };
        let fin = await apiSend("/clientes/carga/finalizar", "POST", cuerpo);
        if (fin.requiere_confirmacion) {
          if (!confirm(`${sucursal.toUpperCase()}: este archivo deja fuera a ${formatearMiles(fin.bajas)} de los ${formatearMiles(fin.total)} clientes que hay hoy en la base (más del 30 %). ¿Es el archivo correcto y completo de la sucursal? Si aceptas, esos clientes se darán de baja.`)) {
            await apiSend("/clientes/carga/abortar", "POST", { carga_id: cargaId }); cargaId = null;
            hechas.push(`${sucursal}: cancelada, no se dieron de baja clientes`); continue;
          }
          fin = await apiSend("/clientes/carga/finalizar", "POST", { ...cuerpo, confirmar_bajas: true });
        }
        cargaId = null;
        hechas.push(`${fin.sucursal}: +${formatearMiles(t.nuevas)} nuevos${t.cambiadas ? `, ${formatearMiles(t.cambiadas)} actualizados` : ""}${fin.bajas ? `, ${formatearMiles(fin.bajas)} bajas` : ""} (total ${formatearMiles(fin.filas)})`);
      }
      el("cli_archivo").value = ""; el("cli_preview").classList.add("hidden");
      const dups = [...a.duplicadas, ...conflictos.map((c) => ({ serial: c.serial, conservada: c.conservada, descartadas: [c.descartada] }))];
      cliMostrarDuplicadas(dups, conflictos.length ? "(del archivo y contra otras sucursales ya cargadas)" : "del archivo");
      if (tope) {
        showMsg(msg, `Se llegó al tope de hoy (${formatearMiles(cambiosHoy)} cambios). ${hechas.join(" · ")}. MAÑANA vuelve a subir el MISMO archivo: continúa donde quedó (lo ya cargado se salta y las bajas se aplican al terminar).`, true);
      } else {
        showMsg(msg, `Base actualizada al ${fmtFecha(cliFechaBase)}. ${hechas.join(" · ")}.`, true);
        cliAnalisis = null;
      }
      cliCargarBases(); cliCargarFrescura();
      cliCruzarTickets();
      return !tope;
    } catch (err) {
      if (cargaId) { try { await apiSend("/clientes/carga/abortar", "POST", { carga_id: cargaId }); } catch (e) { /* nada */ } }
      showMsg(msg, `La carga se detuvo: ${err.message}. Lo ya cargado quedó guardado (no se pierde). ` + (hechas.length ? `Ya terminadas: ${hechas.join(" · ")}. ` : "") + "Si es el límite diario de Cloudflare, vuelve a subir el MISMO archivo mañana: continúa donde quedó.", false);
      cliCargarBases(); cliCargarFrescura();
    } finally { btn.disabled = false; }
  };
  el("cli_btn_cargar").addEventListener("click", cliCargarGrafana); window.cliCargarGrafana = cliCargarGrafana;
}

// ---------------- Auditoría SmartOLT (UI) ----------------
if (typeof document !== "undefined" && document.getElementById("cli_aud_archivo")) {
  const LOTE_AUD = 100;
  let audAnalisis = null, audNombre = "", audMeta = null, audLote = [];   // audLote: varios archivos de SmartOLT a la vez
  const el = (id) => document.getElementById(id);
  const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const fmt = (iso) => { const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(iso || ""); return m ? `${m[3]}/${m[2]}/${m[1]} ${m[4]}:${m[5]}` : (iso || ""); };
  const NOMBRE_METODO = { serial: "serial (SN)", contact: "Contact = cuenta", cuenta_en_name: "cuenta en Name", cedula_en_name: "cédula en Name", nombre: "nombre exacto único" };

  function asociacionHtml(aso) {
    if (!aso) return "";
    if (aso.error) return `<p class="msg error">No se pudo asociar con tickets: ${esc(aso.error)}</p>`;
    const t = aso.tickets || [];
    const filas = t.map((x) => `<tr><td>${esc(x.ticket_cmr)}</td><td>${x.puertos}</td><td>${x.afectados}</td><td>${x.sin_luz}</td><td>${x.caida_previa}</td><td>${x.duplicado ? "Revisar: posible ticket duplicado" : ""}</td></tr>`).join("");
    const ab = (aso.alertas || []).filter((a) => a.estado === "abierta");
    return `<h4>Asociación con tickets</h4>` + (t.length
      ? `<table class="rows-table"><thead><tr><th>Ticket CMR</th><th>Puertos</th><th>Afectados por falla</th><th>Sin electricidad</th><th>Caída previa</th><th>Aviso</th></tr></thead><tbody>${filas}</tbody></table>`
      : '<p class="hint">Ningún ticket cubre esta auditoría.</p>')
      + `<div class="kv"><div><span>Caídas previas (no se cuentan):</span> <strong>${aso.caida_previa}</strong></div></div>`
      + (ab.length ? `<p class="msg error">Posible falla no reportada: ${ab.map((a) => `${esc(a.olt)} tarjeta ${a.tarjeta} puerto ${a.puerto} (${a.n_onus} ONUs)`).join("; ")}. Revisa el cuadro de alertas.</p>` : "");
  }

  function pintarResumen(r, info, avisos, aso) {
    const m = r.metodos || {};
    const porMetodo = Object.keys(NOMBRE_METODO).filter((k) => m[k]).map((k) => `${NOMBRE_METODO[k]}: ${m[k]}`).join(" · ") || "—";
    el("cli_aud_resultado").innerHTML = `
      <h4>Resultado: ${esc(info.olt)}${info.tarjeta ? (String(info.tarjeta).includes(",") ? " · tarjetas " : " · tarjeta ") + String(info.tarjeta).replace(/,/g, ", ") : ""}${info.puerto ? (String(info.puerto).includes(",") ? " · puertos " : " · puerto ") + String(info.puerto).replace(/,/g, ", ") : ""} · auditoría del ${fmt(info.fecha_local)}</h4>
      ${(avisos || []).map((a) => `<p class="msg error">${esc(a)}</p>`).join("")}
      <div class="kv">
        <div><span>ONUs en el archivo:</span> <strong>${r.total}</strong></div>
        <div><span>Cruzadas con un cliente:</span> <strong>${r.cruzadas} de ${r.total}</strong> <small>(${r.cruzadas_activas} con contrato activo)</small></div>
        <div><span>Por método:</span> <strong>${porMetodo}</strong></div>
        <div><span>Afectadas por falla (LOS / Offline):</span> <strong>${r.falla}</strong></div>
        <div><span>Sin electricidad (Power fail):</span> <strong>${r.powerfail}</strong></div>
        <div><span>Online:</span> <strong>${r.online}</strong>${r.otro ? ` <small>· otros estados: ${r.otro}</small>` : ""}</div>
        <div><span>ONUs sin cruzar:</span> <strong>${r.sin_cruzar}</strong> <small>(${r.falla_sin_cruzar} de ellas en falla)</small></div>
      </div>
      ${asociacionHtml(aso)}
      ${r.sin_cruzar_lista && r.sin_cruzar_lista.length ? `<details><summary>Ver ONUs sin cruzar (primeras ${r.sin_cruzar_lista.length})</summary>
        <table class="rows-table"><thead><tr><th>SN</th><th>Name</th><th>Contact</th><th>Estado</th><th>Tarjeta</th><th>Puerto</th><th>Último cambio</th></tr></thead><tbody>${
          r.sin_cruzar_lista.map((o) => `<tr><td>${esc(o.sn)}</td><td>${esc(o.name_smartolt)}</td><td>${esc(o.contact)}</td><td>${esc(o.status)}</td><td>${o.tarjeta ?? ""}</td><td>${o.puerto ?? ""}</td><td>${fmt(o.last_status_change)}</td></tr>`).join("")}</tbody></table></details>` : ""}`;
  }

  async function cargarAuditorias() {
    const cont = el("cli_auditorias");
    try {
      const d = await apiGet("/clientes/auditorias");
      cont.innerHTML = d.auditorias.length
        ? `<table class="rows-table"><thead><tr><th>Fecha de auditoría</th><th>OLT</th><th>Tarj.</th><th>Puerto</th><th>ONUs</th><th>Cruzadas</th><th>Falla</th><th>Power fail</th><th>Caída previa</th><th>Tickets</th><th>Alertas</th><th>Base desact.</th><th>Subida por</th><th></th></tr></thead><tbody>${
          d.auditorias.map((a) => `<tr><td>${fmt(a.fecha_auditoria_local)}</td><td>${esc(a.olt_nombre)}</td><td>${a.tarjeta ?? "—"}</td><td>${a.puerto ?? "—"}</td><td>${a.total_onus}</td><td>${a.cruzadas}</td><td>${a.falla}</td><td>${a.powerfail}</td><td>${a.caida_previa || 0}</td><td>${a.n_tickets || 0}</td><td>${a.n_alertas || 0}</td><td>${a.desactualizadas ? "Sí" : "No"}</td><td>${esc(a.usuario)}</td><td><button type="button" class="btn-secondary cli-recruzar" data-id="${a.id}">Re-cruzar</button></td></tr>`).join("")}</tbody></table>`
        : '<p class="hint">Todavía no hay auditorías cargadas.</p>';
      cont.querySelectorAll(".cli-recruzar").forEach((b) => b.addEventListener("click", () => recruzar(Number(b.dataset.id), b)));
    } catch (err) { cont.innerHTML = `<p class="msg error">${esc(err.message)}</p>`; }
  }
  async function cargarAlertas() {
    const cont = el("cli_alertas");
    if (!cont) return;
    try {
      const estado = el("cli_alertas_estado") ? el("cli_alertas_estado").value : "abierta";
      const d = await apiGet("/clientes/alertas?estado=" + encodeURIComponent(estado));
      cont.innerHTML = d.alertas.length
        ? `<table class="rows-table"><thead><tr><th>Auditoría</th><th>OLT</th><th>Tarj.</th><th>Puerto</th><th>ONUs afectadas</th><th>Estado</th><th>Ticket</th><th>Comentario</th><th></th></tr></thead><tbody>${
          d.alertas.map((a) => `<tr><td>${fmt(a.fecha_auditoria_local)}</td><td>${esc(a.olt)}</td><td>${a.tarjeta}</td><td>${a.puerto}</td><td>${a.n_onus}</td><td>${esc(a.estado)}</td><td>${esc(a.ticket_cmr || "")}</td><td>${esc(a.comentario || "")}</td><td>${a.estado === "abierta" ? `<button type="button" class="btn-secondary cli-descartar" data-id="${a.id}">Descartar</button>` : ""}</td></tr>`).join("")}</tbody></table>`
        : '<p class="hint">No hay alertas en este estado.</p>';
      cont.querySelectorAll(".cli-descartar").forEach((b) => b.addEventListener("click", async () => {
        const c = window.prompt("Comentario para descartar la alerta (obligatorio):");
        if (c === null) return;
        try { await apiSend("/clientes/alertas/descartar", "POST", { id: Number(b.dataset.id), comentario: c }); cargarAlertas(); cargarAuditorias(); }
        catch (err) { window.alert(err.message); }
      }));
    } catch (err) { cont.innerHTML = `<p class="msg error">${esc(err.message)}</p>`; }
  }
  if (el("cli_alertas_estado")) el("cli_alertas_estado").addEventListener("change", cargarAlertas);
  window.cliCargarAuditorias = () => { cargarAuditorias(); cargarAlertas(); };

  async function recruzar(id, btn) {
    const msg = el("cli_aud_msg_carga");
    btn.disabled = true;
    try {
      let desde = 0, hechas = 0, r;
      for (;;) {
        r = await apiSend("/clientes/auditoria/recruzar", "POST", { auditoria_id: id, desde_id: desde });
        if (r.siguiente === null) break;
        desde = r.siguiente; hechas += r.procesadas;
        showMsg(msg, `Re-cruzando… ${hechas} ONUs`, true);
      }
      showMsg(msg, `Auditoría re-cruzada con las bases actuales: ${r.resumen.cruzadas} de ${r.resumen.total} ONUs cruzadas.`, true);
      pintarResumen(r.resumen, { olt: "Re-cruce", fecha_local: "" }, []);
      cargarAuditorias();
    } catch (err) { showMsg(msg, err.message, false); } finally { btn.disabled = false; }
  }

  const audAnalizar = async () => {
    const msg = el("cli_aud_msg_analisis");
    el("cli_aud_preview").classList.add("hidden"); el("cli_aud_resultado").innerHTML = ""; el("cli_aud_lote").innerHTML = "";
    audLote = []; audAnalisis = null;
    const archivos = Array.from(el("cli_aud_archivo").files);
    if (!archivos.length) return showMsg(msg, "Elige primero el archivo CSV de SmartOLT.", false);
    if (archivos.length > 1) return audAnalizarVarios(archivos, msg);
    el("cli_aud_fecha").closest(".field").classList.remove("hidden");
    const f = archivos[0];
    try {
      const a = cliParsearAuditoria(cliDecodificar(new Uint8Array(await f.arrayBuffer())));
      if (!a.onus.length) throw new Error("El archivo no trae ninguna ONU legible.");
      const meta = cliParsearNombreSmartolt(f.name);
      if (!meta) throw new Error("El nombre del archivo no tiene el formato de SmartOLT (SmartOLT_oltid_…_onus_list_AAAA-MM-DD_HH_MM_SS…). No se puede saber la hora de la auditoría.");
      audAnalisis = a; audNombre = f.name; audMeta = meta;
      const olts = Object.entries(a.olts).sort((x, y) => y[1] - x[1]);
      el("cli_aud_olt").textContent = olts.map(([o, n]) => `${o} (${n})`).join(", ");
      const nCientS = a.onus.filter((x) => cliSerialEsCientifico(x.sn)).length;
      el("cli_aud_aviso_olt").textContent = (olts.length > 1 ? "Ojo: el archivo trae más de una OLT. " : "") + (nCientS ? `Ojo: ${nCientS} serial(es) venían en notación científica; se convirtieron a número completo, pero si Excel los redondeó pueden estar incompletos.` : "");
      el("cli_aud_filtro").textContent = `${meta.tarjetaTxt ? (meta.tarjetaTxt.includes(",") ? "tarjetas " : "tarjeta ") + meta.tarjetaTxt.replace(/,/g, ", ") : "toda la OLT"}${meta.puertoTxt ? (meta.puertoTxt.includes(",") ? ", puertos " : ", puerto ") + meta.puertoTxt.replace(/,/g, ", ") : ""}${meta.estado ? ", estado " + meta.estado : ""}`;
      el("cli_aud_onus").textContent = `${a.onus.length}${a.malformadas.length ? " (+" + a.malformadas.length + " filas mal formadas descartadas)" : ""}`;
      el("cli_aud_estados").textContent = Object.entries(a.estados).map(([k, v]) => `${k}: ${v}`).join(" · ");
      el("cli_aud_utc").textContent = fmt(meta.utc) + " (UTC)";
      el("cli_aud_fecha").value = meta.local.slice(0, 16);
      el("cli_aud_preview").classList.remove("hidden");
      showMsg(msg, "Archivo analizado. Confirma la hora de la auditoría (hora de Caracas) y carga.", true);
    } catch (err) { showMsg(msg, err.message, false); }
  };

  // ---- Varios archivos de SmartOLT a la vez: se analizan todos y se cargan uno por uno, del más antiguo al más reciente ----
  async function audAnalizarVarios(archivos, msg) {
    const vistos = new Set(), items = [], problemas = [];
    for (let i = 0; i < archivos.length; i++) {
      const f = archivos[i];
      showMsg(msg, `Leyendo archivos… ${i + 1} de ${archivos.length}`, true);
      await pausa2();
      if (vistos.has(f.name)) { problemas.push(`${f.name}: repetido, se ignora`); continue; }
      vistos.add(f.name);
      try {
        const a = cliParsearAuditoria(cliDecodificar(new Uint8Array(await f.arrayBuffer())));
        if (!a.onus.length) throw new Error("no trae ninguna ONU legible");
        const meta = cliParsearNombreSmartolt(f.name);
        if (!meta) throw new Error("el nombre no tiene el formato de SmartOLT");
        const olt = Object.entries(a.olts).sort((x, y) => y[1] - x[1])[0][0];
        items.push({ nombre: f.name, a, meta, olt });
      } catch (err) { problemas.push(`${f.name}: ${err.message}`); }
    }
    if (!items.length) return showMsg(msg, "Ninguno de los archivos se pudo leer. " + problemas.slice(0, 5).join(" · "), false);
    // Los que ya se cargaron antes (mismo nombre de archivo) se saltan, para no duplicar auditorías al reanudar
    let yaCargados = 0;
    try {
      const ya = new Set((await apiSend("/clientes/auditoria/existentes", "POST", { archivos: items.map((x) => x.nombre) })).cargados || []);
      yaCargados = items.filter((x) => ya.has(x.nombre)).length;
      for (let i = items.length - 1; i >= 0; i--) if (ya.has(items[i].nombre)) items.splice(i, 1);
    } catch (e) { /* si falla la consulta se cargan todos */ }
    if (!items.length) { audLote = []; return showMsg(msg, `Los ${yaCargados} archivos ya estaban cargados: no queda nada por subir.`, true); }
    items.sort((x, y) => String(x.meta.utc).localeCompare(String(y.meta.utc)));
    audLote = items;
    const totalOnus = items.reduce((t, x) => t + x.a.onus.length, 0);
    const olts = new Set(items.map((x) => x.olt));
    const estados = {}; items.forEach((x) => Object.entries(x.a.estados).forEach(([k, v]) => { estados[k] = (estados[k] || 0) + v; }));
    el("cli_aud_olt").textContent = `${olts.size} OLT distinta(s)`; el("cli_aud_aviso_olt").textContent = "";
    el("cli_aud_filtro").textContent = `${items.length} archivos`;
    el("cli_aud_onus").textContent = formatearMiles(totalOnus);
    el("cli_aud_estados").textContent = Object.entries(estados).map(([k, v]) => `${k}: ${formatearMiles(v)}`).join(" · ");
    el("cli_aud_utc").textContent = `${fmt(items[0].meta.utc)} a ${fmt(items[items.length - 1].meta.utc)} (UTC)`;
    el("cli_aud_fecha").closest(".field").classList.add("hidden");   // en lote se usa la hora del nombre de cada archivo
    el("cli_aud_lote").innerHTML = `<p class="hint">Se cargarán uno por uno, del más antiguo al más reciente, con la hora de Caracas que trae el nombre de cada archivo, en tandas de ${TANDA_AUD} archivos: al terminar cada tanda pulsas «Confirmar y cargar» otra vez. Si D1 llega a su tope diario (margen de 1.000), no se puede subir nada más hasta las 8:00 pm.</p>` +
      `<table class="rows-table"><thead><tr><th>Archivo / OLT</th><th>ONUs</th><th>Hora (Caracas)</th></tr></thead><tbody>` +
      items.map((x) => `<tr><td>${esc(x.olt)} <small>${esc(x.nombre.slice(0, 60))}</small></td><td>${x.a.onus.length}</td><td>${esc(fmt(x.meta.local))}</td></tr>`).join("") + `</tbody></table>` +
      (yaCargados ? `<p class="hint">Se saltan ${yaCargados} archivo(s) que ya estaban cargados.</p>` : "") + (problemas.length ? `<p class="msg error">No se incluyen ${problemas.length} archivo(s): ${problemas.slice(0, 8).map(esc).join(" · ")}${problemas.length > 8 ? " …" : ""}</p>` : "");
    el("cli_aud_preview").classList.remove("hidden");
    showMsg(msg, `${items.length} archivos por cargar (${formatearMiles(totalOnus)} ONUs)${yaCargados ? `, ${yaCargados} ya estaban cargados` : ""}. Revisa y confirma la carga.`, true);
  }
  const pausa2 = () => new Promise((r) => setTimeout(r, 0));
  el("cli_aud_btn_analizar").addEventListener("click", audAnalizar); window.cliAnalizarAuditoria = audAnalizar;

  // ---- Aviso de diferencia de fechas entre SmartOLT y Grafana (no bloquea: pide confirmación) ----
  const textoDiferencia = (h) => {
    if (h < 24) { const n = Math.round(h); return `${n} ${n === 1 ? "hora" : "horas"}`; }
    const d = Math.round(h / 24); return `${d} ${d === 1 ? "día" : "días"}`;
  };
  const MESES_C = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
  const fechaCorta = (iso) => { const m = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})/.exec(iso || ""); return m ? `${+m[3]} ${MESES_C[+m[2] - 1]} · ${m[4]}:${m[5]}` : (iso || ""); };
  const SVG_OJO = `<svg viewBox="0 0 120 100" width="84" height="70" aria-hidden="true"><defs><linearGradient id="gOjo" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#FFC83A"/><stop offset="1" stop-color="#F29A00"/></linearGradient></defs><path d="M6 46C26 14 94 14 114 46C94 78 26 78 6 46Z" fill="url(#gOjo)"/><ellipse cx="58" cy="46" rx="30" ry="25" fill="#fff"/><circle cx="58" cy="46" r="16" fill="#F5A300"/><circle cx="58" cy="46" r="10" fill="#1d1d1d"/><circle cx="54" cy="42" r="3" fill="#fff" opacity=".6"/><path d="M84 58L110 100H58Z" fill="#E8503A" stroke="#E8503A" stroke-width="6" stroke-linejoin="round"/><path d="M84 66L102 95H66Z" fill="#fff" stroke="#fff" stroke-width="2" stroke-linejoin="round"/><rect x="82" y="73" width="4" height="12" rx="2" fill="#E8503A"/><circle cx="84" cy="90" r="2.4" fill="#E8503A"/></svg>`;
  const SVG_LUPA = `<svg viewBox="0 0 64 64" width="46" height="46" aria-hidden="true"><path d="M10 6h26l12 12v34a4 4 0 0 1-4 4H10a4 4 0 0 1-4-4V10a4 4 0 0 1 4-4Z" fill="#fff" stroke="#111" stroke-width="3" stroke-linejoin="round"/><path d="M36 6v10a2 2 0 0 0 2 2h10Z" fill="#FFB84D" stroke="#111" stroke-width="3" stroke-linejoin="round"/><path d="M14 18h14M14 27h22M14 36h16M14 45h12" stroke="#111" stroke-width="3" stroke-linecap="round"/><path d="M47 47l11 11" stroke="#111" stroke-width="9" stroke-linecap="round"/><path d="M47 47l11 11" stroke="#F4645F" stroke-width="4" stroke-linecap="round"/><circle cx="38" cy="38" r="12" fill="#fff" stroke="#111" stroke-width="3"/><circle cx="38" cy="38" r="8" fill="#74D6FF" stroke="#111" stroke-width="2"/></svg>`;
  function confirmarDiferenciaFechas(bases, fechaSmart, nLote) {
    return new Promise((resolve) => {
      const ov = document.createElement("div");
      ov.className = "modal-overlay";
      const bloques = bases.map((b) => `
        <div class="dif-bloque">
          <div class="dif-linea2">${SVG_LUPA}<span>Hay <b>${textoDiferencia(b.horas)}</b> entre SmartOLT y Grafana${bases.length > 1 ? " (" + esc(b.sucursal) + ")" : ""}</span></div>
          <div class="dif-fechas">
            <div><div class="dif-plat">SmartOLT</div><div class="dif-fecha">${fechaCorta(fechaSmart)}</div></div>
            <div class="dif-vs">vs</div>
            <div><div class="dif-plat">Grafana${bases.length > 1 ? "" : " · " + esc(b.sucursal)}</div><div class="dif-fecha">${fechaCorta(b.fecha_base)}</div></div>
          </div>
        </div>`).join("");
      ov.innerHTML = `<div class="modal-box modal-dif" role="dialog" aria-modal="true">
        <div class="dif-ojo">${SVG_OJO}</div>
        ${bloques}
        ${nLote > 1 ? `<p class="hint">Es el primer aviso del lote de ${nLote} archivos: si continúas, no se vuelve a preguntar en los demás.</p>` : ""}
        <p class="dif-pregunta">¿Seguro que quieres proseguir con la carga?</p>
        <div class="modal-botones"><button type="button" class="btn-secondary" id="dif_no">Cancelar</button><button type="button" class="btn-primary" id="dif_si">Sí, continuar</button></div>
      </div>`;
      document.body.appendChild(ov);
      const fin = (v) => { ov.remove(); resolve(v); };
      ov.querySelector("#dif_no").addEventListener("click", () => fin(false));
      ov.querySelector("#dif_si").addEventListener("click", () => fin(true));
      ov.querySelector("#dif_no").focus();
    });
  }

  // Sube una auditoría (un archivo) y la cruza. Devuelve { fin, avisos, olt }, o null si el usuario canceló por la diferencia de fechas.
  async function subirAuditoria(it, hora, msg, opts = {}) {
    let audId = null;
    try {
      const ini = await apiSend("/clientes/auditoria/iniciar", "POST", {
        archivo: it.nombre, olt_id_smartolt: it.meta.oltid, olt_nombre: it.olt, tarjeta: it.meta.tarjeta, puerto: it.meta.puerto,
        estado_filtro: it.meta.estado, fecha_auditoria_utc: it.meta.utc, fecha_auditoria_local: hora.length === 16 ? hora + ":00" : hora, total_onus: it.a.onus.length,
      });
      audId = ini.auditoria_id;
      const fechaSmart = hora.length === 16 ? hora + ":00" : hora;
      const difs = ini.bases.filter((b) => b.desactualizada);
      if (difs.length && !(opts.acepta && opts.acepta.ok)) {
        if (!(await confirmarDiferenciaFechas(difs, fechaSmart, opts.nLote || 1))) {
          try { await apiSend("/clientes/auditoria/abortar", "POST", { auditoria_id: audId }); } catch (e) { /* nada */ }
          audId = null;
          return null;
        }
        if (opts.acepta) opts.acepta.ok = true;
      }
      const avisos = difs.map((b) => `Se cargó con ${textoDiferencia(b.horas)} de diferencia entre la base de Grafana de ${b.sucursal} (${fmt(b.fecha_base)}) y SmartOLT (${fmt(fechaSmart)}). Si quieres, sube un archivo más cercano en fecha y pulsa «Re-cruzar».`);
      let lecturas = 0;
      for (let i = 0; i < it.a.onus.length; i += LOTE_AUD) {
        const rl = await apiSend("/clientes/auditoria/lote", "POST", { auditoria_id: audId, onus: it.a.onus.slice(i, i + LOTE_AUD) });
        lecturas += Number(rl.lecturas || 0);
        showMsg(msg, `${opts.prefijo || ""}Cruzando… ${Math.min(i + LOTE_AUD, it.a.onus.length)} de ${it.a.onus.length}`, true);
      }
      const fin = await apiSend("/clientes/auditoria/finalizar", "POST", { auditoria_id: audId, esperadas: it.a.onus.length });
      audId = null;
      return { fin, avisos, olt: it.olt, lecturas };
    } catch (err) {
      if (audId) { try { await apiSend("/clientes/auditoria/abortar", "POST", { auditoria_id: audId }); } catch (e) { /* nada */ } }
      throw err;
    }
  }

  const TANDA_AUD = 25;   // archivos de SmartOLT por pulsación: así el consumo diario de D1 se puede vigilar entre tandas
  const audCargarVarios = async () => {
    const msg = el("cli_aud_msg_carga"), btn = el("cli_aud_btn_cargar");
    const todos = audLote.slice(), lote = todos.slice(0, TANDA_AUD), acepta = { ok: false }, filas = [];
    let hechas = 0, detenido = null;
    btn.disabled = true;
    try {
      for (let i = 0; i < lote.length; i++) {
        const it = lote[i];
        const prefijo = `Archivo ${i + 1} de ${lote.length}${todos.length > lote.length ? ` (tanda de ${todos.length})` : ""} (${it.olt}): `;
        let r;
        try { r = await subirAuditoria(it, it.meta.local.slice(0, 16), msg, { acepta, nLote: lote.length, prefijo }); }
        catch (err) { detenido = `Se detuvo en el archivo ${i + 1} de ${todos.length} (${it.olt}): ${err.message}`; break; }
        if (!r) { detenido = `Cargas canceladas desde el archivo ${i + 1} de ${lote.length}.`; break; }
        hechas++;
        filas.push(`<tr><td>${esc(it.olt)}</td><td>${r.fin.resumen.total}</td><td>${r.fin.resumen.cruzadas}</td><td>${esc(fmt(r.fin.auditoria.fecha_local))}</td><td>${formatearMiles(r.lecturas)}</td></tr>`);
        audLote = todos.slice(i + 1);
      }
      el("cli_aud_resultado").innerHTML = filas.length ? `<h4>Auditorías cargadas en este lote (${hechas})</h4><table class="rows-table"><thead><tr><th>OLT</th><th>ONUs</th><th>Cruzadas</th><th>Hora (Caracas)</th><th>Lecturas D1</th></tr></thead><tbody>${filas.join("")}</tbody></table>` : "";
      cargarAlertas(); cargarAuditorias();
      if (detenido) {
        const pend = todos.slice(hechas);
        el("cli_aud_lote").innerHTML = `<p class="msg error">Quedan ${pend.length} archivo(s) sin cargar:</p><ul>${pend.slice(0, 40).map((x) => `<li>${esc(x.olt)} <small>${esc(x.nombre.slice(0, 70))}</small></li>`).join("")}${pend.length > 40 ? `<li>… y ${pend.length - 40} más</li>` : ""}</ul>`;
        showMsg(msg, `${hechas} de ${todos.length} archivos cargados. ${detenido} Lo ya cargado quedó guardado. Pulsa «Confirmar y cargar» para seguir con los pendientes (si fue el límite diario de D1, mañana después de las 8:00 pm).`, false);
        return false;
      }
      if (todos.length > lote.length) {
        const resto = todos.length - lote.length;
        el("cli_aud_lote").innerHTML = `<p class="hint">Quedan ${resto} archivo(s) para la siguiente tanda.</p>`;
        showMsg(msg, `Tanda lista: ${hechas} auditorías cargadas. Quedan ${resto} archivos: revisa el consumo de D1 y pulsa «Confirmar y cargar» para seguir con la siguiente tanda de ${Math.min(TANDA_AUD, resto)}.`, true);
        cliCargarUso();
        return false;
      }
      el("cli_aud_preview").classList.add("hidden"); el("cli_aud_archivo").value = ""; audLote = [];
      showMsg(msg, `Listo: ${hechas} auditorías cargadas y cruzadas.`, true);
      return true;
    } finally { btn.disabled = false; }
  };

  const audCargar = async () => {
    if (audLote.length > 1 || (audLote.length === 1 && !audAnalisis)) return audCargarVarios();
    const msg = el("cli_aud_msg_carga"), btn = el("cli_aud_btn_cargar");
    if (!audAnalisis) return showMsg(msg, "Analiza primero el archivo.", false);
    const hora = el("cli_aud_fecha").value;
    if (!hora) return showMsg(msg, "Confirma la fecha y hora de la auditoría.", false);
    const a = audAnalisis;
    const olt = Object.entries(a.olts).sort((x, y) => y[1] - x[1])[0][0];
    btn.disabled = true;
    try {
      const r = await subirAuditoria({ nombre: audNombre, a, meta: audMeta, olt }, hora, msg);
      if (!r) { showMsg(msg, "Carga cancelada: no se guardó nada.", false); return false; }
      const { fin, avisos } = r;
      showMsg(msg, `Auditoría cargada: ${fin.resumen.cruzadas} de ${fin.resumen.total} ONUs cruzadas.`, true);
      pintarResumen(fin.resumen, { olt, tarjeta: audMeta.tarjetaTxt, puerto: audMeta.puertoTxt, fecha_local: fin.auditoria.fecha_local }, avisos, fin.asociacion);
      cargarAlertas();
      el("cli_aud_preview").classList.add("hidden"); el("cli_aud_archivo").value = ""; audAnalisis = null;
      cargarAuditorias();
      return true;
    } catch (err) {
      showMsg(msg, "La carga falló y no se guardó nada: " + err.message, false);
    } finally { btn.disabled = false; }
  };
  el("cli_aud_btn_cargar").addEventListener("click", audCargar); window.cliCargarAuditoria = audCargar;

  // ---- Carga conjunta: un solo botón para analizar y otro para cargar (Grafana primero, luego SmartOLT) ----
  let listo = { g: false, s: false };
  const oculto = (id) => el(id).classList.contains("hidden");
  el("cli_u_analizar").addEventListener("click", async () => {
    const msg = el("cli_u_msg"), btn = el("cli_u_cargar");
    btn.disabled = true; listo = { g: false, s: false };
    const g = el("cli_archivo").files[0], s = el("cli_aud_archivo").files[0];
    if (!g && !s) return showMsg(msg, "Elige al menos un archivo: el de Grafana, el de SmartOLT o los dos.", false);
    el("cli_msg_analisis").textContent = ""; el("cli_aud_msg_analisis").textContent = "";
    if (g) await window.cliAnalizarGrafana(); else { el("cli_preview").classList.add("hidden"); }
    if (s) await window.cliAnalizarAuditoria(); else { el("cli_aud_preview").classList.add("hidden"); }
    listo.g = !!g && !oculto("cli_preview") && !el("cli_btn_cargar").disabled;
    listo.s = !!s && !oculto("cli_aud_preview");
    const partes = [];
    if (g) partes.push("Grafana: " + (listo.g ? "listo" : "con problemas (ver detalle abajo)"));
    if (s) partes.push("SmartOLT: " + (listo.s ? "listo" : "con problemas (ver detalle abajo)"));
    btn.disabled = !(listo.g || listo.s);
    showMsg(msg, partes.join(" · ") + (btn.disabled ? "." : ". Revisa los resúmenes y confirma la carga."), !btn.disabled);
  });
  el("cli_u_cargar").addEventListener("click", async () => {
    const msg = el("cli_u_msg"), btn = el("cli_u_cargar");
    const hecho = [];
    btn.disabled = true;
    try {
      if (listo.g) {
        showMsg(msg, "Cargando la base de Grafana…", true);
        const ok = await window.cliCargarGrafana();
        if (!ok) { showMsg(msg, "La carga de Grafana no terminó (mira el mensaje de abajo)." + (listo.s ? " El archivo de SmartOLT NO se cargó: se cruzaría con una base incompleta. Súbelo de nuevo cuando termine Grafana." : ""), false); btn.disabled = false; return; }
        hecho.push("Grafana");
      }
      if (listo.s) {
        showMsg(msg, "Cargando y cruzando SmartOLT con la base…", true);
        const ok = await window.cliCargarAuditoria();
        if (!ok) { showMsg(msg, (hecho.length ? "Grafana quedó cargada. " : "") + "La carga de SmartOLT no se completó (mira el mensaje de abajo).", false); btn.disabled = false; return; }
        hecho.push("SmartOLT");
      }
      listo = { g: false, s: false };
      showMsg(msg, "Carga terminada: " + hecho.join(" y ") + ".", true);
    } catch (err) { showMsg(msg, err.message, false); }
  });
  const irInf = el("cli_ir_informe");
  if (irInf) irInf.addEventListener("click", () => { const b = document.querySelector('.tab-btn[data-tab="informe_clientes"]'); if (b) b.click(); window.scrollTo(0, 0); });
  cargarAuditorias();
  cargarAlertas();
}


// ---------------------------------------------------------------
// CLIENTES AFECTADOS — Paso 6: consulta y descarga (Excel con dos hojas)
// ---------------------------------------------------------------
// CCA-PURE-START (sin DOM: se prueba aparte)
const CCA_ETIQUETA_TIPO = { falla: "Afectado (falla)", powerfail: "Sin electricidad", caida_previa: "Caída previa" };
// Primero las columnas que necesita el bot y después las del ticket
const CCA_COLUMNAS = [
  ["nombre", "Nombre / Compañía"], ["telefono_casa", "Teléfono de casa"], ["telefono_oficina", "Teléfono de oficina"], ["cuenta", "Número de cuenta"],
  ["sector", "Sector"], ["identificacion_externo", "Identificación externo"], ["estado_contrato", "Estado del contrato"],
  ["ticket_cmr", "Nº Ticket"], ["estado_ticket", "Estado del ticket"], ["oficina", "Oficina"], ["olt", "OLT"], ["tarjeta", "Tarjeta"], ["puerto", "Puerto"],
  ["fecha_auditoria", "Fecha de la auditoría"], ["clasificacion", "Tipo de afectación"],
  ["apertura_cda", "Registro CDA"], ["apertura_cmr", "Apertura CMR"], ["fecha_falla", "Fecha de la falla"], ["solucion_cda", "Solución CDA"], ["solucion_cmr", "Solución CMR"],
  ["cierre_cda", "Cierre CDA"], ["cierre_cmr", "Cierre CMR"], ["observacion", "Observación"],
];
const CCA_CAMPOS_FECHA = new Set(["fecha_auditoria", "fecha_falla", "apertura_cda", "apertura_cmr", "solucion_cda", "solucion_cmr", "cierre_cda", "cierre_cmr"]);
const CCA_HOJA_CLIENTES = "Clientes afectados";
const CCA_TITULO_SECTORES = "Sectores por cantidad de clientes activos";
const CCA_HOJA_SECTORES = "Sectores por clientes activos";   // Excel limita el nombre de una hoja a 31 caracteres
function ccaNormSector(s) {
  const t = String(s ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().replace(/[.,;:()\-_/]+/g, " ").replace(/\s+/g, " ").trim();
  return t || "SIN SECTOR";
}
function ccaValorCelda(campo, v, fmtFecha) {
  if (v === null || v === undefined) return "";
  if (campo === "clasificacion") return CCA_ETIQUETA_TIPO[v] || v;
  if (CCA_CAMPOS_FECHA.has(campo)) return v ? fmtFecha(v) : "";
  return v;
}
function ccaFilasExcel(filas, fmtFecha) {
  return filas.map((f) => { const o = {}; CCA_COLUMNAS.forEach(([c, t]) => { o[t] = ccaValorCelda(c, f[c], fmtFecha); }); return o; });
}
// Sectores con más clientes activos primero (cada cliente cuenta una vez aunque salga en varias ONUs o tickets)
function ccaSectores(filas) {
  const vistos = new Set(), cuenta = new Map();
  filas.forEach((f) => {
    if (!f.cuenta || String(f.estado_contrato || "").trim().toLowerCase() !== "activo" || vistos.has(f.cuenta)) return;
    vistos.add(f.cuenta);
    const k = ccaNormSector(f.sector);
    cuenta.set(k, (cuenta.get(k) || 0) + 1);
  });
  const total = vistos.size;
  return [...cuenta.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "es"))
    .map(([sector, n]) => ({ sector, clientes: n, porcentaje: total ? Math.round((n / total) * 10000) / 100 : 0 }));
}
const CCA_HOJA_TICKETS = "Resumen por ticket";
function ccaResumenTickets(filas, fmtFecha) {
  const m = new Map();
  for (const f of filas) {
    if (!m.has(f.ticket_cmr)) m.set(f.ticket_cmr, { f, cuentas: new Set(), onus: 0, sinCruzar: 0 });
    const t = m.get(f.ticket_cmr); t.onus++; if (f.cuenta) t.cuentas.add(f.cuenta); else t.sinCruzar++;
  }
  return [...m.values()].map(({ f, cuentas, onus, sinCruzar }) => ({
    "Nº Ticket": f.ticket_cmr, "Estado del ticket": f.estado_ticket || "", "Oficina": f.oficina || "",
    "Fecha de la falla": ccaValorCelda("fecha_falla", f.fecha_falla, fmtFecha), "Apertura CMR": ccaValorCelda("apertura_cmr", f.apertura_cmr, fmtFecha),
    "Solución CMR": ccaValorCelda("solucion_cmr", f.solucion_cmr, fmtFecha), "Cierre CMR": ccaValorCelda("cierre_cmr", f.cierre_cmr, fmtFecha),
    "Clientes": cuentas.size, "ONUs": onus, "ONUs sin cruzar": sinCruzar,
  }));
}
function ccaHojaSectores(filas) {
  const sec = ccaSectores(filas);
  return [[CCA_TITULO_SECTORES], [], ["Sector", "Clientes activos", "% del total"], ...sec.map((s) => [s.sector, s.clientes, s.porcentaje]),
    [], ["Total de clientes activos", sec.reduce((a, s) => a + s.clientes, 0), sec.length ? 100 : 0]];
}
// CCA-PURE-END

(function () {
  const el = (id) => document.getElementById(id);
  if (!el("cca_buscar")) return;
  const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const fmtF = (iso) => { const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(iso || ""); return m ? `${m[3]}/${m[2]}/${m[1]} ${m[4]}:${m[5]}` : (iso || ""); };
  const num = (n) => Number(n || 0).toLocaleString("es-VE");
  let ultimo = null, ultimaQuery = null, grid = null;   // lo que se ve en pantalla y con qué filtros se buscó

  function queryActual() {
    const p = new URLSearchParams();
    const v = (id) => el(id).value.trim();
    if (v("cca_ticket")) p.set("ticket", v("cca_ticket"));
    if (v("cca_oficina")) p.set("oficina_id", v("cca_oficina"));
    if (v("cca_olt")) p.set("olt", v("cca_olt").toUpperCase());
    if (v("cca_estado")) p.set("estado_ticket", v("cca_estado"));
    if (el("cca_historico").checked) p.set("historico", "1");
    if (v("cca_desde")) p.set("desde", v("cca_desde"));
    if (v("cca_hasta")) p.set("hasta", v("cca_hasta"));
    p.set("tipos", ["falla", "powerfail", "caida_previa"].filter((t) => el("cca_t_" + t).checked).join(","));
    if (el("cca_activos").checked) p.set("activos", "1");
    if (el("cca_sin_cruzar").checked) p.set("sin_cruzar", "1");
    return p.toString();
  }
  function cargarOpciones() {
    const L = (typeof LOOKUPS !== "undefined" && LOOKUPS) || {};
    const sel = el("cca_oficina"), actual = sel.value;
    sel.innerHTML = '<option value="">Todas</option>' + (L.oficinas || []).map((o) => `<option value="${esc(o.id)}">${esc(o.nombre)}</option>`).join("");
    sel.value = actual;
    const se = el("cca_estado"), ae = se.value;
    se.innerHTML = '<option value="">Todos</option>' + (L.estados_ticket || []).map((o) => `<option value="${esc(o.nombre)}">${esc(o.nombre)}</option>`).join("");
    se.value = ae;
    el("cca_olts").innerHTML = (L.olts || []).map((o) => `<option value="${esc(o.codigo)}"></option>`).join("");
  }
  async function cargarDomino() {
    const caja = el("cca_domino"); if (!caja) return;
    try {
      const d = await apiGet("/clientes/tickets-activos");
      if (!d.tickets.length) { caja.innerHTML = '<div class="dom-wrap"><h4>Tickets activos</h4><p class="hint">No hay tickets con falla activa.</p></div>'; return; }
      const fichas = d.tickets.map((t) => `<button type="button" class="dom-ficha ${t.cruzado ? "dom-ok" : "dom-no"}" data-ticket="${esc(t.ticket_cmr)}" title="${esc(t.oficinas || "Sin oficina")} · ${esc(t.estado_ticket || "")}${t.cruzado ? "" : " · sin clientes cruzados"}">` +
        `<span class="dom-num">${esc(t.ticket_cmr)}</span><span class="dom-med">${t.total ? num(t.cruzadas) + " de " + num(t.total) : "sin ONUs"}</span></button>`).join("");
      caja.innerHTML = `<div class="dom-wrap"><h4>Tickets activos (${num(d.tickets.length)})</h4><div class="dom-tablero">${fichas}</div>` +
        `<div class="dom-leyenda"><span><i class="dom-ok"></i>Cruzado: se consiguió el cliente de Grafana de al menos una ONU del ticket (${num(d.cruzados)})</span>` +
        `<span><i class="dom-no"></i>Sin cruzar: falla activa sin ningún cliente cruzado (${num(d.sin_cruzar)})</span></div>` +
        `<p class="hint">Cada ficha muestra el número del ticket y, abajo, cuántas ONUs se cruzaron de las que tiene. Pulsa una ficha para ver sus clientes en la tabla.</p></div>`;
      caja.querySelectorAll(".dom-ficha").forEach((b) => b.addEventListener("click", () => { el("cca_ticket").value = b.dataset.ticket; buscar(); }));
    } catch (err) { caja.innerHTML = ""; }
  }
  window.ccaCargarOpciones = () => { cargarOpciones(); cargarDomino(); if (grid) setTimeout(() => { const g = el("cca_grid"); if (g) { g.style.height = Math.max(360, window.innerHeight - g.getBoundingClientRect().top - 14) + "px"; grid.setHeight(g.style.height); grid.redraw(true); } }, 50); };
  function pintar(d) {
    const r = d.resumen, filas = d.filas;
    const tile = (n, t) => `<div class="ml-tile"><b>${num(n)}</b><span>${t}</span></div>`;
    el("cca_resumen").innerHTML = `<div class="ml-tiles">${tile(r.clientes, "Clientes")}${tile(r.onus, "ONUs en la lista")}${tile(r.tickets, "Tickets")}` +
      `${tile(r.sin_cruzar_excluidas, "ONUs sin cruzar no incluidas")}${tile(r.no_activos_excluidos, "Clientes no activos no incluidos")}</div>` +
      (r.truncado ? '<div class="ml-badge b-aviso">La lista es muy grande: se muestran solo los primeros 60.000 registros. Acota los filtros.</div>' : "");
    if (grid) { try { grid.destroy(); } catch (e) { /* ya destruida */ } grid = null; }
    if (!filas.length) { el("cca_tabla").innerHTML = '<p class="hint">No hay clientes con esos filtros. Prueba quitando algún filtro o revisando que el ticket tenga una auditoría asociada.</p>'; return; }
    el("cca_tabla").innerHTML = '<p class="hint" id="cca_conteo">Cargando tabla…</p><div id="cca_grid"></div>';
    const cols = CCA_COLUMNAS.map(([c, t]) => ({
      title: t, field: c, headerFilter: "input", headerSort: true, minWidth: 90,
      formatter: (cell) => esc(ccaValorCelda(c, cell.getValue(), fmtF)),
      headerFilterFunc: (hv, rv) => ccaValorCelda(c, rv, fmtF).toLowerCase().includes(String(hv).toLowerCase()),
      ...(c === "nombre" ? { frozen: true } : {}),
    }));
    const alto = () => Math.max(360, window.innerHeight - el("cca_grid").getBoundingClientRect().top - 14);
    el("cca_grid").style.height = alto() + "px";
    grid = new Tabulator("#cca_grid", { data: filas, columns: cols, layout: "fitDataFill", height: alto(), placeholder: "Sin resultados con esos filtros de columna" });
    const conteo = () => { if (!grid) return; const n = grid.getDataCount("active"); el("cca_conteo").textContent = `${num(n)} de ${num(filas.length)} registros. Cada columna tiene su filtro y se puede ordenar con un clic en el encabezado. El Excel y el CSV bajan lo que se ve en la tabla.`; };
    grid.on("tableBuilt", conteo); grid.on("dataFiltered", () => setTimeout(conteo, 0)); grid.on("renderComplete", conteo);
  }
  async function buscar() {
    const msg = el("cca_msg");
    if (!["falla", "powerfail", "caida_previa"].some((t) => el("cca_t_" + t).checked)) { msg.className = "msg error"; msg.textContent = "Marca al menos un tipo de afectación."; return; }
    msg.className = "msg"; msg.textContent = "Buscando...";
    const q = queryActual();
    try {
      const d = await apiGet("/clientes/afectados?" + q);
      ultimo = d; ultimaQuery = q;
      msg.textContent = ""; pintar(d);
      el("cca_xlsx").disabled = el("cca_csv").disabled = !d.filas.length;
    } catch (err) { ultimo = null; msg.className = "msg error"; msg.textContent = err.message; el("cca_xlsx").disabled = el("cca_csv").disabled = true; }
  }
  function sinCambios() {
    if (!ultimo) return false;
    if (ultimaQuery !== queryActual()) { window.alert("Cambiaste los filtros y todavía no pulsaste Buscar. Pulsa Buscar para que la pantalla y la descarga coincidan."); return false; }
    return true;
  }
  const hoy = () => new Date().toISOString().slice(0, 10);
  const filasVisibles = () => (grid ? grid.getData("active") : ultimo.filas);
  el("cca_xlsx").addEventListener("click", () => {
    if (!sinCambios()) return;
    const visibles = filasVisibles();
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(ccaFilasExcel(visibles, fmtF)), CCA_HOJA_CLIENTES);
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(ccaResumenTickets(visibles, fmtF)), CCA_HOJA_TICKETS);
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(ccaHojaSectores(visibles)), CCA_HOJA_SECTORES);
    XLSX.writeFile(wb, `clientes_afectados_${hoy()}.xlsx`);
  });
  el("cca_csv").addEventListener("click", () => { if (sinCambios()) exportarCSVGenerico(ccaFilasExcel(filasVisibles(), fmtF), `clientes_afectados_${hoy()}.csv`); });
  el("cca_buscar").addEventListener("click", buscar);
  ["cca_ticket", "cca_olt"].forEach((id) => el(id).addEventListener("keydown", (e) => { if (e.key === "Enter") buscar(); }));
  const previo = window.cliCargarAuditorias;
  window.cliCargarAuditorias = () => { if (previo) previo(); cargarOpciones(); };
  cargarOpciones();
})();


// ---------------------------------------------------------------
// REPORTE GENERAL DE CLIENTES (Informe 2): Oficina → OLT → clientes
// ---------------------------------------------------------------
(function () {
  const el = (id) => document.getElementById(id);
  if (!el("ig_contenido")) return;
  const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const num = (n) => Number(n || 0).toLocaleString("es-VE");
  const COLS = [
    ["nombre", "Nombre del cliente"], ["cuenta", "Cuenta"], ["telefono_casa", "Teléfono"], ["telefono_oficina", "Teléfono oficina"], ["correo", "Correo"],
    ["estado", "Estado"], ["ciudad", "Ciudad"], ["localidad", "Localidad"], ["sector", "Sector"], ["edificio", "Edificio"], ["oficina", "Oficina"],
    ["olt", "OLT"], ["tarjeta", "Tarjeta"], ["puerto", "Puerto"], ["estado_contrato", "Estado del contrato"], ["veces_afectado", "Veces afectado"],
  ];
  let grid = null, filas = [], nombreArchivo = "clientes";

  const edificio = (c) => (typeof smoEdificioDeDireccion === "function" ? smoEdificioDeDireccion(c.direccion) : "");
  const ruta = (partes) => {
    el("ig_ruta").innerHTML = partes.map((p, i) => (p.ir ? `<a data-i="${i}">${esc(p.t)}</a>` : `<span class="ig-actual">${esc(p.t)}</span>`)).join('<span class="ig-sep">›</span>');
    el("ig_ruta").querySelectorAll("a").forEach((a) => a.addEventListener("click", () => partes[+a.dataset.i].ir()));
  };
  const msg = (t, ok) => { const m = el("ig_msg"); m.className = "msg" + (t ? (ok ? "" : " error") : ""); m.textContent = t || ""; };
  const destruir = () => { if (grid) { try { grid.destroy(); } catch (e) { /* ya destruida */ } grid = null; } };

  async function verOficinas() {
    destruir(); msg("Cargando oficinas…", true);
    ruta([{ t: "Oficinas" }]);
    try {
      const d = await apiGet("/clientes/informe2?nivel=oficinas");
      msg("");
      if (!d.oficinas.length) { el("ig_contenido").innerHTML = '<p class="hint">Todavía no hay clientes conocidos. Se llena al subir archivos de SmartOLT (Administración › Repositorio de clientes).</p>'; return; }
      const total = d.oficinas.reduce((t, o) => t + o.clientes, 0);
      el("ig_contenido").innerHTML = `<p class="hint">${num(d.oficinas.length)} oficinas · ${num(total)} clientes conocidos. Elige una oficina.</p><div class="ig-grid">${
        d.oficinas.map((o) => `<button type="button" class="ig-card ${o.clientes ? "" : "vacia"}" data-of="${esc(o.oficina_id)}" data-nombre="${esc(o.oficina)}"><b>${esc(o.oficina)}</b><span>${num(o.olts)} OLT${o.olts === 1 ? "" : "s"} · ${num(o.clientes)} cliente${o.clientes === 1 ? "" : "s"} conocidos</span></button>`).join("")}</div>`;
      el("ig_contenido").querySelectorAll(".ig-card").forEach((b) => b.addEventListener("click", () => verOlts(b.dataset.of, b.dataset.nombre)));
    } catch (err) { msg(err.message, false); }
  }

  async function verOlts(ofId, ofNombre) {
    destruir(); msg("Cargando OLTs…", true);
    ruta([{ t: "Oficinas", ir: verOficinas }, { t: ofNombre }]);
    try {
      const d = await apiGet("/clientes/informe2?nivel=olts&oficina_id=" + encodeURIComponent(ofId));
      msg("");
      el("ig_contenido").innerHTML = `<div class="ig-barra"><button type="button" class="btn-secondary" id="ig_of_xlsx">Descargar Excel de toda la oficina</button><span class="hint">${num(d.olts.length)} OLTs. Elige una para ver sus clientes.</span></div>` +
        (d.olts.length ? `<div class="ig-grid">${d.olts.map((o) => `<button type="button" class="ig-card ${o.clientes ? "" : "vacia"}" data-olt="${esc(o.olt)}"><b>${esc(o.olt)}</b><span>${num(o.clientes)} cliente${o.clientes === 1 ? "" : "s"} conocidos</span></button>`).join("")}</div>` : '<p class="hint">Esta oficina no tiene OLTs registradas.</p>');
      el("ig_contenido").querySelectorAll(".ig-card").forEach((b) => b.addEventListener("click", () => verClientes({ olt: b.dataset.olt }, ofId, ofNombre)));
      el("ig_of_xlsx").addEventListener("click", async () => {
        const b = el("ig_of_xlsx"); b.disabled = true; msg("Preparando el Excel de la oficina…", true);
        try { const r = await apiGet("/clientes/informe2?nivel=clientes&oficina_id=" + encodeURIComponent(ofId)); exportar(r.clientes, ofNombre.replace(/[^A-Za-z0-9]+/g, "_"), "xlsx"); msg(r.truncado ? `Se descargaron los primeros ${num(r.clientes.length)} de ${num(r.total)} clientes: baja por OLT para tener todos.` : "", !r.truncado); if (!r.truncado) msg(""); }
        catch (err) { msg(err.message, false); } finally { b.disabled = false; }
      });
    } catch (err) { msg(err.message, false); }
  }

  const conEdificio = (lista) => lista.map((c) => ({ ...c, edificio: edificio(c) }));
  function exportar(lista, nombre, tipo) {
    const datos = conEdificio(lista).map((c) => { const o = {}; COLS.forEach(([k, t]) => { o[t] = c[k] ?? ""; }); return o; });
    const hoy = new Date(Date.now() - 4 * 3600000).toISOString().slice(0, 10);
    if (tipo === "csv") { exportarCSVGenerico(datos, `clientes_${nombre}_${hoy}.csv`); return; }
    const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(datos), "Clientes"); XLSX.writeFile(wb, `clientes_${nombre}_${hoy}.xlsx`);
  }

  async function verClientes(filtro, ofId, ofNombre) {
    destruir(); msg("Cargando clientes…", true);
    ruta([{ t: "Oficinas", ir: verOficinas }, { t: ofNombre, ir: () => verOlts(ofId, ofNombre) }, { t: filtro.olt }]);
    try {
      const d = await apiGet("/clientes/informe2?nivel=clientes&olt=" + encodeURIComponent(filtro.olt));
      msg(d.truncado ? `Se muestran los primeros ${num(d.clientes.length)} de ${num(d.total)} clientes.` : "", !d.truncado);
      filas = conEdificio(d.clientes); nombreArchivo = filtro.olt;
      el("ig_contenido").innerHTML = `<div class="ig-barra"><button type="button" class="btn-secondary" id="ig_xlsx">Descargar Excel</button><button type="button" class="btn-secondary" id="ig_csv">Descargar CSV</button><span class="hint" id="ig_conteo"></span></div><div id="ig_grid"></div>`;
      if (!filas.length) { el("ig_grid").innerHTML = '<p class="hint">Todavía no hay clientes conocidos en esta OLT.</p>'; el("ig_xlsx").disabled = el("ig_csv").disabled = true; return; }
      const cols = COLS.map(([c, t]) => ({ title: t, field: c, headerFilter: "input", minWidth: 80, ...(c === "nombre" ? { frozen: true } : {}),
        ...(c === "veces_afectado" || c === "tarjeta" || c === "puerto" ? { sorter: "number", hozAlign: "right", headerFilterFunc: (hv, rv) => String(rv ?? "").includes(String(hv)) } : {}) }));
      const alto = () => Math.max(360, window.innerHeight - el("ig_grid").getBoundingClientRect().top - 14);
      el("ig_grid").style.height = alto() + "px";
      grid = new Tabulator("#ig_grid", { data: filas, columns: cols, layout: "fitDataFill", height: alto(), placeholder: "Sin resultados con esos filtros" });
      const conteo = () => { if (grid) el("ig_conteo").textContent = `${num(grid.getDataCount("active"))} de ${num(filas.length)} clientes. Cada columna tiene su filtro; el Excel baja lo que ves.`; };
      grid.on("tableBuilt", conteo); grid.on("dataFiltered", () => setTimeout(conteo, 0)); grid.on("renderComplete", conteo);
      const visibles = () => (grid ? grid.getData("active") : filas);
      el("ig_xlsx").addEventListener("click", () => exportar(visibles(), nombreArchivo, "xlsx"));
      el("ig_csv").addEventListener("click", () => exportar(visibles(), nombreArchivo, "csv"));
    } catch (err) { msg(err.message, false); }
  }

  window.igAbrir = () => { if (!el("ig_contenido").innerHTML.trim() || grid === null) verOficinas(); };
})();


// ---------------------------------------------------------------
// CLIENTES POR OLT: lista del cruce Grafana × SmartOLT con filtros y Excel
// ---------------------------------------------------------------
(function () {
  const el = (id) => document.getElementById(id);
  if (!el("co_grid") || typeof CL_MS === "undefined") return;
  const num = (n) => Number(n || 0).toLocaleString("es-VE");
  const IDS = ["co_sucursal", "co_estado", "co_oficina", "co_olt", "co_estatus_olt", "co_estatus_grafana"];
  IDS.forEach((i) => { if (!CL_MS.includes(i)) CL_MS.push(i); });
  const COLS = [
    ["nombre", "Nombre"], ["telefono", "Teléfono"], ["telefono_oficina", "Teléfono oficina"], ["correo", "Correo"], ["cuenta", "Nro. de contrato"], ["cedula", "Cédula"],
    ["sucursal", "Sucursal"], ["estado", "Estado"], ["oficina", "Oficina"], ["olt", "OLT"], ["tarjeta", "Tarjeta"], ["puerto", "Puerto"], ["sector", "Sector"],
    ["municipio", "Municipio"], ["direccion", "Dirección"], ["ubicacion", "Ubicación (SmartOLT)"], ["estatus_grafana", "Estatus Grafana"], ["estatus_olt", "Estatus SmartOLT"],
    ["serial", "Serial ONU"], ["ultima_vez", "Visto en SmartOLT"],
  ];
  let opciones = null, grid = null, cargadas = 0, parar = false, ocupado = false;
  const msg = (t, ok) => { const m = el("co_msg"); m.className = "msg" + (t ? (ok ? "" : " error") : ""); m.textContent = t || ""; };
  const hoy = () => new Date(Date.now() - 4 * 3600000).toISOString().slice(0, 10);

  function llenarOlts() {
    const ofis = new Set(clVals("co_oficina").map(String));
    const lista = (opciones.olts || []).filter((o) => !ofis.size || ofis.has(String(o.oficina_id)));
    llenarSelectSimple("co_olt", lista.map((o) => ({ value: o.olt, label: o.olt })), "Todas");
  }
  async function cargarOpciones(silencio) {
    if (opciones) return;
    if (!silencio) msg("Cargando filtros…", true);
    try {
      opciones = await apiGet("/clientes/clientes-olt/opciones");
      const simple = (v) => v.map((x) => ({ value: x, label: x }));
      llenarSelectSimple("co_sucursal", simple(opciones.sucursales), "Todas");
      llenarSelectSimple("co_estado", simple(opciones.estados), "Todos");
      llenarSelectSimple("co_oficina", opciones.oficinas.map((o) => ({ value: o.id, label: o.nombre })), "Todas");
      llenarSelectSimple("co_estatus_olt", simple(opciones.estatus_olt), "Todos");
      llenarSelectSimple("co_estatus_grafana", simple(opciones.estatus_grafana), "Todos");
      llenarOlts();
      el("co_oficina").addEventListener("change", llenarOlts);
      if (!silencio) msg(opciones.olts.length ? "" : "Todavía no hay clientes conocidos. Se llena al subir archivos de SmartOLT.", true);
    } catch (err) { opciones = null; if (!silencio) msg(err.message, false); }
  }

  const query = () => IDS.map((id) => [id.replace(/^co_/, "").replace("estatus_olt", "estatus_olt"), clVals(id)])
    .filter(([, v]) => v.length).map(([k, v]) => `${k === "oficina" ? "oficina_id" : k}=${encodeURIComponent(v.join(","))}`).join("&");

  async function buscar() {
    if (ocupado) return;
    ocupado = true; parar = false; cargadas = 0;
    el("co_buscar").disabled = true; el("co_detener").classList.remove("hidden"); el("co_xlsx").disabled = el("co_csv").disabled = true; el("co_actualizar").disabled = true;
    if (grid) { try { grid.destroy(); } catch (e) { /* ya destruida */ } grid = null; }
    const q = query();
    let desde = 0, primera = true;
    try {
      for (let guard = 0; guard < 400 && !parar; guard++) {
        const d = await apiGet(`/clientes/clientes-olt/lista?${q}${q ? "&" : ""}desde=${desde}`);
        if (primera) {
          primera = false;
          const alto = () => Math.max(360, window.innerHeight - el("co_grid").getBoundingClientRect().top - 14);
          el("co_grid").style.height = alto() + "px";
          const cols = COLS.map(([c, t]) => ({ title: t, field: c, headerFilter: "input", minWidth: 90, ...(c === "nombre" ? { frozen: true } : {}),
            ...(c === "tarjeta" || c === "puerto" ? { sorter: "number", hozAlign: "right", headerFilterFunc: (hv, rv) => String(rv ?? "").includes(String(hv)) } : {}) }));
          grid = new Tabulator("#co_grid", { data: d.clientes, columns: cols, layout: "fitDataFill", height: alto(), placeholder: "Sin resultados con esos filtros" });
        } else if (d.clientes.length) grid.addData(d.clientes);
        cargadas += d.clientes.length;
        el("co_conteo").textContent = `${num(cargadas)} clientes cargados${d.siguiente !== null && !parar ? "…" : ""}`;
        if (d.siguiente === null) { desde = null; break; }
        desde = d.siguiente;
      }
      const completo = desde === null;
      el("co_conteo").textContent = `${num(cargadas)} clientes${completo ? "" : " (carga detenida: faltan algunos; vuelve a buscar o afina los filtros)"}. Cada columna tiene su propio filtro; el Excel baja lo que ves.`;
      msg(cargadas ? "" : "No hay clientes con esos filtros.", true);
    } catch (err) { msg(err.message, false); }
    finally { ocupado = false; el("co_buscar").disabled = false; el("co_detener").classList.add("hidden"); el("co_actualizar").disabled = false; el("co_xlsx").disabled = el("co_csv").disabled = !cargadas; }
  }

  function exportar(tipo) {
    if (!grid) return;
    const datos = grid.getData("active").map((c) => { const o = {}; COLS.forEach(([k, t]) => { o[t] = c[k] ?? ""; }); return o; });
    if (tipo === "csv") { exportarCSVGenerico(datos, `clientes_por_olt_${hoy()}.csv`); return; }
    const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(datos), "Clientes por OLT"); XLSX.writeFile(wb, `clientes_por_olt_${hoy()}.xlsx`);
  }

  async function actualizar() {
    if (ocupado) return;
    if (!confirm("Se pondrán al día los datos de TODOS los clientes del informe con la base de Grafana de su sucursal (solo se escribe lo que cambió). Puede tardar unos minutos y gastar escrituras de D1. ¿Continuar?")) return;
    ocupado = true; el("co_actualizar").disabled = true; el("co_buscar").disabled = true;
    let desde = 0, vistas = 0, cambios = 0;
    try {
      for (let guard = 0; guard < 5000; guard++) {
        const r = await apiSend("/clientes/clientes-olt/actualizar", "POST", { desde });
        vistas += r.procesadas; cambios += r.actualizadas;
        msg(`Actualizando… ${num(vistas)} clientes revisados, ${num(cambios)} con cambios`, true);
        if (r.siguiente === null) break;
        desde = r.siguiente;
      }
      msg(`Listo: ${num(vistas)} clientes revisados, ${num(cambios)} actualizados. Vuelve a pulsar «Buscar» para ver los datos nuevos.`, true);
      opciones = null; cargarOpciones(true);
    } catch (err) { msg(`Se detuvo: ${err.message}. Lo ya actualizado quedó guardado; vuelve a pulsar el botón para seguir (empieza de nuevo, pero solo escribe lo que falte).`, false); }
    finally { ocupado = false; el("co_actualizar").disabled = false; el("co_buscar").disabled = false; }
  }

  el("co_buscar").addEventListener("click", buscar);
  el("co_detener").addEventListener("click", () => { parar = true; });
  el("co_xlsx").addEventListener("click", () => exportar("xlsx"));
  el("co_csv").addEventListener("click", () => exportar("csv"));
  el("co_actualizar").addEventListener("click", actualizar);
  window.coAbrir = () => cargarOpciones();
})();
