// Regla: si un ticket abarca varias tarjetas/puertos (varios registros que no son "Todas"/"Todos"),
// el número de clientes afectados NO se puede cambiar en bloque (cada registro tiene su propio número).
// Si todos los registros son "Todas" (tarjeta) o "Todos" (puerto), sí se permite.
const agregado = (r) => /^todas?$/i.test(String(r.tarjeta || "").trim()) || /^todos?$/i.test(String(r.puerto || "").trim());
export function afectadosBloqueado(registros) {
  const l = registros || [];
  return l.length > 1 && !l.every(agregado);
}
export const MSG_AFECTADOS_BLOQUEADO = "Este ticket abarca varias tarjetas y puertos: la cantidad de clientes afectados no se puede cambiar en bloque. Edítala registro por registro (Cambio puntual).";
