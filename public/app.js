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

  fillSelect(document.getElementById("m_estado_ticket"), LOOKUPS.estados_ticket, { valueKey: "nombre" });
  fillSelect(document.getElementById("m_unidad_resolutoria"), LOOKUPS.unidades_resolutorias, { valueKey: "nombre" });
  fillSelect(document.getElementById("m_oficina"), LOOKUPS.oficinas, { valueKey: "id" });

  actualizarVisibilidadOficinas();
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
      ticket_crm: document.getElementById("c_ticket_crm").value.trim(),
      tickets_vinculados: document.getElementById("c_tickets_vinculados").value.trim(),
      fecha_apertura_cda: document.getElementById("c_fecha_cda").value,
      fecha_apertura_crm: document.getElementById("c_fecha_crm").value,
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
    showMsg(msg, `Ticket ${res.ticket_crm} creado correctamente (#${res.id}) con ${payload.puertos.length} puerto(s).`, true);
    oficinasState = [];
    renderOficinas();
    document.getElementById("c_ticket_crm").value = "";
    document.getElementById("c_otros_no_reportaron").value = "0";
    document.getElementById("c_otros_nro_afectados").value = "0";
  } catch (err) {
    showMsg(msg, err.message, false);
  }
});

// ---------------------------------------------------------------
// MODIFICAR TODO EL TICKET (MASIVO)
// ---------------------------------------------------------------
let masivoTicket = null;

document.getElementById("m_buscar_btn").addEventListener("click", async () => {
  const msg = document.getElementById("masivo_msg");
  const crm = document.getElementById("m_buscar").value.trim();
  msg.textContent = "";
  try {
    const data = await apiGet(`/tickets/${encodeURIComponent(crm)}`);
    masivoTicket = data.ticket;
    document.getElementById("m_estado_ticket").value = masivoTicket.estado_ticket || "";
    document.getElementById("m_olt").value = "";
    document.getElementById("m_unidad_resolutoria").value = masivoTicket.unidad_resolutoria || "";
    document.getElementById("m_oficina").value = masivoTicket.oficina_id || "";
    document.getElementById("m_fecha_cda").value = toLocalInputValue(masivoTicket.fecha_apertura_cda);
    document.getElementById("m_fecha_crm").value = toLocalInputValue(masivoTicket.fecha_apertura_crm);
    document.getElementById("m_avance").value = masivoTicket.avance_cmr || "";
    document.getElementById("m_form").classList.remove("hidden");
  } catch (err) {
    document.getElementById("m_form").classList.add("hidden");
    showMsg(msg, err.message, false);
  }
});

document.getElementById("btn_guardar_masivo").addEventListener("click", async () => {
  const msg = document.getElementById("masivo_msg");
  if (!masivoTicket) return;
  try {
    const body = {
      estado_ticket: document.getElementById("m_estado_ticket").value,
      unidad_resolutoria: document.getElementById("m_unidad_resolutoria").value,
      oficina_id: document.getElementById("m_oficina").value || null,
      fecha_apertura_cda: document.getElementById("m_fecha_cda").value,
      fecha_apertura_crm: document.getElementById("m_fecha_crm").value,
      avance_cmr: document.getElementById("m_avance").value,
    };
    const olt = document.getElementById("m_olt").value.trim();
    if (olt) body.olt = olt;
    await apiSend(`/tickets/${masivoTicket.id}/masivo`, "PATCH", body);
    showMsg(msg, "Ticket actualizado correctamente.", true);
  } catch (err) {
    showMsg(msg, err.message, false);
  }
});

// ---------------------------------------------------------------
// CAMBIAR PUERTOS SELECCIONADOS (INDIVIDUAL)
// ---------------------------------------------------------------
let individualTicket = null;
let individualPuertos = [];

document.getElementById("i_buscar_btn").addEventListener("click", async () => {
  const msg = document.getElementById("individual_msg");
  const crm = document.getElementById("i_buscar").value.trim();
  msg.textContent = "";
  try {
    const data = await apiGet(`/tickets/${encodeURIComponent(crm)}`);
    individualTicket = data.ticket;
    individualPuertos = data.puertos;
    renderIndividualTable();
    document.getElementById("btn_guardar_individual").classList.remove("hidden");
  } catch (err) {
    document.getElementById("btn_guardar_individual").classList.add("hidden");
    document.querySelector("#i_table tbody").innerHTML = "";
    showMsg(msg, err.message, false);
  }
});

