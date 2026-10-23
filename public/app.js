const API = "/api";

// ---------------------------------------------------------------
// Utilidades
// ---------------------------------------------------------------
async function apiGet(path) {
  const r = await fetch(API + path);
  const data = await r.json();
  if (!r.ok) throw new Error(data.error || "Error de solicitud");
  return data;
}
async function apiSend(path, method, body) {
  const r = await fetch(API + path, {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await r.json();
  if (!r.ok) { const err = new Error(data.error || "Error de solicitud"); if (data.reautenticar) err.reautenticar = true; throw err; }
  return data;
}
function fillSelect(select, items, { valueKey = "nombre", labelKey = "nombre", placeholder = "Seleccione:" } = {}) {
  select.innerHTML = "";
  const opt0 = document.createElement("option");
  opt0.value = "";
  opt0.textContent = placeholder;
  select.appendChild(opt0);
  for (const it of items) {
    const opt = document.createElement("option");
    opt.value = it[valueKey];
    opt.textContent = it[labelKey];
    select.appendChild(opt);
  }
}
function showMsg(el, text, ok = true) {
  el.textContent = text;
  el.className = "msg " + (ok ? "ok" : "error");
}
function toLocalInputValue(iso) {
  if (!iso) return "";
  // recorta a "YYYY-MM-DDTHH:MM" para <input type=datetime-local>
  return String(iso).slice(0, 16);
}
// Fuerza solo dígitos mientras el usuario escribe (sin espacios ni caracteres
// especiales), para los campos Ticket CMR-COR y Tickets Vinculados.
function soloDigitos(input) {
  input.addEventListener("input", () => {
    const limpio = input.value.replace(/[^0-9]/g, "");
    if (limpio !== input.value) input.value = limpio;
  });
}
["c_ticket_cmr", "c_tickets_vinculados"].forEach((id) => soloDigitos(document.getElementById(id)));

// ---------------------------------------------------------------
// Campos de fecha y hora: la fecha usa el selector del navegador y la hora se escribe con el teclado, en formato libre.
//   · 13–23 → PM (14 = 2:00 PM) · 1–11 → AM · 12 → 12 PM (mediodía) · 0 / 00 → 12 AM (medianoche)
//   · "5p" / "5 pm" fuerzan PM; "12a" / "12 am" fuerzan AM. Minutos opcionales: "9", "9:30", "930", "14:05", "1405".
// El <input type="datetime-local"> original se conserva oculto como valor del campo (el resto del código lo sigue leyendo igual).
// ---------------------------------------------------------------
// FECHAHORA-PURE-START
function interpretarHora(texto) {
  const t = String(texto ?? "").trim().toLowerCase().replace(/\./g, "").replace(/\s+/g, "");
  const m = /^(\d{1,2})(?::?(\d{2}))?([ap])?m?$/.exec(t);
  if (!m) return null;
  const h = Number(m[1]), min = m[2] === undefined ? 0 : Number(m[2]), suf = m[3] || "";
  if (min > 59 || h > 23) return null;
  let h24;
  if (suf && h >= 1 && h <= 12) h24 = suf === "p" ? (h === 12 ? 12 : h + 12) : (h === 12 ? 0 : h);
  else if (h === 0) h24 = 0;           // 0 / 00 → 12 AM (medianoche)
  else h24 = h;                        // 1–11 → AM · 12 → 12 PM · 13–23 → PM
  return { h24, min };
}
function formatearHora12(h24, min) {
  const ampm = h24 >= 12 ? "PM" : "AM";
  const h = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")} ${ampm}`;
}
// FECHAHORA-PURE-END
const _valorNativo = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value");
function mejorarFechaHora(orig) {
  if (!orig || orig.dataset.fh) return;
  orig.dataset.fh = "1";
  const wrap = document.createElement("div");
  wrap.className = "fh-wrap";
  const fecha = document.createElement("input"); fecha.type = "date"; fecha.className = "fh-fecha";
  const hora = document.createElement("input"); hora.type = "text"; hora.className = "fh-hora";
  hora.placeholder = "hh:mm"; hora.maxLength = 12; hora.autocomplete = "off";
  hora.title = "Escribe la hora: 14:30 = 2:30 PM · 9:15 = 9:15 AM · 12 = mediodía (12 PM) · 0 = medianoche (12 AM). Con p o a puedes forzar PM o AM (ej. 5p).";
  const ayuda = document.createElement("span"); ayuda.className = "fh-ayuda";
  wrap.append(fecha, hora, ayuda);
  orig.insertAdjacentElement("afterend", wrap);
  orig.style.display = "none";
  let interno = false;
  const dibujar = (v) => {
    const m = /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})/.exec(v || "");
    fecha.value = m ? m[1] : "";
    hora.value = m ? formatearHora12(Number(m[2]), Number(m[3])) : "";
    hora.classList.remove("fh-error"); ayuda.textContent = "";
  };
  const recalcular = (normalizar) => {
    const txt = hora.value.trim();
    const hr = txt ? interpretarHora(txt) : null;
    hora.classList.toggle("fh-error", !!txt && !hr);
    ayuda.textContent = txt && !hr ? "Hora no válida" : "";
    if (hr && normalizar) hora.value = formatearHora12(hr.h24, hr.min);
    const nuevo = fecha.value && hr ? `${fecha.value}T${String(hr.h24).padStart(2, "0")}:${String(hr.min).padStart(2, "0")}` : "";
    if (nuevo !== _valorNativo.get.call(orig)) {
      interno = true; _valorNativo.set.call(orig, nuevo); interno = false;
      orig.dispatchEvent(new Event("input", { bubbles: true })); orig.dispatchEvent(new Event("change", { bubbles: true }));
    }
  };
  fecha.addEventListener("change", () => recalcular(true));
  fecha.addEventListener("input", () => recalcular(false));
  hora.addEventListener("input", () => recalcular(false));
  hora.addEventListener("change", () => recalcular(true));
  hora.addEventListener("blur", () => recalcular(true));
  hora.addEventListener("keydown", (e) => { if (e.key === "Enter") recalcular(true); });
  // Lecturas y escrituras de .value desde el código (ej. cargar un ticket) se reflejan en los campos visibles
  Object.defineProperty(orig, "value", {
    configurable: true,
    get() { return _valorNativo.get.call(orig); },
    set(v) { _valorNativo.set.call(orig, v); if (!interno) dibujar(_valorNativo.get.call(orig)); },
  });
  dibujar(_valorNativo.get.call(orig));
}
function mejorarTodosFechaHora(raiz) {
  (raiz || document).querySelectorAll('input[type="datetime-local"]').forEach(mejorarFechaHora);
}
mejorarTodosFechaHora();
new MutationObserver((muts) => {
  for (const m of muts) m.addedNodes.forEach((n) => {
    if (n.nodeType !== 1) return;
    if (n.matches && n.matches('input[type="datetime-local"]')) mejorarFechaHora(n); else if (n.querySelectorAll) mejorarTodosFechaHora(n);
  });
}).observe(document.body, { childList: true, subtree: true });

// Formatea un número de ticket con un espacio visual cada 3 dígitos
// (de derecha a izquierda), únicamente para lectura en pantallas de
// consulta/log/dashboard. Nunca se usa este valor para guardar ni buscar.
// Ej.: 334455 -> "334 455" · 1234567 -> "1 234 567" (espacio, no punto: el Nº de ticket no lleva separador de miles).
function formatearTicket(numero) {
  if (!numero) return "";
  return String(numero).trim().replace(/\B(?=(\d{3})+(?!\d))/g, " ");
}
// Separador de miles (punto, como en es-VE): 1234567 -> "1.234.567". Para métricas, nunca para el Nº de ticket.
function formatearMiles(v) {
  if (v === null || v === undefined || v === "") return "";
  const n = Number(v);
  if (!isFinite(n)) return String(v);
  const s = String(Math.trunc(Math.abs(n))).replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return (n < 0 ? "-" : "") + s;
}

// ---------------------------------------------------------------
// Tablas de Pizarra / Reporte: se ven 50 filas y a partir de ahí hay scroll vertical
// ---------------------------------------------------------------
const FILAS_VISIBLES_TABLA = 50;
function ajustarAlturaTabla(tableId, maxFilas = FILAS_VISIBLES_TABLA) {
  const tabla = document.getElementById(tableId);
  const cont = tabla && tabla.closest(".db-table-scroll");
  if (!cont) return;
  const filas = tabla.querySelectorAll("tbody tr");
  if (filas.length <= maxFilas) { cont.style.maxHeight = ""; return; }
  const hHead = tabla.tHead ? tabla.tHead.getBoundingClientRect().height : 0;
  if (!hHead) return;   // pestaña oculta: se recalcula al mostrarla
  // Se mide dos veces: al aparecer la barra de scroll la tabla se angosta y las filas pueden crecer una línea.
  for (let pasada = 0; pasada < 2; pasada++) {
    // posición real del borde inferior de la fila N (incluye bordes colapsados) + borde del contenedor
    const alto = filas[maxFilas - 1].getBoundingClientRect().bottom - tabla.getBoundingClientRect().top + 3;
    cont.style.maxHeight = Math.ceil(alto) + "px";
  }
}
function ajustarTodasLasTablas() { ["piz_table", "rep_table", "cic_table"].forEach((id) => ajustarAlturaTabla(id)); }
window.addEventListener("resize", ajustarTodasLasTablas);

// ---------------------------------------------------------------
// Pestañas
// ---------------------------------------------------------------
document.querySelectorAll(".tab-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".tab-btn").forEach((b) => b.classList.remove("active"));
    document.querySelectorAll(".tab-panel").forEach((p) => p.classList.remove("active"));
    btn.classList.add("active");
    document.getElementById("tab-" + btn.dataset.tab).classList.add("active");
    if (btn.dataset.tab === "pizarra" && pizarraDatos.length === 0) cargarPizarra();
    if (btn.dataset.tab === "reporte" && reporteDatos.length === 0) cargarReporte();
    if (btn.dataset.tab === "ciclo" && cicloDatos.length === 0) cargarCiclo();
    ajustarTodasLasTablas();
    if (btn.dataset.tab === "consultar" && clGrid && clGridListo) clGrid.redraw(true);
  });
});

// ---------------------------------------------------------------
// Catálogos globales
// ---------------------------------------------------------------
let LOOKUPS = null;

async function loadLookups() {
  LOOKUPS = await apiGet("/lookups");
  await cargarConfigReportes();

  fillSelect(document.getElementById("c_estado_ticket"), LOOKUPS.estados_ticket, { valueKey: "nombre" });
  fillSelect(document.getElementById("c_unidad_resolutoria"), LOOKUPS.unidades_resolutorias, { valueKey: "nombre" });
  fillSelect(document.getElementById("c_categoria"), LOOKUPS.categorias, { valueKey: "id" });
  fillSelect(document.getElementById("c_comentario"), comentariosParaCategoria(""), { valueKey: "nombre" });
  fillSelect(document.getElementById("add_oficina_select"), oficinasReales(), { valueKey: "id" });

  mcLlenarAccion();

  actualizarModoUbicacion();
  initFiltrosConsulta();
  initFiltrosPizarra();
  initFiltrosGenerico("rep");
  initFiltrosGenerico("cic");
  cargarConsulta();
}

document.getElementById("c_categoria").addEventListener("change", (e) => {
  const catId = e.target.value;
  const afectaciones = LOOKUPS.afectaciones.filter((a) => String(a.categoria_id) === String(catId));
  fillSelect(document.getElementById("c_afectacion"), afectaciones, { valueKey: "nombre" });
  fillSelect(document.getElementById("c_comentario"), comentariosParaCategoria(catId), { valueKey: "nombre" });
  document.getElementById("c_ubicacion_tipo").value = "";   // cada Tipo empieza con su propia elección de ubicación
  actualizarModoUbicacion();
});

// Comentarios que aplican a una categoría: los ligados a ella + los genéricos
// (categoria_id NULL = aplican a todas las categorías).
function comentariosParaCategoria(catId) {
  return LOOKUPS.comentarios.filter((c) => !c.categoria_id || String(c.categoria_id) === String(catId));
}

// ---------------------------------------------------------------
// CREAR TICKET: Tipo -> Tipo de ubicación -> (Oficinas | Enlace/Tramo | solo conteos)
// ---------------------------------------------------------------
function categoriaSeleccionada() {
  const catId = document.getElementById("c_categoria").value;
  return (LOOKUPS.categorias || []).find((c) => String(c.id) === String(catId)) || null;
}
// "SOPORTE TÉCNICO" (también reconoce el nombre viejo "Soporte Técnico (Internet / Pley)")
function categoriaEsSoporte() {
  const cat = categoriaSeleccionada();
  return !!cat && normTxt(cat.nombre).startsWith("SOPORTE TEC");
}
function oficinasReales() {
  return (LOOKUPS.oficinas || []).filter((o) => (o.tipo || "oficina") === "oficina");
}
function modoUbicacion() {
  return document.getElementById("c_ubicacion_tipo").value;   // "", NO_APLICA, ENLACE, TRAMO, TRONCAL, OFICINA
}

function actualizarModoUbicacion() {
  const cat = categoriaSeleccionada();
  const esSoporte = categoriaEsSoporte();
  const modo = modoUbicacion();
  const mostrar = (id, visible) => document.getElementById(id).classList.toggle("hidden", !visible);
  const esEnlaceTramo = esSoporte && TIPOS_ENLACE.includes(modo);

  mostrar("ubicacion_tipo_block", esSoporte);
  mostrar("oficinas_section", esSoporte && modo === "OFICINA");
  mostrar("enlace_section", esEnlaceTramo);
  // Conteos a nivel de ticket: "no aplica" y los Tipos no técnicos (CENTRAL TELEFÓNICA, PAGOS, ...)
  mostrar("otros_categoria_block", !!cat && (!esSoporte || modo === "NO_APLICA"));
  if (esEnlaceTramo) {
    document.getElementById("enlace_titulo").textContent = TITULO_ENLACE[modo];
    renderEnlace();
  }
}
document.getElementById("c_ubicacion_tipo").addEventListener("change", actualizarModoUbicacion);

// ---- ENLACE / TRAMO / TRONCAL: varios OLT, cada uno con su Ubicación ----
function nuevaFilaEnlace() {
  return { olt: "", ubicacion: "", nro_afectados: 0, no_reportaron: 0 };
}
let enlaceState = [nuevaFilaEnlace()];

function renderEnlace() {
  const cont = document.getElementById("enlace_container");
  const datalist = document.getElementById("enlace_olts_datalist");
  datalist.innerHTML = "";
  ["NO INDICADO", "N/A", ...(LOOKUPS.olts || []).map((o) => o.codigo)].forEach((v) => {
    const opt = document.createElement("option");
    opt.value = v;
    datalist.appendChild(opt);
  });

  cont.innerHTML = "";
  enlaceState.forEach((fila, idx) => {
    const box = document.createElement("div");
    box.className = "tree-box tree-olt";
    box.innerHTML = `
      <div class="tree-header">
        <strong>OLT ${idx + 1}</strong>
        <button type="button" class="btn-secondary btn-remove">Quitar</button>
      </div>
      <div class="grid-2">
        <div class="field"><label>OLT <small>(escribe para buscar, o elige NO INDICADO / N/A)</small></label>
          <input type="text" list="enlace_olts_datalist" class="en-olt" /></div>
        <div class="field"><label>Ubicación</label><select class="en-ubicacion"></select></div>
        <div class="field"><label>Nro de afectados</label><input type="number" min="0" class="en-afectados" /></div>
        <div class="field"><label>Nro Personas que reportaron la falla</label><input type="number" min="0" class="en-reportaron" /></div>
      </div>`;

    const inOlt = box.querySelector(".en-olt");
    const selUbi = box.querySelector(".en-ubicacion");
    const inAfe = box.querySelector(".en-afectados");
    const inRep = box.querySelector(".en-reportaron");

    inOlt.value = fila.olt;
    inAfe.value = fila.nro_afectados;
    inRep.value = fila.no_reportaron;

    const opt0 = document.createElement("option");
    opt0.value = ""; opt0.textContent = "Seleccione:";
    selUbi.appendChild(opt0);
    oficinasReales().forEach((o) => {
      const opt = document.createElement("option");
      opt.value = o.nombre; opt.textContent = o.nombre;
      selUbi.appendChild(opt);
    });
    selUbi.value = fila.ubicacion;

    inOlt.addEventListener("input", () => { fila.olt = inOlt.value; });
    selUbi.addEventListener("change", () => { fila.ubicacion = selUbi.value; });
    inAfe.addEventListener("input", () => { fila.nro_afectados = Number(inAfe.value || 0); });
    inRep.addEventListener("input", () => { fila.no_reportaron = Number(inRep.value || 0); });
    box.querySelector(".btn-remove").addEventListener("click", () => {
      enlaceState.splice(idx, 1);
      if (enlaceState.length === 0) enlaceState.push(nuevaFilaEnlace());
      renderEnlace();
    });
    cont.appendChild(box);
  });
}
document.getElementById("btn_add_enlace_olt").addEventListener("click", () => {
  enlaceState.push(nuevaFilaEnlace());
  renderEnlace();
});

// ---------------------------------------------------------------
// CREAR TICKET: árbol anidado Oficina -> OLT -> Tarjeta -> Puerto
// ---------------------------------------------------------------
// Constantes fijas del negocio (independientes del catálogo de OLTs,
// que solo se usa para el autocompletado del campo de texto).
const NUM_OLTS_POR_OFICINA = 4;
const NUM_TARJETAS = 18;
const NUM_PUERTOS = 16;

// Estado en árbol. Cada nivel es autónomo: cambiar algo en una oficina
// u OLT nunca toca los datos de otra rama.
// oficinasState = [ { oficina_id, nombre, olts: [ { texto, sector, edificio,
//   no_reportaron, tarjetas: { "Tarjeta 1": { puertos: { "Puerto 1": { no_afectados } } } } } x4 ] } ]
let oficinasState = [];

document.getElementById("btn_add_oficina").addEventListener("click", async () => {
  const select = document.getElementById("add_oficina_select");
  const oficinaId = select.value;
  if (!oficinaId) return;
  if (oficinasState.some((o) => String(o.oficina_id) === String(oficinaId))) {
    alert("Esa oficina ya fue agregada.");
    return;
  }
  const nombre = select.selectedOptions[0].textContent;

  let oltsCatalogo = [];
  try {
    const data = await apiSend("/lookups", "POST", { oficina_id: oficinaId });
    oltsCatalogo = data.olts.map((o) => o.codigo);
  } catch (e) { /* si falla el autocompletado no bloquea el flujo */ }

  oficinasState.push({
    oficina_id: oficinaId,
    nombre,
    olts_catalogo: oltsCatalogo,
    olts: Array.from({ length: NUM_OLTS_POR_OFICINA }, () => ({
      texto: "", sector: "DESCONOCIDO", edificio: "DESCONOCIDO", no_reportaron: 0, tarjetas: {},
    })),
  });
  renderOficinas();
});

function removeOficina(oIdx) {
  oficinasState.splice(oIdx, 1);
  renderOficinas();
}

function toggleTarjeta(oIdx, oltIdx, tarjetaNombre, checked) {
  const olt = oficinasState[oIdx].olts[oltIdx];
  if (checked) {
    if (!olt.tarjetas[tarjetaNombre]) olt.tarjetas[tarjetaNombre] = { puertos: {} };
  } else {
    delete olt.tarjetas[tarjetaNombre];
  }
  renderOficinas();
}

function selectAllTarjetas(oIdx, oltIdx) {
  const olt = oficinasState[oIdx].olts[oltIdx];
  for (let i = 1; i <= NUM_TARJETAS; i++) {
    const nombre = `Tarjeta ${i}`;
    if (!olt.tarjetas[nombre]) olt.tarjetas[nombre] = { puertos: {} };
  }
  renderOficinas();
}

function togglePuerto(oIdx, oltIdx, tarjetaNombre, puertoNombre, checked) {
  const tarjeta = oficinasState[oIdx].olts[oltIdx].tarjetas[tarjetaNombre];
  if (checked) {
    if (!tarjeta.puertos[puertoNombre]) tarjeta.puertos[puertoNombre] = { no_afectados: 0 };
  } else {
    delete tarjeta.puertos[puertoNombre];
  }
  renderOficinas();
}

function selectAllPuertos(oIdx, oltIdx, tarjetaNombre) {
  const tarjeta = oficinasState[oIdx].olts[oltIdx].tarjetas[tarjetaNombre];
  for (let i = 1; i <= NUM_PUERTOS; i++) {
    const nombre = `Puerto ${i}`;
    if (!tarjeta.puertos[nombre]) tarjeta.puertos[nombre] = { no_afectados: 0 };
  }
  renderOficinas();
}

function renderOficinas() {
  const cont = document.getElementById("oficinas_container");
  cont.innerHTML = "";

  oficinasState.forEach((of, oIdx) => {
    const box = document.createElement("div");
    box.className = "tree-box tree-oficina";
    box.innerHTML = `
      <div class="tree-header">
        <strong>Oficina:</strong> ${of.nombre}
        <button type="button" class="btn-secondary btn-remove" data-oidx="${oIdx}">Quitar oficina</button>
      </div>
      <div class="tree-body olts-grid"></div>
    `;
    box.querySelector(".btn-remove").addEventListener("click", () => removeOficina(oIdx));

    const oltsGrid = box.querySelector(".olts-grid");

    const datalistId = `olts-datalist-${oIdx}`;
    const datalist = document.createElement("datalist");
    datalist.id = datalistId;
    (of.olts_catalogo || []).forEach((code) => {
      const opt = document.createElement("option");
      opt.value = code;
      datalist.appendChild(opt);
    });
    oltsGrid.appendChild(datalist);

    of.olts.forEach((olt, oltIdx) => {
      const oltBox = document.createElement("div");
      oltBox.className = "tree-box tree-olt";
      oltBox.innerHTML = `
        <label>OLT ${oltIdx + 1}</label>
        <input type="text" list="${datalistId}" placeholder="Escriba o seleccione el código de OLT" value="${olt.texto}" class="olt-texto" />
      `;
      const oltInput = oltBox.querySelector(".olt-texto");
      oltInput.addEventListener("input", () => { olt.texto = oltInput.value; });
      oltInput.addEventListener("change", () => { olt.texto = oltInput.value; renderOficinas(); });

      if (olt.texto.trim()) {
        const datosBox = document.createElement("div");
        datosBox.className = "tree-body";
        datosBox.innerHTML = `
          <div class="grid-3">
            <div class="field">
              <label>Sector</label>
              <input type="text" class="olt-sector" value="${olt.sector}" />
            </div>
            <div class="field">
              <label>Edificio</label>
              <input type="text" class="olt-edificio" value="${olt.edificio}" />
            </div>
            <div class="field">
              <label>No. Reportaron</label>
              <input type="number" min="0" class="olt-no-reportaron" value="${olt.no_reportaron}" />
            </div>
          </div>
          <div class="field">
            <label>Tarjeta (selección múltiple)</label>
            <div class="multiselect-row">
              <div class="checkbox-grid tarjetas-grid"></div>
              <button type="button" class="btn-secondary btn-todas-tarjetas">Todas</button>
            </div>
          </div>
          <div class="tarjetas-container"></div>
        `;
        datosBox.querySelector(".olt-sector").addEventListener("input", (e) => { olt.sector = e.target.value; });
        datosBox.querySelector(".olt-edificio").addEventListener("input", (e) => { olt.edificio = e.target.value; });
        datosBox.querySelector(".olt-no-reportaron").addEventListener("input", (e) => { olt.no_reportaron = Number(e.target.value || 0); });
        datosBox.querySelector(".btn-todas-tarjetas").addEventListener("click", () => selectAllTarjetas(oIdx, oltIdx));

        const tarjetasGrid = datosBox.querySelector(".tarjetas-grid");
        for (let i = 1; i <= NUM_TARJETAS; i++) {
          const nombre = `Tarjeta ${i}`;
          const checked = !!olt.tarjetas[nombre];
          const lbl = document.createElement("label");
          lbl.className = "chk";
          lbl.innerHTML = `<input type="checkbox" ${checked ? "checked" : ""} /> ${nombre}`;
          lbl.querySelector("input").addEventListener("change", (e) => toggleTarjeta(oIdx, oltIdx, nombre, e.target.checked));
          tarjetasGrid.appendChild(lbl);
        }

        const tarjetasContainer = datosBox.querySelector(".tarjetas-container");
        Object.keys(olt.tarjetas).forEach((tarjetaNombre) => {
          const tarjeta = olt.tarjetas[tarjetaNombre];
          const tBox = document.createElement("div");
          tBox.className = "tree-box tree-tarjeta";
          tBox.innerHTML = `
            <div class="tree-header"><strong>${tarjetaNombre}</strong></div>
            <div class="field">
              <label>Puerto (selección múltiple)</label>
              <div class="multiselect-row">
                <div class="checkbox-grid puertos-grid"></div>
                <button type="button" class="btn-secondary btn-todos-puertos">Todos</button>
              </div>
            </div>
            <div class="puertos-container"></div>
          `;
          tBox.querySelector(".btn-todos-puertos").addEventListener("click", () => selectAllPuertos(oIdx, oltIdx, tarjetaNombre));

          const puertosGrid = tBox.querySelector(".puertos-grid");
          for (let i = 1; i <= NUM_PUERTOS; i++) {
            const pNombre = `Puerto ${i}`;
            const checked = !!tarjeta.puertos[pNombre];
            const lbl = document.createElement("label");
            lbl.className = "chk";
            lbl.innerHTML = `<input type="checkbox" ${checked ? "checked" : ""} /> ${pNombre}`;
            lbl.querySelector("input").addEventListener("change", (e) => togglePuerto(oIdx, oltIdx, tarjetaNombre, pNombre, e.target.checked));
            puertosGrid.appendChild(lbl);
          }

          const puertosContainer = tBox.querySelector(".puertos-container");
          Object.keys(tarjeta.puertos).forEach((puertoNombre) => {
            const pField = document.createElement("div");
            pField.className = "field puerto-field";
            pField.innerHTML = `
              <label>${puertoNombre} — No. Afectados</label>
              <input type="number" min="0" value="${tarjeta.puertos[puertoNombre].no_afectados}" />
            `;
            pField.querySelector("input").addEventListener("input", (e) => {
              tarjeta.puertos[puertoNombre].no_afectados = Number(e.target.value || 0);
            });
            puertosContainer.appendChild(pField);
          });

          tarjetasContainer.appendChild(tBox);
        });

        oltBox.appendChild(datosBox);
      }

      oltsGrid.appendChild(oltBox);
    });

    cont.appendChild(box);
  });
}

// CREAR-PURE-START
// Tipos de ubicación "lineales": se eligen varios OLT, cada uno con su Ubicación (oficina real).
const TIPOS_ENLACE = ["ENLACE", "TRAMO", "TRONCAL"];
const TITULO_ENLACE = { ENLACE: "Enlace afectado", TRAMO: "Tramo afectado", TRONCAL: "Troncal afectada" };
// Convierte el árbol Oficina > OLT > Tarjeta > Puerto en la lista plana que espera la API:
// una fila por cada combinación Oficina + OLT + Tarjeta + Puerto.
function flattenOficinasPuro(oficinasState) {
  const puertos = [];
  for (const of of oficinasState) {
    for (const olt of of.olts) {
      if (!olt.texto.trim()) continue;
      for (const tarjetaNombre of Object.keys(olt.tarjetas)) {
        const tarjeta = olt.tarjetas[tarjetaNombre];
        for (const puertoNombre of Object.keys(tarjeta.puertos)) {
          puertos.push({
            oficina_id: of.oficina_id,
            olt: olt.texto.trim(),
            tarjeta: tarjetaNombre,
            puerto: puertoNombre,
            sector: olt.sector || "DESCONOCIDO",
            edificio: olt.edificio || "DESCONOCIDO",
            no_clientes_reportaron: Number(olt.no_reportaron || 0),
            nro_clientes_afectados: Number(tarjeta.puertos[puertoNombre].no_afectados || 0),
          });
        }
      }
    }
  }
  return puertos;
}

// Reglas de ubicación al crear un ticket:
//  - Tipo NO técnico (CENTRAL TELEFÓNICA, HERRAMIENTAS VNET, MERCADEO, PAGOS): OFICINA = ese Tipo, todo lo demás N/A.
//  - SOPORTE TÉCNICO + "SOPORTE TÉCNICO PERO NO APLICA": OFICINA = esa opción, todo lo demás N/A.
//  - SOPORTE TÉCNICO + ENLACE / TRAMO / TRONCAL: OFICINA = ese tipo; una fila por OLT (NO INDICADO / N/A también valen),
//    la UBICACIÓN (oficina donde está el OLT) va en "sector"; Tarjeta, Puerto y Edificio = N/A.
//  - SOPORTE TÉCNICO + OFICINA: árbol de siempre (sin cambios).
function construirPuertosSegunModo(ctx) {
  const { categoria, esSoporte, modo, oficinas, oficinasState, enlaceState, conteos } = ctx;
  const especialDe = (nombre) => {
    const n = normTxt(nombre);
    return (oficinas || []).find((o) => o.tipo === "especial" && normTxt(o.nombre) === n) || null;
  };
  const faltaEspecial = (nombre) =>
    new Error(`No existe la oficina especial "${nombre}" en el catálogo. Aplica las migraciones pendientes (015 y 016) y recarga la página.`);
  const unico = (oficina) => [{
    oficina_id: oficina.id,
    olt: "N/A", tarjeta: "N/A", puerto: "N/A", sector: "N/A", edificio: "N/A",
    no_clientes_reportaron: Number(conteos.no_reportaron || 0),
    nro_clientes_afectados: Number(conteos.nro_afectados || 0),
  }];

  if (!categoria) throw new Error("Seleccione el Tipo (categoría de la afectación).");

  if (!esSoporte) {
    const of = especialDe(categoria.nombre);
    if (!of) throw faltaEspecial(categoria.nombre);
    return unico(of);
  }

  if (!modo) throw new Error("Seleccione el Tipo de ubicación.");

  if (modo === "NO_APLICA") {
    const of = especialDe("SOPORTE TÉCNICO PERO NO APLICA");
    if (!of) throw faltaEspecial("SOPORTE TÉCNICO PERO NO APLICA");
    return unico(of);
  }

  if (TIPOS_ENLACE.includes(modo)) {
    const of = especialDe(modo);
    if (!of) throw faltaEspecial(modo);
    const filas = [];
    enlaceState.forEach((f, idx) => {
      const olt = String(f.olt || "").trim();
      if (!olt && !f.ubicacion) return;                 // fila vacía: se ignora
      if (!olt || !f.ubicacion) throw new Error(`Completa el OLT y la Ubicación en la fila ${idx + 1} del ${modo}.`);
      filas.push({
        oficina_id: of.id,
        olt, tarjeta: "N/A", puerto: "N/A", sector: f.ubicacion, edificio: "N/A",
        no_clientes_reportaron: Number(f.no_reportaron || 0),
        nro_clientes_afectados: Number(f.nro_afectados || 0),
      });
    });
    if (filas.length === 0) throw new Error(`Agrega al menos un OLT con su Ubicación para el ${modo}.`);
    return filas;
  }

  if (modo === "OFICINA") {
    const filas = flattenOficinasPuro(oficinasState);
    if (filas.length === 0) throw new Error("Agrega al menos una oficina, con al menos un OLT, tarjeta y puerto.");
    return filas;
  }

  throw new Error("Tipo de ubicación no válido.");
}
// CREAR-PURE-END

