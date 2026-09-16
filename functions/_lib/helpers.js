// Helpers compartidos por todas las funciones de /functions/api

export function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json;charset=UTF-8",
      "access-control-allow-origin": "*",
    },
  });
}

export function badRequest(msg) {
  return json({ error: msg }, 400);
}

export function notFound(msg = "No encontrado") {
  return json({ error: msg }, 404);
}

// Identifica al usuario actual.
// Cuando se active Cloudflare Access, este header lo inyecta Cloudflare
// automáticamente y ya no hace falta tocar este archivo.
// Mientras tanto, se usa un usuario de desarrollo por defecto.
export function currentUserEmail(request) {
  const accessEmail = request.headers.get("Cf-Access-Authenticated-User-Email");
  if (accessEmail) return accessEmail;
  const devHeader = request.headers.get("X-Dev-User-Email");
  if (devHeader) return devHeader;
  return "dev@vnet.local";
}

export async function logCambio(db, {
  ticket_id,
  ticket_puerto_id = null,
  tipo_cambio,
  campo,
  valor_anterior,
  valor_nuevo,
  usuario_email,
}) {
  await db
    .prepare(
      `INSERT INTO ticket_log
        (ticket_id, ticket_puerto_id, tipo_cambio, campo, valor_anterior, valor_nuevo, usuario_email)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(
      ticket_id,
      ticket_puerto_id,
      tipo_cambio,
      campo,
      valor_anterior === undefined || valor_anterior === null ? null : String(valor_anterior),
      valor_nuevo === undefined || valor_nuevo === null ? null : String(valor_nuevo),
      usuario_email
    )
    .run();
}

export function nowIso() {
  return new Date().toISOString();
}
