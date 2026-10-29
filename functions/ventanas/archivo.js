// GET /api/ventanas/archivo -> el Excel original que se subió al Repositorio (requiere sesión; lo exige el middleware).
export async function onRequestGet({ env }) {
  const c = await env.DB.prepare("SELECT nombre_archivo, archivo_b64 FROM ventanas_carga ORDER BY id DESC LIMIT 1").first();
  if (!c || !c.archivo_b64) return new Response(JSON.stringify({ error: "No hay archivo guardado." }), { status: 404, headers: { "content-type": "application/json;charset=UTF-8" } });
  const bin = Uint8Array.from(atob(c.archivo_b64), (ch) => ch.charCodeAt(0));
  const nombre = (c.nombre_archivo || "ventanas.xlsx").replace(/[^\w.\- ]+/g, "_");
  const tipo = /\.csv$/i.test(nombre) ? "text/csv" : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
  return new Response(bin, { headers: { "content-type": tipo, "content-disposition": `attachment; filename="${nombre}"`, "cache-control": "no-store" } });
}