// ---------------------------------------------------------------
// Aviso de ticket repetido (Crear Ticket): al salir del cuadro del ticket se busca en la BD.
//   Si existe: alerta con "Validar" (muestra el Log del ticket), "Continuar" (pide la contraseña y da 2 minutos) y "Cancelar".
// ---------------------------------------------------------------
const DUP = { cmr: null, token: null, hasta: 0 };
const dupVigente = (cmr) => DUP.cmr === cmr && DUP.token && Date.now() < DUP.hasta;
function dupMostrarAviso(cmr) {
  return new Promise((resolve) => {
    const nombre = (currentUser && (currentUser.nombre || currentUser.email)) || "usuario";
    const ov = document.createElement("div");
    ov.id = "modal_dup"; ov.className = "modal-overlay";
    ov.innerHTML = `<div class="modal-box"><h3>Ticket ya registrado</h3>` +
      `<p>Atención <b>${escHtml(nombre)}</b> el ticket que desea crear ya se encuentra en la base de datos, por favor validar antes de proceder.</p>` +
      `<div class="modal-botones"><button type="button" class="btn-secondary" id="dup_cancelar">Cancelar</button>` +
      `<button type="button" class="btn-secondary" id="dup_validar">Validar</button>` +
      `<button type="button" class="btn-primary" id="dup_continuar">Continuar</button></div></div>`;
    document.body.appendChild(ov);
    const cerrar = (r) => { ov.remove(); resolve(r); };
    ov.querySelector("#dup_validar").addEventListener("click", () => abrirModalLog(cmr));
    ov.querySelector("#dup_cancelar").addEventListener("click", () => cerrar("cancelar"));
    ov.querySelector("#dup_continuar").addEventListener("click", () => cerrar("continuar"));
  });
}
let dupRevisando = null;
// true = se puede seguir con ese número; false = se canceló (el cuadro queda vacío). Si ya hay una revisión en curso
// (el blur del cuadro y el clic en "Crear" llegan casi juntos) se espera a esa misma.
function revisarTicketRepetido() {
  const cmr = document.getElementById("c_ticket_cmr").value.trim();
  if (!cmr || dupVigente(cmr)) return Promise.resolve(true);
  if (!dupRevisando) dupRevisando = revisarTicketRepetidoInterno(cmr).finally(() => { dupRevisando = null; });
  return dupRevisando;
}
async function revisarTicketRepetidoInterno(cmr) {
  const input = document.getElementById("c_ticket_cmr");
  {
    try {
    let r;
    try { r = await apiGet(`/tickets/existe?cmr=${encodeURIComponent(cmr)}`); } catch { return true; } // si la búsqueda falla, el servidor igual rechaza el repetido
    if (!r.existe) return true;
    for (;;) {
      const op = await dupMostrarAviso(cmr);
      if (op === "cancelar") { input.value = ""; return false; }
      const res = await pedirClave(`Para continuar con el ticket ${formatearTicket(cmr)} (ya existente) escribe tu contraseña. Podrás registrarlo durante los próximos 2 minutos.`,
        (password) => apiSend("/auth/verificar-duplicado", "POST", { password, ticket_cmr: cmr }),
        { titulo: "Confirmar ticket existente", boton: "Continuar", peligro: false });
      if (res && res.token) { DUP.cmr = cmr; DUP.token = res.token; DUP.hasta = Date.now() + (res.minutos || 2) * 60000; return true; }
      // clave cancelada: vuelve al aviso
    }
    } finally { /* nada */ }
  }
}
document.getElementById("c_ticket_cmr").addEventListener("blur", () => { revisarTicketRepetido(); });

document.getElementById("btn_crear_ticket").addEventListener("click", async () => {
  const msg = document.getElementById("crear_msg");
  try {
    if (!(await revisarTicketRepetido())) throw new Error("Ticket cancelado: escribe otro número de ticket.");
    const puertos = construirPuertosSegunModo({
      categoria: categoriaSeleccionada(),
      esSoporte: categoriaEsSoporte(),
      modo: modoUbicacion(),
      oficinas: LOOKUPS.oficinas,
      oficinasState,
      enlaceState,
      conteos: {
        nro_afectados: document.getElementById("c_otros_nro_afectados").value,
        no_reportaron: document.getElementById("c_otros_no_reportaron").value,
      },
    });
    const payload = {
      ticket_cmr: document.getElementById("c_ticket_cmr").value.trim(),
      tickets_vinculados: document.getElementById("c_tickets_vinculados").value.trim(),
      fecha_apertura_cda: document.getElementById("c_fecha_cda").value,
      fecha_apertura_cmr: document.getElementById("c_fecha_cmr").value,
      estado_ticket: document.getElementById("c_estado_ticket").value,
      unidad_resolutoria: document.getElementById("c_unidad_resolutoria").value,
      categoria_afectacion: document.getElementById("c_categoria").selectedOptions[0]?.textContent || "",
      afectacion: document.getElementById("c_afectacion").value,
      comentario: document.getElementById("c_comentario").value,
      descripcion: document.getElementById("c_descripcion").value,
      puertos,
    };
    if (dupVigente(payload.ticket_cmr)) payload.token_duplicado = DUP.token;
    const res = await apiSend("/tickets", "POST", payload);
    DUP.cmr = null; DUP.token = null; DUP.hasta = 0;
    showMsg(msg, res.agregado
      ? `Ticket ${res.ticket_cmr} ya existía: se agregaron ${payload.puertos.length} registro(s) (#${res.id}).`
      : `Ticket ${res.ticket_cmr} creado correctamente (#${res.id}) con ${payload.puertos.length} puerto(s).`, true);
    oficinasState = [];
    enlaceState = [nuevaFilaEnlace()];
    renderOficinas();
    document.getElementById("c_ubicacion_tipo").value = "";
    actualizarModoUbicacion();
    document.getElementById("c_ticket_cmr").value = "";
    document.getElementById("c_otros_no_reportaron").value = "0";
    document.getElementById("c_otros_nro_afectados").value = "0";
  } catch (err) {
    showMsg(msg, err.message, false);
  }
});

// ---------------------------------------------------------------
// MODIFICAR / CERRAR TICKET — Solución, Cierre o Cambio de campo (masivo / puntual)
// ---------------------------------------------------------------
let mcTicket = null;
let mcPuertos = [];
let mcEscenario = null; // 1, 2, 3 o 4

function mcOcultarEscenarios() {
  [1, 2, 3, 4, 5].forEach((n) => document.getElementById(`mc_escenario_${n}`).classList.add("hidden"));
  document.getElementById("mc_enlace").classList.add("hidden");
}

// Paso 1: "¿Qué deseas hacer?" → SOLUCION | CIERRE | CAMPO. Paso 2: número de ticket; al buscar se cuentan sus registros:
//   CAMPO    · >1 registro: elegir Cambio masivo / puntual · 1 registro: directo a Cambio masivo
//   SOLUCION · >1 registro: elegir Solución masiva / puntual · 1 registro: directo a Solución masiva
//   CIERRE   · siempre Cierre masivo (todos los registros del ticket)
function mcLlenarAccion() { document.getElementById("mc_accion").value = ""; }
function mcAccionActual() {
  const v = document.getElementById("mc_accion").value;
  return { accion: v, cerrado: v === "CIERRE", solucion: v === "SOLUCION", campo: v === "CAMPO", elegida: !!v };
}
function mcFechaCorta(v) { return v ? formatearFechaHora(v) : "-"; }

// Estados que se pueden asignar con "Cambio de campo" (CERRADO se hace por "Cierre de Ticket")
// En "Cambio de campo" no se ofrecen CERRADO ni RESUELTO: esos estados se registran solo con las acciones "Cierre de Ticket" y "Solución de Ticket" (llevan sus fechas).
function mcLlenarEstados(select, textoVacio, actual) {
  select.innerHTML = "";
  if (textoVacio) { const o = document.createElement("option"); o.value = ""; o.textContent = textoVacio; select.appendChild(o); }
  (LOOKUPS.estados_ticket || []).map((e) => e.nombre).filter((n) => n !== "CERRADO" && n !== "RESUELTO").forEach((n) => {
    const o = document.createElement("option"); o.value = n; o.textContent = n; select.appendChild(o);
  });
  if (actual !== undefined && actual !== null) select.value = actual;
}
// Indicadores de lectura rápida del ticket (solo en "Cambio de campo").
// Los clientes siguen la lógica de los tableros (1.er registro del ticket).
function mcRenderCards() {
  const c = document.getElementById("mc_cards");
  if (!mcTicket || !mcAccionActual().campo) { c.classList.add("hidden"); return; }
  const p0 = mcPuertos[0] || {};
  const oficinas = [...new Set(mcPuertos.map((p) => p.oficina_nombre).filter(Boolean))];
  const set = (id, v) => { document.getElementById(id).textContent = v; };
  set("mc_card_apertura_cmr", mcFechaCorta(mcTicket.fecha_apertura_cmr));
  set("mc_card_apertura_cda", mcFechaCorta(mcTicket.fecha_apertura_cda));
  set("mc_card_oficina", oficinas.length ? oficinas.join(", ") : (mcTicket.oficina_nombre || "-"));
  set("mc_card_unidad", mcTicket.unidad_resolutoria || "-");
  set("mc_card_estado", mcTicket.estado_ticket || "-");
  set("mc_card_afectados", formatearMiles(p0.nro_clientes_afectados ?? 0));
  set("mc_card_reportaron", formatearMiles(p0.no_clientes_reportaron ?? 0));
  c.classList.remove("hidden");
}

let mcAlcance = "MASIVO";
// Vuelve a leer el ticket (tarjetas al día) y redibuja el formulario conservando la acción elegida
async function mcRefrescarTicket() {
  const data = await apiGet(`/tickets/${encodeURIComponent(mcTicket.ticket_cmr)}`);
  mcTicket = data.ticket; mcPuertos = data.puertos;
  mcRenderCards();
  mcRenderSegunAccion();
}
// Dibuja el formulario que corresponde a (acción elegida, alcance)
function mcRenderSegunAccion() {
  mcOcultarEscenarios();
  const { cerrado, solucion } = mcAccionActual();
  if (cerrado) { mcEscenario = 3; mcRenderEscenario3(); return; }
  if (solucion) {
    if (mcAlcance === "MASIVO") { mcEscenario = 5; mcRenderEscenario5(); } else { mcEscenario = 4; mcRenderEscenario4(); }
    return;
  }
  if (mcEsEnlace(mcPuertos)) {         // ENLACE / TRAMO / TRONCAL: pantalla propia (cambio de campo)
    mcRenderEnlace(mcAlcance, false, null);
    return;
  }
  mcEscenario = mcAlcance === "MASIVO" ? 1 : 2;
  if (mcEscenario === 1) mcRenderEscenario1(); else mcRenderEscenario2();
}
function mcMarcarAlcance() {
  document.getElementById("mc_btn_masivo").classList.toggle("btn-primary", mcAlcance === "MASIVO");
  document.getElementById("mc_btn_masivo").classList.toggle("btn-secondary", mcAlcance !== "MASIVO");
  document.getElementById("mc_btn_puertos").classList.toggle("btn-primary", mcAlcance !== "MASIVO");
  document.getElementById("mc_btn_puertos").classList.toggle("btn-secondary", mcAlcance === "MASIVO");
}
function mcLimpiarPantalla() {
  mcTicket = null; mcPuertos = [];
  mcOcultarEscenarios();
  document.getElementById("mc_cards").classList.add("hidden");
  document.getElementById("mc_alcance").classList.add("hidden");
  document.getElementById("mc_msg").textContent = "";
  document.getElementById("mc_msg_busqueda").textContent = "";
}
// Tras guardar un cambio con éxito: se vacía el número de ticket, el combo vuelve a "Seleccione:" y se oculta el formulario (el mensaje de éxito queda
// visible) para que nadie aplique por error otro cambio sobre el mismo ticket.
function mcFinalizarCambio() {
  const msg = document.getElementById("mc_msg");
  const texto = msg.textContent, clase = msg.className;
  mcLimpiarPantalla();
  msg.textContent = texto; msg.className = clase;
  document.getElementById("mc_ticket").value = "";
  document.getElementById("mc_accion").value = "";        // vuelve a "Seleccione:"
  document.getElementById("mc_paso2").classList.add("hidden");
  document.getElementById("mc_accion").focus();
}
// Al cambiar el paso 1 se limpia la pantalla: solo queda el Nº de ticket y el botón de buscar
document.getElementById("mc_accion").addEventListener("change", () => {
  mcLimpiarPantalla();
  document.getElementById("mc_paso2").classList.toggle("hidden", !mcAccionActual().elegida);
});
document.getElementById("mc_ticket").addEventListener("input", () => { if (mcTicket) mcLimpiarPantalla(); });
document.getElementById("mc_ticket").addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); mcBuscarTicket(); } });

// Confirma el número: consulta la base de datos, cuenta los registros del ticket y decide el siguiente paso.
async function mcBuscarTicket() {
  const msg = document.getElementById("mc_msg_busqueda");
  mcLimpiarPantalla();
  const cmr = document.getElementById("mc_ticket").value.replace(/\s+/g, "");
  const ac = mcAccionActual();
  if (!ac.elegida) { showMsg(msg, "Elige primero qué deseas hacer.", false); return; }
  if (!cmr) { showMsg(msg, "Ingrese el número de ticket.", false); return; }
  try {
    const data = await apiGet(`/tickets/${encodeURIComponent(cmr)}`);
    mcTicket = data.ticket;
    mcPuertos = data.puertos;
    const n = mcPuertos.length;
    showMsg(msg, `Ticket ${formatearTicket(mcTicket.ticket_cmr)}: ${formatearMiles(n)} registro(s) · estado ${mcTicket.estado_ticket}.`, true);
    mcRenderCards();
    if (ac.cerrado || n <= 1) { mcAlcance = "MASIVO"; mcRenderSegunAccion(); return; }
    const etiqueta = ac.solucion ? "Solución" : "Cambio";
    document.getElementById("mc_btn_masivo").textContent = ac.solucion ? "SOLUCIÓN MASIVA" : "CAMBIO MASIVO";
    document.getElementById("mc_btn_puertos").textContent = ac.solucion ? "SOLUCIÓN PUNTUAL" : "CAMBIO PUNTUAL";
    document.getElementById("mc_alcance_hint").textContent = `Este ticket tiene ${formatearMiles(n)} registros. ¿${etiqueta} masivo (todo el ticket) o puntual (un registro)?`;
    document.getElementById("mc_alcance").classList.remove("hidden");
    mcAlcance = null;
    document.getElementById("mc_btn_masivo").classList.add("btn-secondary"); document.getElementById("mc_btn_masivo").classList.remove("btn-primary");
    document.getElementById("mc_btn_puertos").classList.add("btn-secondary"); document.getElementById("mc_btn_puertos").classList.remove("btn-primary");
  } catch (err) {
    mcTicket = null;
    mcRenderCards();
    showMsg(msg, err.message, false);
  }
}
document.getElementById("mc_btn_buscar").addEventListener("click", mcBuscarTicket);
function mcElegirAlcance(alcance) {
  if (!mcTicket) return;
  document.getElementById("mc_msg").textContent = "";
  mcAlcance = alcance; mcMarcarAlcance(); mcRenderSegunAccion();
}
document.getElementById("mc_btn_masivo").addEventListener("click", () => mcElegirAlcance("MASIVO"));
document.getElementById("mc_btn_puertos").addEventListener("click", () => mcElegirAlcance("PUNTUAL"));

// --- Escenario 1: <> Cerrado + Masivo ---
function mcRenderEscenario1() {
  fillSelect(document.getElementById("e1_unidad_resolutoria"), LOOKUPS.unidades_resolutorias, { valueKey: "nombre", placeholder: "No modificar" });
  document.getElementById("e1_fecha_cmr").value = "";
  document.getElementById("e1_fecha_cda").value = "";
  document.getElementById("e1_unidad_resolutoria").value = "";
  mcLlenarEstados(document.getElementById("e1_estado"), "No modificar", "");
  document.getElementById("e1_avance").value = "";
  document.getElementById("e1_afectados").value = "";
  document.getElementById("e1_reportaron").value = "";
  document.getElementById("mc_escenario_1").classList.remove("hidden");
}

document.getElementById("e1_btn_guardar").addEventListener("click", async () => {
  const msg = document.getElementById("mc_msg");
  try {
    const body = {};
    const nuevoEstado = document.getElementById("e1_estado").value;
    if (nuevoEstado) body.estado_ticket = nuevoEstado;
    const conteo = (id, etiqueta) => {
      const raw = document.getElementById(id).value.trim();
      if (raw === "") return null;
      const n = Number(raw);
      if (!Number.isInteger(n) || n < 0) throw new Error(`${etiqueta}: indica un número entero igual o mayor que 0.`);
      return n;
    };
    const afectados = conteo("e1_afectados", "Cantidad de clientes afectados");
    const reportaron = conteo("e1_reportaron", "Cantidad de clientes que reportaron");
    if (afectados !== null) body.nro_clientes_afectados = afectados;
    if (reportaron !== null) body.no_clientes_reportaron = reportaron;
    const fechaCmr = document.getElementById("e1_fecha_cmr").value;
    const fechaCda = document.getElementById("e1_fecha_cda").value;
    const unidad = document.getElementById("e1_unidad_resolutoria").value;
    const avance = document.getElementById("e1_avance").value.trim();
    if (fechaCmr) body.fecha_apertura_cmr = fechaCmr;
    if (fechaCda) body.fecha_apertura_cda = fechaCda;
    if (unidad) body.unidad_resolutoria = unidad;
    if (avance) body.avance_cmr = avance;
    if (Object.keys(body).length === 0) throw new Error("No hay cambios para guardar: llena al menos un campo o elige otra acción.");

    await apiSend(`/tickets/${mcTicket.id}/masivo`, "PATCH", body);
    showMsg(msg, `Ticket ${mcTicket.ticket_cmr} actualizado correctamente (modificación masiva).`, true);
    mcFinalizarCambio();
  } catch (err) {
    showMsg(msg, err.message, false);
  }
});

// --- Escenario 2: Cambio puntual (un registro: solo Oficina, OLT, Tarjeta y Puerto) ---
function mcRenderEscenario2() {
  const tbody = document.querySelector("#e2_table tbody");
  tbody.innerHTML = "";
  const oficinas = LOOKUPS.oficinas;

  mcPuertos.forEach((p, idx) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td><input type="radio" name="e2_registro" class="e2-sel" data-idx="${idx}" title="Elegir este registro" /></td>
      <td>
        <select class="e2-oficina" data-idx="${idx}" disabled>
          <option value="${p.oficina_id || ""}" selected>${escHtml(p.oficina_nombre || "Sin oficina")}</option>
          ${oficinas.filter((o) => o.id !== p.oficina_id).map((o) => `<option value="${o.id}">${escHtml(o.nombre)}</option>`).join("")}
        </select>
      </td>
      <td><input class="e2-olt" data-idx="${idx}" value="${escHtml(p.olt)}" disabled /></td>
      <td><input class="e2-tarjeta" data-idx="${idx}" value="${escHtml(p.tarjeta)}" disabled /></td>
      <td><input class="e2-puerto" data-idx="${idx}" value="${escHtml(p.puerto)}" disabled /></td>
    `;
    tr.querySelector(".e2-sel").addEventListener("change", () => {
      tbody.querySelectorAll("tr").forEach((fila) => {
        const activa = fila.querySelector(".e2-sel").checked;
        fila.querySelectorAll("select, input:not(.e2-sel)").forEach((c) => { c.disabled = !activa; });
        fila.classList.toggle("cl-fila-sel", activa);
      });
    });
    tbody.appendChild(tr);
  });
  document.getElementById("mc_escenario_2").classList.remove("hidden");
}

document.getElementById("e2_btn_guardar").addEventListener("click", async () => {
  const msg = document.getElementById("mc_msg");
  const tbody = document.querySelector("#e2_table tbody");
  const marcada = tbody.querySelector(".e2-sel:checked");
  if (!marcada) { showMsg(msg, "Elige el registro que quieres cambiar (casilla de la primera columna).", false); return; }
  const idx = Number(marcada.dataset.idx);
  const p = mcPuertos[idx];
  const oficina_id = tbody.querySelector(`.e2-oficina[data-idx="${idx}"]`).value || null;
  const olt = tbody.querySelector(`.e2-olt[data-idx="${idx}"]`).value.trim();
  const tarjeta = tbody.querySelector(`.e2-tarjeta[data-idx="${idx}"]`).value.trim();
  const puerto = tbody.querySelector(`.e2-puerto[data-idx="${idx}"]`).value.trim();
  if (!olt || !tarjeta || !puerto) { showMsg(msg, "OLT, Tarjeta y Puerto no pueden quedar vacíos.", false); return; }

  const cambio = {};
  if (String(oficina_id || "") !== String(p.oficina_id || "")) cambio.oficina_id = oficina_id;
  if (olt !== p.olt) cambio.olt = olt;
  if (tarjeta !== p.tarjeta) cambio.tarjeta = tarjeta;
  if (puerto !== p.puerto) cambio.puerto = puerto;
  if (Object.keys(cambio).length === 0) { showMsg(msg, "No hay cambios para guardar en ese registro.", false); return; }
  try {
    await apiSend(`/tickets/${mcTicket.id}/puertos`, "PATCH", { puertos: [{ id: p.id, ...cambio }] });
    showMsg(msg, "Registro actualizado correctamente.", true);
    mcFinalizarCambio();
  } catch (err) {
    showMsg(msg, err.message, false);
  }
});

// --- Escenario 3: Cierre masivo (siempre todo el ticket) ---
function mcRenderEscenario3() {
  document.getElementById("e3_fecha_cmr").value = "";
  document.getElementById("e3_fecha_cda").value = "";
  document.getElementById("mc_escenario_3").classList.remove("hidden");
}

document.getElementById("e3_btn_guardar").addEventListener("click", async () => {
  const msg = document.getElementById("mc_msg");
  try {
    const fecha_cierre_cmr = document.getElementById("e3_fecha_cmr").value;
    const fecha_cierre_cda = document.getElementById("e3_fecha_cda").value;
    if (!fecha_cierre_cmr && !fecha_cierre_cda) {
      throw new Error("Indica al menos una fecha de cierre (CMR o CDA). La que dejes vacía conserva lo que ya tenía.");
    }
    const r = await apiSend(`/tickets/${mcTicket.id}/cerrar`, "POST", soloLlenas({ fecha_cierre_cmr, fecha_cierre_cda }));
    showMsg(msg, `Ticket ${mcTicket.ticket_cmr} cerrado correctamente (${r.registros} registro(s)).` + (r.fecha_solucion_cda_copiada ? " La Fecha de Solución del CDA estaba vacía y se llenó con la de cierre." : ""), true);
    pizarraDatos = []; reporteDatos = []; cicloDatos = [];
    mcFinalizarCambio();
  } catch (err) {
    showMsg(msg, err.message, false);
  }
});

const MC_YA_RESUELTO = ["RESUELTO", "CERRADO"];
function mcResumenSolucion(r) {
  const partes = [`${r.resueltos} registro(s) resuelto(s)`];
  if (r.excluidos) partes.push(`${r.excluidos} ya estaban resueltos y no se tocaron`);
  partes.push(r.ticket_resuelto ? "el ticket quedó RESUELTO" : `quedan ${r.pendientes} registro(s) pendientes`);
  return partes.join(" · ") + ".";
}

// --- Escenario 4: Solución puntual (registros marcados) ---
function mcRenderEscenario4() {
  document.getElementById("e4_fecha_cmr").value = "";
  document.getElementById("e4_fecha_cda").value = "";
  const tbody = document.querySelector("#e4_table tbody");
  tbody.innerHTML = "";
  mcPuertos.forEach((p, idx) => {
    const resuelto = MC_YA_RESUELTO.includes(p.estado_puerto);
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td><input type="checkbox" class="e4-check" data-idx="${idx}" ${resuelto ? "disabled" : ""} /></td>
      <td>${escHtml(p.oficina_nombre || "-")}</td>
      <td>${escHtml(p.olt)}</td>
      <td>${escHtml(p.tarjeta)}</td>
      <td>${escHtml(p.puerto)}</td>
      <td class="hint">${escHtml(p.estado_puerto || "")}${resuelto && p.fecha_solucion_cmr ? " · " + formatearFechaHora(p.fecha_solucion_cmr) : ""}</td>
    `;
    tbody.appendChild(tr);
  });
  document.getElementById("mc_escenario_4").classList.remove("hidden");
}

document.getElementById("e4_btn_guardar").addEventListener("click", async () => {
  const msg = document.getElementById("mc_msg");
  try {
    const fecha_solucion_cmr = document.getElementById("e4_fecha_cmr").value;
    const fecha_solucion_cda = document.getElementById("e4_fecha_cda").value;
    if (!fecha_solucion_cmr && !fecha_solucion_cda) {
      throw new Error("Indica al menos una fecha de solución (CMR o CDA). La que dejes vacía conserva lo que ya tenía.");
    }
    const registros = [];
    document.querySelectorAll("#e4_table .e4-check").forEach((chk) => {
      if (chk.checked) registros.push(mcPuertos[Number(chk.dataset.idx)].id);
    });
    if (registros.length === 0) throw new Error("Marca al menos un registro para resolver.");
    const r = await apiSend(`/tickets/${mcTicket.id}/resolver`, "POST", { alcance: "PUNTUAL", ...soloLlenas({ fecha_solucion_cmr, fecha_solucion_cda }), registros });
    showMsg(msg, `Ticket ${mcTicket.ticket_cmr}: ${mcResumenSolucion(r)}`, true);
    pizarraDatos = []; reporteDatos = []; cicloDatos = [];
    mcFinalizarCambio();
  } catch (err) {
    showMsg(msg, err.message, false);
  }
});

// Quita los campos vacíos: una fecha que no se escribe no se envía y el servidor conserva la que ya había.
function soloLlenas(o) { const r = {}; Object.keys(o).forEach((k) => { if (o[k]) r[k] = o[k]; }); return r; }

// --- Escenario 5: Solución masiva (todo el ticket, salvo lo ya resuelto) ---
function mcRenderEscenario5() {
  document.getElementById("e5_fecha_cmr").value = "";
  document.getElementById("e5_fecha_cda").value = "";
  document.getElementById("mc_escenario_5").classList.remove("hidden");
}

document.getElementById("e5_btn_guardar").addEventListener("click", async () => {
  const msg = document.getElementById("mc_msg");
  try {
    const fecha_solucion_cmr = document.getElementById("e5_fecha_cmr").value;
    const fecha_solucion_cda = document.getElementById("e5_fecha_cda").value;
    if (!fecha_solucion_cmr && !fecha_solucion_cda) {
      throw new Error("Indica al menos una fecha de solución (CMR o CDA). La que dejes vacía conserva lo que ya tenía.");
    }
    const r = await apiSend(`/tickets/${mcTicket.id}/resolver`, "POST", { alcance: "MASIVO", ...soloLlenas({ fecha_solucion_cmr, fecha_solucion_cda }) });
    showMsg(msg, `Ticket ${mcTicket.ticket_cmr}: ${mcResumenSolucion(r)}`, true);
    pizarraDatos = []; reporteDatos = []; cicloDatos = [];
    mcFinalizarCambio();
  } catch (err) {
    showMsg(msg, err.message, false);
  }
});

// ---------------------------------------------------------------
// MODIFICAR / CERRAR para tickets ENLACE / TRAMO / TRONCAL
//   Por fila (OLT): OLT, Ubicación, Nro afectados, Nro que reportaron.
//   Por ticket: estado, unidad resolutoria y fechas.
//   Ticket activo  -> solo fechas de APERTURA.
//   Ticket cerrado -> solo fechas de CIERRE.
// ---------------------------------------------------------------
// ENLACE-MOD-PURE-START
const TIPOS_ENLACE_MOD = ["ENLACE", "TRAMO", "TRONCAL"];
function mcTipoEnlace(puertos) {
  const norm = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").trim().toUpperCase();
  const hallado = (puertos || []).map((p) => norm(p.oficina_nombre)).find((n) => TIPOS_ENLACE_MOD.includes(n));
  return hallado || null;
}
function mcEsEnlace(puertos) { return !!mcTipoEnlace(puertos); }

function enteroNoNegativo(v, etiqueta) {
  const t = String(v ?? "").trim();
  if (t === "") return null;
  if (!/^\d+$/.test(t)) throw new Error(`${etiqueta} debe ser un número entero mayor o igual a 0.`);
  return Number(t);
}

