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

// Nombre del archivo de Grafana -> fecha y hora de la base (hora de Caracas). Ej: "Detalle de Cuentas-data-2026-10-20 19_08_27"
function cliFechaDeNombre(nombre) {
  const m = /(\d{4})-(\d{2})-(\d{2})[ T_](\d{2})[_:.](\d{2})[_:.](\d{2})/.exec(String(nombre || ""));
  return m ? `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}` : null;
}

// Texto completo -> { filas, leidas, malformadas:[{linea,texto}], sinCuenta, repetidas, conteos, conSerial, sucursales, faltantes }
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

  const res = { filas: [], leidas: 0, malformadas: [], sinCuenta: 0, repetidas: 0, conSerial: 0,
    conteos: { activo: 0, suspendido: 0, prospecto: 0, otros: 0 }, sucursales: {} };
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
    res.filas.push(fila);
    const e = fila.estado_contrato.toLowerCase();
    if (e === "activo") res.conteos.activo++; else if (e === "suspendido") res.conteos.suspendido++; else if (e === "prospecto") res.conteos.prospecto++; else res.conteos.otros++;
    if (fila.serial_onu) res.conSerial++;
    const s = fila.sucursal || "(vacía)";
    res.sucursales[s] = (res.sucursales[s] || 0) + 1;
  }
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
if (typeof module !== "undefined") module.exports = { cliDecodificar, cliPartirLinea, cliParsearBase, cliFechaDeNombre, cliParsearNombreSmartolt, cliParsearAuditoria };

