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
  fillSelect(document.getElementById("c_oficina"), LOOKUPS.oficinas, { valueKey: "id" });

  fillSelect(document.getElementById("m_estado_ticket"), LOOKUPS.estados_ticket, { valueKey: "nombre" });
  fillSelect(document.getElementById("m_unidad_resolutoria"), LOOKUPS.unidades_resolutorias, { valueKey: "nombre" });
  fillSelect(document.getElementById("m_oficina"), LOOKUPS.oficinas, { valueKey: "id" });
}

document.getElementById("c_categoria").addEventListener("change", (e) => {
  const catId = e.target.value;
  const afectaciones = LOOKUPS.afectaciones.filter((a) => String(a.categoria_id) === String(catId));
  fillSelect(document.getElementById("c_afectacion"), afectaciones, { valueKey: "nombre" });
});

// ---------------------------------------------------------------
// CREAR TICKET: OLT / Tarjeta / Puerto dinámicos
// ---------------------------------------------------------------
const rowOlt = document.getElementById("row_olt");
const rowTarjeta = document.getElementById("row_tarjeta");
const rowPuerto = document.getElementById("row_puerto");
let officeOlts = [];
let rows = [];

document.getElementById("c_oficina").addEventListener("change", async (e) => {
  const oficinaId = e.target.value;
  rowOlt.innerHTML = '<option value="">Seleccione:</option>';
  rowTarjeta.innerHTML = "";
  rowPuerto.innerHTML = "";
  if (!oficinaId) return;
  const data = await apiSend("/lookups", "POST", { oficina_id: oficinaId });
  officeOlts = data.olts;
  fillSelect(rowOlt, officeOlts, { valueKey: "codigo", labelKey: "codigo" });
});

function tarjetaOptions(numTarjetas) {
  const opts = [];
  for (let i = 1; i <= numTarjetas; i++) opts.push({ nombre: `Tarjeta ${i}` });
  opts.push({ nombre: "NODO" }, { nombre: "ENLACE" }, { nombre: "TODAS" }, { nombre: "DESCONOCIDO" });
  return opts;
}
function puertoOptions(numPuertos) {
  const opts = [];
  for (let i = 1; i <= numPuertos; i++) opts.push({ nombre: `Puerto ${i}` });
  opts.push({ nombre: "TODOS" }, { nombre: "DESCONOCIDO" });
  return opts;
}

rowOlt.addEventListener("change", () => {
  const olt = officeOlts.find((o) => o.codigo === rowOlt.value);
  const numTarjetas = olt ? olt.num_tarjetas : 17;
  fillSelect(rowTarjeta, tarjetaOptions(numTarjetas), { valueKey: "nombre" });
  rowPuerto.innerHTML = "";
});
rowTarjeta.addEventListener("change", () => {
  const olt = officeOlts.find((o) => o.codigo === rowOlt.value);
  const numPuertos = olt ? olt.puertos_por_tarjeta : 16;
  fillSelect(rowPuerto, puertoOptions(numPuertos), { valueKey: "nombre" });
});

function renderRows() {
  const tbody = document.querySelector("#rows_table tbody");
  tbody.innerHTML = "";
  rows.forEach((r, idx) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${r.olt}</td><td>${r.tarjeta}</td><td>${r.puerto}</td>
      <td>${r.sector}</td><td>${r.edificio}</td>
      <td>${r.no_clientes_reportaron}</td><td>${r.nro_clientes_afectados}</td>
      <td><button type="button" data-idx="${idx}" class="btn-secondary btn-del">Quitar</button></td>
    `;
    tbody.appendChild(tr);
  });
  tbody.querySelectorAll(".btn-del").forEach((btn) => {
    btn.addEventListener("click", () => {
      rows.splice(Number(btn.dataset.idx), 1);
      renderRows();
    });
  });
}

function currentRowValues() {
  return {
    olt: rowOlt.value,
    tarjeta: rowTarjeta.value,
    puerto: rowPuerto.value,
    sector: document.getElementById("row_sector").value || "DESCONOCIDO",
    edificio: document.getElementById("row_edificio").value || "DESCONOCIDO",
    no_clientes_reportaron: Number(document.getElementById("row_no_reportaron").value || 0),
    nro_clientes_afectados: Number(document.getElementById("row_nro_afectados").value || 0),
  };
}

document.getElementById("btn_add_row").addEventListener("click", () => {
  const v = currentRowValues();
  if (!v.olt || !v.tarjeta || !v.puerto) {
    alert("Seleccione OLT, Tarjeta y Puerto antes de agregar la fila.");
    return;
  }
  rows.push(v);
  renderRows();
});

document.getElementById("btn_add_all_ports").addEventListener("click", () => {
  const olt = officeOlts.find((o) => o.codigo === rowOlt.value);
  if (!olt || !rowTarjeta.value) {
    alert("Seleccione OLT y Tarjeta antes de agregar todos los puertos.");
    return;
  }
  const base = currentRowValues();
  for (let i = 1; i <= olt.puertos_por_tarjeta; i++) {
    rows.push({ ...base, puerto: `Puerto ${i}` });
  }
  renderRows();
});

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
      oficina_id: document.getElementById("c_oficina").value || null,
      puertos: rows,
    };
    const res = await apiSend("/tickets", "POST", payload);
    showMsg(msg, `Ticket ${res.ticket_crm} creado correctamente (#${res.id}).`, true);
    rows = [];
    renderRows();
    document.getElementById("c_ticket_crm").value = "";
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