// Cambios por fila. entrada.filas: [{ olt, ubicacion, afectados, reportaron, cerrar }] (mismo orden que puertos).
// En MASIVO se usa entrada.masivo = { olt, ubicacion, afectados, reportaron } (vacío = no modificar) para TODAS las filas.
function construirCambiosFilasEnlace({ alcance, cerrado, puertos, filas, masivo, cierre }) {
  const cambios = [];
  const comparar = (p, nuevo) => {
    const c = {};
    if (nuevo.olt !== null && nuevo.olt !== undefined && String(nuevo.olt).trim() !== "" && String(nuevo.olt).trim() !== p.olt) c.olt = String(nuevo.olt).trim();
    if (nuevo.ubicacion && nuevo.ubicacion !== p.sector) c.sector = nuevo.ubicacion;
    if (nuevo.afectados !== null && nuevo.afectados !== undefined && Number(nuevo.afectados) !== Number(p.nro_clientes_afectados)) c.nro_clientes_afectados = Number(nuevo.afectados);
    if (nuevo.reportaron !== null && nuevo.reportaron !== undefined && Number(nuevo.reportaron) !== Number(p.no_clientes_reportaron)) c.no_clientes_reportaron = Number(nuevo.reportaron);
    return c;
  };
  if (alcance === "MASIVO") {
    const m = {
      olt: String(masivo.olt || "").trim(),
      ubicacion: masivo.ubicacion || "",
      afectados: enteroNoNegativo(masivo.afectados, "Nro de afectados"),
      reportaron: enteroNoNegativo(masivo.reportaron, "Nro Personas que reportaron la falla"),
    };
    puertos.forEach((p) => {
      const c = comparar(p, m);
      if (Object.keys(c).length) cambios.push({ id: p.id, ...c });
    });
    return cambios;
  }
  puertos.forEach((p, i) => {
    const f = filas[i] || {};
    const nuevo = {
      olt: f.olt,
      ubicacion: f.ubicacion,
      afectados: enteroNoNegativo(f.afectados, `Nro de afectados (fila ${i + 1})`),
      reportaron: enteroNoNegativo(f.reportaron, `Nro que reportaron (fila ${i + 1})`),
    };
    if (String(nuevo.olt || "").trim() === "") throw new Error(`El OLT de la fila ${i + 1} no puede quedar vacío.`);
    const c = comparar(p, nuevo);
    if (cerrado && f.cerrar) {
      if (!cierre.cmr && !cierre.cda) throw new Error("Indica al menos una fecha de cierre (CMR o CDA) para las filas marcadas.");
      c.estado_puerto = "CERRADO";
      if (cierre.cmr) c.fecha_cierre_cmr = cierre.cmr;
      if (cierre.cda) c.fecha_cierre_cda = cierre.cda;
    }
    if (Object.keys(c).length) cambios.push({ id: p.id, ...c });
  });
  return cambios;
}

// Cambios a nivel de ticket. Devuelve { masivoBody, cerrarBody } (null si no aplica).
function construirCambiosTicketEnlace({ ticket, alcance, cerrado, estado, unidad, apertura, cierre, avance, tocaFilas }) {
  const masivoBody = {};
  let cerrarBody = null;
  const vTicket = (k) => toLocalInputValue(ticket[k]);
  if (unidad && unidad !== (ticket.unidad_resolutoria || "")) masivoBody.unidad_resolutoria = unidad;

  if (!cerrado) {
    if (estado && estado !== ticket.estado_ticket) masivoBody.estado_ticket = estado;
    if (apertura.cmr && apertura.cmr !== vTicket("fecha_apertura_cmr")) masivoBody.fecha_apertura_cmr = apertura.cmr;
    if (apertura.cda && apertura.cda !== vTicket("fecha_apertura_cda")) masivoBody.fecha_apertura_cda = apertura.cda;
    if (avance && String(avance).trim()) masivoBody.avance_cmr = String(avance).trim();
  } else if (alcance === "MASIVO") {
    if (!cierre.cmr && !cierre.cda) throw new Error("Indica al menos una fecha de cierre (CMR o CDA).");
    cerrarBody = soloLlenas({ fecha_cierre_cmr: cierre.cmr, fecha_cierre_cda: cierre.cda });
  }
  return { masivoBody, cerrarBody };
}
// ENLACE-MOD-PURE-END

let meCtx = null;   // { alcance, cerrado, estado, tipo }

function meOpcionesUbicacion(select, actual, textoVacio) {
  select.innerHTML = "";
  const nombres = oficinasReales().map((o) => o.nombre);
  if (textoVacio !== undefined) {
    const o0 = document.createElement("option");
    o0.value = ""; o0.textContent = textoVacio;
    select.appendChild(o0);
  }
  if (actual && !nombres.includes(actual)) {      // conserva valores como "N/A" o nombres fuera del catálogo
    const oa = document.createElement("option");
    oa.value = actual; oa.textContent = actual;
    select.appendChild(oa);
  }
  nombres.forEach((n) => {
    const o = document.createElement("option");
    o.value = n; o.textContent = n;
    select.appendChild(o);
  });
  if (actual !== undefined) select.value = actual;
}

function mcRenderEnlace(alcance, cerrado, estado) {
  const tipo = mcTipoEnlace(mcPuertos);
  meCtx = { alcance, cerrado, estado, tipo };
  const porOlt = alcance !== "MASIVO";

  document.getElementById("me_titulo").textContent =
    `${cerrado ? "Cierre" : "Modificación"} ${porOlt ? "por OLT" : "masiva"} — ${tipo}`;
  document.getElementById("me_hint").textContent = cerrado
    ? "Ticket cerrado: solo se pueden modificar las fechas de CIERRE (además de OLT, Ubicación, afectados y reportaron)."
    : "Ticket activo: solo se puede modificar la fecha de APERTURA (además de OLT, Ubicación, afectados, reportaron, estado y unidad).";

  // lista de OLT para autocompletar
  const dl = document.getElementById("me_olts_datalist");
  dl.innerHTML = "";
  ["NO INDICADO", "N/A", ...(LOOKUPS.olts || []).map((o) => o.codigo)].forEach((v) => {
    const opt = document.createElement("option");
    opt.value = v;
    dl.appendChild(opt);
  });

  document.getElementById("me_masivo_block").classList.toggle("hidden", porOlt);
  document.getElementById("me_porolt_block").classList.toggle("hidden", !porOlt);
  document.getElementById("me_m_olt").value = "";
  document.getElementById("me_m_afectados").value = "";
  document.getElementById("me_m_reportaron").value = "";
  meOpcionesUbicacion(document.getElementById("me_m_ubicacion"), "", "No modificar");

  // tabla por OLT
  const thCerrar = document.getElementById("me_th_cerrar");
  thCerrar.classList.toggle("hidden", !cerrado);
  document.getElementById("me_porolt_hint").textContent = cerrado
    ? "Marca los OLT que se cerraron con las fechas de cierre de abajo. Puedes corregir también sus datos."
    : "Edita solo las filas que necesites; se envían únicamente las que cambien.";
  const tbody = document.querySelector("#me_table tbody");
  tbody.innerHTML = "";
  if (porOlt) {
    mcPuertos.forEach((p, idx) => {
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td class="${cerrado ? "" : "hidden"}"><input type="checkbox" class="me-cerrar" data-idx="${idx}" /></td>
        <td><input class="me-olt" list="me_olts_datalist" data-idx="${idx}" /></td>
        <td><select class="me-ubicacion" data-idx="${idx}"></select></td>
        <td><input class="me-afectados" type="number" min="0" data-idx="${idx}" /></td>
        <td><input class="me-reportaron" type="number" min="0" data-idx="${idx}" /></td>
        <td class="hint"></td>`;
      tr.querySelector(".me-olt").value = p.olt || "";
      meOpcionesUbicacion(tr.querySelector(".me-ubicacion"), p.sector || "N/A");
      tr.querySelector(".me-afectados").value = p.nro_clientes_afectados ?? 0;
      tr.querySelector(".me-reportaron").value = p.no_clientes_reportaron ?? 0;
      tr.lastElementChild.textContent = p.fecha_cierre_cmr ? `${p.estado_puerto} · ${toLocalInputValue(p.fecha_cierre_cmr).replace("T", " ")}` : (p.estado_puerto || "");
      tbody.appendChild(tr);
    });
  }

  // datos del ticket
  fillSelect(document.getElementById("me_unidad"), LOOKUPS.unidades_resolutorias, { valueKey: "nombre", placeholder: "No modificar" });
  document.getElementById("me_unidad").value = mcTicket.unidad_resolutoria || "";
  document.getElementById("me_estado_field").classList.toggle("hidden", cerrado);
  document.getElementById("me_unidad").parentElement.classList.toggle("hidden", cerrado);   // en el cierre solo se piden fechas
  mcLlenarEstados(document.getElementById("me_estado"), "", mcTicket.estado_ticket || "");
  document.getElementById("me_bloque_apertura").classList.toggle("hidden", cerrado);
  document.getElementById("me_bloque_avance").classList.toggle("hidden", cerrado);
  document.getElementById("me_bloque_cierre").classList.toggle("hidden", !cerrado);
  document.getElementById("me_apertura_cmr").value = toLocalInputValue(mcTicket.fecha_apertura_cmr);
  document.getElementById("me_apertura_cda").value = toLocalInputValue(mcTicket.fecha_apertura_cda);
  document.getElementById("me_avance").value = "";
  // en MASIVO se precargan las fechas de cierre actuales del ticket; por OLT se piden nuevas
  document.getElementById("me_cierre_cmr").value = porOlt ? "" : toLocalInputValue(mcTicket.fecha_solucion_cmr);
  document.getElementById("me_cierre_cda").value = porOlt ? "" : toLocalInputValue(mcTicket.fecha_solucion_cda);
  document.getElementById("me_btn_guardar").textContent =
    cerrado ? (porOlt ? "Cerrar OLT marcados" : "Cerrar Todo el Ticket") : (porOlt ? "Guardar Cambios por OLT" : "Aplicar a Todo el Ticket");
  document.getElementById("mc_enlace").classList.remove("hidden");
}

document.getElementById("me_btn_guardar").addEventListener("click", async () => {
  const msg = document.getElementById("mc_msg");
  try {
    const { alcance, cerrado, estado } = meCtx;
    const porOlt = alcance !== "MASIVO";
    const val = (id) => document.getElementById(id).value;
    const cierre = { cmr: val("me_cierre_cmr"), cda: val("me_cierre_cda") };

    const filas = [];
    if (porOlt) {
      const tbody = document.querySelector("#me_table tbody");
      mcPuertos.forEach((_, idx) => {
        const q = (c) => tbody.querySelector(`.${c}[data-idx="${idx}"]`);
        filas.push({
          olt: q("me-olt").value,
          ubicacion: q("me-ubicacion").value,
          afectados: q("me-afectados").value,
          reportaron: q("me-reportaron").value,
          cerrar: cerrado && q("me-cerrar").checked,
        });
      });
    }
    if (cerrado && porOlt && !filas.some((f) => f.cerrar) && (cierre.cmr || cierre.cda)) {
      throw new Error("Marca al menos un OLT para cerrar con esas fechas.");
    }

    const cambiosFilas = construirCambiosFilasEnlace({
      alcance, cerrado, puertos: mcPuertos, filas, cierre,
      masivo: { olt: val("me_m_olt"), ubicacion: val("me_m_ubicacion"), afectados: val("me_m_afectados"), reportaron: val("me_m_reportaron") },
    });
    const { masivoBody, cerrarBody } = construirCambiosTicketEnlace({
      ticket: mcTicket, alcance, cerrado, estado: cerrado ? estado : val("me_estado"),
      unidad: cerrado ? "" : val("me_unidad"),
      apertura: { cmr: val("me_apertura_cmr"), cda: val("me_apertura_cda") },
      cierre, avance: val("me_avance"),
    });

    if (!cambiosFilas.length && !Object.keys(masivoBody).length && !cerrarBody) {
      throw new Error("No hay cambios para guardar.");
    }
    if (Object.keys(masivoBody).length) await apiSend(`/tickets/${mcTicket.id}/masivo`, "PATCH", masivoBody);
    if (cambiosFilas.length) await apiSend(`/tickets/${mcTicket.id}/puertos`, "PATCH", { puertos: cambiosFilas });
    if (cerrarBody) await apiSend(`/tickets/${mcTicket.id}/cerrar`, "POST", cerrarBody);

    const partes = [];
    if (cambiosFilas.length) partes.push(`${cambiosFilas.length} OLT actualizado(s)`);
    if (Object.keys(masivoBody).length) partes.push("datos del ticket actualizados");
    if (cerrarBody) partes.push("ticket cerrado");
    showMsg(msg, `Ticket ${mcTicket.ticket_cmr}: ${partes.join(", ")}.`, true);
    mcFinalizarCambio();   // refresca tarjetas y formulario con lo guardado
  } catch (err) {
    showMsg(msg, err.message, false);
  }
});

// ---------------------------------------------------------------
// CONSULTAR / LOG
// ---------------------------------------------------------------
let detTicket = null;
let detPuertos = [];

async function mostrarDetalleTicket(cmr) {
  document.getElementById("cl_vista_tabla").classList.add("hidden");
  document.getElementById("q_btn_volver").classList.remove("hidden");
  const cont = document.getElementById("q_resultado");
  cont.classList.remove("hidden");
  cont.innerHTML = "Cargando...";
  try {
    const [detalle, logData] = await Promise.all([
      apiGet(`/tickets/${encodeURIComponent(cmr)}`),
      apiGet(`/tickets/${encodeURIComponent(cmr)}/log`),
    ]);
    detTicket = detalle.ticket;
    detPuertos = detalle.puertos;
    renderDetalle(false, logData.log);
  } catch (err) {
    cont.innerHTML = `<div class="msg error">${err.message}</div>`;
  }
}

function campoTexto(label, valor) {
  return `<div><span>${label}:</span> ${valor || "-"}</div>`;
}
function campoInput(id, valor, tipo = "text") {
  return `<input id="${id}" type="${tipo}" value="${valor ?? ""}" />`;
}
function campoSelect(id, opciones, valorActual) {
  return `<select id="${id}"><option value="">-</option>${opciones
    .map((o) => `<option value="${o}" ${o === valorActual ? "selected" : ""}>${o}</option>`).join("")}</select>`;
}

function renderDetalle(editable, log) {
  const cont = document.getElementById("q_resultado");
  cont.innerHTML = "";
  const t = detTicket;

  const card = document.createElement("div");
  card.className = "ticket-card";

  if (!editable) {
    card.innerHTML = `
      <div class="tree-header">
        <h3>Ticket ${formatearTicket(t.ticket_cmr)} <span class="badge">${t.estado_ticket}</span></h3>
        <label><input type="checkbox" id="det_edicion" /> Edición</label>
      </div>
      <div class="kv">
        ${campoTexto("Vinculados", t.tickets_vinculados)}
        ${campoTexto("Oficina", t.oficina_nombre)}
        ${campoTexto("Unidad Resolutoria", t.unidad_resolutoria)}
        ${campoTexto("Categoría", t.categoria_afectacion)}
        ${campoTexto("Afectación", t.afectacion)}
        ${campoTexto("Comentario", t.comentario)}
        ${campoTexto("Apertura CDA", t.fecha_apertura_cda)}
        ${campoTexto("Apertura CMR", t.fecha_apertura_cmr)}
        ${campoTexto("Solución CDA", t.fecha_solucion_cda)}
        ${campoTexto("Solución CMR", t.fecha_solucion_cmr)}
      </div>
      <p><strong>Descripción:</strong> ${t.descripcion || "-"}</p>
      <p><strong>Avance del CMR:</strong> ${t.avance_cmr || "-"}</p>
    `;
  } else {
    card.innerHTML = `
      <div class="tree-header">
        <h3>Ticket <span class="badge">EDITANDO</span></h3>
        <label><input type="checkbox" id="det_edicion" checked /> Edición</label>
      </div>
      <div class="grid-3">
        <div class="field"><label>Ticket CMR-COR</label>${campoInput("d_ticket_cmr", t.ticket_cmr)}</div>
        <div class="field"><label>Tickets Vinculados</label>${campoInput("d_vinculados", t.tickets_vinculados)}</div>
        <div class="field"><label>Estado del Ticket</label>${campoSelect("d_estado", LOOKUPS.estados_ticket.map(e=>e.nombre), t.estado_ticket)}</div>
        <div class="field"><label>Unidad Resolutoria</label>${campoSelect("d_unidad", LOOKUPS.unidades_resolutorias.map(u=>u.nombre), t.unidad_resolutoria)}</div>
        <div class="field"><label>Categoría de la Afectación</label>${campoSelect("d_categoria", LOOKUPS.categorias.map(c=>c.nombre), t.categoria_afectacion)}</div>
        <div class="field"><label>Afectación</label>${campoSelect("d_afectacion", LOOKUPS.afectaciones.map(a=>a.nombre), t.afectacion)}</div>
        <div class="field"><label>Comentario</label>${campoSelect("d_comentario", LOOKUPS.comentarios.map(c=>c.nombre), t.comentario)}</div>
        <div class="field"><label>Apertura CDA</label>${campoInput("d_fecha_apertura_cda", toLocalInputValue(t.fecha_apertura_cda), "datetime-local")}</div>
        <div class="field"><label>Apertura CMR</label>${campoInput("d_fecha_apertura_cmr", toLocalInputValue(t.fecha_apertura_cmr), "datetime-local")}</div>
        <div class="field"><label>Solución CDA</label>${campoInput("d_fecha_solucion_cda", toLocalInputValue(t.fecha_solucion_cda), "datetime-local")}</div>
        <div class="field"><label>Solución CMR</label>${campoInput("d_fecha_solucion_cmr", toLocalInputValue(t.fecha_solucion_cmr), "datetime-local")}</div>
      </div>
      <div class="field"><label>Descripción</label><textarea id="d_descripcion" rows="2">${t.descripcion || ""}</textarea></div>
      <div class="field"><label>Avance del CMR</label><textarea id="d_avance" rows="2">${t.avance_cmr || ""}</textarea></div>
    `;
  }
  cont.appendChild(card);

  // --- Tabla de puertos ---
  const estadosPuerto = LOOKUPS.estados_puerto.map((e) => e.nombre);
  const tbl = document.createElement("table");
  tbl.className = "rows-table";
  tbl.innerHTML = `
    <thead><tr><th>Oficina</th><th>OLT</th><th>Sector</th><th>Edificio</th><th>Tarjeta</th><th>Puerto</th>
    <th>No. Reportaron</th><th>Nro. Afectados</th><th>Estado</th></tr></thead>
    <tbody>${detPuertos.map((p, idx) => editable ? `
      <tr>
        <td>${campoSelect(`p_oficina_${idx}`, LOOKUPS.oficinas.map(o=>o.nombre), p.oficina_nombre)}</td>
        <td>${campoInput(`p_olt_${idx}`, p.olt)}</td>
        <td>${campoInput(`p_sector_${idx}`, p.sector)}</td>
        <td>${campoInput(`p_edificio_${idx}`, p.edificio)}</td>
        <td>${campoInput(`p_tarjeta_${idx}`, p.tarjeta)}</td>
        <td>${campoInput(`p_puerto_${idx}`, p.puerto)}</td>
        <td>${campoInput(`p_reportaron_${idx}`, p.no_clientes_reportaron, "number")}</td>
        <td>${campoInput(`p_afectados_${idx}`, p.nro_clientes_afectados, "number")}</td>
        <td>${campoSelect(`p_estado_${idx}`, estadosPuerto, p.estado_puerto)}</td>
      </tr>` : `
      <tr><td>${p.oficina_nombre || "-"}</td><td>${p.olt}</td><td>${p.sector}</td><td>${p.edificio}</td>
      <td>${p.tarjeta}</td><td>${p.puerto}</td><td>${formatearMiles(p.no_clientes_reportaron)}</td>
      <td>${formatearMiles(p.nro_clientes_afectados)}</td><td>${p.estado_puerto}</td></tr>`
    ).join("")}</tbody>
  `;
  cont.appendChild(tbl);

  if (editable) {
    const btnGuardar = document.createElement("button");
    btnGuardar.className = "btn-primary";
    btnGuardar.textContent = "Guardar Cambios";
    btnGuardar.addEventListener("click", guardarEdicionDetalle);
    cont.appendChild(btnGuardar);
    const msg = document.createElement("div");
    msg.id = "det_msg";
    msg.className = "msg";
    cont.appendChild(msg);
  }

  // --- Log (siempre visible, no editable) ---
  const logTitle = document.createElement("h3");
  logTitle.textContent = "Log de cambios";
  cont.appendChild(logTitle);
  (log || []).forEach((l) => {
    const div = document.createElement("div");
    div.className = "log-entry";
    const detalleCampo = l.ticket_puerto_id ? `[${l.olt} | ${l.tarjeta} | ${l.puerto}] ` : "";
    div.innerHTML = `
      <div>${detalleCampo}<strong>${l.campo}</strong>: ${l.valor_anterior ?? "-"} → ${l.valor_nuevo ?? "-"}</div>
      <div class="meta">${l.tipo_cambio} · ${l.usuario_email} · ${l.fecha}</div>
    `;
    cont.appendChild(div);
  });

  document.getElementById("det_edicion").addEventListener("change", (e) => {
    renderDetalle(e.target.checked, log);
  });
}

async function guardarEdicionDetalle() {
  const msg = document.getElementById("det_msg");
  const t = detTicket;
  try {
    const cambiosTicket = {};
    const val = (id) => document.getElementById(id).value;
    const posibles = {
      ticket_cmr: "d_ticket_cmr", tickets_vinculados: "d_vinculados",
      estado_ticket: "d_estado", unidad_resolutoria: "d_unidad",
      categoria_afectacion: "d_categoria", afectacion: "d_afectacion", comentario: "d_comentario",
      fecha_apertura_cda: "d_fecha_apertura_cda", fecha_apertura_cmr: "d_fecha_apertura_cmr",
      fecha_solucion_cda: "d_fecha_solucion_cda", fecha_solucion_cmr: "d_fecha_solucion_cmr",
      descripcion: "d_descripcion", avance_cmr: "d_avance",
    };
    for (const [campo, id] of Object.entries(posibles)) {
      const nuevo = val(id);
      const anterior = t[campo] ?? "";
      if (String(nuevo) !== String(anterior) && !(nuevo === "" && anterior === null)) {
        cambiosTicket[campo] = nuevo;
      }
    }
    if (Object.keys(cambiosTicket).length > 0) {
      await apiSend(`/tickets/${t.id}/editar`, "PATCH", cambiosTicket);
    }

    const cambiosPuertos = [];
    detPuertos.forEach((p, idx) => {
      const oficinaNombre = document.getElementById(`p_oficina_${idx}`).value;
      const oficina = LOOKUPS.oficinas.find((o) => o.nombre === oficinaNombre);
      const cambio = { id: p.id };
      let hayCambio = false;
      const check = (campo, nuevoVal, anteriorVal) => {
        if (String(nuevoVal ?? "") !== String(anteriorVal ?? "")) { cambio[campo] = nuevoVal; hayCambio = true; }
      };
      check("oficina_id", oficina ? oficina.id : null, p.oficina_id);
      check("olt", document.getElementById(`p_olt_${idx}`).value, p.olt);
      check("sector", document.getElementById(`p_sector_${idx}`).value, p.sector);
      check("edificio", document.getElementById(`p_edificio_${idx}`).value, p.edificio);
      check("tarjeta", document.getElementById(`p_tarjeta_${idx}`).value, p.tarjeta);
      check("puerto", document.getElementById(`p_puerto_${idx}`).value, p.puerto);
      check("no_clientes_reportaron", Number(document.getElementById(`p_reportaron_${idx}`).value), p.no_clientes_reportaron);
      check("nro_clientes_afectados", Number(document.getElementById(`p_afectados_${idx}`).value), p.nro_clientes_afectados);
      check("estado_puerto", document.getElementById(`p_estado_${idx}`).value, p.estado_puerto);
      if (hayCambio) cambiosPuertos.push(cambio);
    });
    if (cambiosPuertos.length > 0) {
      await apiSend(`/tickets/${t.id}/puertos`, "PATCH", { puertos: cambiosPuertos });
    }

    if (Object.keys(cambiosTicket).length === 0 && cambiosPuertos.length === 0) {
      showMsg(msg, "No hay cambios para guardar.", false);
      return;
    }
    showMsg(msg, "Guardado correctamente.", true);
    mostrarDetalleTicket(document.getElementById("d_ticket_cmr") ? document.getElementById("d_ticket_cmr").value : t.ticket_cmr);
  } catch (err) {
    showMsg(msg, err.message, false);
  }
}


// --- Filtros y tabla principal ---
const MESES = ["Enero","Febrero","Marzo","Abril","Mayo","Junio","Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"];

function llenarSelectSimple(id, opciones, placeholder) {
  const el = document.getElementById(id);
  el.innerHTML = `<option value="">${placeholder}</option>` + opciones.map((o) => `<option value="${o.value}">${o.label}</option>`).join("");
}

function initFiltrosConsulta() {
  llenarSelectSimple("cl_dia_apertura", [], "Día");
  llenarSelectSimple("cl_dia_cierre", [], "Día");
  llenarSelectSimple("cl_mes_apertura", [], "Mes");
  llenarSelectSimple("cl_mes_cierre", [], "Mes");
  // Día / Mes / Año se llenan con las fechas que existen en los registros (llegan con cada consulta): ver clActualizarFechas()
  llenarSelectSimple("cl_anio_apertura", [], "Año");
  llenarSelectSimple("cl_anio_cierre", [], "Año");
  ["apertura", "cierre"].forEach((eje) => ["dia", "mes", "anio"].forEach((parte) =>
    document.getElementById(`cl_${parte}_${eje}`).addEventListener("change", () => clActualizarFechas(eje))));

  llenarSelectSimple("cl_categoria", LOOKUPS.categorias.map((c)=>({value:c.nombre,label:c.nombre})), "Todas");
  llenarSelectSimple("cl_afectacion", LOOKUPS.afectaciones.map((a)=>({value:a.nombre,label:a.nombre})), "Todas");
  llenarSelectSimple("cl_grupo_horario", ["MAÑANA","TARDE","NOCHE"].map((g)=>({value:g,label:g})), "Todos");
  llenarSelectSimple("cl_semaforo", ["VERDE","AMARILLO","NARANJA","ROJO"].map((s)=>({value:s,label:s})), "Todos");
  llenarSelectSimple("cl_unidad", LOOKUPS.unidades_resolutorias.map((u)=>({value:u.nombre,label:u.nombre})), "Todas");
  llenarSelectSimple("cl_oficina", LOOKUPS.oficinas.map((o)=>({value:o.id,label:o.nombre})), "Todas");
  // Catálogo vigente + los OLT que ya aparecen en tickets (para poder filtrar también los históricos)
  llenarSelectSimple("cl_olt",
    [...new Set([...LOOKUPS.olts.map((o) => o.codigo), ...(LOOKUPS.olts_usados || [])])]
      .sort((a, b) => a.localeCompare(b)).map((c) => ({ value: c, label: c })), "Todos");

  const estadoEl = document.getElementById("cl_estado");
  estadoEl.innerHTML = `<option value="">Todos</option><option value="__ABIERTOS__" selected>Distinto de Cerrado</option>` +
    LOOKUPS.estados_ticket.map((e)=>`<option value="${e.nombre}">${e.nombre}</option>`).join("");
}

// FECHAS-PURE-START
// triples = [[año, mes, día], ...] con las fechas que existen en los registros; sel = lo que el usuario ya eligió.
// Cada selector ofrece solo los valores que existen combinados con lo elegido en los otros dos (cascada completa).
function opcionesFechaEnCascada(triples, sel) {
  const ok = (t, omitir) => (omitir === "anio" || !sel.anio || t[0] === sel.anio)
    && (omitir === "mes" || !sel.mes || t[1] === sel.mes)
    && (omitir === "dia" || !sel.dia || t[2] === sel.dia);
  const unicos = (idx, omitir) => [...new Set(triples.filter((t) => ok(t, omitir)).map((t) => t[idx]))].sort((a, b) => a - b);
  return { anios: unicos(0, "anio"), meses: unicos(1, "mes"), dias: unicos(2, "dia") };
}
// FECHAS-PURE-END
let clFechas = { apertura: [], cierre: [] };   // fechas existentes que devolvió la última consulta

function clActualizarFechas(eje) {
  const el = (parte) => document.getElementById(`cl_${parte}_${eje}`);
  const triples = clFechas[eje] || [];
  const leer = () => ({ anio: Number(el("anio").value) || 0, mes: Number(el("mes").value) || 0, dia: Number(el("dia").value) || 0 });
  let sel = leer();
  let o = opcionesFechaEnCascada(triples, sel);
  // si lo elegido ya no existe junto con lo demás (p. ej. cambió el año y ese mes no tiene datos), se limpia
  for (let i = 0; i < 3; i++) {
    let cambio = false;
    if (sel.anio && !o.anios.includes(sel.anio)) { sel.anio = 0; cambio = true; }
    if (sel.mes && !o.meses.includes(sel.mes)) { sel.mes = 0; cambio = true; }
    if (sel.dia && !o.dias.includes(sel.dia)) { sel.dia = 0; cambio = true; }
    if (!cambio) break;
    o = opcionesFechaEnCascada(triples, sel);
  }
  llenarSelectSimple(`cl_anio_${eje}`, o.anios.map((a) => ({ value: a, label: a })), "Año");
  llenarSelectSimple(`cl_mes_${eje}`, o.meses.map((m) => ({ value: m, label: MESES[m - 1] })), "Mes");
  llenarSelectSimple(`cl_dia_${eje}`, o.dias.map((d) => ({ value: d, label: d })), "Día");
  el("anio").value = sel.anio || ""; el("mes").value = sel.mes || ""; el("dia").value = sel.dia || "";
}

function construirQueryConsulta() {
  const params = new URLSearchParams();
  const campos = {
    ticket_cmr: "cl_ticket_cmr", tickets_vinculados: "cl_tickets_vinculados",
    dia_apertura: "cl_dia_apertura", mes_apertura: "cl_mes_apertura", anio_apertura: "cl_anio_apertura",
    dia_cierre: "cl_dia_cierre", mes_cierre: "cl_mes_cierre", anio_cierre: "cl_anio_cierre",
    categoria_afectacion: "cl_categoria", afectacion: "cl_afectacion",
    grupo_horario: "cl_grupo_horario", semaforo: "cl_semaforo",
    estado_ticket: "cl_estado", unidad_resolutoria: "cl_unidad",
    oficina_id: "cl_oficina", olt: "cl_olt",
  };
  for (const [param, id] of Object.entries(campos)) {
    const v = document.getElementById(id).value;
    if (v) params.set(param, v);
  }
  return params.toString();
}

// ---------------------------------------------------------------
// Consultar / Log: tabla tipo Excel (Tabulator). Solo lectura hasta que un administrador o supervisor
// pulsa "Editar como cuadro de Excel" y vuelve a escribir su contraseña.
// ---------------------------------------------------------------
let clDatosActuales = [];   // filas de la última búsqueda mostrada en Consultar / Log
let clSeleccion = new Set();   // ids de REGISTRO (fila de detalle) marcados para eliminar (solo administrador)
let clFilas = new Map();      // id de registro -> { ticket, total de registros que tiene ese ticket en la base }
let clGrid = null, clGridRol = null, clGridListo = false;
let clBase = new Map();       // id de registro -> copia de los campos editables tal como están guardados
let clGrupos = new Map();     // ticket_id -> [ids de registro]
let clModoEdicion = false;
let clTokenEdicion = null;    // permiso temporal (30 min) que entrega el servidor al volver a escribir la contraseña
let clOcupado = false;

// Una sola lista define orden, nombre visible, tipo y si se puede editar.
//   t: texto visible · tipo: cómo se muestra/edita · ed: editable · campo: nombre que entiende el servidor al guardar
const CL_COLS = [
  { f: "ticket_cmr", t: "Ticket", tipo: "ticket", ed: true, w: 110, frozen: true },
  { f: "tickets_vinculados", t: "Vinculados", tipo: "ticket", ed: true, w: 120 },
  { f: "estado_ticket", t: "Estado del ticket", tipo: "lista", ed: true, w: 175, lista: () => (LOOKUPS.estados_ticket || []).map((x) => x.nombre) },
  { f: "unidad_resolutoria", t: "Unidad resolutoria", tipo: "lista", ed: true, w: 160, vacio: true, lista: () => (LOOKUPS.unidades_resolutorias || []).map((x) => x.nombre) },
  { f: "region", t: "Estado", tipo: "dato", w: 140 },
  { f: "oficina_nombre", t: "Oficina", tipo: "lista", ed: true, campo: "oficina", w: 200, lista: () => (LOOKUPS.oficinas || []).map((x) => x.nombre) },
  { f: "olt", t: "OLT", tipo: "texto", ed: true, w: 190 },
  { f: "tarjeta", t: "Tarjeta", tipo: "texto", ed: true, w: 90 },
  { f: "puerto", t: "Puerto", tipo: "texto", ed: true, w: 90 },
  { f: "sector", t: "Sector", tipo: "texto", ed: true, w: 170 },
  { f: "edificio", t: "Edificio", tipo: "texto", ed: true, w: 150 },
  { f: "no_clientes_reportaron", t: "Nro. reportes", tipo: "cant", ed: true, w: 110 },
  { f: "nro_clientes_afectados", t: "Nro. afectados", tipo: "cant", ed: true, w: 115 },
  { f: "categoria_afectacion", t: "Categoría", tipo: "lista", ed: true, w: 170, lista: () => (LOOKUPS.categorias || []).map((x) => x.nombre) },
  { f: "afectacion", t: "Afectación", tipo: "lista", ed: true, w: 190, lista: () => [...new Set((LOOKUPS.afectaciones || []).map((x) => x.nombre))] },
  { f: "descripcion", t: "Descripción", tipo: "texto", ed: true, vacio: true, w: 260 },
  { f: "comentario", t: "Comentario", tipo: "texto", ed: true, vacio: true, w: 220 },
  { f: "avance_cmr", t: "Avance CMR", tipo: "texto", ed: true, vacio: true, w: 260 },
  { f: "fecha_apertura_cda", t: "Apertura CDA", tipo: "fecha", ed: true, w: 140 },
  { f: "fecha_apertura_cmr", t: "Apertura CMR", tipo: "fecha", ed: true, w: 140 },
  { f: "dia_apertura", t: "Día apertura CMR", tipo: "dato", w: 90 },
  { f: "mes_apertura", t: "Mes apertura CMR", tipo: "dato", w: 90 },
  { f: "anio_apertura", t: "Año apertura CMR", tipo: "dato", w: 90 },
  { f: "grupo_horario", t: "Grupo horario CMR", tipo: "dato", w: 120 },
  { f: "fecha_cierre_cda", t: "Cierre CDA", tipo: "fecha", ed: true, w: 140 },
  { f: "fecha_cierre_cmr", t: "Cierre CMR", tipo: "fecha", ed: true, w: 140 },
  { f: "fecha_solucion_cda", t: "Solución CDA", tipo: "fecha", ed: true, w: 140 },
  { f: "fecha_solucion_cmr", t: "Solución CMR", tipo: "fecha", ed: true, w: 140 },
  { f: "tiempo_curso_cda_h", t: "Tiempo en curso CDA (h)", tipo: "horas", w: 120 },
  { f: "tiempo_curso_cmr_h", t: "Tiempo en curso CMR (h)", tipo: "horas", w: 120 },
  { f: "tiempo_cerrar_cda_h", t: "Tiempo en cerrar CDA (h)", tipo: "horas", w: 120 },
  { f: "tiempo_cerrar_cmr_h", t: "Tiempo en cerrar CMR (h)", tipo: "horas", w: 120 },
  { f: "semaforo_curso_cmr", t: "Semáforo tiempo en curso CMR", tipo: "sem", w: 130 },
  { f: "semaforo_cierre_cmr", t: "Semáforo tiempo de cierre CMR", tipo: "sem", w: 130 },
  { f: "creado_por_nombre", t: "Creado por", tipo: "dato", w: 150 },
];
// Campos que pertenecen al TICKET (se repiten en cada fila del ticket y se guardan una sola vez).
const CL_CAMPOS_TICKET = ["ticket_cmr", "tickets_vinculados", "estado_ticket", "unidad_resolutoria", "categoria_afectacion", "afectacion",
  "descripcion", "comentario", "avance_cmr", "fecha_apertura_cda", "fecha_apertura_cmr", "fecha_solucion_cda", "fecha_solucion_cmr"];
const CL_EDITABLES = CL_COLS.filter((c) => c.ed);

const clVacio = (v) => v === null || v === undefined || String(v).trim() === "";
const clIgual = (a, b) => (clVacio(a) && clVacio(b)) || String(a) === String(b);

// "04/10/2026 21:22" o "2026-10-04T21:22" -> "2026-10-04T21:22:00". Lo que no se reconoce se deja tal cual (el servidor lo rechaza y avisa).
function clNormFecha(v) {
  if (v === null || v === undefined) return "";
  const t = String(v).trim();
  if (!t) return "";
  const dos = (x) => String(x).padStart(2, "0");
  let m = t.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{1,2}):(\d{2})(?::(\d{2}))?)?$/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}T${dos(m[4] || "00")}:${m[5] || "00"}:${m[6] || "00"}`;
  m = t.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})(?:[ T]+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/);
  if (m) return `${m[3]}-${dos(m[2])}-${dos(m[1])}T${dos(m[4] || "00")}:${m[5] || "00"}:${m[6] || "00"}`;
  return t;
}
function clFechaATexto(v) {
  const m = String(v || "").match(/^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}))?/);
  return m ? `${m[3]}/${m[2]}/${m[1]}${m[4] ? ` ${m[4]}:${m[5]}` : ""}` : String(v || "");
}
function clNormCant(v) {
  if (v === null || v === undefined) return "";
  const t = String(v).trim().replace(/\./g, "");
  return /^\d+$/.test(t) ? Number(t) : String(v).trim();
}
function clNormNumTicket(v) {
  if (v === null || v === undefined) return "";
  return String(v).replace(/\s+/g, "").trim();
}

