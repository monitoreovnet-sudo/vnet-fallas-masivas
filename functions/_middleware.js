export async function onRequest(context) {
  const { request, next } = context;

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
