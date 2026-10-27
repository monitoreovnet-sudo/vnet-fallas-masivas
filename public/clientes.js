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
// CLI-PURE-END
if (typeof module !== "undefined") module.exports = { cliDecodificar, cliPartirLinea, cliParsearBase, cliFechaDeNombre };

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