function clEditorFecha(cell, onRendered, success, cancel) {
  const inp = document.createElement("input");
  inp.type = "text"; inp.placeholder = "dd/mm/aaaa hh:mm";
  inp.style.cssText = "width:100%;height:100%;box-sizing:border-box;padding:4px;border:0;outline:0;";
  inp.value = clFechaATexto(cell.getValue());
  let hecho = false;
  const fin = (ok) => {
    if (hecho) return; hecho = true;
    const v = inp.value.trim();
    if (ok && v !== clFechaATexto(cell.getValue())) success(clNormFecha(v)); else cancel();
  };
  onRendered(() => { inp.focus({ preventScroll: true }); inp.select(); });
  inp.addEventListener("blur", () => fin(true));
  inp.addEventListener("keydown", (e) => {
    if (e.key === "Enter") { e.preventDefault(); fin(true); }
    else if (e.key === "Escape") { e.preventDefault(); fin(false); }
  });
  return inp;
}

// Resalta (color suave) la celda cuyo valor ya no es el guardado.
function clMarcar(cell, texto) {
  const el = cell.getElement();
  const f = cell.getField();
  const b = clBase.get(cell.getRow().getData().puerto_id);
  el.classList.toggle("cl-cambiada", !!b && f in b && !clIgual(b[f], cell.getValue()));
  return texto;
}

function clDefColumna(c) {
  const col = { title: c.t, field: c.f, width: c.w, minWidth: 70, headerTooltip: c.t, cssClass: c.ed ? "" : "cl-calculada" };
  if (c.frozen) col.frozen = true;
  const esc = (v) => escHtml(String(v));
  switch (c.tipo) {
    case "ticket":
      col.mutator = clNormNumTicket;
      col.formatter = (cell) => clMarcar(cell, clVacio(cell.getValue()) ? "" : `<strong>${formatearTicket(cell.getValue())}</strong>`);
      col.editor = "input"; col.editorParams = { elementAttributes: { inputmode: "numeric" } };
      break;
    case "texto":
      col.formatter = (cell) => clMarcar(cell, clVacio(cell.getValue()) ? "" : esc(cell.getValue()));
      col.editor = "input";
      break;
    case "cant":
      col.mutator = clNormCant;
      col.hozAlign = "right";
      col.formatter = (cell) => clMarcar(cell, formatearMiles(cell.getValue()));
      col.editor = "input"; col.editorParams = { elementAttributes: { inputmode: "numeric" } };
      break;
    case "lista":
      col.formatter = (cell) => clMarcar(cell, clVacio(cell.getValue()) ? "" : esc(cell.getValue()));
      col.editor = "list";
      col.editorParams = () => ({ values: c.lista(), autocomplete: true, listOnEmpty: true, clearable: !!c.vacio, allowEmpty: !!c.vacio, freetext: false });
      break;
    case "fecha":
      col.mutator = clNormFecha;
      col.formatter = (cell) => clMarcar(cell, clVacio(cell.getValue()) ? "" : clFechaATexto(cell.getValue()));
      col.editor = clEditorFecha;
      break;
    case "horas":
      col.hozAlign = "right";
      col.formatter = (cell) => { const v = cell.getValue(); return v === null || v === undefined || v === "" ? "" : Number(v).toFixed(1).replace(".", ","); };
      break;
    case "sem":
      col.hozAlign = "center";
      col.formatter = (cell) => {
        const v = cell.getValue();
        const el = cell.getElement();
        el.style.background = v && SEMAFORO_HEX[v] ? hexARgba(SEMAFORO_HEX[v], 0.5) : "";
        return v ? esc(v) : "";
      };
      break;
    default:
      col.formatter = (cell) => { const v = cell.getValue(); return v === null || v === undefined || v === "" ? "" : esc(v); };
  }
  if (c.ed) col.editable = () => clModoEdicion;
  else col.editable = false;
  return col;
}

function clColumnas() {
  const cols = [];
  if (currentUser && currentUser.rol === "administrador") {
    cols.push({
      title: "", field: "_sel", width: 44, hozAlign: "center", headerSort: false, frozen: true, cssClass: "cl-sel-col", editable: false, resizable: false,
      titleFormatter: () => `<input type="checkbox" id="cl_check_todos" title="Seleccionar todas" />`,
      headerClick: (e) => {
        if (!(e.target && e.target.id === "cl_check_todos")) return;
        const marcar = e.target.checked;
        clSeleccion = new Set(marcar ? clGrid.getData("active").map((r) => String(r.puerto_id)) : []);
        clGrid.getRows("active").forEach((r) => r.reformat());
        clActualizarSeleccion();
      },
      formatter: (cell) => `<input type="checkbox" class="cl-check" ${clSeleccion.has(String(cell.getRow().getData().puerto_id)) ? "checked" : ""} title="Marca todo el ticket. Ctrl+clic: solo este registro." />`,
      cellClick: (e, cell) => {
        if (!(e.target && e.target.classList.contains("cl-check"))) return;
        e.stopPropagation();
        const d = cell.getRow().getData();
        const id = String(d.puerto_id);
        const soloEste = e.ctrlKey || e.metaKey || e.altKey;
        const grupo = (clGrupos.get(d.ticket_id) || [d.puerto_id]).map(String);
        const tocar = [id];
        if (e.target.checked) {
          const yaHabiaOtras = grupo.some((x) => x !== id && clSeleccion.has(x));
          clSeleccion.add(id);
          if (!soloEste && !yaHabiaOtras) grupo.forEach((x) => { clSeleccion.add(x); tocar.push(x); });
        } else clSeleccion.delete(id);
        tocar.forEach((x) => { const r = clGrid.getRow(Number(x)) || clGrid.getRow(x); if (r) r.reformat(); });
        clActualizarSeleccion();
      },
    });
  }
  CL_COLS.forEach((c) => cols.push(clDefColumna(c)));
  return cols;
}

function clCrearGrid() {
  if (clGrid) { try { clGrid.destroy(); } catch (e) { /* ya destruida */ } clGrid = null; }
  clGridListo = false;
  clGridRol = currentUser ? currentUser.rol : null;
  document.getElementById("cl_grid").innerHTML = "";
  clGrid = new Tabulator("#cl_grid", {
    data: [],
    index: "puerto_id",
    height: "68vh",
    layout: "fixed",
    renderHorizontal: "basic",
    columns: clColumnas(),
    placeholder: "Sin registros. Ajusta los filtros y pulsa Filtrar.",
    selectableRange: true,
    selectableRangeColumns: false,
    selectableRangeRows: false,
    selectableRangeClearCells: true,
    selectableRangeFill: true,
    editTriggerEvent: "dblclick",
    clipboard: true,
    clipboardCopyStyled: false,
    clipboardPasteParser: "range",
    clipboardPasteAction: "range",
    history: true,
    rowFormatter: (row) => {
      const el = row.getElement(), d = row.getData();
      el.dataset.ticket = d.ticket_cmr; el.dataset.registro = d.puerto_id;
      el.classList.toggle("cl-fila-sel", clSeleccion.has(String(d.puerto_id)));
    },
  });
  clGrid.on("tableBuilt", () => { clGridListo = true; if (clDatosActuales.length) clPonerDatos(); });
  clGrid.on("rowDblClick", (e, row) => {
    if (clModoEdicion) return;
    if (e.target && e.target.closest && e.target.closest(".cl-sel-col")) return;
    mostrarDetalleTicket(row.getData().ticket_cmr);
  });
  clGrid.on("cellEdited", (cell) => clTrasEditar([cell]));
  clGrid.on("rangeEdited", (rango) => clTrasEditar(rango.getCells().flat()));
  clGrid.on("historyUndo", (tipo, comp) => clTrasHistoria(tipo, comp));
  clGrid.on("historyRedo", (tipo, comp) => clTrasHistoria(tipo, comp));
}

function clTrasHistoria(tipo, comp) {
  if (tipo === "cellEdit") clTrasEditar([comp]);
  else if (tipo === "rangeEdit" && comp && comp.getCells) clTrasEditar(comp.getCells().flat());
  else clActualizarCambios();
}

// Después de editar: repite en todas las filas del ticket los campos del ticket, recalcula el Estado (región) si cambió la oficina.
function clTrasEditar(celdas) {
  const vistos = new Set();
  celdas.forEach((cell) => {
    if (!cell || !cell.getField) return;
    const campo = cell.getField();
    const fila = cell.getRow();
    const d = fila.getData();
    if (CL_CAMPOS_TICKET.includes(campo)) {
      const k = d.puerto_id + "|" + campo;
      if (vistos.has(k)) return; vistos.add(k);
      (clGrupos.get(d.ticket_id) || []).forEach((id) => {
        if (id === d.puerto_id) return;
        const otra = clGrid.getRow(id);
        if (otra && !clIgual(otra.getData()[campo], cell.getValue())) otra.update({ [campo]: cell.getValue() });
      });
    } else if (campo === "oficina_nombre") {
      const of = (LOOKUPS.oficinas || []).find((o) => o.nombre === cell.getValue());
      if (of && of.estado !== d.region) fila.update({ region: of.estado });
    }
  });
  clActualizarCambios();
}

// Lista de cambios pendientes = diferencia entre lo que hay en la tabla y lo que está guardado.
function clCambiosPendientes() {
  const out = [];
  if (!clGrid || !clGridListo) return out;
  const vistos = new Set();
  clGrid.getData().forEach((r) => {
    const b = clBase.get(r.puerto_id);
    if (!b) return;
    CL_EDITABLES.forEach((c) => {
      if (clIgual(b[c.f], r[c.f])) return;
      if (CL_CAMPOS_TICKET.includes(c.f)) {
        const k = r.ticket_id + "|" + c.f;
        if (vistos.has(k)) return; vistos.add(k);
      }
      out.push({ registro: r.puerto_id, campo: c.campo || c.f, valor: clVacio(r[c.f]) ? "" : r[c.f] });
    });
  });
  return out;
}
function clActualizarCambios() {
  const n = clCambiosPendientes().length;
  document.getElementById("cl_cambios_n").textContent = n ? `(${n})` : "";
  document.getElementById("cl_btn_guardar").disabled = clOcupado || n === 0;
  document.getElementById("cl_btn_descartar").disabled = clOcupado || n === 0;
  return n;
}

function clPonerDatos() {
  clBase = new Map();
  clGrupos = new Map();
  clFilas = new Map();
  clSeleccion = new Set();
  clDatosActuales.forEach((f) => {
    const b = {};
    CL_EDITABLES.forEach((c) => {
      let v = f[c.f];
      if (c.tipo === "fecha") v = clNormFecha(v);
      else if (c.tipo === "cant") v = clNormCant(v);
      else if (c.tipo === "ticket") v = clNormNumTicket(v);
      b[c.f] = v === null || v === undefined ? "" : v;
    });
    clBase.set(f.puerto_id, b);
    if (!clGrupos.has(f.ticket_id)) clGrupos.set(f.ticket_id, []);
    clGrupos.get(f.ticket_id).push(f.puerto_id);
    clFilas.set(String(f.puerto_id), { ticket: String(f.ticket_cmr), total: Number(f.total_registros_ticket) || 0 });
  });
  clGrid.replaceData(clDatosActuales.map((f) => ({ ...f })));
  clGrid.clearHistory();
  clActualizarSeleccion();
  clActualizarCambios();
}

// Vista general (las mismas columnas de la tabla, con los filtros activos). No incluye el detalle del ticket.
function filasExportConsulta() {
  return clDatosActuales.map((f) => {
    const o = {};
    CL_COLS.forEach((c) => {
      let v = f[c.f];
      if (v === null || v === undefined) v = "";
      if (c.tipo === "fecha") v = v ? formatearFechaHora(v) : "";
      else if (c.tipo === "horas") v = v === "" ? "" : Number(Number(v).toFixed(1));
      o[c.t] = v;
    });
    return o;
  });
}
function exportarConsulta(formato) {
  if (!clDatosActuales.length) { alert("No hay registros en pantalla para descargar. Aplica los filtros y pulsa Filtrar."); return; }
  const filas = filasExportConsulta();
  const fecha = new Date().toISOString().slice(0, 10);
  if (formato === "csv") exportarCSVGenerico(filas, `consulta_log_${fecha}.csv`);
  else exportarExcelGenerico(filas, "Consulta", `consulta_log_${fecha}.xlsx`);
}
document.getElementById("cl_btn_csv").addEventListener("click", () => exportarConsulta("csv"));
document.getElementById("cl_btn_xlsx").addEventListener("click", () => exportarConsulta("xlsx"));

function clPuedeEditar() { return !!currentUser && (currentUser.rol === "administrador" || currentUser.rol === "supervisor"); }

function clAplicarModoEdicion(activo) {
  clModoEdicion = activo;
  document.getElementById("cl_grid").classList.toggle("cl-editando", activo);
  document.getElementById("cl_btn_editar").classList.toggle("hidden", activo);
  document.getElementById("cl_edit_controles").classList.toggle("hidden", !activo);
  document.getElementById("cl_ayuda_excel").classList.toggle("hidden", !activo);
  if (!activo) clTokenEdicion = null;
  clActualizarCambios();
}

// true si se puede continuar (no hay cambios, o el usuario acepta perderlos)
function clConfirmarDescarte() {
  const n = clModoEdicion ? clCambiosPendientes().length : 0;
  return n === 0 || confirm(`Tienes ${n} cambio(s) sin guardar. Si continúas se pierden. ¿Continuar?`);
}

async function cargarConsulta(opciones) {
  const contador = document.getElementById("cl_contador");
  const msgx = document.getElementById("cl_msg_excel");
  const silencioso = !!(opciones && opciones.silencioso);
  if (!(opciones && opciones.forzar) && !clConfirmarDescarte()) return;
  if (clModoEdicion && !(opciones && opciones.mantenerEdicion)) clAplicarModoEdicion(false);
  if (!clGrid || clGridRol !== (currentUser && currentUser.rol)) clCrearGrid();
  if (!silencioso) { contador.textContent = "Cargando..."; msgx.textContent = ""; }
  try {
    const data = await apiGet(`/consulta?${construirQueryConsulta()}`);
    clDatosActuales = data.filas;   // exactamente lo que se ve en la tabla (ya filtrado por el servidor)
    clFechas = data.fechas || { apertura: [], cierre: [] };
    clActualizarFechas("apertura"); clActualizarFechas("cierre");
    if (clGridListo) clPonerDatos();     // si la tabla aún se está construyendo, lo hace al terminar (tableBuilt)
    contador.textContent = `${formatearMiles(data.filas.length)} registro(s) encontrados.`;
  } catch (err) {
    contador.textContent = "";
    showMsg(msgx, err.message, false);
  }
}

// Marcar una fila marca todo el ticket (si no había ya filas suyas marcadas); desmarcar quita solo esa fila.
// Ctrl+clic marca únicamente ese registro. (La lógica está en la columna de casillas.)
function clActualizarSeleccion() {
  const n = clSeleccion.size;
  document.getElementById("cl_sel_count").textContent = n ? `(${n})` : "";
  document.getElementById("cl_btn_eliminar").disabled = n === 0;
  const todos = document.getElementById("cl_check_todos");
  if (todos) todos.checked = clDatosActuales.length > 0 && n === clDatosActuales.length;
}

// Activar la edición: pide la contraseña otra vez; el servidor entrega un permiso temporal.
document.getElementById("cl_btn_editar").addEventListener("click", async () => {
  if (!clPuedeEditar()) return;
  const msgx = document.getElementById("cl_msg_excel");
  msgx.textContent = "";
  const r = await pedirClave("Para editar la tabla como si fuera Excel, vuelve a escribir tu contraseña.", async (password) => apiSend("/auth/verificar-edicion", "POST", { password }), { titulo: "Editar como cuadro de Excel", boton: "Activar edición", peligro: false });
  if (!r || !r.token) return;
  clTokenEdicion = r.token;
  clAplicarModoEdicion(true);
  showMsg(msgx, `Edición activada (${r.minutos || 30} min). Haz doble clic en una celda para cambiarla.`, true);
});

document.getElementById("cl_btn_salir_edicion").addEventListener("click", () => {
  if (!clConfirmarDescarte()) return;
  clAplicarModoEdicion(false);
  cargarConsulta({ forzar: true });
});
document.getElementById("cl_btn_descartar").addEventListener("click", () => {
  if (!clCambiosPendientes().length || !confirm("¿Descartar todos los cambios sin guardar?")) return;
  cargarConsulta({ forzar: true, mantenerEdicion: true, silencioso: true });
});

async function clEnviarCambios(cambios) {
  const lotes = [];
  for (let i = 0; i < cambios.length; i += 1000) lotes.push(cambios.slice(i, i + 1000));
  let total = 0;
  for (const lote of lotes) {
    let r;
    try { r = await apiSend("/consulta-editar", "POST", { token: clTokenEdicion, cambios: lote }); }
    catch (e) {
      if (!e.reautenticar) throw e;
      const nuevo = await pedirClave("Tu permiso de edición venció. Escribe tu contraseña para continuar.", async (password) => apiSend("/auth/verificar-edicion", "POST", { password }), { titulo: "Editar como cuadro de Excel", boton: "Continuar", peligro: false });
      if (!nuevo || !nuevo.token) throw new Error("Guardado cancelado. No se guardó nada.");
      clTokenEdicion = nuevo.token;
      r = await apiSend("/consulta-editar", "POST", { token: clTokenEdicion, cambios: lote });
    }
    total += r.celdas || lote.length;
  }
  return total;
}

document.getElementById("cl_btn_guardar").addEventListener("click", async () => {
  const msgx = document.getElementById("cl_msg_excel");
  const cambios = clCambiosPendientes();
  if (!cambios.length || clOcupado) return;
  clOcupado = true; clActualizarCambios();
  try {
    const n = await clEnviarCambios(cambios);
    pizarraDatos = []; reporteDatos = []; cicloDatos = [];            // los informes se recargan al abrirlos
    await cargarConsulta({ forzar: true, mantenerEdicion: true, silencioso: true });
    showMsg(msgx, `Se guardaron ${formatearMiles(n)} cambio(s). Las columnas calculadas se actualizaron.`, true);
  } catch (e) {
    showMsg(msgx, e.message, false);
  } finally { clOcupado = false; clActualizarCambios(); }
});

window.addEventListener("beforeunload", (e) => {
  if (clModoEdicion && clCambiosPendientes().length) { e.preventDefault(); e.returnValue = ""; }
});

// Qué se va a borrar: tickets con TODOS sus registros marcados -> ticket completo; el resto -> solo esos registros.
function clPlanEliminacion() {
  const porTicket = new Map();
  clSeleccion.forEach((idReg) => {
    const f = clFilas.get(idReg);
    if (!f) return;
    if (!porTicket.has(f.ticket)) porTicket.set(f.ticket, { total: f.total, ids: [] });
    porTicket.get(f.ticket).ids.push(idReg);
  });
  const completos = [], sueltos = [];
  porTicket.forEach((v, ticket) => {
    if (v.total > 0 && v.ids.length >= v.total) completos.push({ ticket, registros: v.ids.length });
    else sueltos.push({ ticket, ids: v.ids, total: v.total });
  });
  return { completos, sueltos };
}

// Ventana que pide la contraseña. "ejecutar(clave)" hace la llamada; si falla (ej. clave incorrecta)
// el mensaje se muestra en la ventana y se puede reintentar. Resuelve con el resultado, o null si se cancela.
function pedirClave(texto, ejecutar, op) {
  const o = Object.assign({ titulo: "Confirmar eliminación", boton: "Eliminar definitivamente", peligro: true }, op || {});
  return new Promise((resolve) => {
    const ov = document.getElementById("modal_clave");
    const inp = document.getElementById("modal_clave_input");
    const msg = document.getElementById("modal_clave_msg");
    const ok = document.getElementById("modal_clave_ok");
    const cancelar = document.getElementById("modal_clave_cancelar");
    document.getElementById("modal_clave_texto").textContent = texto;
    document.getElementById("modal_clave_titulo").textContent = o.titulo;
    ok.textContent = o.boton;
    ok.className = o.peligro ? "btn-danger" : "btn-primary";
    inp.value = ""; msg.textContent = ""; msg.className = "msg"; ok.disabled = false;
    ov.classList.remove("hidden");
    inp.focus();
    const cerrar = (res) => {
      ov.classList.add("hidden");
      inp.value = ""; ok.onclick = null; cancelar.onclick = null; inp.onkeydown = null;
      resolve(res);
    };
    const confirmar = async () => {
      if (!inp.value) { showMsg(msg, "Ingresa tu contraseña.", false); return; }
      ok.disabled = true;
      try { cerrar(await ejecutar(inp.value)); }
      catch (e) { showMsg(msg, e.message, false); ok.disabled = false; inp.select(); }
    };
    ok.onclick = confirmar;
    cancelar.onclick = () => cerrar(null);
    inp.onkeydown = (e) => { if (e.key === "Enter") confirmar(); else if (e.key === "Escape") cerrar(null); };
  });
}

// El servidor acepta hasta 500 por llamada: lo grande se envía en lotes con la misma confirmación.
async function eliminarEnLotes(ruta, campo, lista, password, acumulado) {
  for (let i = 0; i < lista.length; i += 400) {
    try {
      const r = await apiSend(ruta, "POST", { [campo]: lista.slice(i, i + 400), password });
      acumulado.tickets_eliminados += r.tickets_eliminados || 0;
      acumulado.registros_eliminados += r.registros_eliminados || 0;
      acumulado.tickets_vaciados += r.tickets_vaciados_eliminados || 0;
    } catch (e) {
      const hecho = acumulado.tickets_eliminados + acumulado.registros_eliminados;
      if (hecho > 0) throw new Error(`Ya se había eliminado una parte antes del error (${acumulado.tickets_eliminados} ticket(s), ${acumulado.registros_eliminados} registro(s)): ${e.message}`);
      throw e;
    }
  }
}

document.getElementById("cl_btn_eliminar").addEventListener("click", async () => {
  if (clSeleccion.size === 0 || !clConfirmarDescarte()) return;
  const { completos, sueltos } = clPlanEliminacion();
  const lineas = ["Vas a eliminar definitivamente:"];
  if (completos.length) {
    const lista = completos.length <= 6 ? ` (${completos.map((c) => formatearTicket(c.ticket)).join(", ")})` : "";
    lineas.push(`• ${completos.length} ticket(s) COMPLETO(S)${lista}, con todos sus registros e historial.`);
  }
  if (sueltos.length) {
    const nReg = sueltos.reduce((s, x) => s + x.ids.length, 0);
    const lista = sueltos.length <= 4
      ? ": " + sueltos.map((x) => `ticket ${formatearTicket(x.ticket)} (${x.ids.length} de ${x.total})`).join("; ") : "";
    lineas.push(`• ${nReg} registro(s) suelto(s)${lista}. El resto de esos tickets se conserva.`);
  }
  lineas.push("Esta acción no se puede deshacer.");

  const res = await pedirClave(lineas.join("\n"), async (password) => {
    const acum = { tickets_eliminados: 0, registros_eliminados: 0, tickets_vaciados: 0 };
    if (completos.length) await eliminarEnLotes("/admin/eliminar-tickets", "tickets", completos.map((c) => c.ticket), password, acum);
    const ids = sueltos.flatMap((x) => x.ids);
    if (ids.length) await eliminarEnLotes("/admin/eliminar-registros", "registros", ids, password, acum);
    return acum;
  });
  if (!res) return;
  pizarraDatos = []; reporteDatos = []; cicloDatos = [];            // los dashboards se recargan al abrirlos
  await cargarConsulta({ forzar: true });
  const sueltosEl = sueltos.reduce((s, x) => s + x.ids.length, 0);
  const partes = [];
  if (completos.length) partes.push(`${res.tickets_eliminados - res.tickets_vaciados} ticket(s) completo(s)`);
  if (sueltosEl) partes.push(`${sueltosEl} registro(s) suelto(s)`);
  if (res.tickets_vaciados) partes.push(`${res.tickets_vaciados} ticket(s) que quedaron sin registros`);
  showMsg(document.getElementById("cl_contador"), `Se eliminaron: ${partes.join(", ")}.`, true);
});

