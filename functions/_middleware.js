import { usuarioDeSesion } from "./_lib/auth.js";

// Rutas de la API que NO requieren sesión iniciada.
const RUTAS_PUBLICAS = new Set(["/api/auth/login", "/api/auth/logout", "/api/me"]);
// Acceso público (sin sesión) SOLO de lectura y solo lo que necesita la Pizarra de Monitoreo.
// /api/consulta, sin sesión, devuelve los datos recortados (sin autor, descripción ni avance).
const RUTAS_PUBLICAS_GET = new Set(["/api/lookups", "/api/config-reportes", "/api/consulta", "/api/ventanas"]);
// Primer inicio de sesión: con la sesión limitada solo se puede crear la contraseña.
const RUTAS_SESION_LIMITADA = new Set(["/api/auth/cambiar-password", "/api/auth/logout", "/api/me"]);

export async function onRequest(context) {
  const { request, next, env } = context;
  const url = new URL(request.url);

  // Preflight CORS (útil durante desarrollo local / pruebas separadas de frontend)
  if (request.method === "OPTIONS") {
    return new Response(null, {
      headers: {
        "access-control-allow-origin": "*",
        "access-control-allow-methods": "GET,POST,PATCH,DELETE,OPTIONS",
        "access-control-allow-headers": "Content-Type, X-Dev-User-Email",
      },
    });
  }

  // Bloqueo real de acceso: toda la API requiere sesión válida, excepto
  // login/logout. Las páginas estáticas (HTML/CSS/JS) se siguen sirviendo
  // igual -- lo que protege los datos es que ninguna llamada a /api/* fuera
  // de estas dos rutas funciona sin haber iniciado sesión antes.
  const esApi = url.pathname.startsWith("/api/");
  if (esApi && !RUTAS_PUBLICAS.has(url.pathname)) {
    const sesion = await usuarioDeSesion(request, env);
    const publicoGet = request.method === "GET" && RUTAS_PUBLICAS_GET.has(url.pathname);
    if (sesion && sesion.cambio && !RUTAS_SESION_LIMITADA.has(url.pathname) && !publicoGet) {
      return new Response(JSON.stringify({ error: "Primero crea tu contraseña definitiva.", debe_cambiar: true }), {
        status: 403,
        headers: { "content-type": "application/json;charset=UTF-8" },
      });
    }
    if (!sesion && !publicoGet) {
      return new Response(JSON.stringify({ error: "No autenticado. Inicia sesión." }), {
        status: 401,
        headers: { "content-type": "application/json;charset=UTF-8" },
      });
    }
  }

  try {
    return await next();
  } catch (err) {
    if (err && typeof err.status === "number" && err.body) {
      return new Response(JSON.stringify(err.body), {
        status: err.status,
        headers: { "content-type": "application/json;charset=UTF-8" },
      });
    }
    return new Response(
      JSON.stringify({ error: "Error interno", detalle: String(err && err.message ? err.message : err) }),
      { status: 500, headers: { "content-type": "application/json;charset=UTF-8" } }
    );
  }
}
