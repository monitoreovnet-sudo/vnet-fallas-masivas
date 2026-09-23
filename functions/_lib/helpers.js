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

export function forbidden(msg = "No tienes permiso para realizar esta acción.") {
  return json({ error: msg }, 403);
}

// Busca el usuario actual (por su correo) en la tabla "usuarios" para saber
// su rol. Si Cloudflare Access lo dejó entrar pero no está en la tabla,
// vuelve sin rol (permisos = ninguno).
export async function getCurrentUser(db, request) {
  const email = currentUserEmail(request);
  const row = await db
    .prepare("SELECT email, nombre, rol, activo FROM usuarios WHERE email = ?")
    .bind(email)
    .first();
  if (!row || !row.activo) return { email, nombre: null, rol: null };
  return row;
}

// Verifica que el usuario actual tenga uno de los roles permitidos.
// Devuelve una Response 403 si no cumple (para "return" directo desde el
// handler), o null si todo está en orden.
export async function requireRole(db, request, rolesPermitidos) {
  const user = await getCurrentUser(db, request);
  if (!user.rol || !rolesPermitidos.includes(user.rol)) {
    return forbidden(
      `Esta acción requiere uno de estos roles: ${rolesPermitidos.join(", ")}. Tu usuario (${user.email}) tiene: ${user.rol || "sin rol asignado"}.`
    );
  }
  return null;
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

// Verifica que el usuario actual tenga rol 'administrador'.
// Devuelve el usuario si tiene permiso, o lanza un objeto {status, body}
// que el endpoint debe capturar y devolver tal cual.
export async function requireAdmin(request, env) {
  const email = currentUserEmail(request);
  const db = env.DB;
  const usuario = await db
    .prepare("SELECT email, nombre, rol, activo FROM usuarios WHERE email = ?")
    .bind(email)
    .first();

  if (!usuario || !usuario.activo || usuario.rol !== "administrador") {
    throw { status: 403, body: { error: "No tienes permisos de administrador." } };
  }
  return usuario;
}

