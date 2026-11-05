// El cron nocturno (GitHub Actions) entra con "Authorization: Bearer <CRON_TOKEN>" (variable de Cloudflare Pages).
export function esTokenCron(request, env) {
  const t = env && env.CRON_TOKEN ? String(env.CRON_TOKEN) : "";
  if (t.length < 16) return false;   // sin token configurado (o muy corto) nadie entra por esta vía
  const h = request.headers.get("authorization") || "";
  const dado = h.startsWith("Bearer ") ? h.slice(7) : "";
  if (dado.length !== t.length) return false;
  let d = 0; for (let i = 0; i < t.length; i++) d |= t.charCodeAt(i) ^ dado.charCodeAt(i);
  return d === 0;
}