document.getElementById("cl_btn_filtrar").addEventListener("click", () => cargarConsulta());

// Actualización programada: cada hora se recargan los informes abiertos y la tabla de Consultar / Log
// (los tiempos "en curso" se calculan al momento de la consulta), sin depender de que alguien registre un ticket.
setInterval(() => {
  if (!currentUser || !currentUser.registrado) return;
  ["piz", "rep", "cic"].forEach((p) => { if (datosInforme(p).length) cargarInforme(p); });
  const vistaTabla = document.getElementById("cl_vista_tabla");
  if (clGrid && !clModoEdicion && vistaTabla && !vistaTabla.classList.contains("hidden")) cargarConsulta({ forzar: true, silencioso: true });
}, 3600000);

document.getElementById("q_btn_volver").addEventListener("click", () => {
  document.getElementById("q_resultado").classList.add("hidden");
  document.getElementById("q_btn_volver").classList.add("hidden");
  document.getElementById("cl_vista_tabla").classList.remove("hidden");
  if (clGrid && clGridListo) clGrid.redraw(true);
});

// ---------------------------------------------------------------
// Rol del usuario actual: oculta pestañas que no le correspondan
// ---------------------------------------------------------------
let currentUser = null;

const TABS_POR_ROL = {
  analista: ["pizarra", "reporte", "ciclo"],
  especialista: ["crear", "modificar", "pizarra", "reporte", "ciclo"],
  supervisor: ["crear", "modificar", "pizarra", "reporte", "ciclo", "consultar"],
  administrador: ["crear", "modificar", "pizarra", "reporte", "ciclo", "consultar", "admin", "repositorio"],
};

function aplicarPermisosRol() {
  document.getElementById("topbar_usuario_nombre").textContent = currentUser.nombre || currentUser.email || "";

  const permitidas = TABS_POR_ROL[currentUser.rol] || [];
  document.querySelectorAll(".tab-btn[data-tab]").forEach((btn) => {
    btn.classList.toggle("hidden", !permitidas.includes(btn.dataset.tab));
  });

  if (document.querySelector(".tab-btn.active")?.classList.contains("hidden")) {
    document.querySelector(`.tab-btn[data-tab="${permitidas[0]}"]`)?.click();
  }

  const esAdminCl = currentUser.rol === "administrador";
  document.getElementById("cl_barra_excel").classList.toggle("hidden", !clPuedeEditar());
  if (clGrid && clGridRol !== currentUser.rol) { clAplicarModoEdicion(false); cargarConsulta({ forzar: true }); }
  document.getElementById("cl_btn_eliminar").classList.toggle("hidden", !esAdminCl);
  document.getElementById("cl_ayuda_sel").classList.toggle("hidden", !esAdminCl);

  if (currentUser.rol === "administrador") {
    cargarUsuarios();
    initCatalogosUI();
    rptCargarBorrador();
  }
}

// ---------------------------------------------------------------
// ADMINISTRACIÓN: Generador de reportes (columnas de Pizarra y Reporte Diario)
//   Las columnas disponibles se leen de la base de datos (/admin/campos-reportes).
//   Cada columna guarda su db_column_name y el display_name (alias) que se muestra en el encabezado.
// ---------------------------------------------------------------
let rptBorrador = [];       // configuración que se está editando (se refleja al instante en la vista previa)
let rptCatalogo = null;     // { tablas, columnas, calculados } desde la BD
let rptMuestra = [];        // filas de ejemplo para la vista previa
let rptTemporizador = null;

function rptPrefix() { return document.getElementById("rpt_select").value; }

async function rptCargarCatalogo() {
  if (rptCatalogo) return;
  try {
    const c = await apiGet("/admin/campos-reportes");
    if (!c || !Array.isArray(c.columnas) || !Array.isArray(c.tablas)) throw new Error("respuesta inesperada");
    rptCatalogo = { tablas: c.tablas, columnas: c.columnas, calculados: Array.isArray(c.calculados) ? c.calculados : [] };
  } catch (err) { showMsg(document.getElementById("rpt_msg"), "No se pudo leer el listado de columnas de la base de datos: " + err.message, false); }
}

function rptLlenarSelectorAgregar() {
  const sel = document.getElementById("rpt_add_select");
  sel.innerHTML = '<option value="">Elige una columna de la base de datos…</option>';
  if (!rptCatalogo) return;
  const enUso = new Set(rptBorrador.map((c) => c.db_column_name));
  const grupo = (titulo, items) => {
    const libres = items.filter((c) => !enUso.has(c.db_column_name));
    if (!libres.length) return;
    const og = document.createElement("optgroup");
    og.label = titulo;
    libres.forEach((c) => {
      const o = document.createElement("option");
      o.value = c.db_column_name;
      o.textContent = `${c.etiqueta}  ·  ${c.db_column_name}`;
      og.appendChild(o);
    });
    sel.appendChild(og);
  };
  rptCatalogo.tablas.forEach((t) => grupo(t.etiqueta, rptCatalogo.columnas.filter((c) => c.tabla === t.tabla)));
  grupo("Campos calculados", rptCatalogo.calculados);
}

function rptEtiquetaCatalogo(clave) {
  if (!rptCatalogo) return etiquetaDeClave(clave);
  const c = rptCatalogo.columnas.find((x) => x.db_column_name === clave) || rptCatalogo.calculados.find((x) => x.db_column_name === clave);
  return c ? c.etiqueta : etiquetaDeClave(clave);
}

async function rptCargarBorrador() {
  await rptCargarCatalogo();
  rptBorrador = columnasEfectivas(rptPrefix(), REPORTES_CFG[rptPrefix()]).map((c) => ({ ...c }));
  rptDibujar();
  rptActualizarMuestra();
}

// Filas de ejemplo: las ya cargadas y, si el borrador usa columnas extra, 3 filas pedidas al servidor con esas columnas.
async function rptActualizarMuestra() {
  const prefix = rptPrefix();
  const extras = extrasNecesarios(rptBorrador);
  const datos = datosInforme(prefix);
  const tieneTodo = (fila) => extras.every((k) => k in fila);
  if (datos && datos.length && tieneTodo(datos[0])) { rptMuestra = datos.slice(0, 3); rptDibujarVistaPrevia(); return; }
  try {
    const q = `/consulta?limite=3` + (extras.length ? "&extras=" + encodeURIComponent(extras.join(",")) : "");
    const r = await apiGet(q);
    if (prefix !== rptPrefix()) return;
    rptMuestra = r.filas.length ? r.filas : [];
  } catch { rptMuestra = []; }
  rptDibujarVistaPrevia();
}
function rptProgramarMuestra() { clearTimeout(rptTemporizador); rptTemporizador = setTimeout(rptActualizarMuestra, 350); }

function rptFilasVistaPrevia() {
  if (rptMuestra.length) return rptMuestra;
  return [{ ticket_cmr: "334455", oficina_nombre: "Caracas - Chacao", olt: "CHA-OL-ZT-AC-001", tarjeta: "Tarjeta 4", puerto: "Puerto 12",
    fecha_apertura_cmr: "2026-10-04T09:30:00", horas_abierta: 52.4, semaforo: "NARANJA", estado_ticket: "EN CURSO (ASIGNADO)", afectacion: "SIN CONEXIÓN",
    nro_clientes_afectados: 120, no_clientes_reportaron: 15, unidad_resolutoria: "REPARACIONES", grupo_horario: "MAÑANA", region: "MIRANDA", avance_cmr: "Cuadrilla en sitio" }];
}

function rptDibujarVistaPrevia() {
  const { thead, tbody } = htmlTablaDinamica(rptBorrador, rptFilasVistaPrevia(), () => ({ fila: 1 }));
  const t = document.getElementById("rpt_preview");
  t.tHead.innerHTML = thead;
  t.tBodies[0].innerHTML = tbody;
  const suma = rptBorrador.filter((c) => c.visible && c.ancho).reduce((a, c) => a + c.ancho, 0);
  document.getElementById("rpt_aviso_ancho").textContent = suma > 1300
    ? `Atención: los anchos fijos suman ${suma} px; en pantallas más angostas aparecerá scroll horizontal.` : "";
}

function rptDibujar() {
  const tbody = document.querySelector("#rpt_table tbody");
  tbody.innerHTML = "";
  rptBorrador.forEach((c, i) => {
    const tr = document.createElement("tr");
    tr.draggable = true;
    if (!c.visible) tr.classList.add("rpt-fila-oculta");
    const tamanos = Array.from({ length: 21 }, (_, k) => k + 8).map((n) => `<option value="${n}" ${n === c.fontSize ? "selected" : ""}>${n}</option>`).join("");
    tr.innerHTML = `
      <td class="rpt-asa" title="Arrastra para reordenar">☰</td>
      <td class="rpt-td-visible"><input type="checkbox" data-k="visible" ${c.visible ? "checked" : ""} title="Mostrar esta columna" /></td>
      <td class="rpt-td-alias">
        <input type="text" data-k="display_name" value="${escHtml(c.display_name)}" maxlength="60" placeholder="${escHtml(rptEtiquetaCatalogo(c.db_column_name))}" />
        <span class="rpt-bd" title="Columna de la base de datos">${escHtml(c.db_column_name)}</span>
      </td>
      <td><input type="number" data-k="ancho" min="30" max="900" step="5" placeholder="auto" value="${c.ancho ?? ""}" /></td>
      <td><select data-k="fontSize">${tamanos}</select></td>
      <td class="rpt-estilo">
        <button type="button" data-t="negrita" class="${c.negrita ? "on" : ""}" title="Negrita"><b>N</b></button>
        <button type="button" data-t="cursiva" class="${c.cursiva ? "on" : ""}" title="Cursiva"><i>K</i></button>
        <button type="button" data-t="subrayado" class="${c.subrayado ? "on" : ""}" title="Subrayado"><u>S</u></button>
      </td>
      <td class="rpt-orden">
        <button type="button" data-mv="-1" ${i === 0 ? "disabled" : ""} title="Subir">↑</button>
        <button type="button" data-mv="1" ${i === rptBorrador.length - 1 ? "disabled" : ""} title="Bajar">↓</button>
      </td>
      <td><button type="button" class="rpt-quitar" data-quitar="1" title="Quitar esta columna del informe" ${rptBorrador.length <= 1 ? "disabled" : ""}>✕</button></td>`;
    tr.querySelectorAll("[data-k]").forEach((el) => {
      const k = el.dataset.k;
      el.addEventListener(k === "visible" || k === "fontSize" ? "change" : "input", () => {
        if (k === "visible") { c.visible = el.checked; tr.classList.toggle("rpt-fila-oculta", !c.visible); rptProgramarMuestra(); }
        else if (k === "ancho") c.ancho = el.value === "" ? null : Math.max(30, Math.min(900, Math.round(Number(el.value))));
        else if (k === "fontSize") c.fontSize = Number(el.value);
        else if (k === "display_name") c.display_name = el.value.trim() || rptEtiquetaCatalogo(c.db_column_name);
        rptDibujarVistaPrevia();
      });
    });
    tr.querySelectorAll("[data-t]").forEach((b) => b.addEventListener("click", () => {
      c[b.dataset.t] = !c[b.dataset.t]; b.classList.toggle("on", c[b.dataset.t]); rptDibujarVistaPrevia();
    }));
    tr.querySelectorAll("[data-mv]").forEach((b) => b.addEventListener("click", () => rptMover(i, i + Number(b.dataset.mv))));
    tr.querySelector("[data-quitar]").addEventListener("click", () => {
      if (rptBorrador.length <= 1) return;
      rptBorrador.splice(i, 1); rptDibujar(); rptProgramarMuestra();
    });
    tr.addEventListener("dragstart", (e) => { e.dataTransfer.setData("text/plain", String(i)); e.dataTransfer.effectAllowed = "move"; });
    tr.addEventListener("dragover", (e) => { e.preventDefault(); tr.classList.add("rpt-fila-arrastre"); });
    tr.addEventListener("dragleave", () => tr.classList.remove("rpt-fila-arrastre"));
    tr.addEventListener("drop", (e) => {
      e.preventDefault(); tr.classList.remove("rpt-fila-arrastre");
      const desde = Number(e.dataTransfer.getData("text/plain"));
      if (Number.isInteger(desde)) rptMover(desde, i);
    });
    tbody.appendChild(tr);
  });
  rptLlenarSelectorAgregar();
  rptDibujarVistaPrevia();
}

function rptMover(desde, hasta) {
  if (desde === hasta || hasta < 0 || hasta >= rptBorrador.length) return;
  const [c] = rptBorrador.splice(desde, 1);
  rptBorrador.splice(hasta, 0, c);
  rptDibujar();
}

document.getElementById("rpt_select").addEventListener("change", rptCargarBorrador);
document.getElementById("rpt_btn_agregar").addEventListener("click", () => {
  const sel = document.getElementById("rpt_add_select");
  const clave = sel.value;
  if (!clave) return;
  rptBorrador.push(columnaPorDefecto(clave, rptEtiquetaCatalogo(clave)));
  rptDibujar();
  rptProgramarMuestra();
});
document.getElementById("rpt_btn_guardar").addEventListener("click", async () => {
  const msg = document.getElementById("rpt_msg");
  const prefix = rptPrefix();
  try {
    const r = await apiSend("/admin/config-reportes", "PUT", { reporte: prefix, config: { columnas: rptBorrador } });
    REPORTES_CFG[prefix] = r.config;
    // se vuelven a pedir los datos: las columnas nuevas pueden necesitar campos que antes no se traían
    await cargarInforme(prefix);
    showMsg(msg, "Configuración guardada. Ya se aplica a todos los usuarios.", true);
  } catch (err) { showMsg(msg, err.message, false); }
});
document.getElementById("rpt_btn_restablecer").addEventListener("click", async () => {
  const msg = document.getElementById("rpt_msg");
  const prefix = rptPrefix();
  if (!confirm("¿Volver al orden y formato de fábrica de este informe?")) return;
  try {
    await apiSend(`/admin/config-reportes?reporte=${prefix}`, "DELETE", {});
    REPORTES_CFG[prefix] = null;
    await rptCargarBorrador();
    await cargarInforme(prefix);
    showMsg(msg, "Se restableció la configuración de fábrica.", true);
  } catch (err) { showMsg(msg, err.message, false); }
});

