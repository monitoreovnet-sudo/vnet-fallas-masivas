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
  if (!r.ok) throw new Error(data.error || "Error de solicitud");
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

// Formatea un número de ticket con un espacio visual cada 3 dígitos
// (de derecha a izquierda), únicamente para lectura en pantallas de
// consulta/log/dashboard. Nunca se usa este valor para guardar ni buscar.
// El Nº de ticket es el ÚNICO número que NO lleva separador de miles.
function formatearTicket(numero) {
  if (!numero) return "";
  return String(numero).trim();
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
function ajustarTodasLasTablas() { ["piz_table", "rep_table"].forEach((id) => ajustarAlturaTabla(id)); }
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
    ajustarTodasLasTablas();
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

document.getElementById("btn_crear_ticket").addEventListener("click", async () => {
  const msg = document.getElementById("crear_msg");
  try {
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
    const res = await apiSend("/tickets", "POST", payload);
    showMsg(msg, `Ticket ${res.ticket_cmr} creado correctamente (#${res.id}) con ${payload.puertos.length} puerto(s).`, true);
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
// MODIFICAR / CERRAR TICKET (UNIFICADA) — 4 escenarios:
//   estado === "CERRADO"  ×  alcance === "MASIVO"
// ---------------------------------------------------------------
let mcTicket = null;
let mcPuertos = [];
let mcEscenario = null; // 1, 2, 3 o 4

function mcOcultarEscenarios() {
  [1, 2, 3, 4].forEach((n) => document.getElementById(`mc_escenario_${n}`).classList.add("hidden"));
  document.getElementById("mc_enlace").classList.add("hidden");
}

// Paso 1: "Cambio de Campo o Cierre de Ticket" (al elegir, aparecen el Nº de ticket y los dos botones)
//   CAMPO  -> indicadores + campos editables (masivo) o tabla por registro (puntual)
//   CIERRE -> solo fechas de cierre (todo el ticket, o los registros marcados)
function mcLlenarAccion() { document.getElementById("mc_accion").value = ""; }
function mcAccionActual() {
  const v = document.getElementById("mc_accion").value;
  return { cerrado: v === "CIERRE", estado: v === "CIERRE" ? "CERRADO" : null, elegida: !!v };
}
function mcFechaCorta(v) { return v ? formatearFechaHora(v) : "-"; }

// Estados que se pueden asignar con "Cambio de campo" (CERRADO se hace por "Cierre de Ticket")
function mcLlenarEstados(select, textoVacio, actual) {
  select.innerHTML = "";
  if (textoVacio) { const o = document.createElement("option"); o.value = ""; o.textContent = textoVacio; select.appendChild(o); }
  (LOOKUPS.estados_ticket || []).map((e) => e.nombre).filter((n) => n !== "CERRADO").forEach((n) => {
    const o = document.createElement("option"); o.value = n; o.textContent = n; select.appendChild(o);
  });
  if (actual !== undefined && actual !== null) select.value = actual;
}
// Indicadores de lectura rápida del ticket (solo en "Cambio de campo").
// Los clientes siguen la lógica de los tableros (1.er registro del ticket).
function mcRenderCards() {
  const c = document.getElementById("mc_cards");
  if (!mcTicket || mcAccionActual().cerrado || !mcAccionActual().elegida) { c.classList.add("hidden"); return; }
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
// Dibuja el formulario que corresponde a (alcance, acción elegida)
function mcRenderSegunAccion() {
  mcOcultarEscenarios();
  const { cerrado, estado } = mcAccionActual();
  if (mcEsEnlace(mcPuertos)) {         // ENLACE / TRAMO / TRONCAL: pantalla propia
    mcRenderEnlace(mcAlcance, cerrado, estado);
    return;
  }
  mcEscenario = cerrado ? (mcAlcance === "MASIVO" ? 3 : 4) : (mcAlcance === "MASIVO" ? 1 : 2);
  if (mcEscenario === 1) mcRenderEscenario1();
  else if (mcEscenario === 2) mcRenderEscenario2();
  else if (mcEscenario === 3) mcRenderEscenario3();
  else mcRenderEscenario4();
}
// Al cambiar el paso 1 se limpia la pantalla: solo queda el Nº de ticket y los botones
document.getElementById("mc_accion").addEventListener("change", () => {
  mcTicket = null; mcPuertos = [];
  mcOcultarEscenarios();
  document.getElementById("mc_cards").classList.add("hidden");
  document.getElementById("mc_msg").textContent = "";
  document.getElementById("mc_msg_busqueda").textContent = "";
  document.getElementById("mc_paso2").classList.toggle("hidden", !mcAccionActual().elegida);
});

async function mcBuscarYMostrar(alcance) {
  const msg = document.getElementById("mc_msg_busqueda");
  const resultMsg = document.getElementById("mc_msg");
  resultMsg.textContent = "";
  mcOcultarEscenarios();

  const cmr = document.getElementById("mc_ticket").value.trim();
  if (!mcAccionActual().elegida) { showMsg(msg, "Elige primero: Cierre de Ticket o Cambio de Campo.", false); return; }
  if (!cmr) { showMsg(msg, "Ingrese el número de ticket.", false); return; }

  try {
    const data = await apiGet(`/tickets/${encodeURIComponent(cmr)}`);
    mcTicket = data.ticket;
    mcPuertos = data.puertos;
    mcAlcance = alcance;
    msg.textContent = "";
    mcRenderCards();
    mcRenderSegunAccion();
  } catch (err) {
    mcTicket = null;
    mcRenderCards();
    showMsg(msg, err.message, false);
  }
}

document.getElementById("mc_btn_masivo").addEventListener("click", () => mcBuscarYMostrar("MASIVO"));
document.getElementById("mc_btn_puertos").addEventListener("click", () => mcBuscarYMostrar("PUERTOS"));

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
    await mcRefrescarTicket();
  } catch (err) {
    showMsg(msg, err.message, false);
  }
});

// --- Escenario 2: <> Cerrado + Por Puertos ---
function mcRenderEscenario2() {
  const tbody = document.querySelector("#e2_table tbody");
  tbody.innerHTML = "";
  const estados = LOOKUPS.estados_puerto.map((e) => e.nombre);
  const oficinas = LOOKUPS.oficinas;

  mcPuertos.forEach((p, idx) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>
        <div class="hint">${p.oficina_nombre || "-"}</div>
        <select class="e2-oficina" data-idx="${idx}">
          <option value="${p.oficina_id || ""}" selected>${p.oficina_nombre || "Sin oficina"}</option>
          ${oficinas.filter((o) => o.id !== p.oficina_id).map((o) => `<option value="${o.id}">${o.nombre}</option>`).join("")}
        </select>
      </td>
      <td><div class="hint">${p.olt}</div><input class="e2-olt" data-idx="${idx}" value="${p.olt}" /></td>
      <td><div class="hint">${p.tarjeta}</div><input class="e2-tarjeta" data-idx="${idx}" value="${p.tarjeta}" /></td>
      <td><div class="hint">${p.puerto}</div><input class="e2-puerto" data-idx="${idx}" value="${p.puerto}" /></td>
      <td>
        <div class="hint">${p.estado_puerto}</div>
        <select class="e2-estado" data-idx="${idx}">
          ${estados.map((e) => `<option value="${e}" ${e === p.estado_puerto ? "selected" : ""}>${e}</option>`).join("")}
        </select>
      </td>
    `;
    tbody.appendChild(tr);
  });
  document.getElementById("mc_escenario_2").classList.remove("hidden");
}

document.getElementById("e2_btn_guardar").addEventListener("click", async () => {
  const msg = document.getElementById("mc_msg");
  const tbody = document.querySelector("#e2_table tbody");
  const cambios = [];

  mcPuertos.forEach((p, idx) => {
    const oficina_id = tbody.querySelector(`.e2-oficina[data-idx="${idx}"]`).value || null;
    const olt = tbody.querySelector(`.e2-olt[data-idx="${idx}"]`).value;
    const tarjeta = tbody.querySelector(`.e2-tarjeta[data-idx="${idx}"]`).value;
    const puerto = tbody.querySelector(`.e2-puerto[data-idx="${idx}"]`).value;
    const estado_puerto = tbody.querySelector(`.e2-estado[data-idx="${idx}"]`).value;

    const cambio = {};
    if (String(oficina_id || "") !== String(p.oficina_id || "")) cambio.oficina_id = oficina_id;
    if (olt !== p.olt) cambio.olt = olt;
    if (tarjeta !== p.tarjeta) cambio.tarjeta = tarjeta;
    if (puerto !== p.puerto) cambio.puerto = puerto;
    if (estado_puerto !== p.estado_puerto) cambio.estado_puerto = estado_puerto;

    if (Object.keys(cambio).length > 0) cambios.push({ id: p.id, ...cambio });
  });

  if (cambios.length === 0) {
    showMsg(msg, "No hay cambios para guardar: modifica al menos un registro.", false);
    return;
  }
  try {
    await apiSend(`/tickets/${mcTicket.id}/puertos`, "PATCH", { puertos: cambios });
    showMsg(msg, `${cambios.length} registro(s) actualizados correctamente.`, true);
    await mcRefrescarTicket();
  } catch (err) {
    showMsg(msg, err.message, false);
  }
});

// --- Escenario 3: Cerrado + Masivo ---
function mcRenderEscenario3() {
  document.getElementById("e3_fecha_cmr").value = "";
  document.getElementById("e3_fecha_cda").value = "";
  document.getElementById("mc_escenario_3").classList.remove("hidden");
}

document.getElementById("e3_btn_guardar").addEventListener("click", async () => {
  const msg = document.getElementById("mc_msg");
  try {
    const fecha_solucion_cmr = document.getElementById("e3_fecha_cmr").value;
    const fecha_solucion_cda = document.getElementById("e3_fecha_cda").value;
    if (!fecha_solucion_cmr || !fecha_solucion_cda) {
      throw new Error("Indica ambas fechas de cierre (CMR y CDA).");
    }
    await apiSend(`/tickets/${mcTicket.id}/cerrar`, "POST", { fecha_solucion_cmr, fecha_solucion_cda });
    showMsg(msg, `Ticket ${mcTicket.ticket_cmr} cerrado correctamente (cierre masivo).`, true);
    await mcRefrescarTicket();
  } catch (err) {
    showMsg(msg, err.message, false);
  }
});

// --- Escenario 4: Cerrado + Por Puertos ---
function mcRenderEscenario4() {
  document.getElementById("e4_fecha_cmr").value = "";
  document.getElementById("e4_fecha_cda").value = "";
  const tbody = document.querySelector("#e4_table tbody");
  tbody.innerHTML = "";
  mcPuertos.forEach((p, idx) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td><input type="checkbox" class="e4-check" data-idx="${idx}" /></td>
      <td>${p.oficina_nombre || "-"}</td>
      <td>${p.olt}</td>
      <td>${p.tarjeta}</td>
      <td>${p.puerto}</td>
    `;
    tbody.appendChild(tr);
  });
  document.getElementById("mc_escenario_4").classList.remove("hidden");
}

document.getElementById("e4_btn_guardar").addEventListener("click", async () => {
  const msg = document.getElementById("mc_msg");
  try {
    const fecha_cierre_cmr = document.getElementById("e4_fecha_cmr").value;
    const fecha_cierre_cda = document.getElementById("e4_fecha_cda").value;
    if (!fecha_cierre_cmr || !fecha_cierre_cda) {
      throw new Error("Indica ambas fechas de cierre (CMR y CDA).");
    }
    const tbody = document.querySelector("#e4_table tbody");
    const seleccionados = [];
    tbody.querySelectorAll(".e4-check").forEach((chk) => {
      if (!chk.checked) return;
      const idx = Number(chk.dataset.idx);
      seleccionados.push({
        id: mcPuertos[idx].id,
        estado_puerto: "CERRADO",
        fecha_cierre_cmr,
        fecha_cierre_cda,
      });
    });
    if (seleccionados.length === 0) {
      throw new Error("Marca al menos un registro para cerrar.");
    }
    await apiSend(`/tickets/${mcTicket.id}/puertos`, "PATCH", { puertos: seleccionados });
    showMsg(msg, `${seleccionados.length} registro(s) cerrados correctamente.`, true);
    await mcRefrescarTicket();
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
      if (!cierre.cmr || !cierre.cda) throw new Error("Indica ambas fechas de cierre (CMR y CDA) para las filas marcadas.");
      c.estado_puerto = "CERRADO";
      c.fecha_cierre_cmr = cierre.cmr;
      c.fecha_cierre_cda = cierre.cda;
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
    if (!cierre.cmr || !cierre.cda) throw new Error("Indica ambas fechas de cierre (CMR y CDA).");
    cerrarBody = { fecha_solucion_cmr: cierre.cmr, fecha_solucion_cda: cierre.cda };
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
    await mcRefrescarTicket();   // refresca tarjetas y formulario con lo guardado
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

let clDatosActuales = [];   // filas de la última búsqueda mostrada en Consultar / Log

// Vista general (las mismas columnas de la tabla, con los filtros activos). No incluye el detalle del ticket.
function filasExportConsulta() {
  const v = (x) => (x === null || x === undefined ? "" : x);
  return clDatosActuales.map((f) => ({
    "Ticket": f.ticket_cmr,
    "Vinculados": v(f.tickets_vinculados),
    "Apert. CDA": v(f.fecha_apertura_cda),
    "Apert. CMR": f.fecha_apertura_cmr ? formatearFechaHora(f.fecha_apertura_cmr) : "",
    "Estado": v(f.estado_ticket),
    "Unidad Res.": v(f.unidad_resolutoria),
    "Categoría": v(f.categoria_afectacion),
    "Afectación": v(f.afectacion),
    "Comentario": v(f.comentario),
    "Descripción": v(f.descripcion),
    "Nro Afect.": v(f.nro_clientes_afectados),
    "Nro Report.": v(f.no_clientes_reportaron),
    "Oficina": v(f.oficina_nombre),
    "OLT": v(f.olt),
    "Sector": v(f.sector),
    "Edificio": v(f.edificio),
    "Tarjeta": v(f.tarjeta),
    "Puerto": v(f.puerto),
    "Semáforo": v(f.semaforo),
    "Tiempo Cierre (h)": f.tiempo_cierre_horas !== null && f.tiempo_cierre_horas !== undefined ? Number(f.tiempo_cierre_horas.toFixed(1)) : "",
  }));
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

async function cargarConsulta() {
  const tbody = document.querySelector("#cl_table tbody");
  const contador = document.getElementById("cl_contador");
  clSeleccion = new Set();
  clFilas = new Map();
  clDatosActuales = [];
  tbody.innerHTML = `<tr><td colspan="21">Cargando...</td></tr>`;
  try {
    const data = await apiGet(`/consulta?${construirQueryConsulta()}`);
    tbody.innerHTML = "";
    clDatosActuales = data.filas;   // exactamente lo que se ve en la tabla (ya filtrado por el servidor)
    clFechas = data.fechas || { apertura: [], cierre: [] };
    clActualizarFechas("apertura"); clActualizarFechas("cierre");
    data.filas.forEach((f) => {
      const tr = document.createElement("tr");
      tr.className = f.semaforo ? `sem-${f.semaforo}` : "";
      tr.style.cursor = "pointer";
      tr.title = "Doble click para ver el log";
      tr.innerHTML = `
        <td class="cl-sel"><input type="checkbox" class="cl-check" data-ticket="${f.ticket_cmr}" data-registro="${f.puerto_id}" title="Marca todo el ticket. Ctrl+clic: solo este registro." /></td>
        <td><strong>${formatearTicket(f.ticket_cmr)}</strong></td>
        <td>${f.tickets_vinculados ? formatearTicket(f.tickets_vinculados) : "-"}</td>
        <td>${f.fecha_apertura_cda || "-"}</td>
        <td>${formatearFechaHora(f.fecha_apertura_cmr)}</td>
        <td>${f.estado_ticket}</td>
        <td>${f.unidad_resolutoria || "-"}</td>
        <td>${f.categoria_afectacion || "-"}</td>
        <td>${f.afectacion || "-"}</td>
        <td>${f.comentario || "-"}</td>
        <td>${f.descripcion || "-"}</td>
        <td>${formatearMiles(f.nro_clientes_afectados)}</td>
        <td>${formatearMiles(f.no_clientes_reportaron)}</td>
        <td>${f.oficina_nombre || "-"}</td>
        <td>${f.olt}</td>
        <td>${f.sector}</td>
        <td>${f.edificio}</td>
        <td>${f.tarjeta}</td>
        <td>${f.puerto}</td>
        <td>${f.semaforo || "-"}</td>
        <td>${f.tiempo_cierre_horas !== null ? f.tiempo_cierre_horas.toFixed(1) : "-"}</td>
      `;
      tr.addEventListener("dblclick", () => mostrarDetalleTicket(f.ticket_cmr));
      clFilas.set(String(f.puerto_id), { ticket: String(f.ticket_cmr), total: Number(f.total_registros_ticket) || 0 });
      const chk = tr.querySelector(".cl-check");
      chk.addEventListener("dblclick", (e) => e.stopPropagation());
      chk.addEventListener("click", (e) => { e.stopPropagation(); clAlHacerClic(chk, e.ctrlKey || e.metaKey || e.altKey); });
      tbody.appendChild(tr);
    });
    clActualizarSeleccion();
    contador.textContent = `${formatearMiles(data.filas.length)} registro(s) encontrados.`;
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="21" class="msg error">${err.message}</td></tr>`;
  }
}

// ---------------------------------------------------------------
// Consultar / Log: eliminar tickets (solo administrador, con su contraseña)
// ---------------------------------------------------------------
let clSeleccion = new Set();   // ids de REGISTRO (fila de detalle) marcados
let clFilas = new Map();      // id de registro -> { ticket, total de registros que tiene ese ticket en la base }

// Marcar una fila marca todo el ticket (si no había ya filas suyas marcadas); desmarcar quita solo esa fila.
// Ctrl+clic marca únicamente ese registro.
function clAlHacerClic(chk, soloEste) {
  const ticket = chk.dataset.ticket;
  const delTicket = [...document.querySelectorAll(`#cl_table .cl-check[data-ticket="${ticket}"]`)];
  if (chk.checked) {
    const yaHabiaOtras = delTicket.some((c) => c !== chk && c.checked);
    if (!soloEste && !yaHabiaOtras) delTicket.forEach((c) => { c.checked = true; });
  }
  clActualizarSeleccion();
}
function clActualizarSeleccion() {
  const checks = [...document.querySelectorAll("#cl_table .cl-check")];
  clSeleccion = new Set(checks.filter((c) => c.checked).map((c) => c.dataset.registro));
  checks.forEach((c) => c.closest("tr").classList.toggle("cl-fila-sel", c.checked));
  document.getElementById("cl_sel_count").textContent = clSeleccion.size ? `(${clSeleccion.size})` : "";
  document.getElementById("cl_btn_eliminar").disabled = clSeleccion.size === 0;
  document.getElementById("cl_check_todos").checked = checks.length > 0 && clSeleccion.size === checks.length;
}
document.getElementById("cl_check_todos").addEventListener("change", (e) => {
  document.querySelectorAll("#cl_table .cl-check").forEach((c) => { c.checked = e.target.checked; });
  clActualizarSeleccion();
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
function pedirClave(texto, ejecutar) {
  return new Promise((resolve) => {
    const ov = document.getElementById("modal_clave");
    const inp = document.getElementById("modal_clave_input");
    const msg = document.getElementById("modal_clave_msg");
    const ok = document.getElementById("modal_clave_ok");
    const cancelar = document.getElementById("modal_clave_cancelar");
    document.getElementById("modal_clave_texto").textContent = texto;
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
  if (clSeleccion.size === 0) return;
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
  pizarraDatos = []; reporteDatos = [];            // los dashboards se recargan al abrirlos
  await cargarConsulta();
  const sueltosEl = sueltos.reduce((s, x) => s + x.ids.length, 0);
  const partes = [];
  if (completos.length) partes.push(`${res.tickets_eliminados - res.tickets_vaciados} ticket(s) completo(s)`);
  if (sueltosEl) partes.push(`${sueltosEl} registro(s) suelto(s)`);
  if (res.tickets_vaciados) partes.push(`${res.tickets_vaciados} ticket(s) que quedaron sin registros`);
  showMsg(document.getElementById("cl_contador"), `Se eliminaron: ${partes.join(", ")}.`, true);
});

document.getElementById("cl_btn_filtrar").addEventListener("click", cargarConsulta);

document.getElementById("q_btn_volver").addEventListener("click", () => {
  document.getElementById("q_resultado").classList.add("hidden");
  document.getElementById("q_btn_volver").classList.add("hidden");
  document.getElementById("cl_vista_tabla").classList.remove("hidden");
});

// ---------------------------------------------------------------
// Rol del usuario actual: oculta pestañas que no le correspondan
// ---------------------------------------------------------------
let currentUser = null;

const TABS_POR_ROL = {
  analista: ["pizarra", "reporte"],
  especialista: ["crear", "modificar", "pizarra", "reporte"],
  supervisor: ["crear", "modificar", "pizarra", "reporte", "consultar"],
  administrador: ["crear", "modificar", "pizarra", "reporte", "consultar", "admin", "repositorio"],
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
  document.getElementById("cl_table").classList.toggle("cl-admin", esAdminCl);
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
  const datos = prefix === "piz" ? pizarraDatos : reporteDatos;
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
    if (prefix === "piz") await cargarPizarra(); else await cargarReporte();
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
    if (prefix === "piz") await cargarPizarra(); else await cargarReporte();
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

// Estados "activos" de la Pizarra y el Reporte (valor especial del filtro "Estado del Ticket").
const ESTADOS_ACTIVOS = ["EN CURSO (ASIGNADO)", "EN OBSERVACIÓN"];
const VALOR_ACTIVOS = "__ACTIVOS__";
const ETIQUETA_ACTIVOS = "Activos (En curso + En observación)";
function coincideFiltro(f, flt, v) {
  if (flt.id === "estado_ticket" && v === VALOR_ACTIVOS) return ESTADOS_ACTIVOS.includes(f.estado_ticket);
  return String(f[flt.campo] ?? "") === String(v);
}

const FILTROS_CASCADA = [
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
    [{ value: VALOR_ACTIVOS, label: ETIQUETA_ACTIVOS }, ...LOOKUPS.estados_ticket.map((e)=>({value:e.nombre,label:e.nombre}))], "Todos");
  document.getElementById(`${prefix}_estado_ticket`).value = VALOR_ACTIVOS;   // por defecto: solo tickets activos
  llenarSelectSimple(`${prefix}_afectacion`, LOOKUPS.afectaciones.map((a)=>({value:a.nombre,label:a.nombre})), "Todas");
  llenarSelectSimple(`${prefix}_tipo_falla`, LOOKUPS.categorias.map((c)=>({value:c.nombre,label:c.nombre})), "Todos");
  llenarSelectSimple(`${prefix}_unidad`, LOOKUPS.unidades_resolutorias.map((u)=>({value:u.nombre,label:u.nombre})), "Todas");
  llenarSelectSimple(`${prefix}_oficina`, LOOKUPS.oficinas.map((o)=>({value:o.id,label:o.nombre})), "Todas");
  llenarSelectSimple(`${prefix}_semaforo`, ["VERDE","AMARILLO","NARANJA","ROJO"].map((s)=>({value:s,label:s})), "Todos");
  const regiones = Array.from(new Set(LOOKUPS.oficinas.map((o)=>o.estado).filter(Boolean))).sort();
  llenarSelectSimple(`${prefix}_region`, regiones.map((r)=>({value:r,label:r})), "Todos");

  FILTROS_CASCADA.forEach((flt) => {
    document.getElementById(`${prefix}_${flt.id}`).addEventListener("change", () => aplicarFiltros(prefix));
  });
  document.getElementById(`${prefix}_ticket`).addEventListener("input", () => aplicarFiltros(prefix));
}
function initFiltrosPizarra() { initFiltrosGenerico("piz"); }

function valorFiltro(prefix, id) {
  return document.getElementById(`${prefix}_${id}`).value;
}

function filasQueCoincidenExcepto(filas, prefix, idExcluir) {
  return filas.filter((f) => FILTROS_CASCADA.every((flt) => {
    if (flt.id === idExcluir) return true;
    const v = valorFiltro(prefix, flt.id);
    if (!v) return true;
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
    const actual = select.value;
    const placeholder = select.options[0] ? select.options[0].textContent : "Todos";
    const ordenados = Array.from(valores.entries()).sort((a, b) =>
      flt.numerico ? Number(a[0]) - Number(b[0]) : String(a[1]).localeCompare(String(b[1]), "es"));
    const extraActivos = flt.id === "estado_ticket"
      ? `<option value="${VALOR_ACTIVOS}" ${VALOR_ACTIVOS === actual ? "selected" : ""}>${ETIQUETA_ACTIVOS}</option>` : "";
    select.innerHTML = `<option value="">${placeholder}</option>` + extraActivos +
      ordenados.map(([v, l]) => `<option value="${v}" ${v === actual ? "selected" : ""}>${l}</option>`).join("");
    if (![...select.options].some((o) => o.value === actual)) select.value = "";
  });
}

// sinEstado = true: aplica todos los filtros MENOS el de Estado del Ticket (lo usan las tarjetas de estado,
// que siempre deben mostrar el conteo de cada estado aunque la vista esté en "Activos").
function filtrarDatos(filas, prefix, sinEstado = false) {
  const textoTicket = document.getElementById(`${prefix}_ticket`).value.trim();
  return filas.filter((f) => {
    if (textoTicket && !String(f.ticket_cmr).includes(textoTicket)) return false;
    return FILTROS_CASCADA.every((flt) => {
      if (sinEstado && flt.id === "estado_ticket") return true;
      const v = valorFiltro(prefix, flt.id);
      if (!v) return true;
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
  const datosCompletos = prefix === "piz" ? pizarraDatos : reporteDatos;
  const filtrados = filtrarDatos(datosCompletos, prefix);
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
  paso("tabla de tickets", () => (prefix === "piz" ? renderTablaPizarra(filtrados) : renderTablaReporte(filtrados)));
  paso("gráfica de unidades", () => renderChartUnidad(filtrados, `${prefix}_chart_unidad`));
  paso("gráfica de oficinas", () => renderChartOficina(filtrados, `${prefix}_chart_oficina`));
  paso("desglose de activos", () => renderChartDesglose(filtrados, `${prefix}_chart_desglose`));
  paso("filtros", () => actualizarCascada(prefix, datosCompletos));
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
function destruirChart(canvasId) {
  if (chartInstances[canvasId]) { chartInstances[canvasId].destroy(); delete chartInstances[canvasId]; }
}

function escHtml(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
function htmlFallbackBarras(items) {
  const max = Math.max(1, ...items.map((i) => i.valor));
  return `<div class="db-fb-contenedor">${items.map((i) =>
    `<div class="db-fb-row"><span class="db-fb-lbl" title="${escHtml(i.etiqueta)}">${escHtml(i.etiqueta)}</span>` +
    `<span class="db-fb-bar"><i style="width:${(i.valor / max) * 100}%;background:${i.color}"></i></span><b>${formatearMiles(i.valor)}</b></div>`).join("")}</div>`;
}
function htmlFallbackDona(items) {
  const total = items.reduce((s, i) => s + i.valor, 0);
  let acum = 0;
  const tramos = total ? items.map((i) => { const ini = acum; acum += (i.valor / total) * 100; return `${i.color} ${ini}% ${acum}%`; }).join(",") : "#e6e0ee 0 100%";
  return `<div class="db-fb-contenedor"><div class="db-fb-dona" style="background:conic-gradient(${tramos})"></div>` +
    `<div class="db-fb-leyenda">${items.map((i) => `<span><i style="background:${i.color}"></i>${escHtml(i.etiqueta)}: <b>${formatearMiles(i.valor)}</b></span>`).join("")}</div></div>`;
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
  const conteos = cfg.map((c) => unicos.filter((t) => t.semaforo === c.color).length);
  cont.innerHTML = `
    <div class="db-semaforo-bar">
      ${cfg.map((c, i) => `<div class="seg seg-${c.color}" style="flex-grow:${conteos[i]}"><span>${formatearMiles(conteos[i])}</span></div>`).join("")}
    </div>
    <div class="db-semaforo-labels">
      ${cfg.map((c, i) => `<div style="flex-grow:${conteos[i]}">${c.label}</div>`).join("")}
    </div>
  `;
}

function renderChartUnidad(filas, canvasId = "piz_chart_unidad") {
  const unicos = ticketsUnicos(filas);
  const conteo = {};
  ORDEN_UNIDADES.forEach((u) => { conteo[u] = 0; });
  unicos.forEach((t) => {
    if (!t.unidad_resolutoria) return;
    conteo[t.unidad_resolutoria] = (conteo[t.unidad_resolutoria] || 0) + 1;
  });
  const etiquetas = Object.keys(conteo);
  const valores = etiquetas.map((e) => conteo[e]);
  const colores = etiquetas.map((e) => COLORES_UNIDAD[e] || "#cccccc");

  destruirChart(canvasId);
  const el = document.getElementById(canvasId);
  if (!el) return;
  ajustarScrollBarras(el, etiquetas.length);
  crearChartSeguro(canvasId, el, { tipo: "barras", items: etiquetas.map((e, i) => ({ etiqueta: e, valor: valores[i], color: colores[i] })) }, {
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
  const conteo = {};
  unicos.forEach((t) => {
    const o = t.oficina_nombre || "SIN OFICINA";
    conteo[o] = (conteo[o] || 0) + 1;
  });
  const entradas = Object.entries(conteo).sort((a, b) => b[1] - a[1]).slice(0, 10);
  const etiquetas = entradas.map(([n]) => capitalizar(n));
  const valores = entradas.map(([, n]) => n);
  const colores = colorGradienteOficinas(entradas.length);

  destruirChart(canvasId);
  const el = document.getElementById(canvasId);
  if (!el) return;
  ajustarScrollBarras(el, etiquetas.length);
  crearChartSeguro(canvasId, el, { tipo: "barras", items: etiquetas.map((e, i) => ({ etiqueta: e, valor: valores[i], color: colores[i] })) }, {
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
  const cfg = [
    { estado: "VENTANA DE MANTENIMIENTO", label: "Ventana de Mantenimiento", color: "#00A99D" },
    { estado: "EN CURSO (ASIGNADO)", label: "En Curso Asignado", color: "#A6127A" },
    { estado: "EN OBSERVACIÓN", label: "En Observación", color: "#4A1259" },
  ];
  const valores = cfg.map((c) => unicos.filter((t) => t.estado_ticket === c.estado).length);
  const total = valores.reduce((a, b) => a + b, 0) || 1;

  destruirChart(canvasId);
  const el = document.getElementById(canvasId);
  if (!el) return;
  crearChartSeguro(canvasId, el, { tipo: "dona", items: cfg.map((c, i) => ({ etiqueta: c.label, valor: valores[i], color: c.color })) }, {
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
    return `<tr>${vis.map((c) => {
      const [contenido, extra] = celdaDeColumna(c.db_column_name, f, ctx);
      return `<td class="${NOWRAP_COLUMNAS.has(c.db_column_name) ? "col-nowrap" : ""}" data-col="${esc(c.db_column_name)}" style="${estiloCeldaDeColumna(c)}${extra ? ";" + extra : ""}">${contenido}</td>`;
    }).join("")}</tr>`;
  }).join("");
  return { thead, tbody };
}
// REPORTES-PURE-END

let REPORTES_CFG = { piz: null, rep: null };
async function cargarConfigReportes() {
  try {
    const c = await apiGet("/config-reportes");
    REPORTES_CFG = { piz: c.piz || null, rep: c.rep || null };
  } catch (err) {
    console.warn("No se pudo leer la configuración de reportes; se usa la de fábrica.", err);
  }
}
function renderTablaDinamica(prefix, filas) {
  const columnas = columnasEfectivas(prefix, REPORTES_CFG[prefix]);
  const { ordenadas, filaPorTicket } = asignarFilaYColor(filas);
  const { thead, tbody } = htmlTablaDinamica(columnas, ordenadas, (f) => ({ fila: filaPorTicket.get(f.ticket_cmr) }));
  const tabla = document.getElementById(`${prefix}_table`);
  tabla.tHead.innerHTML = thead;
  tabla.tBodies[0].innerHTML = tbody;
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
  exportarExcelGenerico(filasParaExcelDashboard(pizarraDatos), "Pizarra", `pizarra_monitoreo_${fecha}.xlsx`);
});
document.getElementById("piz_btn_csv").addEventListener("click", () => {
  if (pizarraDatos.length === 0) { alert("No hay datos cargados para exportar."); return; }
  const fecha = new Date().toISOString().slice(0, 10);
  exportarCSVGenerico(filasParaExcelDashboard(pizarraDatos), `pizarra_monitoreo_${fecha}.csv`);
});

// ---------------------------------------------------------------
// REPORTE DIARIO DE FALLAS MASIVAS
// ---------------------------------------------------------------
function renderTop5PorEstado(filas, tablaId) {
  const unicos = ticketsUnicos(filas);
  const porEstado = {};
  unicos.forEach((t) => {
    const region = t.region || "SIN ESTADO";
    if (!porEstado[region]) porEstado[region] = { fallas: 0, afectados: 0 };
    porEstado[region].fallas += 1;
    porEstado[region].afectados += Number(t.nro_clientes_afectados || 0);
  });
  const entradas = Object.entries(porEstado).sort((a, b) => b[1].fallas - a[1].fallas);
  const top5 = entradas.slice(0, 5).map(([region, v]) => ({ region, ...v }));
  const resto = entradas.slice(5);
  const filasTabla = [...top5];
  if (resto.length > 0) {
    filasTabla.push({
      region: "Otros",
      fallas: resto.reduce((s, [, v]) => s + v.fallas, 0),
      afectados: resto.reduce((s, [, v]) => s + v.afectados, 0),
    });
  }
  filasTabla.push({
    region: "Total",
    fallas: entradas.reduce((s, [, v]) => s + v.fallas, 0),
    afectados: entradas.reduce((s, [, v]) => s + v.afectados, 0),
  });

  const tbody = document.querySelector(`#${tablaId} tbody`);
  if (!tbody) return;
  tbody.innerHTML = filasTabla.map((f) => `<tr><td>${f.region}</td><td>${formatearMiles(f.fallas)}</td><td>${formatearMiles(f.afectados)}</td></tr>`).join("");
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
    const region = t.region || "SIN ESTADO";
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
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(filasResumenPorEstadoParaExcel(reporteDatos)), "Resumen por Estado");
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(filasDetalleReporteParaExcel(reporteDatos)), "Detalle");
  const fecha = new Date().toISOString().slice(0, 10);
  XLSX.writeFile(wb, `reporte_diario_fallas_${fecha}.xlsx`);
});
document.getElementById("rep_btn_csv").addEventListener("click", () => {
  if (reporteDatos.length === 0) { alert("No hay datos cargados para exportar."); return; }
  const fecha = new Date().toISOString().slice(0, 10);
  exportarCSVGenerico(filasDetalleReporteParaExcel(reporteDatos), `reporte_diario_fallas_${fecha}.csv`);
});

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