// ---------------- Interfaz (solo navegador) ----------------
if (typeof document !== "undefined" && document.getElementById("cli_archivo")) {
  const CLI_LOTE = 250;                          // filas por envío al servidor
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
        ? `<table class="rows-table"><thead><tr><th>Sucursal</th><th>Base actualizada al</th><th>Cuentas</th><th>Activos</th><th>Descartadas</th><th>Archivo</th><th>Subida por</th></tr></thead><tbody>${
            d.vigentes.map((b) => `<tr><td>${esc(b.sucursal)}</td><td>${fmtFecha(b.fecha_base)}</td><td>${b.filas_leidas - b.filas_descartadas}</td><td>${b.activos}</td><td>${b.filas_descartadas}</td><td>${esc(b.archivo)}</td><td>${esc(b.usuario)}</td></tr>`).join("")}</tbody></table>`
        : '<p class="hint">Todavía no hay ninguna base cargada.</p>';
    } catch (err) { cont.innerHTML = `<p class="msg error">${esc(err.message)}</p>`; }
  }
  window.cliCargarBases = cliCargarBases;

  el("cli_btn_analizar").addEventListener("click", async () => {
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
      el("cli_sucursal").value = sucs.length ? sucs[0][0] : "";
      el("cli_aviso_sucursal").textContent = sucs.length > 1 ? `Ojo: el archivo trae ${sucs.length} sucursales distintas (${sucs.map(([s, n]) => s + ": " + n).join(", ")}). Cada carga reemplaza UNA sola sucursal.` : "";
      el("cli_fecha_base").textContent = fmtFecha(cliFechaBase) + (deNombre ? " (del nombre del archivo)" : " (el nombre del archivo no la trae: se usa la hora de subida)");
      el("cli_prev_leidas").textContent = a.leidas;
      el("cli_prev_validas").textContent = a.filas.length;
      el("cli_prev_desc").textContent = a.malformadas.length + a.sinCuenta + a.repetidas;
      el("cli_prev_det_desc").textContent = `${a.malformadas.length} mal formadas · ${a.sinCuenta} sin número de cuenta · ${a.repetidas} cuentas repetidas`;
      el("cli_prev_activos").textContent = a.conteos.activo;
      el("cli_prev_estados").textContent = `Suspendidos ${a.conteos.suspendido} · Prospectos ${a.conteos.prospecto} · Otros ${a.conteos.otros}`;
      el("cli_prev_serial").textContent = a.filas.length ? Math.round(100 * a.conSerial / a.filas.length) + " %" : "—";
      el("cli_prev_malas").innerHTML = a.malformadas.length
        ? "<p class=\"hint\">Filas descartadas por estar mal formadas (se pueden corregir en Grafana y volver a cargar):</p><ul>" + a.malformadas.slice(0, 20).map((m) => `<li>Línea ${m.linea}: ${esc(m.texto)}…</li>`).join("") + (a.malformadas.length > 20 ? `<li>… y ${a.malformadas.length - 20} más</li>` : "") + "</ul>"
        : "";
      el("cli_preview").classList.remove("hidden");
      showMsg(msg, "Archivo analizado. Revisa el resumen y confirma la carga.", true);
    } catch (err) { showMsg(msg, err.message, false); }
  });

  async function cliPurgar() {
    for (let i = 0; i < 100; i++) { const r = await apiSend("/clientes/carga/purgar", "POST", {}); if (!r.pendientes) break; }
  }

  el("cli_btn_cargar").addEventListener("click", async () => {
    const msg = el("cli_msg_carga"), btn = el("cli_btn_cargar");
    const sucursal = el("cli_sucursal").value.trim();
    if (!cliAnalisis) return showMsg(msg, "Analiza primero el archivo.", false);
    if (!sucursal) return showMsg(msg, "Indica la sucursal.", false);
    const a = cliAnalisis;
    if (!confirm(`Se REEMPLAZARÁ por completo la base de la sucursal "${sucursal.toUpperCase()}" con ${a.filas.length} cuentas. ¿Continuar?`)) return;
    btn.disabled = true;
    let cargaId = null;
    try {
      const ini = await apiSend("/clientes/carga/iniciar", "POST", {
        sucursal, archivo: cliNombreArchivo, fecha_base: cliFechaBase,
        filas_leidas: a.leidas, filas_descartadas: a.malformadas.length + a.sinCuenta + a.repetidas,
      });
      cargaId = ini.carga_id;
      for (let i = 0; i < a.filas.length; i += CLI_LOTE) {
        await apiSend("/clientes/carga/lote", "POST", { carga_id: cargaId, filas: a.filas.slice(i, i + CLI_LOTE) });
        showMsg(msg, `Cargando… ${Math.min(i + CLI_LOTE, a.filas.length)} de ${a.filas.length}`, true);
      }
      showMsg(msg, "Verificando y reemplazando la base anterior…", true);
      const fin = await apiSend("/clientes/carga/finalizar", "POST", { carga_id: cargaId });
      cargaId = null;
      showMsg(msg, "Limpiando la base anterior…", true);
      await cliPurgar();
      showMsg(msg, `Base ${fin.sucursal} actualizada al ${fmtFecha(fin.fecha_base)}: ${fin.filas} cuentas (${fin.activos} activas).`, true);
      el("cli_preview").classList.add("hidden"); el("cli_archivo").value = ""; cliAnalisis = null;
      cliCargarBases();
    } catch (err) {
      if (cargaId) { try { await apiSend("/clientes/carga/abortar", "POST", { carga_id: cargaId }); await cliPurgar(); } catch (e) { /* nada */ } }
      showMsg(msg, "La carga falló y la base anterior quedó intacta: " + err.message, false);
    } finally { btn.disabled = false; }
  });
}

