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
function cliNormSerial(v) { return String(v ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().replace(/[^A-Z0-9]/g, ""); }
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
  const m = /SmartOLT_oltid_(\d+)(?:_board_(\d+))?(?:_port_(\d+))?(?:_status_([A-Za-z_ ]+?))?_onus_list_(\d{4})-(\d{2})-(\d{2})[_ T](\d{2})[_:](\d{2})[_:](\d{2})/i.exec(String(nombre || ""));
  if (!m) return null;
  const utc = Date.UTC(+m[5], +m[6] - 1, +m[7], +m[8], +m[9], +m[10]);
  const f = (ms) => new Date(ms).toISOString().slice(0, 19);
  return { oltid: m[1], tarjeta: m[2] ? +m[2] : null, puerto: m[3] ? +m[3] : null, estado: m[4] ? m[4].replace(/_/g, " ").toLowerCase() : null,
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
if (typeof module !== "undefined") module.exports = { cliNormSerial, cliClave, cliFechaContrato, cliDecodificar, cliPartirLinea, cliParsearBase, cliFechaDeNombre, cliParsearNombreSmartolt, cliParsearAuditoria };

// ---------------- Interfaz (solo navegador) ----------------
if (typeof document !== "undefined" && document.getElementById("cli_archivo")) {
  const CLI_LOTE = 250, CLI_PARALELO = 4, CLI_TOPE_DIA = 80000;   // tope diario de clientes nuevos (plan gratuito de D1: 100.000 escrituras/día; el resto lo usa la app)                          // filas por envío al servidor
  let cliAnalisis = null, cliNombreArchivo = "", cliFechaBase = "";
  const el = (id) => document.getElementById(id);
  const fmtFecha = (iso) => { const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(iso || ""); return m ? `${m[3]}/${m[2]}/${m[1]} ${m[4]}:${m[5]}` : (iso || ""); };
  const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const pausa = () => new Promise((r) => setTimeout(r, 0));
  const ahoraCaracas = () => new Date(Date.now() - 4 * 3600 * 1000).toISOString().slice(0, 19);

  async function cliCargarBases() {
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
      el("cli_aviso_sucursal").textContent = "Cada sucursal del archivo reemplaza a la suya; las demás no se tocan.";
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

  const cliCargarGrafana = async () => {
    const msg = el("cli_msg_carga"), btn = el("cli_btn_cargar");
    if (!cliAnalisis) return showMsg(msg, "Analiza primero el archivo.", false);
    const a = cliAnalisis;
    if (!a.filas.length || a.filas.some((f) => !f.sucursal)) return showMsg(msg, "El archivo no tiene clientes activos con sucursal: no se puede cargar.", false);
    const grupos = new Map();
    a.filas.forEach((f) => { if (!grupos.has(f.sucursal)) grupos.set(f.sucursal, []); grupos.get(f.sucursal).push(f); });
    const lista = [...grupos.entries()];
    if (!confirm(`La base de ${lista.length} sucursal(es) se REEMPLAZARÁ con este archivo (${formatearMiles(a.filas.length)} clientes activos): ${lista.map(([n]) => n.toUpperCase()).join(", ")}.\n\nSolo se escribe lo que cambió (nuevos, modificados y dados de baja). Máximo ${formatearMiles(CLI_TOPE_DIA)} cambios por día (límite del plan gratuito). ¿Continuar?`)) return;
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
            showMsg(msg, `${etiqueta}: revisadas ${formatearMiles(revisadas)} de ${formatearMiles(filas.length)} · cambios hoy: ${formatearMiles(cambiosHoy)}`, true);
          }
        };
        await Promise.all(Array.from({ length: Math.min(CLI_PARALELO, lotes.length) }, trabajador));
        const completa = !tope && revisadas >= filas.length;
        const cuerpo = { carga_id: cargaId, ...t, completa, claves: completa ? filas.map(cliClave) : undefined };
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
  let audAnalisis = null, audNombre = "", audMeta = null;
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
      <h4>Resultado: ${esc(info.olt)}${info.tarjeta ? " · tarjeta " + info.tarjeta : ""}${info.puerto ? " · puerto " + info.puerto : ""} · auditoría del ${fmt(info.fecha_local)}</h4>
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
    el("cli_aud_preview").classList.add("hidden"); el("cli_aud_resultado").innerHTML = "";
    const f = el("cli_aud_archivo").files[0];
    if (!f) return showMsg(msg, "Elige primero el archivo CSV de SmartOLT.", false);
    try {
      const a = cliParsearAuditoria(cliDecodificar(new Uint8Array(await f.arrayBuffer())));
      if (!a.onus.length) throw new Error("El archivo no trae ninguna ONU legible.");
      const meta = cliParsearNombreSmartolt(f.name);
      if (!meta) throw new Error("El nombre del archivo no tiene el formato de SmartOLT (SmartOLT_oltid_…_onus_list_AAAA-MM-DD_HH_MM_SS…). No se puede saber la hora de la auditoría.");
      audAnalisis = a; audNombre = f.name; audMeta = meta;
      const olts = Object.entries(a.olts).sort((x, y) => y[1] - x[1]);
      el("cli_aud_olt").textContent = olts.map(([o, n]) => `${o} (${n})`).join(", ");
      el("cli_aud_aviso_olt").textContent = olts.length > 1 ? "Ojo: el archivo trae más de una OLT." : "";
      el("cli_aud_filtro").textContent = `${meta.tarjeta ? "tarjeta " + meta.tarjeta : "toda la OLT"}${meta.puerto ? ", puerto " + meta.puerto : ""}${meta.estado ? ", estado " + meta.estado : ""}`;
      el("cli_aud_onus").textContent = `${a.onus.length}${a.malformadas.length ? " (+" + a.malformadas.length + " filas mal formadas descartadas)" : ""}`;
      el("cli_aud_estados").textContent = Object.entries(a.estados).map(([k, v]) => `${k}: ${v}`).join(" · ");
      el("cli_aud_utc").textContent = fmt(meta.utc) + " (UTC)";
      el("cli_aud_fecha").value = meta.local.slice(0, 16);
      el("cli_aud_preview").classList.remove("hidden");
      showMsg(msg, "Archivo analizado. Confirma la hora de la auditoría (hora de Caracas) y carga.", true);
    } catch (err) { showMsg(msg, err.message, false); }
  };
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
  function confirmarDiferenciaFechas(bases, fechaSmart) {
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

  const audCargar = async () => {
    const msg = el("cli_aud_msg_carga"), btn = el("cli_aud_btn_cargar");
    if (!audAnalisis) return showMsg(msg, "Analiza primero el archivo.", false);
    const hora = el("cli_aud_fecha").value;
    if (!hora) return showMsg(msg, "Confirma la fecha y hora de la auditoría.", false);
    const a = audAnalisis;
    const olt = Object.entries(a.olts).sort((x, y) => y[1] - x[1])[0][0];
    btn.disabled = true;
    let audId = null;
    try {
      const ini = await apiSend("/clientes/auditoria/iniciar", "POST", {
        archivo: audNombre, olt_id_smartolt: audMeta.oltid, olt_nombre: olt, tarjeta: audMeta.tarjeta, puerto: audMeta.puerto,
        estado_filtro: audMeta.estado, fecha_auditoria_utc: audMeta.utc, fecha_auditoria_local: hora.length === 16 ? hora + ":00" : hora, total_onus: a.onus.length,
      });
      audId = ini.auditoria_id;
      const fechaSmart = hora.length === 16 ? hora + ":00" : hora;
      const difs = ini.bases.filter((b) => b.desactualizada);
      if (difs.length && !(await confirmarDiferenciaFechas(difs, fechaSmart))) {
        try { await apiSend("/clientes/auditoria/abortar", "POST", { auditoria_id: audId }); } catch (e) { /* nada */ }
        audId = null;
        showMsg(msg, "Carga cancelada: no se guardó nada.", false);
        return false;
      }
      const avisos = difs.map((b) => `Se cargó con ${textoDiferencia(b.horas)} de diferencia entre la base de Grafana de ${b.sucursal} (${fmt(b.fecha_base)}) y SmartOLT (${fmt(fechaSmart)}). Si quieres, sube un archivo más cercano en fecha y pulsa «Re-cruzar».`);
      for (let i = 0; i < a.onus.length; i += LOTE_AUD) {
        await apiSend("/clientes/auditoria/lote", "POST", { auditoria_id: audId, onus: a.onus.slice(i, i + LOTE_AUD) });
        showMsg(msg, `Cruzando… ${Math.min(i + LOTE_AUD, a.onus.length)} de ${a.onus.length}`, true);
      }
      const fin = await apiSend("/clientes/auditoria/finalizar", "POST", { auditoria_id: audId, esperadas: a.onus.length });
      audId = null;
      showMsg(msg, `Auditoría cargada: ${fin.resumen.cruzadas} de ${fin.resumen.total} ONUs cruzadas.`, true);
      pintarResumen(fin.resumen, { olt, tarjeta: audMeta.tarjeta, puerto: audMeta.puerto, fecha_local: fin.auditoria.fecha_local }, avisos, fin.asociacion);
      cargarAlertas();
      el("cli_aud_preview").classList.add("hidden"); el("cli_aud_archivo").value = ""; audAnalisis = null;
      cargarAuditorias();
      return true;
    } catch (err) {
      if (audId) { try { await apiSend("/clientes/auditoria/abortar", "POST", { auditoria_id: audId }); } catch (e) { /* nada */ } }
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
  ["ticket_cmr", "Nº Ticket"], ["oficina", "Oficina"], ["olt", "OLT"], ["tarjeta", "Tarjeta"], ["puerto", "Puerto"],
  ["fecha_auditoria", "Fecha de la auditoría"], ["clasificacion", "Tipo de afectación"],
  ["apertura_cda", "Registro CDA"], ["apertura_cmr", "Apertura CMR"], ["solucion_cda", "Solución CDA"], ["solucion_cmr", "Solución CMR"],
  ["cierre_cda", "Cierre CDA"], ["cierre_cmr", "Cierre CMR"], ["observacion", "Observación"],
];
const CCA_CAMPOS_FECHA = new Set(["fecha_auditoria", "apertura_cda", "apertura_cmr", "solucion_cda", "solucion_cmr", "cierre_cda", "cierre_cmr"]);
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
  let ultimo = null, ultimaQuery = null;   // lo que se ve en pantalla y con qué filtros se buscó

  function queryActual() {
    const p = new URLSearchParams();
    const v = (id) => el(id).value.trim();
    if (v("cca_ticket")) p.set("ticket", v("cca_ticket"));
    if (v("cca_oficina")) p.set("oficina_id", v("cca_oficina"));
    if (v("cca_olt")) p.set("olt", v("cca_olt").toUpperCase());
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
    el("cca_olts").innerHTML = (L.olts || []).map((o) => `<option value="${esc(o.codigo)}"></option>`).join("");
  }
  function pintar(d) {
    const r = d.resumen, filas = d.filas;
    const tile = (n, t) => `<div class="ml-tile"><b>${num(n)}</b><span>${t}</span></div>`;
    el("cca_resumen").innerHTML = `<div class="ml-tiles">${tile(r.clientes, "Clientes")}${tile(r.onus, "ONUs en la lista")}${tile(r.tickets, "Tickets")}` +
      `${tile(r.sin_cruzar_excluidas, "ONUs sin cruzar no incluidas")}${tile(r.no_activos_excluidos, "Clientes no activos no incluidos")}</div>` +
      (r.truncado ? '<div class="ml-badge b-aviso">La lista es muy grande: se muestran solo los primeros 60.000 registros. Acota los filtros.</div>' : "");
    if (!filas.length) { el("cca_tabla").innerHTML = '<p class="hint">No hay clientes con esos filtros. Prueba quitando algún filtro o revisando que el ticket tenga una auditoría asociada.</p>'; return; }
    const VISTA = CCA_COLUMNAS.filter(([c]) => ["nombre", "telefono_casa", "telefono_oficina", "cuenta", "sector", "estado_contrato", "ticket_cmr", "oficina", "olt", "tarjeta", "puerto", "clasificacion", "observacion"].includes(c));
    const MAX = 300;
    el("cca_tabla").innerHTML = `<p class="hint">Vista previa de los primeros ${num(Math.min(MAX, filas.length))} de ${num(filas.length)} registros. El Excel trae todos y más columnas.</p>` +
      `<table class="rows-table"><thead><tr>${VISTA.map(([, t]) => `<th>${esc(t)}</th>`).join("")}</tr></thead><tbody>${
        filas.slice(0, MAX).map((f) => `<tr>${VISTA.map(([c]) => `<td>${esc(ccaValorCelda(c, f[c], fmtF))}</td>`).join("")}</tr>`).join("")}</tbody></table>`;
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
  el("cca_xlsx").addEventListener("click", () => {
    if (!sinCambios()) return;
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(ccaFilasExcel(ultimo.filas, fmtF)), CCA_HOJA_CLIENTES);
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(ccaHojaSectores(ultimo.filas)), CCA_HOJA_SECTORES);
    XLSX.writeFile(wb, `clientes_afectados_${hoy()}.xlsx`);
  });
  el("cca_csv").addEventListener("click", () => { if (sinCambios()) exportarCSVGenerico(ccaFilasExcel(ultimo.filas, fmtF), `clientes_afectados_${hoy()}.csv`); });
  el("cca_buscar").addEventListener("click", buscar);
  ["cca_ticket", "cca_olt"].forEach((id) => el(id).addEventListener("keydown", (e) => { if (e.key === "Enter") buscar(); }));
  const previo = window.cliCargarAuditorias;
  window.cliCargarAuditorias = () => { if (previo) previo(); cargarOpciones(); };
  cargarOpciones();
})();
