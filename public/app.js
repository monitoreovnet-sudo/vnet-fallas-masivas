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
function formatearTicket(numero) {
  if (!numero) return "";
  return String(numero).replace(/\B(?=(\d{3})+(?!\d))/g, " ");
}

// ---------------------------------------------------------------
// Pestañas
// ---------------------------------------------------------------
document.querySelectorAll(".tab-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".tab-btn").forEach((b) => b.classList.remove("active"));
    document.querySelectorAll(".tab-panel").forEach((p) => p.classList.remove("active"));
    btn.classList.add("active");
    document.getElementById("tab-" + btn.dataset.tab).classList.add("active");
  });
});

// ---------------------------------------------------------------
// Catálogos globales
// ---------------------------------------------------------------
let LOOKUPS = null;

async function loadLookups() {
  LOOKUPS = await apiGet("/lookups");

  fillSelect(document.getElementById("c_estado_ticket"), LOOKUPS.estados_ticket, { valueKey: "nombre" });
  fillSelect(document.getElementById("c_unidad_resolutoria"), LOOKUPS.unidades_resolutorias, { valueKey: "nombre" });
  fillSelect(document.getElementById("c_categoria"), LOOKUPS.categorias, { valueKey: "id" });
  fillSelect(document.getElementById("c_comentario"), LOOKUPS.comentarios, { valueKey: "nombre" });
  fillSelect(document.getElementById("add_oficina_select"), LOOKUPS.oficinas, { valueKey: "id" });

  fillSelect(document.getElementById("mc_estado"), LOOKUPS.estados_ticket, { valueKey: "nombre" });

  actualizarVisibilidadOficinas();
  initFiltrosConsulta();
  cargarConsulta();
}

document.getElementById("c_categoria").addEventListener("change", (e) => {
  const catId = e.target.value;
  const afectaciones = LOOKUPS.afectaciones.filter((a) => String(a.categoria_id) === String(catId));
  fillSelect(document.getElementById("c_afectacion"), afectaciones, { valueKey: "nombre" });
  actualizarVisibilidadOficinas();
});

// Nombre exacto de la categoría que habilita el flujo de Oficinas/OLT.
const CATEGORIA_INTERNET_PLEY = "Soporte Técnico (Internet / Pley)";
// Nombre exacto de la oficina comodín (sin localidad, para soporte que no aplica a una oficina real).
const OFICINA_COMODIN_NOMBRE = "1. Soporte técnico, pero no aplica";

function categoriaEsInternetPley() {
  const catId = document.getElementById("c_categoria").value;
  const cat = LOOKUPS.categorias.find((c) => String(c.id) === String(catId));
  return !!cat && cat.nombre === CATEGORIA_INTERNET_PLEY;
}

function oficinaComodinId() {
  const of = (LOOKUPS.oficinas || []).find((o) => o.nombre === OFICINA_COMODIN_NOMBRE);
  return of ? String(of.id) : null;
}