function renderIndividualTable() {
  const tbody = document.querySelector("#i_table tbody");
  tbody.innerHTML = "";
  const estados = LOOKUPS.estados_puerto.map((e) => e.nombre);
  individualPuertos.forEach((p, idx) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td><input type="checkbox" class="i-check" data-idx="${idx}" /> ${individualTicket.ticket_crm}</td>
      <td>${p.olt}</td>
      <td><input class="i-tarjeta" data-idx="${idx}" value="${p.tarjeta}" /></td>
      <td><input class="i-puerto" data-idx="${idx}" value="${p.puerto}" /></td>
      <td>
        <select class="i-estado" data-idx="${idx}">
          ${estados.map((e) => `<option value="${e}" ${e === p.estado_puerto ? "selected" : ""}>${e}</option>`).join("")}
        </select>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

document.getElementById("btn_guardar_individual").addEventListener("click", async () => {
  const msg = document.getElementById("individual_msg");
  const tbody = document.querySelector("#i_table tbody");
  const cambios = [];
  tbody.querySelectorAll(".i-check").forEach((chk) => {
    if (!chk.checked) return;
    const idx = Number(chk.dataset.idx);
    const p = individualPuertos[idx];
    const tarjeta = tbody.querySelector(`.i-tarjeta[data-idx="${idx}"]`).value;
    const puerto = tbody.querySelector(`.i-puerto[data-idx="${idx}"]`).value;
    const estado_puerto = tbody.querySelector(`.i-estado[data-idx="${idx}"]`).value;
    cambios.push({ id: p.id, tarjeta, puerto, estado_puerto });
  });
  if (cambios.length === 0) {
    showMsg(msg, "Seleccione al menos un puerto (casilla a la izquierda).", false);
    return;
  }
  try {
    await apiSend(`/tickets/${individualTicket.id}/puertos`, "PATCH", { puertos: cambios });
    showMsg(msg, `${cambios.length} puerto(s) actualizados correctamente.`, true);
  } catch (err) {
    showMsg(msg, err.message, false);
  }
});

// ---------------------------------------------------------------
// CERRAR TICKET
// ---------------------------------------------------------------
document.getElementById("btn_cerrar_ticket").addEventListener("click", async () => {
  const msg = document.getElementById("cerrar_msg");
  const crm = document.getElementById("z_buscar").value.trim();
  try {
    if (!crm) throw new Error("Ingrese el número de ticket a cerrar.");
    await apiSend(`/tickets/${encodeURIComponent(crm)}/cerrar`, "POST", {
      fecha_solucion_crm: document.getElementById("z_fecha_crm").value,
      fecha_solucion_cda: document.getElementById("z_fecha_cda").value,
    });
    showMsg(msg, `Ticket ${crm} cerrado correctamente.`, true);
  } catch (err) {
    showMsg(msg, err.message, false);
  }
});

// ---------------------------------------------------------------
// CONSULTAR / LOG
// ---------------------------------------------------------------
document.getElementById("q_buscar_btn").addEventListener("click", async () => {
  const cont = document.getElementById("q_resultado");
  const crm = document.getElementById("q_buscar").value.trim();
  cont.innerHTML = "";
  try {
    const [detalle, logData] = await Promise.all([
      apiGet(`/tickets/${encodeURIComponent(crm)}`),
      apiGet(`/tickets/${encodeURIComponent(crm)}/log`),
    ]);
    const t = detalle.ticket;
    const card = document.createElement("div");
    card.className = "ticket-card";
    card.innerHTML = `
      <h3>Ticket ${t.ticket_crm} <span class="badge">${t.estado_ticket}</span></h3>
      <div class="kv">
        <div><span>Oficina:</span> ${t.oficina_nombre || "-"}</div>
        <div><span>Unidad Resolutoria:</span> ${t.unidad_resolutoria || "-"}</div>
        <div><span>Categoría:</span> ${t.categoria_afectacion || "-"}</div>
        <div><span>Afectación:</span> ${t.afectacion || "-"}</div>
        <div><span>Apertura CDA:</span> ${t.fecha_apertura_cda || "-"}</div>
        <div><span>Apertura CRM:</span> ${t.fecha_apertura_crm || "-"}</div>
        <div><span>Solución CDA:</span> ${t.fecha_solucion_cda || "-"}</div>
        <div><span>Solución CRM:</span> ${t.fecha_solucion_crm || "-"}</div>
      </div>
      <p><strong>Descripción:</strong> ${t.descripcion || "-"}</p>
      <p><strong>Avance del CRM:</strong> ${t.avance_cmr || "-"}</p>
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
});

// ---------------------------------------------------------------
// Arranque
// ---------------------------------------------------------------
loadLookups().catch((err) => console.error("Error cargando catálogos:", err));