// ---------------- Auditoría SmartOLT (UI) ----------------
if (typeof document !== "undefined" && document.getElementById("cli_aud_archivo")) {
  const LOTE_AUD = 100;
  let audAnalisis = null, audNombre = "", audMeta = null;
  const el = (id) => document.getElementById(id);
  const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const fmt = (iso) => { const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(iso || ""); return m ? `${m[3]}/${m[2]}/${m[1]} ${m[4]}:${m[5]}` : (iso || ""); };
  const NOMBRE_METODO = { serial: "serial (SN)", contact: "Contact = cuenta", cuenta_en_name: "cuenta en Name", cedula_en_name: "cédula en Name", nombre: "nombre exacto único" };

  function pintarResumen(r, info, avisos) {
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
      <p class="hint">Las "caídas previas", los tickets asociados y las alertas de falla no reportada se calculan en el siguiente paso.</p>
      ${r.sin_cruzar_lista && r.sin_cruzar_lista.length ? `<details><summary>Ver ONUs sin cruzar (primeras ${r.sin_cruzar_lista.length})</summary>
        <table class="rows-table"><thead><tr><th>SN</th><th>Name</th><th>Contact</th><th>Estado</th><th>Tarjeta</th><th>Puerto</th><th>Último cambio</th></tr></thead><tbody>${
          r.sin_cruzar_lista.map((o) => `<tr><td>${esc(o.sn)}</td><td>${esc(o.name_smartolt)}</td><td>${esc(o.contact)}</td><td>${esc(o.status)}</td><td>${o.tarjeta ?? ""}</td><td>${o.puerto ?? ""}</td><td>${fmt(o.last_status_change)}</td></tr>`).join("")}</tbody></table></details>` : ""}`;
  }

  async function cargarAuditorias() {
    const cont = el("cli_auditorias");
    try {
      const d = await apiGet("/clientes/auditorias");
      cont.innerHTML = d.auditorias.length
        ? `<table class="rows-table"><thead><tr><th>Fecha de auditoría</th><th>OLT</th><th>Tarj.</th><th>Puerto</th><th>ONUs</th><th>Cruzadas</th><th>Falla</th><th>Power fail</th><th>Base desact.</th><th>Subida por</th><th></th></tr></thead><tbody>${
          d.auditorias.map((a) => `<tr><td>${fmt(a.fecha_auditoria_local)}</td><td>${esc(a.olt_nombre)}</td><td>${a.tarjeta ?? "—"}</td><td>${a.puerto ?? "—"}</td><td>${a.total_onus}</td><td>${a.cruzadas}</td><td>${a.falla}</td><td>${a.powerfail}</td><td>${a.desactualizadas ? "Sí" : "No"}</td><td>${esc(a.usuario)}</td><td><button type="button" class="btn-secondary cli-recruzar" data-id="${a.id}">Re-cruzar</button></td></tr>`).join("")}</tbody></table>`
        : '<p class="hint">Todavía no hay auditorías cargadas.</p>';
      cont.querySelectorAll(".cli-recruzar").forEach((b) => b.addEventListener("click", () => recruzar(Number(b.dataset.id), b)));
    } catch (err) { cont.innerHTML = `<p class="msg error">${esc(err.message)}</p>`; }
  }
  window.cliCargarAuditorias = cargarAuditorias;

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

  el("cli_aud_btn_analizar").addEventListener("click", async () => {
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
  });

  el("cli_aud_btn_cargar").addEventListener("click", async () => {
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
      const avisos = ini.bases.filter((b) => b.desactualizada).map((b) => `La base de ${b.sucursal} tiene ${b.horas} horas de diferencia con esta auditoría (tolerancia ${ini.tolerancia_horas} h); actualízala y vuelve a cruzar.`);
      for (let i = 0; i < a.onus.length; i += LOTE_AUD) {
        await apiSend("/clientes/auditoria/lote", "POST", { auditoria_id: audId, onus: a.onus.slice(i, i + LOTE_AUD) });
        showMsg(msg, `Cruzando… ${Math.min(i + LOTE_AUD, a.onus.length)} de ${a.onus.length}`, true);
      }
      const fin = await apiSend("/clientes/auditoria/finalizar", "POST", { auditoria_id: audId, esperadas: a.onus.length });
      audId = null;
      showMsg(msg, `Auditoría cargada: ${fin.resumen.cruzadas} de ${fin.resumen.total} ONUs cruzadas.`, true);
      pintarResumen(fin.resumen, { olt, tarjeta: audMeta.tarjeta, puerto: audMeta.puerto, fecha_local: fin.auditoria.fecha_local }, avisos);
      el("cli_aud_preview").classList.add("hidden"); el("cli_aud_archivo").value = ""; audAnalisis = null;
      cargarAuditorias();
    } catch (err) {
      if (audId) { try { await apiSend("/clientes/auditoria/abortar", "POST", { auditoria_id: audId }); } catch (e) { /* nada */ } }
      showMsg(msg, "La carga falló y no se guardó nada: " + err.message, false);
    } finally { btn.disabled = false; }
  });
  cargarAuditorias();
}