// Muestra/oculta "Oficinas afectadas" según la categoría, y muestra los
// campos alternos (Nro Afectados / Nro Reportaron a nivel de ticket)
// cuando la categoría NO es Soporte Técnico (Internet/Pley).
function actualizarVisibilidadOficinas() {
  const esInternet = categoriaEsInternetPley();
  document.getElementById("oficinas_section").classList.toggle("hidden", !esInternet);
  document.getElementById("otros_categoria_block").classList.toggle("hidden", esInternet);
}

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
  const esComodin = String(oficinaId) === oficinaComodinId();

  let oltsCatalogo = [];
  if (!esComodin) {
    try {
      const data = await apiSend("/lookups", "POST", { oficina_id: oficinaId });
      oltsCatalogo = data.olts.map((o) => o.codigo);
    } catch (e) { /* si falla el autocompletado no bloquea el flujo */ }
  }

  oficinasState.push({
    oficina_id: oficinaId,
    nombre,
    es_comodin: esComodin,
    olts_catalogo: oltsCatalogo,
    // Solo se usan cuando es_comodin = true (sin OLT/Tarjeta/Puerto).
    comodin_no_reportaron: 0,
    comodin_nro_afectados: 0,
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

    // Oficina comodín: sin OLT/Tarjeta/Puerto, solo dos campos simples.
    if (of.es_comodin) {
      oltsGrid.innerHTML = `
        <div class="field">
          <label>Nro de afectados</label>
          <input type="number" min="0" class="comodin-nro-afectados" value="${of.comodin_nro_afectados}" />
        </div>
        <div class="field">
          <label>Nro Personas que reportaron la falla</label>
          <input type="number" min="0" class="comodin-no-reportaron" value="${of.comodin_no_reportaron}" />
        </div>
      `;
      oltsGrid.querySelector(".comodin-nro-afectados").addEventListener("input", (e) => {
        of.comodin_nro_afectados = Number(e.target.value || 0);
      });
      oltsGrid.querySelector(".comodin-no-reportaron").addEventListener("input", (e) => {
        of.comodin_no_reportaron = Number(e.target.value || 0);
      });
      cont.appendChild(box);
      return;
    }

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

// Convierte el árbol en la lista plana que espera la API: una fila por
// cada combinación Oficina + OLT + Tarjeta + Puerto. La oficina comodín
// genera una única fila sintética (sin OLT/Tarjeta/Puerto reales).
function flattenOficinas() {
  const puertos = [];
  for (const of of oficinasState) {
    if (of.es_comodin) {
      puertos.push({
        oficina_id: of.oficina_id,
        olt: "N/A",
        tarjeta: "N/A",
        puerto: "N/A",
        sector: "DESCONOCIDO",
        edificio: "DESCONOCIDO",
        no_clientes_reportaron: Number(of.comodin_no_reportaron || 0),
        nro_clientes_afectados: Number(of.comodin_nro_afectados || 0),
      });
      continue;
    }
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

// Cuando la categoría NO es Soporte Técnico (Internet/Pley), no hay
// oficinas ni OLT: se genera una única fila sintética con los campos
// alternos a nivel de ticket.
function construirPuertosSinOficina() {
  return [{
    oficina_id: null,
    olt: "N/A",
    tarjeta: "N/A",
    puerto: "N/A",
    sector: "DESCONOCIDO",
    edificio: "DESCONOCIDO",
    no_clientes_reportaron: Number(document.getElementById("c_otros_no_reportaron").value || 0),
    nro_clientes_afectados: Number(document.getElementById("c_otros_nro_afectados").value || 0),
  }];
}

document.getElementById("btn_crear_ticket").addEventListener("click", async () => {
  const msg = document.getElementById("crear_msg");
  try {
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
      puertos: categoriaEsInternetPley() ? flattenOficinas() : construirPuertosSinOficina(),
    };
    if (payload.puertos.length === 0) {
      throw new Error("Agrega al menos una oficina, con al menos un OLT, tarjeta y puerto.");
    }
    const res = await apiSend("/tickets", "POST", payload);
    showMsg(msg, `Ticket ${res.ticket_cmr} creado correctamente (#${res.id}) con ${payload.puertos.length} puerto(s).`, true);
    oficinasState = [];
    renderOficinas();
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
}

async function mcBuscarYMostrar(alcance) {
  const msg = document.getElementById("mc_msg_busqueda");
  const resultMsg = document.getElementById("mc_msg");
  resultMsg.textContent = "";
  mcOcultarEscenarios();

  const cmr = document.getElementById("mc_ticket").value.trim();
  const estado = document.getElementById("mc_estado").value;
  if (!cmr) { showMsg(msg, "Ingrese el número de ticket.", false); return; }
  if (!estado) { showMsg(msg, "Seleccione el nuevo estado del ticket.", false); return; }

  try {
    const data = await apiGet(`/tickets/${encodeURIComponent(cmr)}`);
    mcTicket = data.ticket;
    mcPuertos = data.puertos;
    msg.textContent = "";

    const esCerrado = estado === "CERRADO";
    mcEscenario = esCerrado ? (alcance === "MASIVO" ? 3 : 4) : (alcance === "MASIVO" ? 1 : 2);

    if (mcEscenario === 1) mcRenderEscenario1();
    else if (mcEscenario === 2) mcRenderEscenario2();
    else if (mcEscenario === 3) mcRenderEscenario3();
    else mcRenderEscenario4();
  } catch (err) {
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
  document.getElementById("e1_avance").value = "";
  document.getElementById("mc_escenario_1").classList.remove("hidden");
}

document.getElementById("e1_btn_guardar").addEventListener("click", async () => {
  const msg = document.getElementById("mc_msg");
  try {
    const body = { estado_ticket: document.getElementById("mc_estado").value };
    const fechaCmr = document.getElementById("e1_fecha_cmr").value;
    const fechaCda = document.getElementById("e1_fecha_cda").value;
    const unidad = document.getElementById("e1_unidad_resolutoria").value;
    const avance = document.getElementById("e1_avance").value.trim();
    if (fechaCmr) body.fecha_apertura_cmr = fechaCmr;
    if (fechaCda) body.fecha_apertura_cda = fechaCda;
    if (unidad) body.unidad_resolutoria = unidad;
    if (avance) body.avance_cmr = avance;

    await apiSend(`/tickets/${mcTicket.id}/masivo`, "PATCH", body);
    showMsg(msg, `Ticket ${mcTicket.ticket_cmr} actualizado correctamente (modificación masiva).`, true);
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
  } catch (err) {
    showMsg(msg, err.message, false);
  }
});

// ---------------------------------------------------------------
// CONSULTAR / LOG
// ---------------------------------------------------------------
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
    cont.innerHTML = "";
    const t = detalle.ticket;
    const card = document.createElement("div");
    card.className = "ticket-card";
    card.innerHTML = `
      <h3>Ticket ${formatearTicket(t.ticket_cmr)} <span class="badge">${t.estado_ticket}</span></h3>
      <div class="kv">
        <div><span>Oficina:</span> ${t.oficina_nombre || "-"}</div>
        <div><span>Unidad Resolutoria:</span> ${t.unidad_resolutoria || "-"}</div>
        <div><span>Categoría:</span> ${t.categoria_afectacion || "-"}</div>
        <div><span>Afectación:</span> ${t.afectacion || "-"}</div>
        <div><span>Apertura CDA:</span> ${t.fecha_apertura_cda || "-"}</div>
        <div><span>Apertura CMR:</span> ${t.fecha_apertura_cmr || "-"}</div>
        <div><span>Solución CDA:</span> ${t.fecha_solucion_cda || "-"}</div>
        <div><span>Solución CMR:</span> ${t.fecha_solucion_cmr || "-"}</div>
      </div>
      <p><strong>Descripción:</strong> ${t.descripcion || "-"}</p>
      <p><strong>Avance del CMR:</strong> ${t.avance_cmr || "-"}</p>
    `;
    cont.appendChild(card);

    const tbl = document.createElement("table");
    tbl.className = "rows-table";
    tbl.innerHTML = `
      <thead><tr><th>OLT</th><th>Tarjeta</th><th>Puerto</th><th>Sector</th><th>Edificio</th>
      <th>No. Reportaron</th><th>Nro. Afectados</th><th>Estado</th></tr></thead>
      <tbody>${detalle.puertos.map((p) => `
        <tr><td>${p.olt}</td><td>${p.tarjeta}</td><td>${p.puerto}</td><td>${p.sector}</td>
        <td>${p.edificio}</td><td>${p.no_clientes_reportaron}</td><td>${p.nro_clientes_afectados}</td>
        <td>${p.estado_puerto}</td></tr>`).join("")}
      </tbody>
    `;
    cont.appendChild(tbl);

    const logTitle = document.createElement("h3");
    logTitle.textContent = "Log de cambios";
    cont.appendChild(logTitle);

    logData.log.forEach((l) => {
      const div = document.createElement("div");
      div.className = "log-entry";
      const detalleCampo = l.ticket_puerto_id ? `[${l.olt} | ${l.tarjeta} | ${l.puerto}] ` : "";
      div.innerHTML = `
        <div>${detalleCampo}<strong>${l.campo}</strong>: ${l.valor_anterior ?? "-"} → ${l.valor_nuevo ?? "-"}</div>
        <div class="meta">${l.tipo_cambio} · ${l.usuario_email} · ${l.fecha}</div>
      `;
      cont.appendChild(div);
    });
  } catch (err) {
    cont.innerHTML = `<div class="msg error">${err.message}</div>`;
  }
}

// --- Filtros y tabla principal ---
const MESES = ["Enero","Febrero","Marzo","Abril","Mayo","Junio","Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"];

function llenarSelectSimple(id, opciones, placeholder) {
  const el = document.getElementById(id);
  el.innerHTML = `<option value="">${placeholder}</option>` + opciones.map((o) => `<option value="${o.value}">${o.label}</option>`).join("");
}

function initFiltrosConsulta() {
  llenarSelectSimple("cl_dia_apertura", Array.from({length:31},(_,i)=>({value:i+1,label:i+1})), "Día");
  llenarSelectSimple("cl_dia_cierre", Array.from({length:31},(_,i)=>({value:i+1,label:i+1})), "Día");
  llenarSelectSimple("cl_mes_apertura", MESES.map((m,i)=>({value:i+1,label:m})), "Mes");
  llenarSelectSimple("cl_mes_cierre", MESES.map((m,i)=>({value:i+1,label:m})), "Mes");
  const anioActual = new Date().getFullYear();
  const anios = Array.from({length:6},(_,i)=>({value:anioActual-4+i,label:anioActual-4+i}));
  llenarSelectSimple("cl_anio_apertura", anios, "Año");
  llenarSelectSimple("cl_anio_cierre", anios, "Año");

  llenarSelectSimple("cl_categoria", LOOKUPS.categorias.map((c)=>({value:c.nombre,label:c.nombre})), "Todas");
  llenarSelectSimple("cl_afectacion", LOOKUPS.afectaciones.map((a)=>({value:a.nombre,label:a.nombre})), "Todas");
  llenarSelectSimple("cl_grupo_horario", ["MAÑANA","TARDE","NOCHE"].map((g)=>({value:g,label:g})), "Todos");
  llenarSelectSimple("cl_semaforo", ["VERDE","AMARILLO","NARANJA","ROJO"].map((s)=>({value:s,label:s})), "Todos");
  llenarSelectSimple("cl_unidad", LOOKUPS.unidades_resolutorias.map((u)=>({value:u.nombre,label:u.nombre})), "Todas");
  llenarSelectSimple("cl_oficina", LOOKUPS.oficinas.map((o)=>({value:o.id,label:o.nombre})), "Todas");
  llenarSelectSimple("cl_olt", LOOKUPS.olts.map((o)=>({value:o.codigo,label:o.codigo})), "Todos");

  const estadoEl = document.getElementById("cl_estado");
  estadoEl.innerHTML = `<option value="">Todos</option><option value="__ABIERTOS__" selected>Distinto de Cerrado</option>` +
    LOOKUPS.estados_ticket.map((e)=>`<option value="${e.nombre}">${e.nombre}</option>`).join("");
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

async function cargarConsulta() {
  const tbody = document.querySelector("#cl_table tbody");
  const contador = document.getElementById("cl_contador");
  tbody.innerHTML = `<tr><td colspan="20">Cargando...</td></tr>`;
  try {
    const data = await apiGet(`/consulta?${construirQueryConsulta()}`);
    tbody.innerHTML = "";
    data.filas.forEach((f) => {
      const tr = document.createElement("tr");
      tr.className = f.semaforo ? `sem-${f.semaforo}` : "";
      tr.style.cursor = "pointer";
      tr.title = "Doble click para ver el log";
      tr.innerHTML = `
        <td><strong>${formatearTicket(f.ticket_cmr)}</strong></td>
        <td>${f.tickets_vinculados ? formatearTicket(f.tickets_vinculados) : "-"}</td>
        <td>${f.fecha_apertura_cda || "-"}</td>
        <td>${f.fecha_apertura_cmr || "-"}</td>
        <td>${f.estado_ticket}</td>
        <td>${f.unidad_resolutoria || "-"}</td>
        <td>${f.categoria_afectacion || "-"}</td>
        <td>${f.afectacion || "-"}</td>
        <td>${f.comentario || "-"}</td>
        <td>${f.descripcion || "-"}</td>
        <td>${f.nro_clientes_afectados}</td>
        <td>${f.no_clientes_reportaron}</td>
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
      tbody.appendChild(tr);
    });
    contador.textContent = `${data.filas.length} registro(s) encontrados.`;
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="20" class="msg error">${err.message}</td></tr>`;
  }
}

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

async function loadCurrentUser() {
  try {
    currentUser = await apiGet("/me");
  } catch (e) {
    currentUser = { email: null, rol: "consultor", registrado: false };
  }
  if (currentUser.rol === "consultor") {
    ["crear", "modificar"].forEach((tab) => {
      document.querySelector(`.tab-btn[data-tab="${tab}"]`)?.classList.add("hidden");
    });
    if (document.querySelector(".tab-btn.active")?.classList.contains("hidden")) {
      document.querySelector('.tab-btn[data-tab="consultar"]')?.click();
    }
  }
  if (currentUser.rol === "administrador") {
    document.getElementById("nav_admin").classList.remove("hidden");
    cargarUsuarios();
    initCatalogosUI();
  }
}

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
            <option value="consultor" ${u.rol === "consultor" ? "selected" : ""}>consultor</option>
            <option value="supervisor" ${u.rol === "supervisor" ? "selected" : ""}>supervisor</option>
            <option value="administrador" ${u.rol === "administrador" ? "selected" : ""}>administrador</option>
          </select>
        </td>
        <td><input type="checkbox" class="adm-activo" ${u.activo ? "checked" : ""} /></td>
        <td>
          <button type="button" class="btn-secondary adm-guardar">Guardar</button>
          <button type="button" class="btn-secondary adm-eliminar">Eliminar</button>
        </td>
      `;
      tr.querySelector(".adm-guardar").addEventListener("click", async () => {
        try {
          await apiSend(`/admin/usuarios/${u.id}`, "PATCH", {
            nombre: tr.querySelector(".adm-nombre").value,
            rol: tr.querySelector(".adm-rol-sel").value,
            activo: tr.querySelector(".adm-activo").checked,
          });
          showMsg(document.getElementById("adm_msg"), `Usuario ${u.email} actualizado.`, true);
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
    });
    document.getElementById("adm_email").value = "";
    document.getElementById("adm_nombre").value = "";
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
    { key: "oficina_id", tipo: "number" }, { key: "codigo", tipo: "text" },
    { key: "num_tarjetas", tipo: "number" }, { key: "puertos_por_tarjeta", tipo: "number" }, { key: "activo", tipo: "bool" },
  ]},
  catalogo_categorias: { label: "Categorías de Afectación", campos: [
    { key: "nombre", tipo: "text" }, { key: "orden", tipo: "number" },
  ]},
  catalogo_afectaciones: { label: "Afectaciones", campos: [
    { key: "categoria_id", tipo: "number" }, { key: "nombre", tipo: "text" }, { key: "orden", tipo: "number" },
  ]},
  catalogo_comentarios: { label: "Comentarios", campos: [
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

function catInputHtml(campo, valor) {
  if (campo.tipo === "bool") {
    return `<input type="checkbox" class="cat-f" data-key="${campo.key}" ${valor ? "checked" : ""} />`;
  }
  if (campo.tipo === "number") {
    return `<input type="number" class="cat-f" data-key="${campo.key}" value="${valor ?? ""}" />`;
  }
  return `<input type="text" class="cat-f" data-key="${campo.key}" value="${valor ?? ""}" />`;
}

function catLeerValores(fila) {
  const valores = {};
  fila.querySelectorAll(".cat-f").forEach((el) => {
    valores[el.dataset.key] = el.type === "checkbox" ? (el.checked ? 1 : 0) : el.value;
  });
  return valores;
}

async function cargarCatalogo(tabla) {
  const config = CATALOGOS_UI[tabla];
  const thead = document.getElementById("cat_thead_row");
  const addRow = document.getElementById("cat_add_row");
  thead.innerHTML = config.campos.map((c) => `<th>${c.key}</th>`).join("") + "<th></th>";
  addRow.innerHTML = config.campos.map((c) => `<div class="field"><label>${c.key}</label>${catInputHtml(c, "")}</div>`).join("");

  const tbody = document.querySelector("#cat_table tbody");
  tbody.innerHTML = "";
  try {
    const data = await apiGet(`/admin/catalogos/${tabla}`);
    data.filas.forEach((fila) => {
      const tr = document.createElement("tr");
      tr.innerHTML = config.campos.map((c) => `<td>${catInputHtml(c, fila[c.key])}</td>`).join("") +
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
// Arranque
// ---------------------------------------------------------------
loadLookups().catch((err) => console.error("Error cargando catálogos:", err));
loadCurrentUser();