// ---------------------------------------------------------------
// ADMINISTRACIÓN: CRUD de usuarios
// ---------------------------------------------------------------
async function cargarUsuarios() {
  const tbody = document.querySelector("#adm_table tbody");
  try {
    const data = await apiGet("/admin/usuarios");
    tbody.innerHTML = "";
    data.usuarios.forEach((u) => {
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${u.email}</td>
        <td><input class="adm-nombre" value="${u.nombre || ""}" /></td>
        <td>
          <select class="adm-rol-sel">
            <option value="analista" ${u.rol === "analista" ? "selected" : ""}>analista</option>
            <option value="especialista" ${u.rol === "especialista" ? "selected" : ""}>especialista</option>
            <option value="supervisor" ${u.rol === "supervisor" ? "selected" : ""}>supervisor</option>
            <option value="administrador" ${u.rol === "administrador" ? "selected" : ""}>administrador</option>
          </select>
        </td>
        <td><input type="checkbox" class="adm-activo" ${u.activo ? "checked" : ""} /></td>
        <td>
          <div class="search-row">
            <input type="password" class="adm-password-actual" value="${u.password_actual || ""}" readonly placeholder="Sin asignar" />
            <button type="button" class="btn-secondary adm-toggle-ojo">👁</button>
          </div>
        </td>
        <td>
          <input type="password" class="adm-password" placeholder="Escribir para cambiar" />
        </td>
        <td>
          <button type="button" class="btn-secondary adm-guardar">Guardar</button>
          <button type="button" class="btn-secondary adm-eliminar">Eliminar</button>
        </td>
      `;
      tr.querySelector(".adm-toggle-ojo").addEventListener("click", () => {
        const input = tr.querySelector(".adm-password-actual");
        input.type = input.type === "password" ? "text" : "password";
      });
      tr.querySelector(".adm-guardar").addEventListener("click", async () => {
        try {
          const password = tr.querySelector(".adm-password").value;
          const body = {
            nombre: tr.querySelector(".adm-nombre").value,
            rol: tr.querySelector(".adm-rol-sel").value,
            activo: tr.querySelector(".adm-activo").checked,
          };
          if (password) body.password = password;
          await apiSend(`/admin/usuarios/${u.id}`, "PATCH", body);
          showMsg(document.getElementById("adm_msg"), `Usuario ${u.email} actualizado.`, true);
          cargarUsuarios();
        } catch (err) {
          showMsg(document.getElementById("adm_msg"), err.message, false);
        }
      });
      tr.querySelector(".adm-eliminar").addEventListener("click", async () => {
        if (!confirm(`¿Eliminar a ${u.email}?`)) return;
        try {
          await apiSend(`/admin/usuarios/${u.id}`, "DELETE");
          cargarUsuarios();
        } catch (err) {
          showMsg(document.getElementById("adm_msg"), err.message, false);
        }
      });
      tbody.appendChild(tr);
    });
  } catch (err) {
    showMsg(document.getElementById("adm_msg"), err.message, false);
  }
}

document.getElementById("adm_btn_crear").addEventListener("click", async () => {
  const msg = document.getElementById("adm_msg");
  try {
    await apiSend("/admin/usuarios", "POST", {
      email: document.getElementById("adm_email").value.trim(),
      nombre: document.getElementById("adm_nombre").value.trim(),
      rol: document.getElementById("adm_rol").value,
      password: document.getElementById("adm_password").value,
    });
    document.getElementById("adm_email").value = "";
    document.getElementById("adm_nombre").value = "";
    document.getElementById("adm_password").value = "";
    showMsg(msg, "Usuario agregado correctamente.", true);
    cargarUsuarios();
  } catch (err) {
    showMsg(msg, err.message, false);
  }
});

// ---------------------------------------------------------------
// ADMINISTRACIÓN: editor genérico de catálogos
// ---------------------------------------------------------------
const CATALOGOS_UI = {
  oficinas: { label: "Oficinas", campos: [
    { key: "codigo", tipo: "text" }, { key: "nombre", tipo: "text" },
    { key: "estado", tipo: "text" }, { key: "localidad", tipo: "text" }, { key: "activo", tipo: "bool" },
  ]},
  olts: { label: "OLTs", campos: [
    { key: "oficina_id", tipo: "ref", ref: "oficinas", label: "oficina" }, { key: "codigo", tipo: "text" },
    { key: "num_tarjetas", tipo: "number" }, { key: "puertos_por_tarjeta", tipo: "number" }, { key: "activo", tipo: "bool" },
  ]},
  catalogo_categorias: { label: "Tipos de Incidencia (Categorías)", campos: [
    { key: "nombre", tipo: "text" }, { key: "orden", tipo: "number" },
  ]},
  catalogo_afectaciones: { label: "Incidencias (Afectaciones)", campos: [
    { key: "categoria_id", tipo: "ref", ref: "catalogo_categorias", label: "tipo de incidencia" },
    { key: "nombre", tipo: "text" }, { key: "orden", tipo: "number" },
  ]},
  catalogo_comentarios: { label: "Comentarios", campos: [
    { key: "categoria_id", tipo: "ref", ref: "catalogo_categorias", label: "tipo de incidencia" },
    { key: "nombre", tipo: "text" }, { key: "orden", tipo: "number" },
  ]},
  catalogo_unidades_resolutorias: { label: "Unidades Resolutorias", campos: [
    { key: "nombre", tipo: "text" }, { key: "orden", tipo: "number" },
  ]},
  catalogo_estados_ticket: { label: "Estados de Ticket", campos: [
    { key: "nombre", tipo: "text" }, { key: "orden", tipo: "number" },
  ]},
  catalogo_estados_puerto: { label: "Estados de Puerto", campos: [
    { key: "nombre", tipo: "text" }, { key: "orden", tipo: "number" },
  ]},
};

function catInputHtml(campo, valor, refs = {}) {
  if (campo.tipo === "bool") {
    return `<input type="checkbox" class="cat-f" data-key="${campo.key}" ${valor ? "checked" : ""} />`;
  }
  if (campo.tipo === "number") {
    return `<input type="number" class="cat-f" data-key="${campo.key}" value="${valor ?? ""}" />`;
  }
  if (campo.tipo === "ref") {
    const opciones = (refs[campo.ref] || [])
      .map((r) => `<option value="${r.id}" ${String(r.id) === String(valor ?? "") ? "selected" : ""}>${r.nombre}</option>`)
      .join("");
    return `<select class="cat-f" data-key="${campo.key}" data-tipo="ref"><option value="">(Todas / ninguna)</option>${opciones}</select>`;
  }
  return `<input type="text" class="cat-f" data-key="${campo.key}" value="${valor ?? ""}" />`;
}

function catLeerValores(fila) {
  const valores = {};
  fila.querySelectorAll(".cat-f").forEach((el) => {
    if (el.type === "checkbox") valores[el.dataset.key] = el.checked ? 1 : 0;
    else if (el.dataset.tipo === "ref") valores[el.dataset.key] = el.value === "" ? null : Number(el.value);
    else valores[el.dataset.key] = el.value;
  });
  return valores;
}

async function cargarCatalogo(tabla) {
  const config = CATALOGOS_UI[tabla];
  const thead = document.getElementById("cat_thead_row");
  const addRow = document.getElementById("cat_add_row");
  const tbody = document.querySelector("#cat_table tbody");
  tbody.innerHTML = "";

  // Carga las listas a las que apuntan los campos tipo "ref" (ej. categorías, oficinas)
  const refs = {};
  try {
    for (const c of config.campos) {
      if (c.tipo === "ref" && !refs[c.ref]) {
        refs[c.ref] = (await apiGet(`/admin/catalogos/${c.ref}`)).filas;
      }
    }
  } catch (err) {
    showMsg(document.getElementById("cat_msg"), err.message, false);
    return;
  }

  thead.innerHTML = config.campos.map((c) => `<th>${c.label || c.key}</th>`).join("") + "<th></th>";
  addRow.innerHTML = config.campos.map((c) => `<div class="field"><label>${c.label || c.key}</label>${catInputHtml(c, "", refs)}</div>`).join("");

  try {
    const data = await apiGet(`/admin/catalogos/${tabla}`);
    data.filas.forEach((fila) => {
      const tr = document.createElement("tr");
      tr.innerHTML = config.campos.map((c) => `<td>${catInputHtml(c, fila[c.key], refs)}</td>`).join("") +
        `<td><button type="button" class="btn-secondary cat-guardar">Guardar</button>
         <button type="button" class="btn-secondary cat-eliminar">Eliminar</button></td>`;
      tr.querySelector(".cat-guardar").addEventListener("click", async () => {
        try {
          await apiSend(`/admin/catalogos/${tabla}/${fila.id}`, "PATCH", catLeerValores(tr));
          showMsg(document.getElementById("cat_msg"), "Guardado.", true);
        } catch (err) {
          showMsg(document.getElementById("cat_msg"), err.message, false);
        }
      });
      tr.querySelector(".cat-eliminar").addEventListener("click", async () => {
        if (!confirm("¿Eliminar este registro?")) return;
        try {
          await apiSend(`/admin/catalogos/${tabla}/${fila.id}`, "DELETE");
          cargarCatalogo(tabla);
        } catch (err) {
          showMsg(document.getElementById("cat_msg"), err.message, false);
        }
      });
      tbody.appendChild(tr);
    });
  } catch (err) {
    showMsg(document.getElementById("cat_msg"), err.message, false);
  }
}

document.getElementById("cat_select").addEventListener("change", (e) => cargarCatalogo(e.target.value));

document.getElementById("cat_btn_agregar").addEventListener("click", async () => {
  const tabla = document.getElementById("cat_select").value;
  const msg = document.getElementById("cat_msg");
  try {
    await apiSend(`/admin/catalogos/${tabla}`, "POST", catLeerValores(document.getElementById("cat_add_row")));
    showMsg(msg, "Agregado correctamente.", true);
    cargarCatalogo(tabla);
  } catch (err) {
    showMsg(msg, err.message, false);
  }
});

function initCatalogosUI() {
  const select = document.getElementById("cat_select");
  select.innerHTML = Object.entries(CATALOGOS_UI).map(([key, c]) => `<option value="${key}">${c.label}</option>`).join("");
  cargarCatalogo(select.value);
}

// ---------------------------------------------------------------
// PIZARRA DE MONITOREO
// ---------------------------------------------------------------
let pizarraDatos = [];
let reporteDatos = [];
let cicloDatos = [];

// Universo de cada informe: Pizarra y Reporte Diario muestran (tabla, gráficas, semáforo, filtros) solo los tickets
// en curso asignado, en observación y en ventana de mantenimiento; los resueltos/cerrados solo aparecen en los indicadores.
// Ciclo 2026 muestra los tickets gestionados (resueltos y cerrados).
const ESTADOS_UNIVERSO = {
  piz: ["EN CURSO (ASIGNADO)", "EN OBSERVACIÓN", "VENTANA DE MANTENIMIENTO"],
  rep: ["EN CURSO (ASIGNADO)", "EN OBSERVACIÓN", "VENTANA DE MANTENIMIENTO"],
  cic: ["RESUELTO", "CERRADO"],
};
function datosInforme(prefix) { return prefix === "piz" ? pizarraDatos : prefix === "rep" ? reporteDatos : cicloDatos; }
function universoInforme(prefix, filas) { return filas.filter((f) => ESTADOS_UNIVERSO[prefix].includes(f.estado_ticket)); }
function cargarInforme(prefix) { return prefix === "piz" ? cargarPizarra() : prefix === "rep" ? cargarReporte() : cargarCiclo(); }
// Cada filtro admite varios valores a la vez (selección múltiple). Estado por informe: { id_del_filtro: Set de valores }.
// Un Set vacío = sin filtro ("Todos"). El <select> nativo queda oculto y refleja el primer valor (lo usan las pruebas).
const FILTRO_SEL = { piz: {}, rep: {}, cic: {} };
// Filtro "Otros" del Top 5 por Estado: lista de Estados que lo forman ("" = Estado vacío). null = sin filtro.
const OTROS_SEL = { piz: null, rep: null, cic: null };
const OTROS_MIEMBROS = { piz: [], rep: [], cic: [] };      // los que forman "Otros" en el último dibujo del Top 5
const regionDe = (f) => String(f.region ?? "").trim();
function pasaOtros(f, prefix) { const o = OTROS_SEL[prefix]; return !o || o.has(regionDe(f)); }
function selDe(prefix, id) { return FILTRO_SEL[prefix][id] || (FILTRO_SEL[prefix][id] = new Set()); }
function coincideFiltro(f, flt, v) {
  return v.has(String(f[flt.campo] ?? ""));
}
function soloDigitosTexto(t) { return String(t ?? "").replace(/\D/g, ""); }

const FILTROS_CASCADA = [
  // N° Ticket: lista con casillas (varios a la vez) + cuadro de texto para buscar/escribir uno puntual
  { id: "ticket_sel", campo: "ticket_cmr", ticket: true, desc: true, etiqueta: (t) => formatearTicket(t) },
  { id: "estado_ticket", campo: "estado_ticket" },
  { id: "tipo_falla", campo: "categoria_afectacion" },
  { id: "afectacion", campo: "afectacion" },
  { id: "unidad", campo: "unidad_resolutoria" },
  { id: "region", campo: "region" },
  { id: "oficina", campo: "oficina_id", labelCampo: "oficina_nombre" },
  { id: "semaforo", campo: "semaforo" },
  { id: "grupo_horario", campo: "grupo_horario" },
  // Fecha de apertura: tres filtros entrelazados entre sí y con todos los demás. Las opciones salen de los datos cargados.
  { id: "dia", campo: "dia_apertura", numerico: true },
  { id: "mes", campo: "mes_apertura", numerico: true, etiqueta: (m) => MESES[Number(m) - 1] || m },
  { id: "anio", campo: "anio_apertura", numerico: true },
];

function initFiltrosGenerico(prefix) {
  // Día / Mes / Año se llenan con lo que existe en los datos (actualizarCascada); aquí solo el texto inicial
  llenarSelectSimple(`${prefix}_dia`, [], "Día");
  llenarSelectSimple(`${prefix}_mes`, [], "Mes");
  llenarSelectSimple(`${prefix}_anio`, [], "Año");
  llenarSelectSimple(`${prefix}_grupo_horario`, ["MAÑANA","TARDE","NOCHE"].map((g)=>({value:g,label:g})), "Todos");
  llenarSelectSimple(`${prefix}_estado_ticket`,
    LOOKUPS.estados_ticket.filter((e) => ESTADOS_UNIVERSO[prefix].includes(e.nombre)).map((e)=>({value:e.nombre,label:e.nombre})), "Todos");
  llenarSelectSimple(`${prefix}_afectacion`, LOOKUPS.afectaciones.map((a)=>({value:a.nombre,label:a.nombre})), "Todas");
  llenarSelectSimple(`${prefix}_tipo_falla`, LOOKUPS.categorias.map((c)=>({value:c.nombre,label:c.nombre})), "Todos");
  llenarSelectSimple(`${prefix}_unidad`, LOOKUPS.unidades_resolutorias.map((u)=>({value:u.nombre,label:u.nombre})), "Todas");
  llenarSelectSimple(`${prefix}_oficina`, LOOKUPS.oficinas.map((o)=>({value:o.id,label:o.nombre})), "Todas");
  llenarSelectSimple(`${prefix}_semaforo`, ["VERDE","AMARILLO","NARANJA","ROJO"].map((s)=>({value:s,label:s})), "Todos");
  const regiones = Array.from(new Set(LOOKUPS.oficinas.map((o)=>o.estado).filter(Boolean))).sort();
  llenarSelectSimple(`${prefix}_region`, regiones.map((r)=>({value:r,label:r})), "Todos");

  // El campo de texto del N° de ticket pasa a vivir dentro del desplegable; el <select> nativo (oculto) guarda lo marcado.
  const inpTicket = document.getElementById(`${prefix}_ticket`);
  inpTicket.removeAttribute("list");
  document.getElementById(`${prefix}_ticket_lista`)?.remove();
  if (!document.getElementById(`${prefix}_ticket_sel`)) {
    const selT = document.createElement("select");
    selT.id = `${prefix}_ticket_sel`;
    selT.innerHTML = '<option value="">Todos</option>';
    inpTicket.closest(".db-filtro-item").appendChild(selT);
  }
  FILTROS_CASCADA.forEach((flt) => {
    const nativo = document.getElementById(`${prefix}_${flt.id}`);
    nativo.classList.add("ms-nativo");
    nativo.tabIndex = -1;
    nativo.addEventListener("change", () => {          // cambio hecho sobre el <select> nativo (una sola opción)
      const set = selDe(prefix, flt.id);
      set.clear(); if (nativo.value) set.add(nativo.value);
      aplicarFiltros(prefix);
    });
    msCrear(prefix, flt);
    msDibujar(prefix, flt, nativo.options[0] ? nativo.options[0].textContent : "Todos", [...nativo.options].slice(1).map((o) => [o.value, o.textContent]));
  });
  inpTicket.addEventListener("input", () => aplicarFiltros(prefix));
  inpTicket.addEventListener("keydown", (e) => {
    if (e.key !== "Enter") return;
    e.preventDefault();
    const t = soloDigitosTexto(inpTicket.value);
    const ops = (document.getElementById(`${prefix}_ticket_sel_ms`)?._opciones || []).map(([v]) => v);
    const coinc = t ? ops.filter((v) => v.includes(t)) : [];
    if (!coinc.length) return;
    const elegidos = coinc.includes(t) ? [t] : coinc;      // número exacto → solo ese; si no, todos los que lo contienen
    const set = selDe(prefix, "ticket_sel");
    elegidos.forEach((v) => set.add(v));
    inpTicket.value = "";
    aplicarFiltros(prefix);
  });
}
function initFiltrosPizarra() { initFiltrosGenerico("piz"); }

function valorFiltro(prefix, id) {
  return selDe(prefix, id);
}

// ---- Lista desplegable con casillas (selección múltiple) ----
function msCrear(prefix, flt) {
  const nativo = document.getElementById(`${prefix}_${flt.id}`);
  const cont = document.createElement("div");
  cont.className = "ms";
  cont.id = `${prefix}_${flt.id}_ms`;
  cont.innerHTML = `<button type="button" class="ms-btn" aria-haspopup="listbox"><span class="ms-txt"></span></button>` +
    `<div class="ms-panel hidden"><div class="ms-lista"></div><div class="ms-pie"><button type="button" class="ms-limpiar">Quitar selección</button></div></div>`;
  nativo.insertAdjacentElement("afterend", cont);
  const panel = cont.querySelector(".ms-panel");
  let buscar = null;
  if (flt.ticket) {
    buscar = document.getElementById(`${prefix}_ticket`);
    const caja = document.createElement("div");
    caja.className = "ms-buscar";
    caja.appendChild(buscar);
    buscar.placeholder = "Escribe o elige N° de ticket";
    panel.insertBefore(caja, panel.firstChild);
  }
  cont.querySelector(".ms-btn").addEventListener("click", () => {
    const abrir = panel.classList.contains("hidden");
    document.querySelectorAll(".ms-panel").forEach((p) => p.classList.add("hidden"));
    if (abrir) { panel.classList.remove("hidden"); if (buscar) buscar.focus(); }
  });
  cont.querySelector(".ms-limpiar").addEventListener("click", () => {
    selDe(prefix, flt.id).clear();
    if (buscar) buscar.value = "";
    aplicarFiltros(prefix);
  });
  cont.querySelector(".ms-lista").addEventListener("change", (e) => {
    const cb = e.target.closest("input[type=checkbox]");
    if (!cb) return;
    const set = selDe(prefix, flt.id);
    if (cb.checked) set.add(cb.value); else set.delete(cb.value);
    aplicarFiltros(prefix);
  });
}
function msDibujar(prefix, flt, placeholder, opciones) {   // opciones: [[valor, etiqueta], …]
  const cont = document.getElementById(`${prefix}_${flt.id}_ms`);
  if (!cont) return;
  const set = selDe(prefix, flt.id);
  const lista = cont.querySelector(".ms-lista");
  const scroll = lista.scrollTop;
  cont._opciones = opciones;
  let visibles = opciones, nota = "";
  const textoT = flt.ticket ? soloDigitosTexto(document.getElementById(`${prefix}_ticket`).value) : "";
  if (flt.ticket) {
    if (textoT) visibles = opciones.filter(([v]) => v.includes(textoT));
    if (visibles.length > 300) { nota = `<div class="ms-vacio">Mostrando 300 de ${formatearMiles(visibles.length)}: escribe para acotar</div>`; visibles = visibles.slice(0, 300); }
  }
  lista.innerHTML = visibles.length
    ? visibles.map(([v, l]) => `<label class="ms-op"><input type="checkbox" value="${escHtml(v)}" ${set.has(v) ? "checked" : ""} /><span>${escHtml(l)}</span></label>`).join("") + nota
    : `<div class="ms-vacio">${textoT ? "Ningún ticket coincide (Enter no agrega nada)" : "Sin opciones"}</div>`;
  lista.scrollTop = scroll;
  const etiquetas = opciones.filter(([v]) => set.has(v)).map(([, l]) => l);
  cont.querySelector(".ms-txt").textContent = !set.size ? (textoT ? `Buscando «${textoT}»` : placeholder) : etiquetas.length === 1 ? etiquetas[0] : `${set.size} seleccionados`;
  cont.querySelector(".ms-btn").classList.toggle("ms-activo", set.size > 0 || !!textoT);
  cont.querySelector(".ms-btn").title = etiquetas.join(", ");
}
document.addEventListener("click", (e) => {
  if (e.target.closest && e.target.closest(".ms")) return;
  document.querySelectorAll(".ms-panel").forEach((p) => p.classList.add("hidden"));
});
document.addEventListener("keydown", (e) => { if (e.key === "Escape") document.querySelectorAll(".ms-panel").forEach((p) => p.classList.add("hidden")); });

function filasQueCoincidenExcepto(filas, prefix, idExcluir) {
  const texto = idExcluir === "ticket_sel" ? "" : soloDigitosTexto(document.getElementById(`${prefix}_ticket`).value);
  return filas.filter((f) => (!texto || String(f.ticket_cmr).includes(texto)) && (idExcluir === "region" || pasaOtros(f, prefix)) && FILTROS_CASCADA.every((flt) => {
    if (flt.id === idExcluir) return true;
    const v = valorFiltro(prefix, flt.id);
    if (!v.size) return true;
    return coincideFiltro(f, flt, v);
  }));
}

function actualizarCascada(prefix, datosCompletos) {
  FILTROS_CASCADA.forEach((flt) => {
    const disponibles = filasQueCoincidenExcepto(datosCompletos, prefix, flt.id);
    const valores = new Map();
    disponibles.forEach((f) => {
      const val = f[flt.campo];
      if (val === null || val === undefined || val === "") return;
      valores.set(String(val), flt.labelCampo ? f[flt.labelCampo] : flt.etiqueta ? flt.etiqueta(val) : val);
    });
    const select = document.getElementById(`${prefix}_${flt.id}`);
    const set = selDe(prefix, flt.id);
    const placeholder = select.options[0] ? select.options[0].textContent : "Todos";
    const ordenados = Array.from(valores.entries()).sort((a, b) =>
      flt.desc ? Number(b[0]) - Number(a[0]) : flt.numerico ? Number(a[0]) - Number(b[0]) : String(a[1]).localeCompare(String(b[1]), "es"));
    // lo seleccionado que ya no existe con los demás filtros se descarta (igual que antes con la selección simple)
    [...set].forEach((v) => { if (!valores.has(v)) set.delete(v); });
    select.innerHTML = `<option value="">${placeholder}</option>` +
      ordenados.map(([v, l]) => `<option value="${escHtml(v)}">${escHtml(l)}</option>`).join("");
    select.value = set.size ? [...set][0] : "";
    msDibujar(prefix, flt, placeholder, ordenados.map(([v, l]) => [v, String(l)]));
  });
}

// sinEstado = true: aplica todos los filtros MENOS el de Estado del Ticket (lo usan las tarjetas de estado,
// que siempre deben mostrar el conteo de cada estado aunque la vista esté en "Activos").
function filtrarDatos(filas, prefix, sinEstado = false) {
  const textoTicket = soloDigitosTexto(document.getElementById(`${prefix}_ticket`).value);   // acepta "334 455" o "334455"
  return filas.filter((f) => {
    if (textoTicket && !String(f.ticket_cmr).includes(textoTicket)) return false;
    if (!pasaOtros(f, prefix)) return false;
    return FILTROS_CASCADA.every((flt) => {
      if (sinEstado && flt.id === "estado_ticket") return true;
      const v = valorFiltro(prefix, flt.id);
      if (!v.size) return true;
      return coincideFiltro(f, flt, v);
    });
  });
}

// Avisos visibles en el dashboard (para que un fallo en una pieza nunca deje todo en blanco sin explicación).
function avisoDash(prefix, texto, reiniciar = false) {
  const barra = document.getElementById(`${prefix}_semaforo_bar`);
  if (!barra) return;
  let aviso = document.getElementById(`${prefix}_aviso`);
  if (!aviso) {
    aviso = document.createElement("div");
    aviso.id = `${prefix}_aviso`;
    aviso.className = "db-aviso hidden";
    barra.parentNode.insertBefore(aviso, barra);
  }
  if (reiniciar) { aviso.innerHTML = ""; aviso.classList.add("hidden"); return; }
  if (![...aviso.children].some((d) => d.textContent === texto)) {
    const d = document.createElement("div"); d.textContent = texto; aviso.appendChild(d);
  }
  aviso.classList.remove("hidden");
}

function aplicarFiltros(prefix) {
  if (OTROS_SEL[prefix] && selDe(prefix, "region").size) OTROS_SEL[prefix] = null;   // elegir un Estado concreto reemplaza al filtro "Otros"
  const datosCompletos = datosInforme(prefix);
  const universo = universoInforme(prefix, datosCompletos);   // lo que muestran tabla, gráficas y filtros
  const filtrados = filtrarDatos(universo, prefix);
  avisoDash(prefix, "", true);
  // Cada pieza va por separado: si una falla, las demás se dibujan igual.
  const paso = (nombre, fn) => {
    try { fn(); } catch (e) {
      console.error(`Dashboard (${prefix}) - ${nombre}:`, e);
      avisoDash(prefix, `No se pudo dibujar "${nombre}": ${e.message}`);
    }
  };
  paso("tarjetas de estado", () => renderKpisGenerico(filtrarDatos(datosCompletos, prefix, true), prefix));
  paso("semáforo", () => renderSemaforoBar(filtrados, `${prefix}_semaforo_bar`));
  paso("top 5 por estado", () => renderTop5PorEstado(filtrados, `${prefix}_top5_estado`));
  paso("tabla de tickets", () => renderTablaDinamica(prefix, filtrados));
  paso("gráfica de unidades", () => renderChartUnidad(filtrados, `${prefix}_chart_unidad`));
  paso("gráfica de oficinas", () => renderChartOficina(filtrados, `${prefix}_chart_oficina`));
  if (prefix === "cic") paso("top 10 de OLT", () => renderTop10Olt(filtrados, "cic_top10_olt"));
  else paso("desglose de activos", () => renderChartDesglose(filtrados, `${prefix}_chart_desglose`));
  paso("filtros", () => actualizarCascada(prefix, universo));
}

function ticketsUnicos(filas) {
  const mapa = new Map();
  filas.forEach((f) => { if (!mapa.has(f.ticket_cmr)) mapa.set(f.ticket_cmr, f); });
  return Array.from(mapa.values());
}

function renderKpisGenerico(filas, prefix) {
  const unicos = ticketsUnicos(filas);

  const curso = unicos.filter((t) => t.estado_ticket === "EN CURSO (ASIGNADO)").length;
  const observacion = unicos.filter((t) => t.estado_ticket === "EN OBSERVACIÓN").length;
  const ventana = unicos.filter((t) => t.estado_ticket === "VENTANA DE MANTENIMIENTO").length;
  const resuelto = unicos.filter((t) => t.estado_ticket === "RESUELTO").length;
  const cerrado = unicos.filter((t) => t.estado_ticket === "CERRADO").length;

  document.getElementById(`${prefix}_kpi_curso`).textContent = formatearMiles(curso);
  document.getElementById(`${prefix}_kpi_observacion`).textContent = formatearMiles(observacion);
  document.getElementById(`${prefix}_kpi_ventana`).textContent = formatearMiles(ventana);
  document.getElementById(`${prefix}_kpi_resuelto`).textContent = formatearMiles(resuelto);
  document.getElementById(`${prefix}_kpi_cerrado`).textContent = formatearMiles(cerrado);
  document.getElementById(`${prefix}_kpi_activos`).textContent = formatearMiles(curso + observacion + ventana);
  document.getElementById(`${prefix}_kpi_gestionados`).textContent = formatearMiles(resuelto + cerrado);
}
function renderKpisPizarra(filas) { renderKpisGenerico(filas, "piz"); }

const FONT_DASH = '"Montserrat", "Segoe UI", Arial, sans-serif';
if (window.Chart && window.ChartDataLabels) Chart.register(ChartDataLabels);

const COLORES_UNIDAD = {
  "OLR": "#4A1259", "MIGURA": "#A6127A", "TECNOLOGÍA": "#00A99D",
  "VENTANA DE MANTENIMIENTO": "#B7D433", "REPARACIONES": "#D97706",
};
const ORDEN_UNIDADES = ["OLR", "MIGURA", "TECNOLOGÍA", "VENTANA DE MANTENIMIENTO", "REPARACIONES"];

function mezclarColores(c1, c2, t) {
  const p = (c) => [parseInt(c.slice(1, 3), 16), parseInt(c.slice(3, 5), 16), parseInt(c.slice(5, 7), 16)];
  const [r1, g1, b1] = p(c1), [r2, g2, b2] = p(c2);
  return `rgb(${Math.round(r1 + (r2 - r1) * t)},${Math.round(g1 + (g2 - g1) * t)},${Math.round(b1 + (b2 - b1) * t)})`;
}
function colorGradienteOficinas(n) {
  const stops = ["#00A99D", "#B7D433", "#D97706", "#DC2626"];
  if (n <= 1) return [stops[0]];
  const resultado = [];
  for (let i = 0; i < n; i++) {
    const pos = (i / (n - 1)) * (stops.length - 1);
    const i0 = Math.floor(pos), i1 = Math.min(i0 + 1, stops.length - 1);
    resultado.push(mezclarColores(stops[i0], stops[i1], pos - i0));
  }
  return resultado;
}
function hexARgba(hex, alpha) {
  const r = parseInt(hex.slice(1, 3), 16), g = parseInt(hex.slice(3, 5), 16), b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}
const SEMAFORO_HEX = { VERDE: "#1E9E64", AMARILLO: "#EAB308", NARANJA: "#D97706", ROJO: "#DC2626" };
// "2026-10-04T09:30:00" -> "04/10/2026 09:30" (sin conversión de zona horaria; si no se reconoce, se muestra tal cual)
function formatearFechaHora(v) {
  if (!v) return "-";
  const m = String(v).match(/^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2}))?/);
  if (!m) return escHtml(String(v));
  return `${m[3]}/${m[2]}/${m[1]}` + (m[4] ? ` ${m[4]}:${m[5]}` : "");
}
// Formato compacto: 368.7 -> "15 d 9 h" | 28 -> "1 d 4 h" | 15 -> "15 h" | 72 -> "3 d"
function formatearTiempoAbierto(h) {
  if (h === null || h === undefined || h === "" || isNaN(Number(h))) return "-";
  const total = Math.max(0, Math.round(Number(h)));
  const dias = Math.floor(total / 24), horas = total % 24;
  if (dias === 0) return `${horas} h`;
  return horas === 0 ? `${dias} d` : `${dias} d ${horas} h`;
}
function estiloTiempoAbierto(semaforo) {
  return semaforo ? `background:${hexARgba(SEMAFORO_HEX[semaforo], 0.5)};` : "";
}
function estiloUnidad(unidad) {
  const hex = COLORES_UNIDAD[unidad];
  return hex ? `background:${hexARgba(hex, 0.5)};` : "";
}

function capitalizar(s) {
  if (!s) return s;
  return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
}

const chartInstances = {};
const chartFiltros = {};   // por gráfica: valor de filtro de cada barra/sección (para el doble clic)
function destruirChart(canvasId) {
  if (chartInstances[canvasId]) { chartInstances[canvasId].destroy(); delete chartInstances[canvasId]; }
}

function escHtml(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
function htmlFallbackBarras(items) {
  const max = Math.max(1, ...items.map((i) => i.valor));
  return `<div class="db-fb-contenedor">${items.map((i) =>
    `<div class="db-fb-row" data-clave="${escHtml(i.clave ?? "")}"><span class="db-fb-lbl" title="${escHtml(i.etiqueta)}">${escHtml(i.etiqueta)}</span>` +
    `<span class="db-fb-bar"><i style="width:${(i.valor / max) * 100}%;background:${i.color}"></i></span><b>${formatearMiles(i.valor)}</b></div>`).join("")}</div>`;
}
function htmlFallbackDona(items) {
  const total = items.reduce((s, i) => s + i.valor, 0);
  let acum = 0;
  const tramos = total ? items.map((i) => { const ini = acum; acum += (i.valor / total) * 100; return `${i.color} ${ini}% ${acum}%`; }).join(",") : "#e6e0ee 0 100%";
  return `<div class="db-fb-contenedor"><div class="db-fb-dona" style="background:conic-gradient(${tramos})"></div>` +
    `<div class="db-fb-leyenda">${items.map((i) => `<span data-clave="${escHtml(i.clave ?? "")}"><i style="background:${i.color}"></i>${escHtml(i.etiqueta)}: <b>${formatearMiles(i.valor)}</b></span>`).join("")}</div></div>`;
}
// Dibuja con Chart.js; si la librería no está o falla, muestra la misma información en modo simple
// (barras/dona en HTML) y deja un aviso visible con el motivo.
// La caja exterior (.db-chart-wrap) tiene altura fija. Solo si hay tantas barras que no caben, el área interna
// (.db-chart-inner) se hace más alta y la caja muestra scroll vertical; si caben, ocupa el 100% sin scroll.
function ajustarScrollBarras(el, n) {
  const inner = el.parentElement;
  if (!inner) return;
  const wrap = inner.parentElement;
  const disponible = (wrap ? wrap.clientHeight : 0) - 16;
  const necesaria = n * 30 + 20;
  inner.style.height = necesaria > disponible && disponible > 0 ? necesaria + "px" : "100%";
}
// Etiqueta de tooltip con separador de miles (barras horizontales/verticales y dona)
function tooltipMiles(ctx) {
  const p = ctx.parsed;
  const v = typeof p === "number" ? p : (ctx.chart.options.indexAxis === "y" ? p.x : p.y);
  return `${ctx.label}: ${formatearMiles(v)}`;
}
function crearChartSeguro(canvasId, el, fallback, config) {
  const wrap = el.parentElement;
  let alt = wrap.querySelector(".db-fb-alt");
  try {
    if (typeof Chart === "undefined") throw new Error("la librería de gráficas (Chart.js) no se cargó");
    chartInstances[canvasId] = new Chart(el.getContext("2d"), config);
    el.style.display = "";
    if (alt) alt.remove();
  } catch (e) {
    console.error(`Gráfica ${canvasId}:`, e);
    el.style.display = "none";
    if (!alt) { alt = document.createElement("div"); alt.className = "db-fb-alt"; alt.style.height = "100%"; wrap.appendChild(alt); }
    alt.dataset.canvas = canvasId;
    alt.innerHTML = fallback.tipo === "dona" ? htmlFallbackDona(fallback.items) : htmlFallbackBarras(fallback.items);
    avisoDash(canvasId.split("_")[0], `Las gráficas se muestran en modo simple (${e.message}).`);
  }
}

function renderSemaforoBar(filas, contId = "piz_semaforo_bar") {
  const unicos = ticketsUnicos(filas);
  const cont = document.getElementById(contId);
  const cfg = [
    { color: "VERDE", label: "0-1 Días" },
    { color: "AMARILLO", label: "1-2 Días" },
    { color: "NARANJA", label: "2-3 Días" },
    { color: "ROJO", label: "+3 Días" },
  ];
  // Un tramo en cero no se dibuja (ni su etiqueta)
  const tramos = cfg.map((c) => ({ ...c, n: unicos.filter((t) => t.semaforo === c.color).length })).filter((c) => c.n > 0);
  if (!tramos.length) { cont.innerHTML = `<div class="db-semaforo-vacio">Sin tickets para mostrar</div>`; return; }
  cont.innerHTML = `
    <div class="db-semaforo-bar">
      ${tramos.map((c) => `<div class="seg seg-${c.color}" style="flex-grow:${c.n}"><span>${formatearMiles(c.n)}</span></div>`).join("")}
    </div>
    <div class="db-semaforo-labels">
      ${tramos.map((c) => `<div style="flex-grow:${c.n}">${c.label}</div>`).join("")}
    </div>
  `;
}

function renderChartUnidad(filas, canvasId = "piz_chart_unidad") {
  const unicos = ticketsUnicos(filas);
  const conteo = {};
  unicos.forEach((t) => {
    if (!t.unidad_resolutoria) return;
    conteo[t.unidad_resolutoria] = (conteo[t.unidad_resolutoria] || 0) + 1;
  });
  // Solo unidades con tickets (las que están en cero no se muestran); primero las conocidas en su orden
  const etiquetas = Object.keys(conteo).filter((u) => conteo[u] > 0).sort((a, b) => {
    const ia = ORDEN_UNIDADES.indexOf(a), ib = ORDEN_UNIDADES.indexOf(b);
    return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib) || a.localeCompare(b, "es");
  });
  const valores = etiquetas.map((e) => conteo[e]);
  const colores = etiquetas.map((e) => COLORES_UNIDAD[e] || "#cccccc");
  chartFiltros[canvasId] = etiquetas;

  destruirChart(canvasId);
  const el = document.getElementById(canvasId);
  if (!el) return;
  ajustarScrollBarras(el, etiquetas.length);
  crearChartSeguro(canvasId, el, { tipo: "barras", items: etiquetas.map((e, i) => ({ etiqueta: e, valor: valores[i], color: colores[i], clave: e })) }, {
    type: "bar",
    data: { labels: etiquetas, datasets: [{ data: valores, backgroundColor: colores, borderRadius: 15, barThickness: 18 }] },
    options: {
      indexAxis: "y",
      responsive: true,
      maintainAspectRatio: false,
      layout: { padding: { right: 24 } },
      scales: {
        x: { display: false, grid: { display: false } },
        y: { grid: { display: false }, ticks: { font: { family: FONT_DASH, size: 10 } } },
      },
      plugins: {
        legend: { display: false },
        datalabels: { anchor: "end", align: "right", color: "#000", formatter: (v) => formatearMiles(v), font: { family: FONT_DASH, weight: "bold", size: 12 } },
        tooltip: { callbacks: { label: tooltipMiles } },
      },
    },
  });
}

function renderChartOficina(filas, canvasId = "piz_chart_oficina") {
  const unicos = ticketsUnicos(filas);
  const conteo = {}, idOficina = {};
  unicos.forEach((t) => {
    const o = t.oficina_nombre || "SIN OFICINA";
    conteo[o] = (conteo[o] || 0) + 1;
    if (t.oficina_id !== null && t.oficina_id !== undefined && !(o in idOficina)) idOficina[o] = String(t.oficina_id);
  });
  const entradas = Object.entries(conteo).filter(([, n]) => n > 0).sort((a, b) => b[1] - a[1]).slice(0, 10);
  chartFiltros[canvasId] = entradas.map(([n]) => idOficina[n] ?? "");
  const etiquetas = entradas.map(([n]) => capitalizar(n));
  const valores = entradas.map(([, n]) => n);
  const colores = colorGradienteOficinas(entradas.length);

  destruirChart(canvasId);
  const el = document.getElementById(canvasId);
  if (!el) return;
  ajustarScrollBarras(el, etiquetas.length);
  crearChartSeguro(canvasId, el, { tipo: "barras", items: etiquetas.map((e, i) => ({ etiqueta: e, valor: valores[i], color: colores[i], clave: chartFiltros[canvasId][i] })) }, {
    type: "bar",
    data: { labels: etiquetas, datasets: [{ data: valores, backgroundColor: colores, borderRadius: 15 }] },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      layout: { padding: { top: 20 } },
      scales: {
        x: { grid: { display: false }, ticks: { font: { family: FONT_DASH, size: 9 }, maxRotation: 45, minRotation: 45 } },
        y: { display: false, grid: { display: false } },
      },
      plugins: {
        legend: { display: false },
        datalabels: { anchor: "end", align: "top", color: "#000", formatter: (v) => formatearMiles(v), font: { family: FONT_DASH, weight: "bold", size: 11 } },
        tooltip: { callbacks: { label: tooltipMiles } },
      },
    },
  });
}

function renderChartDesglose(filas, canvasId) {
  const unicos = ticketsUnicos(filas);
  const prefix = canvasId.split("_")[0];
  const todos = prefix === "cic"
    ? [
        { estado: "RESUELTO", label: "Resuelto", color: "#00A99D" },
        { estado: "CERRADO", label: "Cerrado", color: "#4A1259" },
      ]
    : [
        { estado: "VENTANA DE MANTENIMIENTO", label: "Ventana de Mantenimiento", color: "#00A99D" },
        { estado: "EN CURSO (ASIGNADO)", label: "En Curso Asignado", color: "#A6127A" },
        { estado: "EN OBSERVACIÓN", label: "En Observación", color: "#4A1259" },
      ];
  // Solo secciones con tickets: las que están en cero no se dibujan
  const conN = todos.map((c) => ({ ...c, n: unicos.filter((t) => t.estado_ticket === c.estado).length })).filter((c) => c.n > 0);
  const cfg = conN;
  const valores = conN.map((c) => c.n);
  const total = valores.reduce((a, b) => a + b, 0) || 1;
  chartFiltros[canvasId] = cfg.map((c) => c.estado);

  destruirChart(canvasId);
  const el = document.getElementById(canvasId);
  if (!el) return;
  crearChartSeguro(canvasId, el, { tipo: "dona", items: cfg.map((c, i) => ({ etiqueta: c.label, valor: valores[i], color: c.color, clave: c.estado })) }, {
    type: "doughnut",
    data: { labels: cfg.map((c) => c.label), datasets: [{ data: valores, backgroundColor: cfg.map((c) => c.color), borderWidth: 0 }] },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      cutout: "55%",
      plugins: {
        legend: { position: "bottom", labels: { font: { family: FONT_DASH, size: 10 }, color: "#000", boxWidth: 12 } },
        datalabels: {
          labels: {
            porcentaje: {
              color: "#fff", font: { family: FONT_DASH, weight: "bold", size: 11 },
              formatter: (v) => (total ? Math.round((v / total) * 100) + "%" : "0%"),
            },
            valor: {
              anchor: "end", align: "end", offset: 8,
              color: "#000", font: { family: FONT_DASH, weight: "bold", size: 11 },
              formatter: (v) => formatearMiles(v),
            },
          },
        },
        tooltip: { callbacks: { label: tooltipMiles } },
      },
    },
  });
}

function asignarFilaYColor(filas) {
  const ordenadas = [...filas].sort((a, b) => Number(b.ticket_cmr) - Number(a.ticket_cmr));
  const filaPorTicket = new Map();
  let n = 0;
  ordenadas.forEach((f) => {
    if (!filaPorTicket.has(f.ticket_cmr)) { n += 1; filaPorTicket.set(f.ticket_cmr, n); }
  });
  return { ordenadas, filaPorTicket };
}

function colorPorNombreFactory(paleta) {
  const mapa = new Map();
  let i = 0;
  return (nombre) => {
    if (!nombre) return "#eee";
    if (!mapa.has(nombre)) { mapa.set(nombre, paleta[i % paleta.length]); i += 1; }
    return mapa.get(nombre);
  };
}

// ---------------------------------------------------------------
// Generador de reportes: columnas de las tablas de Pizarra y Reporte Diario
//   · REPORTES_FABRICA: columnas de fábrica de cada informe; el resto de campos se elige en Administración (lee la BD).
//   · REPORTES_CFG: configuración guardada por el administrador (D1: tabla config_reportes).
//     Si no hay configuración guardada se usa la de fábrica (el orden y formato de siempre).
// ---------------------------------------------------------------
// REPORTES-PURE-START
// Un informe es una lista de columnas. Cada columna se identifica por su db_column_name ("tabla.columna", o "calc.xxx"
// para campos calculados) y tiene un display_name (alias) que es lo que se ve en el encabezado.
//
// Las filas que devuelve /api/consulta ya traen algunos datos con nombres históricos (ticket_cmr, oficina_nombre…).
// CAMPO_EN_FILA relaciona "tabla.columna" → nombre del campo en la fila. Las columnas que NO estén aquí se piden al servidor
// con ?extras= y llegan en la fila con su propio db_column_name como clave.
const CAMPO_EN_FILA = {
  "tickets.id": "ticket_id", "tickets.ticket_cmr": "ticket_cmr", "tickets.tickets_vinculados": "tickets_vinculados",
  "tickets.fecha_apertura_cda": "fecha_apertura_cda", "tickets.fecha_apertura_cmr": "fecha_apertura_cmr",
  "tickets.fecha_solucion_cmr": "fecha_solucion_cmr", "tickets.estado_ticket": "estado_ticket",
  "tickets.unidad_resolutoria": "unidad_resolutoria", "tickets.categoria_afectacion": "categoria_afectacion",
  "tickets.afectacion": "afectacion", "tickets.comentario": "comentario", "tickets.descripcion": "descripcion", "tickets.avance_cmr": "avance_cmr",
  "ticket_puertos.id": "puerto_id", "ticket_puertos.oficina_id": "oficina_id", "ticket_puertos.olt": "olt", "ticket_puertos.sector": "sector",
  "ticket_puertos.edificio": "edificio", "ticket_puertos.tarjeta": "tarjeta", "ticket_puertos.puerto": "puerto",
  "ticket_puertos.no_clientes_reportaron": "no_clientes_reportaron", "ticket_puertos.nro_clientes_afectados": "nro_clientes_afectados",
  "ticket_puertos.estado_puerto": "estado_puerto",
  "oficinas.id": "oficina_id", "oficinas.nombre": "oficina_nombre", "oficinas.estado": "region", "oficinas.localidad": "localidad",
  "calc.semaforo": "semaforo", "calc.grupo_horario": "grupo_horario", "calc.tiempo_cierre_horas": "tiempo_cierre_horas",
};
const NOWRAP_COLUMNAS = new Set(["calc.fila", "tickets.ticket_cmr"]);   // el N° de ticket y la fila nunca se parten en dos líneas
const FABRICA_BASE = { "tickets.ticket_cmr": { fontSize: 14, negrita: true } };

// Columnas de fábrica de cada informe (lo que se veía antes del Generador)
const REPORTES_FABRICA = {
  piz: [
    ["calc.fila", "Fila"], ["tickets.ticket_cmr", "Title"], ["oficinas.nombre", "Oficina"], ["ticket_puertos.olt", "OLT"],
    ["ticket_puertos.tarjeta", "Tarjeta"], ["ticket_puertos.puerto", "Puerto"], ["tickets.fecha_apertura_cmr", "Apertura CMR"],
    ["calc.tiempo_abierto", "Tiempo Abierto CMR"], ["tickets.estado_ticket", "Estado del Ticket"], ["tickets.afectacion", "Afectación"],
    ["ticket_puertos.nro_clientes_afectados", "N° Cltes Afectados"], ["ticket_puertos.no_clientes_reportaron", "N° Cltes Reportaron"],
    ["tickets.unidad_resolutoria", "Unidad Resolutoria"],
  ],
  rep: [
    ["calc.fila", "Fila"], ["tickets.ticket_cmr", "Title"], ["calc.tipo", "Tipo"], ["tickets.afectacion", "Afectación"],
    ["tickets.unidad_resolutoria", "Unidad Resolutoria"], ["tickets.estado_ticket", "Estado del Ticket"],
    ["tickets.fecha_apertura_cmr", "Apertura CMR"], ["calc.grupo_horario", "Grupo Horario CMR"], ["calc.tiempo_abierto", "Tiempo Abierto CMR"],
    ["ticket_puertos.nro_clientes_afectados", "N° Cltes Afectados"], ["oficinas.estado", "Estado"], ["oficinas.nombre", "Oficina"],
    ["tickets.avance_cmr", "Avance CMR"],
  ],
  // Ciclo 2026: tickets gestionados; sin "Estado del Ticket" (ya se sabe que están resueltos/cerrados) y con la fecha de cierre
  cic: [
    ["calc.fila", "Fila"], ["tickets.ticket_cmr", "Title"], ["calc.tipo", "Tipo"], ["tickets.afectacion", "Afectación"],
    ["tickets.unidad_resolutoria", "Unidad Resolutoria"],
    ["tickets.fecha_apertura_cmr", "Apertura CMR"], ["tickets.fecha_solucion_cmr", "Cierre CMR"],
    ["calc.grupo_horario", "Grupo Horario CMR"], ["calc.tiempo_abierto", "Tiempo Abierto CMR"],
    ["ticket_puertos.nro_clientes_afectados", "N° Cltes Afectados"], ["oficinas.estado", "Estado"], ["oficinas.nombre", "Oficina"],
    ["tickets.avance_cmr", "Avance CMR"],
  ],
};
// Configuraciones guardadas con la primera versión (id/titulo) → db_column_name
const ID_V1_A_CLAVE = {
  fila: "calc.fila", ticket: "tickets.ticket_cmr", oficina: "oficinas.nombre", olt: "ticket_puertos.olt", tarjeta: "ticket_puertos.tarjeta",
  puerto: "ticket_puertos.puerto", apertura_cmr: "tickets.fecha_apertura_cmr", tiempo_abierto: "calc.tiempo_abierto",
  estado_ticket: "tickets.estado_ticket", afectacion: "tickets.afectacion", clientes_afectados: "ticket_puertos.nro_clientes_afectados",
  clientes_reportaron: "ticket_puertos.no_clientes_reportaron", unidad_resolutoria: "tickets.unidad_resolutoria", tipo: "calc.tipo",
  grupo_horario: "calc.grupo_horario", region: "oficinas.estado", avance_cmr: "tickets.avance_cmr",
};
const CAMPOS_CALC_CLIENTE = new Set(["calc.fila", "calc.tiempo_abierto", "calc.semaforo", "calc.grupo_horario", "calc.tiempo_cierre_horas", "calc.tipo"]);

function etiquetaDeClave(clave) {
  const col = String(clave).split(".")[1] || clave;
  const t = col.replace(/_/g, " ");
  return t.charAt(0).toUpperCase() + t.slice(1);
}
function columnaPorDefecto(clave, titulo) {
  const b = FABRICA_BASE[clave] || {};
  return { db_column_name: clave, display_name: titulo || etiquetaDeClave(clave), visible: true, ancho: null,
    fontSize: b.fontSize || 12, negrita: !!b.negrita, cursiva: false, subrayado: false };
}
// Configuración efectiva de un informe: la guardada (si existe) o la de fábrica.
function columnasEfectivas(prefix, guardada) {
  const entrada = guardada && Array.isArray(guardada.columnas) ? guardada.columnas : null;
  if (!entrada) return REPORTES_FABRICA[prefix].map(([clave, titulo]) => columnaPorDefecto(clave, titulo));
  const salida = [];
  const usados = new Set();
  for (const g of entrada) {
    const clave = g.db_column_name || ID_V1_A_CLAVE[g.id];
    if (!clave || usados.has(clave)) continue;
    if (clave.startsWith("calc.") && !CAMPOS_CALC_CLIENTE.has(clave)) continue;
    usados.add(clave);
    const base = columnaPorDefecto(clave);
    const num = (v) => (v !== null && v !== undefined && v !== "" && Number.isFinite(Number(v)) ? Number(v) : null);
    salida.push({
      ...base,
      display_name: String(g.display_name || g.titulo || "").trim() || base.display_name,
      visible: g.visible !== false,
      ancho: num(g.ancho),
      fontSize: num(g.fontSize) ?? base.fontSize,
      negrita: !!g.negrita, cursiva: !!g.cursiva, subrayado: !!g.subrayado,
    });
  }
  return salida.length ? salida : REPORTES_FABRICA[prefix].map(([clave, titulo]) => columnaPorDefecto(clave, titulo));
}
// Columnas que hay que pedir al servidor aparte (?extras=): las que la fila de /api/consulta no trae por defecto.
function extrasNecesarios(columnas) {
  return columnas.filter((c) => c.visible && !c.db_column_name.startsWith("calc.") && !CAMPO_EN_FILA[c.db_column_name]).map((c) => c.db_column_name);
}
function esc(t) { return String(t).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"); }
// Contenido y estilo extra de una celda según su columna
function celdaDeColumna(clave, f, ctx) {
  if (clave === "calc.fila") return [esc(ctx.fila ?? "")];
  if (clave === "calc.tipo") return ["-"];
  if (clave === "calc.tiempo_abierto") return [formatearTiempoAbierto(f.horas_abierta), estiloTiempoAbierto(f.semaforo)];
  const campo = CAMPO_EN_FILA[clave] || clave;
  const v = f[campo];
  const vacio = v === null || v === undefined || v === "";
  if (clave === "tickets.ticket_cmr") return [esc(formatearTicket(v))];
  if (clave === "ticket_puertos.nro_clientes_afectados" || clave === "ticket_puertos.no_clientes_reportaron") return [vacio ? "-" : esc(formatearMiles(v))];
  if (clave === "calc.tiempo_cierre_horas") return [vacio ? "-" : Number(v).toFixed(1)];
  if (/\.(fecha_|creado_en|actualizado_en)/.test(clave)) return [vacio ? "-" : esc(formatearFechaHora(v))];
  if (clave === "tickets.unidad_resolutoria") return [vacio ? "-" : esc(v), estiloUnidad(v)];
  return [vacio ? "-" : esc(v)];
}
function estiloCeldaDeColumna(c) {
  const e = [];
  if (c.fontSize) e.push(`font-size:${c.fontSize}px`);
  e.push(`font-weight:${c.negrita ? 700 : 400}`);
  e.push(`font-style:${c.cursiva ? "italic" : "normal"}`);
  e.push(`text-decoration:${c.subrayado ? "underline" : "none"}`);
  return e.join(";");
}
function estiloEncabezadoDeColumna(c) {
  return c.ancho ? `width:${c.ancho}px;min-width:${c.ancho}px;max-width:${c.ancho}px` : "";
}
// HTML del encabezado (con el display_name) y de las filas. Sin acceso al DOM (se prueba en Node).
function htmlTablaDinamica(columnas, filas, contexto) {
  const vis = columnas.filter((c) => c.visible);
  const thead = `<tr>${vis.map((c) =>
    `<th class="${NOWRAP_COLUMNAS.has(c.db_column_name) ? "col-nowrap" : ""}" data-col="${esc(c.db_column_name)}" style="${estiloEncabezadoDeColumna(c)}">${esc(c.display_name)}</th>`
  ).join("")}</tr>`;
  const tbody = filas.map((f) => {
    const ctx = contexto ? contexto(f) : {};
    return `<tr data-ticket="${esc(f.ticket_cmr ?? "")}">${vis.map((c) => {
      const [contenido, extra] = celdaDeColumna(c.db_column_name, f, ctx);
      return `<td class="${NOWRAP_COLUMNAS.has(c.db_column_name) ? "col-nowrap" : ""}" data-col="${esc(c.db_column_name)}" style="${estiloCeldaDeColumna(c)}${extra ? ";" + extra : ""}">${contenido}</td>`;
    }).join("")}</tr>`;
  }).join("");
  return { thead, tbody };
}
// REPORTES-PURE-END

let REPORTES_CFG = { piz: null, rep: null, cic: null };
async function cargarConfigReportes() {
  try {
    const c = await apiGet("/config-reportes");
    REPORTES_CFG = { piz: c.piz || null, rep: c.rep || null, cic: c.cic || null };
  } catch (err) {
    console.warn("No se pudo leer la configuración de reportes; se usa la de fábrica.", err);
  }
}
// Orden por encabezado (como en Excel): clic alterna ascendente → descendente → sin orden. Es independiente en cada informe.
const ORDEN_TABLA = { piz: null, rep: null, cic: null };
function valorOrdenTabla(clave, f, filaPorTicket) {
  if (clave === "calc.fila") return filaPorTicket.get(f.ticket_cmr);
  if (clave === "calc.tipo") return null;
  if (clave === "calc.tiempo_abierto") return f.horas_abierta;
  const v = f[CAMPO_EN_FILA[clave] || clave];
  if (v === null || v === undefined || v === "") return null;
  if (clave === "tickets.ticket_cmr") return Number(v);
  if (clave === "ticket_puertos.nro_clientes_afectados" || clave === "ticket_puertos.no_clientes_reportaron" || clave === "calc.tiempo_cierre_horas") return Number(v);
  return v;
}
function ordenarFilasTabla(filas, ord, filaPorTicket) {
  const m = ord.dir === "desc" ? -1 : 1;
  return filas.map((f, i) => [f, i, valorOrdenTabla(ord.clave, f, filaPorTicket)]).sort((a, b) => {
    const x = a[2], y = b[2];
    const nx = x === null || x === undefined || (typeof x === "number" && Number.isNaN(x));
    const ny = y === null || y === undefined || (typeof y === "number" && Number.isNaN(y));
    if (nx || ny) return nx && ny ? a[1] - b[1] : nx ? 1 : -1; // vacíos siempre al final
    const c = typeof x === "number" && typeof y === "number" ? x - y : String(x).localeCompare(String(y), "es", { numeric: true, sensitivity: "base" });
    return c ? c * m : a[1] - b[1];
  }).map((r) => r[0]);
}
function alternarOrdenTabla(prefix, clave) {
  const o = ORDEN_TABLA[prefix];
  ORDEN_TABLA[prefix] = !o || o.clave !== clave ? { clave, dir: "asc" } : o.dir === "asc" ? { clave, dir: "desc" } : null;
  renderTablaDinamica(prefix, datosTablaActual(prefix));
}
function datosTablaActual(prefix) { return ULTIMOS_FILTRADOS[prefix] || []; }
const ULTIMOS_FILTRADOS = { piz: [], rep: [], cic: [] };
document.addEventListener("click", (e) => {
  const th = e.target.closest && e.target.closest("table.db-tabla-maestra thead th[data-col]");
  if (!th) return;
  const tabla = th.closest("table");
  const m = /^(piz|rep|cic)_table$/.exec(tabla.id || "");
  if (m) alternarOrdenTabla(m[1], th.dataset.col);
});
function renderTablaDinamica(prefix, filas) {
  ULTIMOS_FILTRADOS[prefix] = filas;
  const columnas = columnasEfectivas(prefix, REPORTES_CFG[prefix]);
  const { ordenadas: base, filaPorTicket } = asignarFilaYColor(filas);
  const ord = ORDEN_TABLA[prefix];
  const ordenadas = ord && columnas.some((c) => c.visible && c.db_column_name === ord.clave) ? ordenarFilasTabla(base, ord, filaPorTicket) : base;
  const { thead, tbody } = htmlTablaDinamica(columnas, ordenadas, (f) => ({ fila: filaPorTicket.get(f.ticket_cmr) }));
  const tabla = document.getElementById(`${prefix}_table`);
  tabla.tHead.innerHTML = thead;
  tabla.tBodies[0].innerHTML = tbody;
  if (ord) { const th = [...tabla.tHead.querySelectorAll("th")].find((t) => t.dataset.col === ord.clave); if (th) th.dataset.orden = ord.dir; }
  ajustarAlturaTabla(`${prefix}_table`);
}
// /consulta con las columnas extra que el informe necesita (las que la fila no trae por defecto)
function rutaConsultaInforme(prefix) {
  const extras = extrasNecesarios(columnasEfectivas(prefix, REPORTES_CFG[prefix]));
  return "/consulta" + (extras.length ? "?extras=" + encodeURIComponent(extras.join(",")) : "");
}

function renderTablaPizarra(filas) {
  renderTablaDinamica("piz", filas);
}


async function cargarPizarra() {
  try {
    const data = await apiGet(rutaConsultaInforme("piz"));
    pizarraDatos = data.filas;
    aplicarFiltros("piz");
  } catch (err) {
    console.error("Error cargando la pizarra:", err);
  }
}

document.getElementById("piz_btn_actualizar").addEventListener("click", cargarPizarra);

// ---------------------------------------------------------------
// Exportar PDF (descarga directa, A4 horizontal, a color) — html2canvas + jsPDF
//   Página 1: indicadores + filtros + gráficas · Página 2 en adelante: tabla completa
// Nunca se modifica la pantalla: todo se hace sobre una copia del documento (onclone).
// ---------------------------------------------------------------
// Reparte filas en páginas sin partir ninguna: devuelve [[desde, hasta), ...]. Pura, probada en Node.
// PDF-PAGINAR-START
function paginarFilasPdf(alturas, altoCabecera, altoMaximo) {
  const paginas = [];
  let inicio = 0, acumulado = altoCabecera;
  for (let i = 0; i < alturas.length; i++) {
    if (i > inicio && acumulado + alturas[i] > altoMaximo) {
      paginas.push([inicio, i]);
      inicio = i;
      acumulado = altoCabecera;
    }
    acumulado += alturas[i];
  }
  if (alturas.length > inicio) paginas.push([inicio, alturas.length]);
  return paginas;
}
// PDF-PAGINAR-END

const PDF_CFG = {
  piz: { seccion: "tab-pizarra", titulo: "Pizarra de Monitoreo", archivo: "pizarra_monitoreo" },
  rep: { seccion: "tab-reporte", titulo: "Reporte Diario de Fallas Masivas", archivo: "reporte_diario_fallas" },
  cic: { seccion: "tab-ciclo", titulo: "Ciclo 2026", archivo: "ciclo_2026" },
};

async function exportarPdfDashboard(prefix) {
  const cfg = PDF_CFG[prefix];
  const btn = document.getElementById(`${prefix}_btn_pdf`);
  if (typeof window.html2canvas !== "function" || !(window.jspdf && window.jspdf.jsPDF)) {
    alert("No se pudieron cargar las librerías para generar el PDF (html2canvas / jsPDF). Revisa la conexión o el bloqueador de contenido y recarga la página.");
    return;
  }
  const seccion = document.getElementById(cfg.seccion);
  const tabla = document.getElementById(`${prefix}_table`);
  const contTabla = tabla.closest(".db-table-scroll");
  const textoBtn = btn.textContent;
  const scrollPrevio = window.scrollY;
  btn.disabled = true;
  try {
    btn.textContent = "Generando…";
    window.scrollTo(0, 0);
    await new Promise((r) => setTimeout(r, 60));

    const fondo = getComputedStyle(seccion).backgroundColor;
    const fondoOk = fondo && fondo !== "rgba(0, 0, 0, 0)" ? fondo : "#ffffff";
    const base = { scale: 2, useCORS: true, logging: false, backgroundColor: fondoOk };

    // Captura la sección dejando visibles solo los bloques indicados (en la copia, no en pantalla)
    const capturarBloques = (mostrar) => window.html2canvas(seccion, {
      ...base,
      onclone: (doc) => {
        const sec = doc.getElementById(cfg.seccion);
        [...sec.children].forEach((h) => { if (!mostrar.some((sel) => h.matches(sel))) h.style.display = "none"; });
        sec.querySelectorAll(".db-acciones, .db-aviso").forEach((e) => { e.style.display = "none"; });
        sec.querySelectorAll(".db-estado-row").forEach((e) => { e.style.gridTemplateColumns = "repeat(5, 1fr)"; });
      },
    });

    // Geometría A4 horizontal (mm)
    const PW = 297, PH = 210, M = 8, PIE = 8;
    const anchoUtil = PW - 2 * M, altoUtil = PH - M - PIE - 4;
    const { jsPDF } = window.jspdf;
    const pdf = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4", compress: true });
    let primera = true;
    const ponerImagen = (canvas) => {
      if (!primera) pdf.addPage("a4", "landscape");
      primera = false;
      let w = anchoUtil, h = (canvas.height * w) / canvas.width;
      if (h > altoUtil) { h = altoUtil; w = (canvas.width * h) / canvas.height; }
      pdf.addImage(canvas.toDataURL("image/jpeg", 0.92), "JPEG", M + (anchoUtil - w) / 2, M, w, h, undefined, "FAST");
    };

    // Página 1: indicadores superiores, filtros aplicados y todas las gráficas
    btn.textContent = "Generando… (1)";
    ponerImagen(await capturarBloques([".db-topbar", ".db-estado-row", ".db-resumen-row", ".db-filtros-grid", ".db-semaforo-wrap", ".db-bloque6"]));

    // Página 3 en adelante: tabla completa, sin filas partidas
    const filas = [...tabla.querySelectorAll("tbody tr")];
    if (filas.length) {
      const altoFilas = filas.map((f) => f.getBoundingClientRect().height);
      const altoCab = tabla.tHead.getBoundingClientRect().height + 2;
      const anchoPx = Math.max(contTabla.getBoundingClientRect().width, contTabla.scrollWidth);   // si hay columnas anchas, se captura todo el ancho
      const altoMaxPx = ((altoUtil * anchoPx) / anchoUtil) * 0.97;   // margen de seguridad
      const paginas = paginarFilasPdf(altoFilas, altoCab, altoMaxPx);
      if (paginas.length > 60 && !confirm(`El PDF tendrá ${paginas.length + 1} páginas (${filas.length} filas) y puede tardar varios minutos. ¿Continuar?\n\nSugerencia: filtra primero para reducir la cantidad de filas.`)) return;
      for (let p = 0; p < paginas.length; p++) {
        btn.textContent = `Generando… (${p + 2}/${paginas.length + 1})`;
        const [desde, hasta] = paginas[p];
        const canvas = await window.html2canvas(contTabla, {
          ...base,
          onclone: (doc) => {
            const t = doc.getElementById(`${prefix}_table`);
            const c = t.closest(".db-table-scroll");
            c.style.maxHeight = "none"; c.style.height = "auto"; c.style.overflow = "visible"; c.style.width = anchoPx + "px";
            t.querySelectorAll("thead th").forEach((th) => { th.style.position = "static"; });
            [...t.querySelectorAll("tbody tr")].forEach((tr, i) => { if (i < desde || i >= hasta) tr.remove(); });
          },
        });
        ponerImagen(canvas);
      }
    }

    // Pie de página: título, fecha y numeración
    const total = pdf.getNumberOfPages();
    const ahora = new Date();
    const sello = ahora.toLocaleDateString("es-VE") + " " + ahora.toLocaleTimeString("es-VE", { hour: "2-digit", minute: "2-digit" });
    pdf.setFontSize(8); pdf.setTextColor(110);
    for (let i = 1; i <= total; i++) {
      pdf.setPage(i);
      pdf.text(`${cfg.titulo} - generado el ${sello}`, M, PH - 4);
      pdf.text(`Página ${i} de ${total}`, PW - M, PH - 4, { align: "right" });
    }
    pdf.save(`${cfg.archivo}_${ahora.toISOString().slice(0, 10)}.pdf`);
  } catch (err) {
    console.error("Exportar PDF:", err);
    alert("No se pudo generar el PDF: " + (err && err.message ? err.message : err));
  } finally {
    btn.disabled = false;
    btn.textContent = textoBtn;
    window.scrollTo(0, scrollPrevio);
  }
}
document.getElementById("piz_btn_pdf").addEventListener("click", () => exportarPdfDashboard("piz"));
document.getElementById("rep_btn_pdf").addEventListener("click", () => exportarPdfDashboard("rep"));
document.getElementById("cic_btn_pdf").addEventListener("click", () => exportarPdfDashboard("cic"));

function exportarExcelGenerico(filasObjetos, nombreHoja, nombreArchivo) {
  const ws = XLSX.utils.json_to_sheet(filasObjetos);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, nombreHoja);
  XLSX.writeFile(wb, nombreArchivo);
}

function exportarCSVGenerico(filasObjetos, nombreArchivo) {
  const ws = XLSX.utils.json_to_sheet(filasObjetos);
  const csv = XLSX.utils.sheet_to_csv(ws);
  const blob = new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = nombreArchivo;
  a.click();
  URL.revokeObjectURL(url);
}

function filasParaExcelDashboard(filas) {
  const { ordenadas, filaPorTicket } = asignarFilaYColor(filas);
  return ordenadas.map((f) => ({
    "Fila": filaPorTicket.get(f.ticket_cmr),
    "Ticket": f.ticket_cmr,
    "Oficina": f.oficina_nombre || "",
    "OLT": f.olt,
    "Tarjeta": f.tarjeta,
    "Puerto": f.puerto,
    "Apertura CMR": f.fecha_apertura_cmr || "",
    "Tiempo Abierto CMR (h)": f.horas_abierta !== null ? Number(f.horas_abierta.toFixed(1)) : "",
    "Estado del Ticket": f.estado_ticket,
    "Afectación": f.afectacion || "",
    "N Cltes Afectados": f.nro_clientes_afectados,
    "N Cltes Reportaron": f.no_clientes_reportaron,
    "Unidad Resolutoria": f.unidad_resolutoria || "",
    "Semáforo": f.semaforo || "",
  }));
}

document.getElementById("piz_btn_excel").addEventListener("click", () => {
  if (pizarraDatos.length === 0) { alert("No hay datos cargados para exportar."); return; }
  const fecha = new Date().toISOString().slice(0, 10);
  exportarExcelGenerico(filasParaExcelDashboard(universoInforme("piz", pizarraDatos)), "Pizarra", `pizarra_monitoreo_${fecha}.xlsx`);
});
document.getElementById("piz_btn_csv").addEventListener("click", () => {
  if (pizarraDatos.length === 0) { alert("No hay datos cargados para exportar."); return; }
  const fecha = new Date().toISOString().slice(0, 10);
  exportarCSVGenerico(filasParaExcelDashboard(universoInforme("piz", pizarraDatos)), `pizarra_monitoreo_${fecha}.csv`);
});

// ---------------------------------------------------------------
// REPORTE DIARIO DE FALLAS MASIVAS
// ---------------------------------------------------------------
function renderTop5PorEstado(filas, tablaId) {
  const prefix = tablaId.split("_")[0];
  const unicos = ticketsUnicos(filas);
  const tbody = document.querySelector(`#${tablaId} tbody`);
  const suma = (arr) => ({ fallas: arr.reduce((s, x) => s + x.fallas, 0), afectados: arr.reduce((s, x) => s + x.afectados, 0) });
  const celdas = (f) => `<td>${escHtml(f.region)}</td><td>${formatearMiles(f.fallas)}</td><td>${formatearMiles(f.afectados)}</td>`;

  // Con el filtro "Otros" activo se ve esa sola fila (resaltada) y el total, igual que con un Estado concreto.
  if (OTROS_SEL[prefix]) {
    const t = suma(unicos.map((u) => ({ fallas: 1, afectados: Number(u.nro_clientes_afectados || 0) })));
    if (!tbody) return;
    tbody.innerHTML = t.fallas > 0
      ? `<tr class="db-filtrable db-fila-activa" data-otros="1" title="Doble clic para quitar el filtro"><td>Otros</td><td>${formatearMiles(t.fallas)}</td><td>${formatearMiles(t.afectados)}</td></tr>` +
        `<tr>${celdas({ region: "Total", ...t })}</tr>`
      : "";
    return;
  }

  // Un Estado vacío, nulo o en blanco nunca es una fila propia: se suma a "Otros".
  const porEstado = {};
  const vacios = { fallas: 0, afectados: 0 };
  unicos.forEach((t) => {
    const region = regionDe(t);
    const dest = region ? (porEstado[region] || (porEstado[region] = { fallas: 0, afectados: 0 })) : vacios;
    dest.fallas += 1;
    dest.afectados += Number(t.nro_clientes_afectados || 0);
  });
  const entradas = Object.entries(porEstado).sort((a, b) => b[1].fallas - a[1].fallas);
  const top5 = entradas.slice(0, 5).map(([region, v]) => ({ region, ...v }));
  const resto = entradas.slice(5);
  const otros = suma([...resto.map(([, v]) => v), vacios]);
  OTROS_MIEMBROS[prefix] = [...resto.map(([r]) => r), ...(vacios.fallas > 0 ? [""] : [])];

  const regionesActivas = selDe(prefix, "region");
  const html = top5.filter((f) => f.fallas > 0 || f.afectados > 0).map((f) =>
    `<tr class="db-filtrable ${regionesActivas.has(f.region) ? "db-fila-activa" : ""}" data-region="${escHtml(f.region)}" title="Doble clic para filtrar por este Estado">${celdas(f)}</tr>`);
  if (otros.fallas > 0 || otros.afectados > 0) {
    html.push(`<tr class="db-filtrable" data-otros="1" title="Doble clic para filtrar por Otros (Estados fuera del Top 5 y registros sin Estado)">${celdas({ region: "Otros", ...otros })}</tr>`);
  }
  const total = suma([...entradas.map(([, v]) => v), vacios]);
  if (unicos.length > 0) html.push(`<tr>${celdas({ region: "Total", ...total })}</tr>`);
  if (tbody) tbody.innerHTML = html.join("");
}

// Ciclo 2026: Top 10 de OLT afectadas. Fallas = tickets distintos con esa OLT; afectados = clientes afectados de ese ticket en esa OLT
// (una vez por ticket y OLT). N/A, NO INDICADO y OLT vacía se agrupan en "Otros" junto con las OLT fuera del Top 10.
function renderTop10Olt(filas, tablaId) {
  const tbody = document.querySelector(`#${tablaId} tbody`);
  if (!tbody) return;
  const norm = (v) => String(v ?? "").trim();
  const sinOlt = (o) => !o || ["N/A", "NO INDICADO"].includes(o.toUpperCase());
  const pares = new Map();   // "ticket|olt" -> afectados (primer registro)
  filas.forEach((f) => {
    const k = `${f.ticket_cmr}|${norm(f.olt)}`;
    if (!pares.has(k)) pares.set(k, { olt: norm(f.olt), afectados: Number(f.nro_clientes_afectados || 0) });
  });
  const porOlt = {}, otrosSin = { fallas: 0, afectados: 0 };
  pares.forEach((v) => {
    const dest = sinOlt(v.olt) ? otrosSin : (porOlt[v.olt] || (porOlt[v.olt] = { fallas: 0, afectados: 0 }));
    dest.fallas += 1; dest.afectados += v.afectados;
  });
  const entradas = Object.entries(porOlt).sort((a, b) => b[1].fallas - a[1].fallas || b[1].afectados - a[1].afectados);
  const top = entradas.slice(0, 10);
  const resto = entradas.slice(10).map(([, v]) => v).concat([otrosSin]);
  const otros = { fallas: resto.reduce((s, x) => s + x.fallas, 0), afectados: resto.reduce((s, x) => s + x.afectados, 0) };
  const totalF = entradas.reduce((s, [, v]) => s + v.fallas, 0) + otrosSin.fallas;
  const totalA = entradas.reduce((s, [, v]) => s + v.afectados, 0) + otrosSin.afectados;
  const fila = (n, f, a, extra = "") => `<tr${extra}><td>${escHtml(n)}</td><td>${formatearMiles(f)}</td><td>${formatearMiles(a)}</td></tr>`;
  const html = top.map(([o, v]) => fila(o, v.fallas, v.afectados));
  if (otros.fallas > 0) html.push(fila("Otros", otros.fallas, otros.afectados));
  if (totalF > 0) html.push(fila("Total", totalF, totalA));
  tbody.innerHTML = html.join("");
}

function renderTablaReporte(filas) {
  renderTablaDinamica("rep", filas);
}

async function cargarReporte() {
  try {
    const data = await apiGet(rutaConsultaInforme("rep"));
    reporteDatos = data.filas;
    aplicarFiltros("rep");
  } catch (err) {
    console.error("Error cargando el reporte diario:", err);
  }
}

document.getElementById("rep_btn_actualizar").addEventListener("click", cargarReporte);

function filasResumenPorEstadoParaExcel(filas) {
  const unicos = ticketsUnicos(filas);
  const porEstado = {};
  unicos.forEach((t) => {
    const region = regionDe(t) || "Otros";
    if (!porEstado[region]) porEstado[region] = { fallas: 0, afectados: 0 };
    porEstado[region].fallas += 1;
    porEstado[region].afectados += Number(t.nro_clientes_afectados || 0);
  });
  const entradas = Object.entries(porEstado).sort((a,b) => b[1].fallas - a[1].fallas);
  const filasExcel = entradas.map(([region, v]) => ({ "Estado": region, "Nro Fallas": v.fallas, "Nro Afectados": v.afectados }));
  filasExcel.push({
    "Estado": "Total",
    "Nro Fallas": entradas.reduce((s,[,v]) => s + v.fallas, 0),
    "Nro Afectados": entradas.reduce((s,[,v]) => s + v.afectados, 0),
  });
  return filasExcel;
}

function filasDetalleReporteParaExcel(filas) {
  return filas.map((f, idx) => ({
    "Fila": idx + 1,
    "Ticket": f.ticket_cmr,
    "Tipo": "",
    "Afectación": f.afectacion || "",
    "Unidad Resolutoria": f.unidad_resolutoria || "",
    "Estado del Ticket": f.estado_ticket,
    "Apertura CMR": f.fecha_apertura_cmr || "",
    "Grupo Horario CMR": f.grupo_horario || "",
    "N Cltes Afectados": f.nro_clientes_afectados,
    "Tiempo Abierto CMR (h)": f.horas_abierta !== null ? Number(f.horas_abierta.toFixed(1)) : "",
    "Estado": f.region || "",
    "Oficina": f.oficina_nombre || "",
    "Avance CMR": f.avance_cmr || "",
  }));
}

document.getElementById("rep_btn_excel").addEventListener("click", () => {
  if (reporteDatos.length === 0) { alert("No hay datos cargados para exportar."); return; }
  const wb = XLSX.utils.book_new();
  const univ = universoInforme("rep", reporteDatos);
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(filasResumenPorEstadoParaExcel(univ)), "Resumen por Estado");
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(filasDetalleReporteParaExcel(univ)), "Detalle");
  const fecha = new Date().toISOString().slice(0, 10);
  XLSX.writeFile(wb, `reporte_diario_fallas_${fecha}.xlsx`);
});
document.getElementById("rep_btn_csv").addEventListener("click", () => {
  if (reporteDatos.length === 0) { alert("No hay datos cargados para exportar."); return; }
  const fecha = new Date().toISOString().slice(0, 10);
  exportarCSVGenerico(filasDetalleReporteParaExcel(universoInforme("rep", reporteDatos)), `reporte_diario_fallas_${fecha}.csv`);
});

// ---------------------------------------------------------------
// CICLO 2026: tickets gestionados (resueltos y cerrados). "Tiempo Abierto CMR" aquí es el tiempo que estuvo abierta la falla:
// fecha de cierre (solución CMR) − fecha de apertura CMR. Con eso se recalcula el semáforo (mismos colores y formato).
// ---------------------------------------------------------------
function semaforoDeHoras(h) { return h === null || h === undefined || !isFinite(h) ? null : h < 24 ? "VERDE" : h < 48 ? "AMARILLO" : h < 72 ? "NARANJA" : "ROJO"; }
function mapearCiclo(filas) {
  return filas.map((f) => {
    const h = f.tiempo_cierre_horas === undefined || f.tiempo_cierre_horas === null ? null : Number(f.tiempo_cierre_horas);
    return { ...f, horas_abierta: h, semaforo: semaforoDeHoras(h) };
  });
}
async function cargarCiclo() {
  try {
    const data = await apiGet(rutaConsultaInforme("cic"));
    cicloDatos = mapearCiclo(data.filas);
    aplicarFiltros("cic");
  } catch (err) {
    console.error("Error cargando el Ciclo 2026:", err);
  }
}
document.getElementById("cic_btn_actualizar").addEventListener("click", cargarCiclo);
document.getElementById("cic_btn_excel").addEventListener("click", () => {
  if (cicloDatos.length === 0) { alert("No hay datos cargados para exportar."); return; }
  const univ = universoInforme("cic", cicloDatos);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(filasResumenPorEstadoParaExcel(univ)), "Resumen por Estado");
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(filasDetalleReporteParaExcel(univ)), "Detalle");
  XLSX.writeFile(wb, `ciclo_2026_${new Date().toISOString().slice(0, 10)}.xlsx`);
});
document.getElementById("cic_btn_csv").addEventListener("click", () => {
  if (cicloDatos.length === 0) { alert("No hay datos cargados para exportar."); return; }
  exportarCSVGenerico(filasDetalleReporteParaExcel(universoInforme("cic", cicloDatos)), `ciclo_2026_${new Date().toISOString().slice(0, 10)}.csv`);
});

