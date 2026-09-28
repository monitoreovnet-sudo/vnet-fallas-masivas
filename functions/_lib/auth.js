// Autenticación propia: hash de contraseñas (PBKDF2) y sesiones firmadas
// (HMAC-SHA256), usando Web Crypto API disponible en Cloudflare Workers/Pages.
// No se necesita ninguna librería externa.

const ITERACIONES_PBKDF2 = 100000;
const DURACION_SESION_MS = 24 * 60 * 60 * 1000; // 24 horas

function bufferAHex(buffer) {
  return [...new Uint8Array(buffer)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
function hexABuffer(hex) {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) bytes[i / 2] = parseInt(hex.substr(i, 2), 16);
  return bytes;
}

// --- Hash de contraseñas ---

export async function hashPassword(password) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt, iterations: ITERACIONES_PBKDF2, hash: "SHA-256" },
    key,
    256
  );
  return `${bufferAHex(salt)}:${bufferAHex(bits)}`;
}

export async function verifyPassword(password, hashGuardado) {
  if (!hashGuardado || !hashGuardado.includes(":")) return false;
  const [saltHex, hashHex] = hashGuardado.split(":");
  const salt = hexABuffer(saltHex);
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt, iterations: ITERACIONES_PBKDF2, hash: "SHA-256" },
    key,
    256
  );
  return bufferAHex(bits) === hashHex;
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
