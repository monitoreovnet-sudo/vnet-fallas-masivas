-- Causa de la falla y correctivo, por registro (OLT/tarjeta/puerto). Se llenan en Solución / Cierre (masivo o puntual).
ALTER TABLE ticket_puertos ADD COLUMN causa_falla TEXT;
ALTER TABLE ticket_puertos ADD COLUMN correctivo TEXT;