// ---------------------------------------------------------------
// Interacción de los informes
//   · Doble clic en una fila del Top 5, una barra de "Unidades resolutorias" / "Oficinas" o una sección del
//     "Desglose" = usa ese valor como filtro (otro doble clic sobre el mismo valor lo quita).
//   · Clic en una fila de la tabla = menú con "1. Ver log" (toda la información del ticket en la base de datos).
// ---------------------------------------------------------------
const SELECT_DE_GRAFICA = { unidad: "unidad", oficina: "oficina", desglose: "estado_ticket" };
function aplicarFiltroDoble(prefix, selectId, valor) {
  if (selectId === "region") OTROS_SEL[prefix] = null;
  if (!document.getElementById(`${prefix}_${selectId}`) || valor === undefined || valor === null || valor === "") return;
  const set = selDe(prefix, selectId), v = String(valor);
  const yaEsElUnico = set.size === 1 && set.has(v);
  set.clear();
  if (!yaEsElUnico) set.add(v);
  aplicarFiltros(prefix);
}
document.addEventListener("dblclick", (e) => {
  const t = e.target;
  if (!t || !t.closest) return;
  // Top 5 por Estado: fila "Otros" (Estados fuera del Top 5 + registros sin Estado)
  const trOtros = t.closest("tr[data-otros]");
  if (trOtros) {
    const prefix = trOtros.closest("table").id.split("_")[0];
    if (OTROS_SEL[prefix]) OTROS_SEL[prefix] = null;
    else { selDe(prefix, "region").clear(); OTROS_SEL[prefix] = new Set(OTROS_MIEMBROS[prefix]); }
    aplicarFiltros(prefix);
    return;
  }
  // Top 5 por Estado
  const trTop = t.closest("tr[data-region]");
  if (trTop) {
    const prefix = trTop.closest("table").id.split("_")[0];
    aplicarFiltroDoble(prefix, "region", trTop.dataset.region);
    return;
  }
  // Gráficas (Chart.js)
  const canvas = t.closest("canvas");
  const m = canvas && /^(piz|rep|cic)_chart_(unidad|oficina|desglose)$/.exec(canvas.id);
  if (m) {
    const ch = chartInstances[canvas.id];
    const el = ch && ch.getElementsAtEventForMode(e, "nearest", { intersect: true }, true)[0];
    if (el && chartFiltros[canvas.id]) aplicarFiltroDoble(m[1], SELECT_DE_GRAFICA[m[2]], chartFiltros[canvas.id][el.index]);
    return;
  }
  // Gráficas en modo simple (sin Chart.js)
  const fb = t.closest("[data-clave]");
  const alt = fb && fb.closest(".db-fb-alt");
  const m2 = alt && alt.dataset.canvas && /^(piz|rep|cic)_chart_(unidad|oficina|desglose)$/.exec(alt.dataset.canvas);
  if (m2) aplicarFiltroDoble(m2[1], SELECT_DE_GRAFICA[m2[2]], fb.dataset.clave);
});

