// Autenticación propia: cifrado reversible de contraseñas (AES-GCM) y
// sesiones firmadas (HMAC-SHA256), usando Web Crypto API disponible en
// Cloudflare Workers/Pages. No se necesita ninguna librería externa.
//
// Nota de diseño: las contraseñas se guardan CIFRADAS (no como hash de un
// solo sentido) a propósito, para que el administrador pueda verlas desde
// el panel. La llave de cifrado se deriva del mismo SESSION_SECRET.

const DURACION_SESION_MS = 24 * 60 * 60 * 1000; // 24 horas

function bufferAHex(buffer) {
  return [...new Uint8Array(buffer)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
function hexABuffer(hex) {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) bytes[i / 2] = parseInt(hex.substr(i, 2), 16);
  return bytes;
}

async function claveAES(env) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(env.SESSION_SECRET));
  return crypto.subtle.importKey("raw", digest, { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
}

// --- Cifrado reversible de contraseñas ---

export async function cifrarPassword(password, env) {
  const key = await claveAES(env);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const cifrado = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, new TextEncoder().encode(password));
  return `${bufferAHex(iv)}:${bufferAHex(cifrado)}`;
}

export async function descifrarPassword(valorCifrado, env) {
  if (!valorCifrado || !valorCifrado.includes(":")) return null;
  const [ivHex, cifradoHex] = valorCifrado.split(":");
  try {
    const key = await claveAES(env);
    const descifrado = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: hexABuffer(ivHex) },
      key,
      hexABuffer(cifradoHex)
    );
    return new TextDecoder().decode(descifrado);
  } catch {
    return null; // llave cambiada o dato corrupto
  }
}

export async function verificarPassword(password, valorCifrado, env) {
  const real = await descifrarPassword(valorCifrado, env);
  return real !== null && real === password;
}

// --- Sesiones firmadas (cookie) ---

function base64UrlEncode(str) {
  return btoa(str).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function base64UrlDecode(str) {
  str = str.replace(/-/g, "+").replace(/_/g, "/");
  while (str.length % 4) str += "=";
  return atob(str);
}

async function firmar(payloadStr, secret) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const firma = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payloadStr));
  return base64UrlEncode(String.fromCharCode(...new Uint8Array(firma)));
}

export async function crearTokenSesion(email, rol, env) {
  const payload = { email, rol, exp: Date.now() + DURACION_SESION_MS };
  const payloadStr = JSON.stringify(payload);
  const payloadB64 = base64UrlEncode(payloadStr);
  const firma = await firmar(payloadB64, env.SESSION_SECRET);
  return `${payloadB64}.${firma}`;
}

// Verifica la firma y la expiración. Devuelve el payload {email, rol, exp} o null.
export async function verificarTokenSesion(token, env) {
  if (!token || !token.includes(".")) return null;
  const [payloadB64, firma] = token.split(".");
  const firmaEsperada = await firmar(payloadB64, env.SESSION_SECRET);
  if (firma !== firmaEsperada) return null;
  try {
    const payload = JSON.parse(base64UrlDecode(payloadB64));
    if (!payload.exp || payload.exp < Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
}

export function parseCookies(request) {
  const header = request.headers.get("Cookie") || "";
  const cookies = {};
  header.split(";").forEach((parte) => {
    const [k, ...v] = parte.trim().split("=");
    if (k) cookies[k] = decodeURIComponent(v.join("="));
  });
  return cookies;
}

export function cookieSesionHeader(token) {
  const maxAge = DURACION_SESION_MS / 1000;
  return `sesion=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}`;
}

export function cookieSesionBorrarHeader() {
  return `sesion=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;
}

// Usuario actual a partir de la cookie de sesión (verificada). null si no hay
// sesión válida.
export async function usuarioDeSesion(request, env) {
  const cookies = parseCookies(request);
  if (!cookies.sesion) return null;
  return verificarTokenSesion(cookies.sesion, env);
}

// Lee solo el email del payload de la cookie, SIN verificar la firma.
// Uso exclusivo para atribución de logs (quién hizo un cambio) en endpoints
// a los que ya solo se llega si el middleware verificó la sesión antes.
// Nunca usar esto para decisiones de autorización — para eso, usuarioDeSesion().
export function emailDeSesionSinVerificar(request) {
  const cookies = parseCookies(request);
  if (!cookies.sesion || !cookies.sesion.includes(".")) return null;
  try {
    const [payloadB64] = cookies.sesion.split(".");
    const payload = JSON.parse(base64UrlDecode(payloadB64));
    return payload.email || null;
  } catch {
    return null;
  }
}
