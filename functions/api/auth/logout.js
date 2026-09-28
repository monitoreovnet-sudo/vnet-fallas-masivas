import { jsonConHeaders } from "../../_lib/helpers.js";
import { cookieSesionBorrarHeader } from "../../_lib/auth.js";

// POST /api/auth/logout
export async function onRequestPost() {
  return jsonConHeaders({ ok: true }, 200, { "Set-Cookie": cookieSesionBorrarHeader() });
}