// --- Menú de la fila + ventana "Ver log" ---
function cerrarMenuFila() { const m = document.getElementById("menu_fila"); if (m) m.remove(); }
function abrirMenuFila(ev, ticket) {
  cerrarMenuFila();
  const menu = document.createElement("div");
  menu.id = "menu_fila";
  menu.className = "menu-fila";
  menu.innerHTML = `<div class="menu-fila-titulo">Ticket ${escHtml(formatearTicket(ticket))}</div><button type="button" data-accion="log">1. Ver log</button>`;
  document.body.appendChild(menu);
  const w = menu.offsetWidth, h = menu.offsetHeight;
  menu.style.left = Math.max(4, Math.min(ev.clientX, window.innerWidth - w - 8)) + "px";
  menu.style.top = Math.max(4, Math.min(ev.clientY, window.innerHeight - h - 8)) + "px";
  menu.querySelector('[data-accion="log"]').addEventListener("click", () => { cerrarMenuFila(); abrirModalLog(ticket); });
}
["piz_table", "rep_table", "cic_table"].forEach((id) => {
  document.getElementById(id).addEventListener("click", (e) => {
    const tr = e.target.closest("tbody tr[data-ticket]");
    if (!tr || !tr.dataset.ticket) return;
    if (window.getSelection && String(window.getSelection()).trim()) return;   // se está seleccionando texto
    abrirMenuFila(e, tr.dataset.ticket);
  });
});
document.addEventListener("click", (e) => {
  if (e.target.closest("#menu_fila") || e.target.closest("tr[data-ticket]")) return;
  cerrarMenuFila();
});
document.addEventListener("keydown", (e) => { if (e.key === "Escape") { cerrarMenuFila(); cerrarModalLog(); } });
window.addEventListener("wheel", (e) => { if (!e.target.closest || !e.target.closest("#menu_fila")) cerrarMenuFila(); }, { passive: true });

function cerrarModalLog() { const m = document.getElementById("modal_log"); if (m) m.remove(); }
function valorLogLegible(clave, v) {
  if (v === null || v === undefined || v === "") return "-";
  if (clave === "ticket_cmr") return formatearTicket(v);
  if (/^(fecha_|creado_en|actualizado_en)/.test(clave)) return formatearFechaHora(v);
  return escHtml(v);
}
function etiquetaCampoLog(clave) { return escHtml(String(clave).replace(/_/g, " ")); }
// HTML de solo lectura con TODO lo guardado del ticket: sus campos, sus registros (puertos) y el log de cambios
function htmlDetalleLog(ticket, puertos, log) {
  const kv = Object.entries(ticket).map(([k, v]) =>
    `<div class="ml-kv"><span>${etiquetaCampoLog(k)}</span><b>${valorLogLegible(k, v)}</b></div>`).join("");
  const cols = [];
  puertos.forEach((p) => Object.keys(p).forEach((k) => { if (!cols.includes(k)) cols.push(k); }));
  const tabla = puertos.length
    ? `<div class="ml-scroll"><table class="rows-table"><thead><tr>${cols.map((c) => `<th>${etiquetaCampoLog(c)}</th>`).join("")}</tr></thead><tbody>${
        puertos.map((p) => `<tr>${cols.map((c) => `<td>${valorLogLegible(c, p[c])}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`
    : `<p class="ml-vacio">Sin registros.</p>`;
  const entradas = (log || []).length
    ? log.map((l) => {
        const det = l.ticket_puerto_id ? `[${escHtml(l.olt ?? "")} | ${escHtml(l.tarjeta ?? "")} | ${escHtml(l.puerto ?? "")}] ` : "";
        return `<div class="log-entry"><div>${det}<strong>${escHtml(l.campo)}</strong>: ${escHtml(l.valor_anterior ?? "-")} → ${escHtml(l.valor_nuevo ?? "-")}</div>` +
          `<div class="meta">${escHtml(l.tipo_cambio)} · ${escHtml(l.usuario_email)} · ${escHtml(l.fecha)}</div></div>`;
      }).join("")
    : `<p class="ml-vacio">Sin cambios registrados.</p>`;
  return `<h4>Datos del ticket</h4><div class="ml-grid">${kv}</div><h4>Registros (${puertos.length})</h4>${tabla}<h4>Log de cambios</h4>${entradas}`;
}
async function abrirModalLog(cmr) {
  cerrarModalLog();
  const ov = document.createElement("div");
  ov.id = "modal_log";
  ov.className = "modal-overlay";
  ov.innerHTML = `<div class="modal-box modal-log"><div class="ml-cab"><h3>Log del ticket ${escHtml(formatearTicket(cmr))}</h3>` +
    `<button type="button" class="btn-secondary" id="ml_cerrar">Cerrar</button></div><div id="ml_cuerpo">Cargando...</div></div>`;
  document.body.appendChild(ov);
  ov.addEventListener("click", (e) => { if (e.target === ov) cerrarModalLog(); });
  ov.querySelector("#ml_cerrar").addEventListener("click", cerrarModalLog);
  try {
    const [detalle, logData] = await Promise.all([
      apiGet(`/tickets/${encodeURIComponent(cmr)}`),
      apiGet(`/tickets/${encodeURIComponent(cmr)}/log`),
    ]);
    const cuerpo = document.getElementById("ml_cuerpo");
    if (cuerpo) cuerpo.innerHTML = htmlDetalleLog(detalle.ticket, detalle.puertos, logData.log);
  } catch (err) {
    const cuerpo = document.getElementById("ml_cuerpo");
    if (cuerpo) cuerpo.innerHTML = `<div class="msg error">${escHtml(err.message)}</div>`;
  }
}

// ---------------------------------------------------------------
// Arranque
// ---------------------------------------------------------------
// ---------------------------------------------------------------
// Login / arranque de la app
// ---------------------------------------------------------------
function mostrarLogin() {
  document.getElementById("login_screen").classList.remove("hidden");
  document.getElementById("app_shell").classList.add("hidden");
}
function mostrarApp() {
  document.getElementById("login_screen").classList.add("hidden");
  document.getElementById("app_shell").classList.remove("hidden");
}

async function iniciarSesionApp() {
  try {
    currentUser = await apiGet("/me");
  } catch (e) {
    currentUser = null;
  }
  if (!currentUser || !currentUser.registrado) {
    mostrarLogin();
    return;
  }
  mostrarApp();
  await loadLookups();
  aplicarPermisosRol();
}

document.getElementById("login_btn").addEventListener("click", async () => {
  const msg = document.getElementById("login_msg");
  const email = document.getElementById("login_email").value.trim();
  const password = document.getElementById("login_password").value;
  if (!email || !password) { showMsg(msg, "Ingresa correo y contraseña.", false); return; }
  try {
    currentUser = await apiSend("/auth/login", "POST", { email, password });
    currentUser.registrado = true;
    document.getElementById("login_password").value = "";
    mostrarApp();
    await loadLookups();
    aplicarPermisosRol();
  } catch (err) {
    showMsg(msg, err.message, false);
  }
});
document.getElementById("login_toggle_ojo").addEventListener("click", () => {
  const input = document.getElementById("login_password");
  input.type = input.type === "password" ? "text" : "password";
});
document.getElementById("login_password").addEventListener("keydown", (e) => {
  if (e.key === "Enter") document.getElementById("login_btn").click();
});

document.getElementById("btn_logout").addEventListener("click", async () => {
  try { await apiSend("/auth/logout", "POST"); } catch (e) { /* no importa si falla */ }
  location.reload();
});

// ---------------------------------------------------------------
// REPOSITORIO: importar tickets desde CSV/XLSX
// ---------------------------------------------------------------
// REPO-PURE-START
// Texto en mayúsculas, sin acentos ni signos (salvo el guion), espacios colapsados.
function normTxt(s) {
  return String(s === null || s === undefined ? "" : s)
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
function vacioRepo(v) {
  return v === null || v === undefined || (typeof v === "string" && v.trim() === "");
}
function textoORepo(v, def = "DESCONOCIDO") {
  const s = vacioRepo(v) ? "" : String(v).trim();
  return s || def;
}
// Números de ticket: solo dígitos ("28014402.0" -> "28014402")
function limpiarNumeroRepo(v) {
  if (vacioRepo(v)) return null;
  let s = String(v).trim();
  if (s.endsWith(".0")) s = s.slice(0, -2);
  s = s.replace(/[^0-9]/g, "");
  return s || null;
}
// Conteos de clientes: "DESCONOCIDO", vacío o texto raro -> 0
function numeroRepo(v) {
  if (vacioRepo(v)) return 0;
  if (typeof v === "number") return isFinite(v) ? Math.trunc(v) : 0;
  const n = parseFloat(String(v).replace(/[^\d.-]/g, ""));
  return isFinite(n) ? Math.trunc(n) : 0;
}

// Fechas -> "YYYY-MM-DDTHH:MM:SS" (hora tal cual, sin zona horaria). Acepta:
//  - serial de Excel (número)
//  - texto "d/m/yyyy h:mm:ss a. m./p. m." (formato de tu Excel; día primero)
//  - texto ISO "yyyy-mm-dd[ T]hh:mm[:ss]"
//  - objeto Date
function fechaRepoAIso(v) {
  if (vacioRepo(v)) return null;
  const pad = (n) => String(n).padStart(2, "0");
  const armar = (y, mo, d, h = 0, mi = 0, se = 0) => {
    if (mo < 1 || mo > 12 || d < 1 || d > 31 || h > 23 || mi > 59 || se > 59) return null;
    return `${y}-${pad(mo)}-${pad(d)}T${pad(h)}:${pad(mi)}:${pad(se)}`;
  };
  if (v instanceof Date) {
    if (isNaN(v.getTime())) return null;
    return armar(v.getFullYear(), v.getMonth() + 1, v.getDate(), v.getHours(), v.getMinutes(), v.getSeconds());
  }
  if (typeof v === "number") {                       // serial de Excel (días desde 1899-12-30)
    if (!isFinite(v) || v < 1) return null;
    const d = new Date(Date.UTC(1899, 11, 30) + Math.round(v * 86400) * 1000);
    return armar(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate(), d.getUTCHours(), d.getUTCMinutes(), d.getUTCSeconds());
  }
  const t = String(v).replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();
  let m = t.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?/);
  if (m) return armar(+m[1], +m[2], +m[3], +(m[4] || 0), +(m[5] || 0), +(m[6] || 0));
  m = t.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?: (\d{1,2}):(\d{2})(?::(\d{2}))?\s*(?:([ap])\.?\s*m\.?)?)?$/i);
  if (m) {
    let d = +m[1], mo = +m[2];
    if (mo > 12 && d <= 12) { const x = d; d = mo; mo = x; }   // venía mes/día
    let h = +(m[4] || 0);
    const ap = (m[7] || "").toLowerCase();
    if (ap === "p" && h < 12) h += 12;
    if (ap === "a" && h === 12) h = 0;
    return armar(+m[3], mo, d, h, +(m[5] || 0), +(m[6] || 0));
  }
  return null;
}

// Convierte las filas leídas del archivo en tickets + puertos listos para enviar.
// ctx = { oficinas: LOOKUPS.oficinas, categorias: LOOKUPS.categorias }
function construirRegistrosRepo(filasCrudas, ctx) {
  const oficinas = ctx.oficinas || [];
  const idxNombre = new Map();
  const idxCodigo = new Map();
  oficinas.forEach((o) => {
    idxNombre.set(normTxt(o.nombre), o);
    if (!idxCodigo.has(o.codigo)) idxCodigo.set(o.codigo, o);
  });
  const resolverOficina = (txt) => {
    if (vacioRepo(txt)) return null;
    if (normTxt(txt) === "1 SOPORTE TECNICO PERO NO APLICA") txt = "SOPORTE TÉCNICO PERO NO APLICA";   // nombre anterior
    const porNombre = idxNombre.get(normTxt(txt));
    if (porNombre) return porNombre;
    const m = String(txt).trim().match(/^([A-Za-z0-9]{2,6})\s*-\s*/);
    return m ? idxCodigo.get(m[1].toUpperCase()) || null : null;
  };
  // "TBY-TABAY" -> nombre del catálogo "TBY - TABAY" (solo oficinas reales)
  const resolverUbicacion = (txt) => {
    if (vacioRepo(txt)) return "N/A";
    const of = resolverOficina(txt);
    return of && (of.tipo || "oficina") === "oficina" ? of.nombre : String(txt).trim();
  };
  const categorias = ctx.categorias || [];
  const normalizarTipo = (raw) => {
    if (vacioRepo(raw)) return null;
    const n = normTxt(raw);
    const exacta = categorias.find((c) => normTxt(c.nombre) === n);
    if (exacta) return exacta.nombre;
    if (n.startsWith("SOPORTE TEC")) {
      const soporte = categorias.find((c) => normTxt(c.nombre).startsWith("SOPORTE TEC"));
      if (soporte) return soporte.nombre;
    }
    return String(raw).trim().toUpperCase();
  };

  const ticketsMap = new Map();
  const puertos = [];
  const vistas = new Set();
  const stats = { invalidas: 0, sinOficina: 0, fechasIlegibles: 0, duplicadas: 0 };

  filasCrudas.forEach((filaCruda) => {
    const f = {};
    for (const [k, v] of Object.entries(filaCruda)) f[normTxt(k)] = v;
    const col = (...nombres) => {
      for (const n of nombres) {
        const v = f[normTxt(n)];
        if (!vacioRepo(v)) return v;
      }
      return null;
    };

    const ticketCmr = limpiarNumeroRepo(col("Title"));
    if (!ticketCmr) { stats.invalidas += 1; return; }

    // ---- datos del ticket (el primer valor no vacío de sus filas) ----
    const rawFechas = {
      fecha_apertura_cda: col("FECHA DE CREACION DEL CDA"),
      fecha_apertura_cmr: col("FECHA DE CREACION DEL CMR", "FECHA DE CREACION DEL CRM"),
      fecha_solucion_cmr: col("FECHA DE SOLUCION DEL CMR", "FECHA DE SOLUCION DEL CRM"),
      fecha_solucion_cda: col("FECHA DE SOLUCION DEL CDA"),
    };
    const textoONull = (v) => (vacioRepo(v) ? null : String(v).trim());
    const candidato = {
      ticket_cmr: ticketCmr,
      tickets_vinculados: limpiarNumeroRepo(col("Tickets Vinculados")),
      estado_ticket: vacioRepo(col("ESTADO DEL TICKET")) ? null : String(col("ESTADO DEL TICKET")).trim().toUpperCase(),
      unidad_resolutoria: vacioRepo(col("UNIDAD RESOLUTORIA")) ? null : String(col("UNIDAD RESOLUTORIA")).trim().toUpperCase(),
      categoria_afectacion: normalizarTipo(col("TIPO")),
      afectacion: textoONull(col("AFECTACION")),
      comentario: textoONull(col("COMENTARIO")),
      descripcion: textoONull(col("DESCRIPCION")),
      avance_cmr: textoONull(col("AVANCE DEL CMR")),
    };
    for (const k of Object.keys(rawFechas)) candidato[k] = fechaRepoAIso(rawFechas[k]);

    let ticket = ticketsMap.get(ticketCmr);
    if (!ticket) {
      ticket = candidato;
      ticketsMap.set(ticketCmr, ticket);
      for (const k of Object.keys(rawFechas)) {
        if (!vacioRepo(rawFechas[k]) && !candidato[k]) stats.fechasIlegibles += 1;
      }
    } else {
      for (const k of Object.keys(candidato)) if (ticket[k] === null || ticket[k] === undefined) ticket[k] = candidato[k];
    }

    // ---- fila de detalle (OFICINA / OLT / TARJETA / PUERTO ...) ----
    const oficinaTxt = col("OFICINA");
    const of = resolverOficina(oficinaTxt);
    if (!vacioRepo(oficinaTxt) && !of) stats.sinOficina += 1;

    let olt, tarjeta, puerto, sector, edificio;
    const especial = of && of.tipo === "especial" ? normTxt(of.nombre) : null;
    if (especial === "ENLACE" || especial === "TRAMO" || especial === "TRONCAL") {
      olt = textoORepo(col("OLT"), "N/A");
      tarjeta = "N/A"; puerto = "N/A"; edificio = "N/A";
      sector = resolverUbicacion(col("UBICACION"));
    } else if (especial) {
      olt = tarjeta = puerto = sector = edificio = "N/A";
    } else {
      olt = textoORepo(col("OLT"));
      tarjeta = textoORepo(col("Tarjeta"));
      puerto = textoORepo(col("PUERTO"));
      sector = textoORepo(col("UBICACION"));
      edificio = textoORepo(col("NOMBRE DEL EDIFICIO (SI APLICA)"));
    }

    const registro = {
      ticket_cmr: ticketCmr,
      oficina_id: of ? of.id : null,
      olt, tarjeta, puerto, sector, edificio,
      no_clientes_reportaron: numeroRepo(col("N° CLIENTES QUE REPORTARON FALLA")),
      nro_clientes_afectados: numeroRepo(col("CANTIDAD DE CLIENTES AFECTADOS")),
      estado_puerto: textoORepo(col("ESTADO DEL TICKET"), "CERRADO").toUpperCase(),
    };
    const clave = [ticketCmr, registro.oficina_id, olt, tarjeta, puerto, sector, edificio,
      registro.no_clientes_reportaron, registro.nro_clientes_afectados].join("|");
    if (vistas.has(clave)) { stats.duplicadas += 1; return; }
    vistas.add(clave);
    puertos.push(registro);
  });

  const tickets = Array.from(ticketsMap.values()).map((t) => ({ ...t, estado_ticket: t.estado_ticket || "CERRADO" }));
  return { tickets, puertos, stats };
}

// Reparte tickets (con sus puertos) en lotes para no mandar todo en una sola petición.
function dividirEnLotesRepo(tickets, puertos, tam = 100) {
  const porTicket = new Map();
  puertos.forEach((p) => {
    if (!porTicket.has(p.ticket_cmr)) porTicket.set(p.ticket_cmr, []);
    porTicket.get(p.ticket_cmr).push(p);
  });
  const lotes = [];
  for (let i = 0; i < tickets.length; i += tam) {
    const t = tickets.slice(i, i + tam);
    lotes.push({ tickets: t, puertos: t.flatMap((x) => porTicket.get(x.ticket_cmr) || []) });
  }
  return lotes;
}
// REPO-PURE-END

async function leerArchivoRepositorio(file) {
  if (file.name.toLowerCase().endsWith(".csv")) {
    const texto = await file.text();
    return XLSX.read(texto, { type: "string" });
  }
  const buffer = await file.arrayBuffer();
  return XLSX.read(buffer, { type: "array" });   // sin cellDates: las fechas llegan como serial y se convierten sin zona horaria
}

let repoParsed = { tickets: [], puertos: [] };

async function analizarArchivoRepositorio() {
  const msg = document.getElementById("repo_msg_analisis");
  document.getElementById("repo_preview").classList.add("hidden");
  document.getElementById("repo_resultado").innerHTML = "";
  const file = document.getElementById("repo_archivo").files[0];
  if (!file) { showMsg(msg, "Selecciona un archivo primero.", false); return; }

  try {
    const wb = await leerArchivoRepositorio(file);
    const hoja = wb.Sheets[wb.SheetNames[0]];
    const filasCrudas = XLSX.utils.sheet_to_json(hoja, { defval: null });
    const { tickets, puertos, stats } = construirRegistrosRepo(filasCrudas, {
      oficinas: LOOKUPS.oficinas,
      categorias: LOOKUPS.categorias,
    });
    repoParsed = { tickets, puertos };

    document.getElementById("repo_prev_tickets").textContent = tickets.length;
    document.getElementById("repo_prev_puertos").textContent = puertos.length;
    document.getElementById("repo_prev_sin_oficina").textContent = stats.sinOficina;
    document.getElementById("repo_prev_invalidas").textContent = stats.invalidas;
    document.getElementById("repo_prev_duplicadas").textContent = stats.duplicadas;
    document.getElementById("repo_prev_fechas").textContent = stats.fechasIlegibles;
    document.getElementById("repo_preview").classList.remove("hidden");
    showMsg(msg, "Archivo analizado correctamente. Revisa el resumen y confirma para importar.", true);
  } catch (err) {
    showMsg(msg, "No se pudo leer el archivo: " + err.message, false);
  }
}

document.getElementById("repo_btn_analizar").addEventListener("click", analizarArchivoRepositorio);

document.getElementById("repo_btn_importar").addEventListener("click", async () => {
  const cont = document.getElementById("repo_resultado");
  const btn = document.getElementById("repo_btn_importar");
  btn.disabled = true;
  cont.innerHTML = "";

  const total = { tickets_recibidos: 0, tickets_insertados: 0, tickets_ya_existian: 0, puertos_recibidos: 0,
    puertos_insertados: 0, puertos_ya_existian: 0, puertos_sin_ticket: 0, puertos_sin_oficina_reconocida: 0 };
  const lotes = dividirEnLotesRepo(repoParsed.tickets, repoParsed.puertos, 100);
  let error = null;
  for (let i = 0; i < lotes.length; i++) {
    btn.textContent = `Importando ${i + 1} de ${lotes.length}...`;
    try {
      const r = await apiSend("/admin/importar", "POST", lotes[i]);
      for (const k of Object.keys(total)) total[k] += r[k] || 0;
    } catch (err) {
      error = `Se detuvo en el lote ${i + 1} de ${lotes.length}: ${err.message}. Lo ya importado quedó guardado; puedes volver a subir el archivo y continuará sin duplicar.`;
      break;
    }
  }

  cont.innerHTML = `
    ${error ? `<div class="msg error">${error}</div>` : ""}
    <div class="ticket-card">
      <h3>${error ? "Importación incompleta" : "Importación completada"}</h3>
      <div class="kv">
        <div><span>Tickets recibidos:</span> ${total.tickets_recibidos}</div>
        <div><span>Tickets nuevos insertados:</span> ${total.tickets_insertados}</div>
        <div><span>Tickets que ya existían (no se tocan):</span> ${total.tickets_ya_existian}</div>
        <div><span>Filas de detalle recibidas:</span> ${total.puertos_recibidos}</div>
        <div><span>Filas de detalle nuevas insertadas:</span> ${total.puertos_insertados}</div>
        <div><span>Filas omitidas (el ticket ya tenía detalle):</span> ${total.puertos_ya_existian}</div>
        <div><span>Filas sin ticket válido:</span> ${total.puertos_sin_ticket}</div>
        <div><span>Filas con oficina no reconocida:</span> ${total.puertos_sin_oficina_reconocida}</div>
      </div>
    </div>`;
  btn.disabled = false;
  btn.textContent = "2. Confirmar e Importar";
});

iniciarSesionApp();
