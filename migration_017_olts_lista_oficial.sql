-- Migración 017: deja el catálogo de OLTs EXACTAMENTE con la lista oficial (111). De aquí salen las sugerencias del campo OLT.
-- Cada OLT se enlaza a su oficina por el prefijo del código. Estas oficinas aceptan DOS códigos:
-- CRC y CRP -> CRP (Carúpano), ESB y ESM -> ESM (El Sombrero), SPS y SCP -> SCP (Socopó),
-- STS y STB -> STB (Santa Bárbara de Barinas).
-- Idempotente (se puede ejecutar más de una vez). No borra nada: los OLT que no están en la lista
-- quedan desactivados (activo = 0), así que los tickets históricos que los mencionan no se afectan.

-- 1) Agrega los que falten y activa/reenlaza los de la lista
INSERT OR IGNORE INTO olts (oficina_id, codigo) VALUES ((SELECT id FROM oficinas WHERE codigo = 'MON' LIMIT 1), 'MON-OL-ZT-AC-001');
INSERT OR IGNORE INTO olts (oficina_id, codigo) VALUES ((SELECT id FROM oficinas WHERE codigo = 'VIC' LIMIT 1), 'VIC-OL-ZT-AC-001');
INSERT OR IGNORE INTO olts (oficina_id, codigo) VALUES ((SELECT id FROM oficinas WHERE codigo = 'VIC' LIMIT 1), 'VIC-OL-ZT-AC-002');
INSERT OR IGNORE INTO olts (oficina_id, codigo) VALUES ((SELECT id FROM oficinas WHERE codigo = 'VIC' LIMIT 1), 'VIC-OL-ZT-AC-003');
INSERT OR IGNORE INTO olts (oficina_id, codigo) VALUES ((SELECT id FROM oficinas WHERE codigo = 'SBE' LIMIT 1), 'SBE-OL-ZT-AC-001');
INSERT OR IGNORE INTO olts (oficina_id, codigo) VALUES ((SELECT id FROM oficinas WHERE codigo = 'SBE' LIMIT 1), 'SBE-OL-ZT-AC-002');
INSERT OR IGNORE INTO olts (oficina_id, codigo) VALUES ((SELECT id FROM oficinas WHERE codigo = 'STF' LIMIT 1), 'STF-OL-ZT-AC-001');
INSERT OR IGNORE INTO olts (oficina_id, codigo) VALUES ((SELECT id FROM oficinas WHERE codigo = 'CAT' LIMIT 1), 'CAT-OL-ZT-AC-001');
INSERT OR IGNORE INTO olts (oficina_id, codigo) VALUES ((SELECT id FROM oficinas WHERE codigo = 'CAT' LIMIT 1), 'CAT-OL-ZT-AC-002');
INSERT OR IGNORE INTO olts (oficina_id, codigo) VALUES ((SELECT id FROM oficinas WHERE codigo = 'ANA' LIMIT 1), 'ANA-OL-ZT-AC-001');
INSERT OR IGNORE INTO olts (oficina_id, codigo) VALUES ((SELECT id FROM oficinas WHERE codigo = 'CTR' LIMIT 1), 'CTR-OL-ZT-AC-001');
INSERT OR IGNORE INTO olts (oficina_id, codigo) VALUES ((SELECT id FROM oficinas WHERE codigo = 'TGR' LIMIT 1), 'TGR-OL-ZT-AC-001');
INSERT OR IGNORE INTO olts (oficina_id, codigo) VALUES ((SELECT id FROM oficinas WHERE codigo = 'TGO' LIMIT 1), 'TGO-OL-ZT-AC-001');
INSERT OR IGNORE INTO olts (oficina_id, codigo) VALUES ((SELECT id FROM oficinas WHERE codigo = 'CIO' LIMIT 1), 'CIO-OL-ZT-AC-001');
INSERT OR IGNORE INTO olts (oficina_id, codigo) VALUES ((SELECT id FROM oficinas WHERE codigo = 'BRS' LIMIT 1), 'BRS-OL-ZT-AC-001');
INSERT OR IGNORE INTO olts (oficina_id, codigo) VALUES ((SELECT id FROM oficinas WHERE codigo = 'SCP' LIMIT 1), 'SPS-OL-ZT-AC-001');
INSERT OR IGNORE INTO olts (oficina_id, codigo) VALUES ((SELECT id FROM oficinas WHERE codigo = 'STB' LIMIT 1), 'STS-OL-ZT-AC-001');
INSERT OR IGNORE INTO olts (oficina_id, codigo) VALUES ((SELECT id FROM oficinas WHERE codigo = 'BCS' LIMIT 1), 'BCS-OL-ZT-AC-001');
INSERT OR IGNORE INTO olts (oficina_id, codigo) VALUES ((SELECT id FROM oficinas WHERE codigo = 'ECS' LIMIT 1), 'ECS-OL-ZT-AC-001');
INSERT OR IGNORE INTO olts (oficina_id, codigo) VALUES ((SELECT id FROM oficinas WHERE codigo = 'PTO' LIMIT 1), 'PTO-OL-ZT-AC-001');
INSERT OR IGNORE INTO olts (oficina_id, codigo) VALUES ((SELECT id FROM oficinas WHERE codigo = 'PCO' LIMIT 1), 'PCO-OL-ZT-AC-001');
INSERT OR IGNORE INTO olts (oficina_id, codigo) VALUES ((SELECT id FROM oficinas WHERE codigo = 'CDB' LIMIT 1), 'CDB-OL-ZT-AC-001');
INSERT OR IGNORE INTO olts (oficina_id, codigo) VALUES ((SELECT id FROM oficinas WHERE codigo = 'CDB' LIMIT 1), 'CDB-OL-ZT-AC-002');
INSERT OR IGNORE INTO olts (oficina_id, codigo) VALUES ((SELECT id FROM oficinas WHERE codigo = 'CVE' LIMIT 1), 'CVE-OL-ZT-AC-001');
INSERT OR IGNORE INTO olts (oficina_id, codigo) VALUES ((SELECT id FROM oficinas WHERE codigo = 'SFX' LIMIT 1), 'SFX-OL-ZT-AC-001');
INSERT OR IGNORE INTO olts (oficina_id, codigo) VALUES ((SELECT id FROM oficinas WHERE codigo = 'SFX' LIMIT 1), 'SFX-OL-ZT-AC-002');
INSERT OR IGNORE INTO olts (oficina_id, codigo) VALUES ((SELECT id FROM oficinas WHERE codigo = 'VAL' LIMIT 1), 'VAL-OL-ZT-AC-001');
INSERT OR IGNORE INTO olts (oficina_id, codigo) VALUES ((SELECT id FROM oficinas WHERE codigo = 'VAL' LIMIT 1), 'VAL-OL-ZT-AC-002');
INSERT OR IGNORE INTO olts (oficina_id, codigo) VALUES ((SELECT id FROM oficinas WHERE codigo = 'VBN' LIMIT 1), 'VBN-OL-ZT-AC-001');
INSERT OR IGNORE INTO olts (oficina_id, codigo) VALUES ((SELECT id FROM oficinas WHERE codigo = 'VBF' LIMIT 1), 'VBF-OL-ZT-AC-001');
INSERT OR IGNORE INTO olts (oficina_id, codigo) VALUES ((SELECT id FROM oficinas WHERE codigo = 'SJM' LIMIT 1), 'SJM-OL-ZT-AC-001');
INSERT OR IGNORE INTO olts (oficina_id, codigo) VALUES ((SELECT id FROM oficinas WHERE codigo = 'SMI' LIMIT 1), 'SMI-OL-ZT-AC-001');
INSERT OR IGNORE INTO olts (oficina_id, codigo) VALUES ((SELECT id FROM oficinas WHERE codigo = 'VDP' LIMIT 1), 'VDP-OL-ZT-AC-001');
INSERT OR IGNORE INTO olts (oficina_id, codigo) VALUES ((SELECT id FROM oficinas WHERE codigo = 'ESM' LIMIT 1), 'ESB-OL-ZT-AC-001');
INSERT OR IGNORE INTO olts (oficina_id, codigo) VALUES ((SELECT id FROM oficinas WHERE codigo = 'CRA' LIMIT 1), 'CRA-OL-ZT-AC-001');
INSERT OR IGNORE INTO olts (oficina_id, codigo) VALUES ((SELECT id FROM oficinas WHERE codigo = 'MRD' LIMIT 1), 'MRD-OL-ZT-AC-001');
INSERT OR IGNORE INTO olts (oficina_id, codigo) VALUES ((SELECT id FROM oficinas WHERE codigo = 'MRD' LIMIT 1), 'MRD-OL-ZT-AC-002');
INSERT OR IGNORE INTO olts (oficina_id, codigo) VALUES ((SELECT id FROM oficinas WHERE codigo = 'HUM' LIMIT 1), 'HUM-OL-ZT-AC-001');
INSERT OR IGNORE INTO olts (oficina_id, codigo) VALUES ((SELECT id FROM oficinas WHERE codigo = 'LMG' LIMIT 1), 'LMG-OL-ZT-AC-001');
INSERT OR IGNORE INTO olts (oficina_id, codigo) VALUES ((SELECT id FROM oficinas WHERE codigo = 'LMG' LIMIT 1), 'LMG-OL-ZT-AC-002');
INSERT OR IGNORE INTO olts (oficina_id, codigo) VALUES ((SELECT id FROM oficinas WHERE codigo = 'CRB' LIMIT 1), 'CRB-OL-ZT-AC-001');
INSERT OR IGNORE INTO olts (oficina_id, codigo) VALUES ((SELECT id FROM oficinas WHERE codigo = 'CRB' LIMIT 1), 'CRB-OL-ZT-AC-002');
INSERT OR IGNORE INTO olts (oficina_id, codigo) VALUES ((SELECT id FROM oficinas WHERE codigo = 'APD' LIMIT 1), 'APD-OL-ZT-AC-001');
INSERT OR IGNORE INTO olts (oficina_id, codigo) VALUES ((SELECT id FROM oficinas WHERE codigo = 'VIG' LIMIT 1), 'VIG-OL-ZT-AC-001');
INSERT OR IGNORE INTO olts (oficina_id, codigo) VALUES ((SELECT id FROM oficinas WHERE codigo = 'VIG' LIMIT 1), 'VIG-OL-ZT-AC-002');
INSERT OR IGNORE INTO olts (oficina_id, codigo) VALUES ((SELECT id FROM oficinas WHERE codigo = 'VIG' LIMIT 1), 'VIG-OL-ZT-AC-003');
INSERT OR IGNORE INTO olts (oficina_id, codigo) VALUES ((SELECT id FROM oficinas WHERE codigo = 'VIG' LIMIT 1), 'VIG-OL-ZT-AC-004');
INSERT OR IGNORE INTO olts (oficina_id, codigo) VALUES ((SELECT id FROM oficinas WHERE codigo = 'SEA' LIMIT 1), 'SEA-OL-ZT-AC-001');
INSERT OR IGNORE INTO olts (oficina_id, codigo) VALUES ((SELECT id FROM oficinas WHERE codigo = 'LZT' LIMIT 1), 'LZT-OL-ZT-AC-001');
INSERT OR IGNORE INTO olts (oficina_id, codigo) VALUES ((SELECT id FROM oficinas WHERE codigo = 'LPS' LIMIT 1), 'LPS-OL-ZT-AC-001');
INSERT OR IGNORE INTO olts (oficina_id, codigo) VALUES ((SELECT id FROM oficinas WHERE codigo = 'GYB' LIMIT 1), 'GYB-OL-ZT-AC-001');
INSERT OR IGNORE INTO olts (oficina_id, codigo) VALUES ((SELECT id FROM oficinas WHERE codigo = 'TBY' LIMIT 1), 'TBY-OL-ZT-AC-001');
INSERT OR IGNORE INTO olts (oficina_id, codigo) VALUES ((SELECT id FROM oficinas WHERE codigo = 'TBY' LIMIT 1), 'TBY-OL-ZT-AC-002');
INSERT OR IGNORE INTO olts (oficina_id, codigo) VALUES ((SELECT id FROM oficinas WHERE codigo = 'EJI' LIMIT 1), 'EJI-OL-ZT-AC-001');
INSERT OR IGNORE INTO olts (oficina_id, codigo) VALUES ((SELECT id FROM oficinas WHERE codigo = 'CAF' LIMIT 1), 'CAF-OL-ZT-AC-001');
INSERT OR IGNORE INTO olts (oficina_id, codigo) VALUES ((SELECT id FROM oficinas WHERE codigo = 'DCC' LIMIT 1), 'DCC-OL-ZT-AC-001');
INSERT OR IGNORE INTO olts (oficina_id, codigo) VALUES ((SELECT id FROM oficinas WHERE codigo = 'CCG' LIMIT 1), 'CCG-OL-ZT-AC-001');
INSERT OR IGNORE INTO olts (oficina_id, codigo) VALUES ((SELECT id FROM oficinas WHERE codigo = 'BTA' LIMIT 1), 'BTA-OL-ZT-AC-001');
INSERT OR IGNORE INTO olts (oficina_id, codigo) VALUES ((SELECT id FROM oficinas WHERE codigo = 'HPT' LIMIT 1), 'HPT-OL-ZT-AC-001');
INSERT OR IGNORE INTO olts (oficina_id, codigo) VALUES ((SELECT id FROM oficinas WHERE codigo = 'MAT' LIMIT 1), 'MAT-OL-ZT-AC-001');
INSERT OR IGNORE INTO olts (oficina_id, codigo) VALUES ((SELECT id FROM oficinas WHERE codigo = 'MAT' LIMIT 1), 'MAT-OL-ZT-AC-002');
INSERT OR IGNORE INTO olts (oficina_id, codigo) VALUES ((SELECT id FROM oficinas WHERE codigo = 'TMB' LIMIT 1), 'TMB-OL-ZT-AC-001');
INSERT OR IGNORE INTO olts (oficina_id, codigo) VALUES ((SELECT id FROM oficinas WHERE codigo = 'CPT' LIMIT 1), 'CPT-OL-ZT-AC-001');
INSERT OR IGNORE INTO olts (oficina_id, codigo) VALUES ((SELECT id FROM oficinas WHERE codigo = 'CPT' LIMIT 1), 'CPT-OL-ZT-AC-002');
INSERT OR IGNORE INTO olts (oficina_id, codigo) VALUES ((SELECT id FROM oficinas WHERE codigo = 'PDM' LIMIT 1), 'PDM-OL-ZT-AC-001');
INSERT OR IGNORE INTO olts (oficina_id, codigo) VALUES ((SELECT id FROM oficinas WHERE codigo = 'PDM' LIMIT 1), 'PDM-OL-ZT-AC-002');
INSERT OR IGNORE INTO olts (oficina_id, codigo) VALUES ((SELECT id FROM oficinas WHERE codigo = 'PDM' LIMIT 1), 'PDM-OL-ZT-AC-003');
INSERT OR IGNORE INTO olts (oficina_id, codigo) VALUES ((SELECT id FROM oficinas WHERE codigo = 'TPR' LIMIT 1), 'TPR-OL-ZT-AC-001');
INSERT OR IGNORE INTO olts (oficina_id, codigo) VALUES ((SELECT id FROM oficinas WHERE codigo = 'MAZ' LIMIT 1), 'MAZ-OL-ZT-AC-001');
INSERT OR IGNORE INTO olts (oficina_id, codigo) VALUES ((SELECT id FROM oficinas WHERE codigo = 'MAZ' LIMIT 1), 'MAZ-OL-ZT-AC-002');
INSERT OR IGNORE INTO olts (oficina_id, codigo) VALUES ((SELECT id FROM oficinas WHERE codigo = 'CUM' LIMIT 1), 'CUM-OL-ZT-AC-001');
INSERT OR IGNORE INTO olts (oficina_id, codigo) VALUES ((SELECT id FROM oficinas WHERE codigo = 'CRP' LIMIT 1), 'CRC-OL-ZT-AC-001');
INSERT OR IGNORE INTO olts (oficina_id, codigo) VALUES ((SELECT id FROM oficinas WHERE codigo = 'LFR' LIMIT 1), 'LFR-OL-ZT-AC-001');
INSERT OR IGNORE INTO olts (oficina_id, codigo) VALUES ((SELECT id FROM oficinas WHERE codigo = 'LFR' LIMIT 1), 'LFR-OL-ZT-AC-002');
INSERT OR IGNORE INTO olts (oficina_id, codigo) VALUES ((SELECT id FROM oficinas WHERE codigo = 'CTO' LIMIT 1), 'CTO-OL-ZT-AC-001');
INSERT OR IGNORE INTO olts (oficina_id, codigo) VALUES ((SELECT id FROM oficinas WHERE codigo = 'CTO' LIMIT 1), 'CTO-OL-ZT-AC-002');
INSERT OR IGNORE INTO olts (oficina_id, codigo) VALUES ((SELECT id FROM oficinas WHERE codigo = 'CLN' LIMIT 1), 'CLN-OL-ZT-AC-001');
INSERT OR IGNORE INTO olts (oficina_id, codigo) VALUES ((SELECT id FROM oficinas WHERE codigo = 'RBO' LIMIT 1), 'RBO-OL-ZT-AC-001');
INSERT OR IGNORE INTO olts (oficina_id, codigo) VALUES ((SELECT id FROM oficinas WHERE codigo = 'RBO' LIMIT 1), 'RBO-OL-ZT-AC-002');
INSERT OR IGNORE INTO olts (oficina_id, codigo) VALUES ((SELECT id FROM oficinas WHERE codigo = 'CPC' LIMIT 1), 'CPC-OL-ZT-AC-001');
INSERT OR IGNORE INTO olts (oficina_id, codigo) VALUES ((SELECT id FROM oficinas WHERE codigo = 'UNA' LIMIT 1), 'UNA-OL-ZT-AC-001');
INSERT OR IGNORE INTO olts (oficina_id, codigo) VALUES ((SELECT id FROM oficinas WHERE codigo = 'SAT' LIMIT 1), 'SAT-OL-ZT-AC-001');
INSERT OR IGNORE INTO olts (oficina_id, codigo) VALUES ((SELECT id FROM oficinas WHERE codigo = 'SAT' LIMIT 1), 'SAT-OL-ZT-AC-002');
INSERT OR IGNORE INTO olts (oficina_id, codigo) VALUES ((SELECT id FROM oficinas WHERE codigo = 'SCR' LIMIT 1), 'SCR-OL-ZT-AC-001');
INSERT OR IGNORE INTO olts (oficina_id, codigo) VALUES ((SELECT id FROM oficinas WHERE codigo = 'SCR' LIMIT 1), 'SCR-OL-ZT-AC-002');
INSERT OR IGNORE INTO olts (oficina_id, codigo) VALUES ((SELECT id FROM oficinas WHERE codigo = 'PGD' LIMIT 1), 'PGD-OL-ZT-AC-001');
INSERT OR IGNORE INTO olts (oficina_id, codigo) VALUES ((SELECT id FROM oficinas WHERE codigo = 'PGD' LIMIT 1), 'PGD-OL-ZT-AC-002');
INSERT OR IGNORE INTO olts (oficina_id, codigo) VALUES ((SELECT id FROM oficinas WHERE codigo = 'TRB' LIMIT 1), 'TRB-OL-ZT-AC-001');
INSERT OR IGNORE INTO olts (oficina_id, codigo) VALUES ((SELECT id FROM oficinas WHERE codigo = 'VLR' LIMIT 1), 'VLR-OL-ZT-AC-001');
INSERT OR IGNORE INTO olts (oficina_id, codigo) VALUES ((SELECT id FROM oficinas WHERE codigo = 'BNO' LIMIT 1), 'BNO-OL-ZT-AC-001');
INSERT OR IGNORE INTO olts (oficina_id, codigo) VALUES ((SELECT id FROM oficinas WHERE codigo = 'CVJ' LIMIT 1), 'CVJ-OL-ZT-AC-001');
INSERT OR IGNORE INTO olts (oficina_id, codigo) VALUES ((SELECT id FROM oficinas WHERE codigo = 'CVJ' LIMIT 1), 'CVJ-OL-ZT-AC-002');
INSERT OR IGNORE INTO olts (oficina_id, codigo) VALUES ((SELECT id FROM oficinas WHERE codigo = 'CVJ' LIMIT 1), 'CVJ-OL-ZT-AC-003');
INSERT OR IGNORE INTO olts (oficina_id, codigo) VALUES ((SELECT id FROM oficinas WHERE codigo = 'CSC' LIMIT 1), 'CSC-OL-ZT-AC-001');
INSERT OR IGNORE INTO olts (oficina_id, codigo) VALUES ((SELECT id FROM oficinas WHERE codigo = 'MCQ' LIMIT 1), 'MCQ-OL-ZT-AC-001');
INSERT OR IGNORE INTO olts (oficina_id, codigo) VALUES ((SELECT id FROM oficinas WHERE codigo = 'MCQ' LIMIT 1), 'MCQ-OL-ZT-AC-002');
INSERT OR IGNORE INTO olts (oficina_id, codigo) VALUES ((SELECT id FROM oficinas WHERE codigo = 'SJP' LIMIT 1), 'SJP-OL-ZT-AC-001');
INSERT OR IGNORE INTO olts (oficina_id, codigo) VALUES ((SELECT id FROM oficinas WHERE codigo = 'SCZ' LIMIT 1), 'SCZ-OL-ZT-AC-001');
INSERT OR IGNORE INTO olts (oficina_id, codigo) VALUES ((SELECT id FROM oficinas WHERE codigo = 'LVR' LIMIT 1), 'LVR-OL-ZT-AC-001');
INSERT OR IGNORE INTO olts (oficina_id, codigo) VALUES ((SELECT id FROM oficinas WHERE codigo = 'LVR' LIMIT 1), 'LVR-OL-ZT-AC-002');
INSERT OR IGNORE INTO olts (oficina_id, codigo) VALUES ((SELECT id FROM oficinas WHERE codigo = 'GBO' LIMIT 1), 'GBO-OL-ZT-AC-001');
INSERT OR IGNORE INTO olts (oficina_id, codigo) VALUES ((SELECT id FROM oficinas WHERE codigo = 'CLA' LIMIT 1), 'CLA-OL-ZT-AC-001');
INSERT OR IGNORE INTO olts (oficina_id, codigo) VALUES ((SELECT id FROM oficinas WHERE codigo = 'JBT' LIMIT 1), 'JBT-OL-ZT-AC-001');
INSERT OR IGNORE INTO olts (oficina_id, codigo) VALUES ((SELECT id FROM oficinas WHERE codigo = 'PAL' LIMIT 1), 'PAL-OL-ZT-AC-001');
INSERT OR IGNORE INTO olts (oficina_id, codigo) VALUES ((SELECT id FROM oficinas WHERE codigo = 'ACC' LIMIT 1), 'ACC-OL-ZT-AC-001');
INSERT OR IGNORE INTO olts (oficina_id, codigo) VALUES ((SELECT id FROM oficinas WHERE codigo = 'MCC' LIMIT 1), 'MCC-OL-ZT-AC-001');
INSERT OR IGNORE INTO olts (oficina_id, codigo) VALUES ((SELECT id FROM oficinas WHERE codigo = 'MBO' LIMIT 1), 'MBO-OL-ZT-AC-001');
INSERT OR IGNORE INTO olts (oficina_id, codigo) VALUES ((SELECT id FROM oficinas WHERE codigo = 'CRP' LIMIT 1), 'CRP-OL-ZT-AC-001');
INSERT OR IGNORE INTO olts (oficina_id, codigo) VALUES ((SELECT id FROM oficinas WHERE codigo = 'ESM' LIMIT 1), 'ESM-OL-ZT-AC-001');
INSERT OR IGNORE INTO olts (oficina_id, codigo) VALUES ((SELECT id FROM oficinas WHERE codigo = 'SCP' LIMIT 1), 'SCP-OL-ZT-AC-001');
INSERT OR IGNORE INTO olts (oficina_id, codigo) VALUES ((SELECT id FROM oficinas WHERE codigo = 'STB' LIMIT 1), 'STB-OL-ZT-AC-001');
UPDATE olts SET activo = 1, oficina_id = (SELECT id FROM oficinas WHERE codigo = 'MON' LIMIT 1) WHERE codigo = 'MON-OL-ZT-AC-001';
UPDATE olts SET activo = 1, oficina_id = (SELECT id FROM oficinas WHERE codigo = 'VIC' LIMIT 1) WHERE codigo = 'VIC-OL-ZT-AC-001';
UPDATE olts SET activo = 1, oficina_id = (SELECT id FROM oficinas WHERE codigo = 'VIC' LIMIT 1) WHERE codigo = 'VIC-OL-ZT-AC-002';
UPDATE olts SET activo = 1, oficina_id = (SELECT id FROM oficinas WHERE codigo = 'VIC' LIMIT 1) WHERE codigo = 'VIC-OL-ZT-AC-003';
UPDATE olts SET activo = 1, oficina_id = (SELECT id FROM oficinas WHERE codigo = 'SBE' LIMIT 1) WHERE codigo = 'SBE-OL-ZT-AC-001';
UPDATE olts SET activo = 1, oficina_id = (SELECT id FROM oficinas WHERE codigo = 'SBE' LIMIT 1) WHERE codigo = 'SBE-OL-ZT-AC-002';
UPDATE olts SET activo = 1, oficina_id = (SELECT id FROM oficinas WHERE codigo = 'STF' LIMIT 1) WHERE codigo = 'STF-OL-ZT-AC-001';
UPDATE olts SET activo = 1, oficina_id = (SELECT id FROM oficinas WHERE codigo = 'CAT' LIMIT 1) WHERE codigo = 'CAT-OL-ZT-AC-001';
UPDATE olts SET activo = 1, oficina_id = (SELECT id FROM oficinas WHERE codigo = 'CAT' LIMIT 1) WHERE codigo = 'CAT-OL-ZT-AC-002';
UPDATE olts SET activo = 1, oficina_id = (SELECT id FROM oficinas WHERE codigo = 'ANA' LIMIT 1) WHERE codigo = 'ANA-OL-ZT-AC-001';
UPDATE olts SET activo = 1, oficina_id = (SELECT id FROM oficinas WHERE codigo = 'CTR' LIMIT 1) WHERE codigo = 'CTR-OL-ZT-AC-001';
UPDATE olts SET activo = 1, oficina_id = (SELECT id FROM oficinas WHERE codigo = 'TGR' LIMIT 1) WHERE codigo = 'TGR-OL-ZT-AC-001';
UPDATE olts SET activo = 1, oficina_id = (SELECT id FROM oficinas WHERE codigo = 'TGO' LIMIT 1) WHERE codigo = 'TGO-OL-ZT-AC-001';
UPDATE olts SET activo = 1, oficina_id = (SELECT id FROM oficinas WHERE codigo = 'CIO' LIMIT 1) WHERE codigo = 'CIO-OL-ZT-AC-001';
UPDATE olts SET activo = 1, oficina_id = (SELECT id FROM oficinas WHERE codigo = 'BRS' LIMIT 1) WHERE codigo = 'BRS-OL-ZT-AC-001';
UPDATE olts SET activo = 1, oficina_id = (SELECT id FROM oficinas WHERE codigo = 'SCP' LIMIT 1) WHERE codigo = 'SPS-OL-ZT-AC-001';
UPDATE olts SET activo = 1, oficina_id = (SELECT id FROM oficinas WHERE codigo = 'STB' LIMIT 1) WHERE codigo = 'STS-OL-ZT-AC-001';
UPDATE olts SET activo = 1, oficina_id = (SELECT id FROM oficinas WHERE codigo = 'BCS' LIMIT 1) WHERE codigo = 'BCS-OL-ZT-AC-001';
UPDATE olts SET activo = 1, oficina_id = (SELECT id FROM oficinas WHERE codigo = 'ECS' LIMIT 1) WHERE codigo = 'ECS-OL-ZT-AC-001';
UPDATE olts SET activo = 1, oficina_id = (SELECT id FROM oficinas WHERE codigo = 'PTO' LIMIT 1) WHERE codigo = 'PTO-OL-ZT-AC-001';
UPDATE olts SET activo = 1, oficina_id = (SELECT id FROM oficinas WHERE codigo = 'PCO' LIMIT 1) WHERE codigo = 'PCO-OL-ZT-AC-001';
UPDATE olts SET activo = 1, oficina_id = (SELECT id FROM oficinas WHERE codigo = 'CDB' LIMIT 1) WHERE codigo = 'CDB-OL-ZT-AC-001';
UPDATE olts SET activo = 1, oficina_id = (SELECT id FROM oficinas WHERE codigo = 'CDB' LIMIT 1) WHERE codigo = 'CDB-OL-ZT-AC-002';
UPDATE olts SET activo = 1, oficina_id = (SELECT id FROM oficinas WHERE codigo = 'CVE' LIMIT 1) WHERE codigo = 'CVE-OL-ZT-AC-001';
UPDATE olts SET activo = 1, oficina_id = (SELECT id FROM oficinas WHERE codigo = 'SFX' LIMIT 1) WHERE codigo = 'SFX-OL-ZT-AC-001';
UPDATE olts SET activo = 1, oficina_id = (SELECT id FROM oficinas WHERE codigo = 'SFX' LIMIT 1) WHERE codigo = 'SFX-OL-ZT-AC-002';
UPDATE olts SET activo = 1, oficina_id = (SELECT id FROM oficinas WHERE codigo = 'VAL' LIMIT 1) WHERE codigo = 'VAL-OL-ZT-AC-001';
UPDATE olts SET activo = 1, oficina_id = (SELECT id FROM oficinas WHERE codigo = 'VAL' LIMIT 1) WHERE codigo = 'VAL-OL-ZT-AC-002';
UPDATE olts SET activo = 1, oficina_id = (SELECT id FROM oficinas WHERE codigo = 'VBN' LIMIT 1) WHERE codigo = 'VBN-OL-ZT-AC-001';
UPDATE olts SET activo = 1, oficina_id = (SELECT id FROM oficinas WHERE codigo = 'VBF' LIMIT 1) WHERE codigo = 'VBF-OL-ZT-AC-001';
UPDATE olts SET activo = 1, oficina_id = (SELECT id FROM oficinas WHERE codigo = 'SJM' LIMIT 1) WHERE codigo = 'SJM-OL-ZT-AC-001';
UPDATE olts SET activo = 1, oficina_id = (SELECT id FROM oficinas WHERE codigo = 'SMI' LIMIT 1) WHERE codigo = 'SMI-OL-ZT-AC-001';
UPDATE olts SET activo = 1, oficina_id = (SELECT id FROM oficinas WHERE codigo = 'VDP' LIMIT 1) WHERE codigo = 'VDP-OL-ZT-AC-001';
UPDATE olts SET activo = 1, oficina_id = (SELECT id FROM oficinas WHERE codigo = 'ESM' LIMIT 1) WHERE codigo = 'ESB-OL-ZT-AC-001';
UPDATE olts SET activo = 1, oficina_id = (SELECT id FROM oficinas WHERE codigo = 'CRA' LIMIT 1) WHERE codigo = 'CRA-OL-ZT-AC-001';
UPDATE olts SET activo = 1, oficina_id = (SELECT id FROM oficinas WHERE codigo = 'MRD' LIMIT 1) WHERE codigo = 'MRD-OL-ZT-AC-001';
UPDATE olts SET activo = 1, oficina_id = (SELECT id FROM oficinas WHERE codigo = 'MRD' LIMIT 1) WHERE codigo = 'MRD-OL-ZT-AC-002';
UPDATE olts SET activo = 1, oficina_id = (SELECT id FROM oficinas WHERE codigo = 'HUM' LIMIT 1) WHERE codigo = 'HUM-OL-ZT-AC-001';
UPDATE olts SET activo = 1, oficina_id = (SELECT id FROM oficinas WHERE codigo = 'LMG' LIMIT 1) WHERE codigo = 'LMG-OL-ZT-AC-001';
UPDATE olts SET activo = 1, oficina_id = (SELECT id FROM oficinas WHERE codigo = 'LMG' LIMIT 1) WHERE codigo = 'LMG-OL-ZT-AC-002';
UPDATE olts SET activo = 1, oficina_id = (SELECT id FROM oficinas WHERE codigo = 'CRB' LIMIT 1) WHERE codigo = 'CRB-OL-ZT-AC-001';
UPDATE olts SET activo = 1, oficina_id = (SELECT id FROM oficinas WHERE codigo = 'CRB' LIMIT 1) WHERE codigo = 'CRB-OL-ZT-AC-002';
UPDATE olts SET activo = 1, oficina_id = (SELECT id FROM oficinas WHERE codigo = 'APD' LIMIT 1) WHERE codigo = 'APD-OL-ZT-AC-001';
UPDATE olts SET activo = 1, oficina_id = (SELECT id FROM oficinas WHERE codigo = 'VIG' LIMIT 1) WHERE codigo = 'VIG-OL-ZT-AC-001';
UPDATE olts SET activo = 1, oficina_id = (SELECT id FROM oficinas WHERE codigo = 'VIG' LIMIT 1) WHERE codigo = 'VIG-OL-ZT-AC-002';
UPDATE olts SET activo = 1, oficina_id = (SELECT id FROM oficinas WHERE codigo = 'VIG' LIMIT 1) WHERE codigo = 'VIG-OL-ZT-AC-003';
UPDATE olts SET activo = 1, oficina_id = (SELECT id FROM oficinas WHERE codigo = 'VIG' LIMIT 1) WHERE codigo = 'VIG-OL-ZT-AC-004';
UPDATE olts SET activo = 1, oficina_id = (SELECT id FROM oficinas WHERE codigo = 'SEA' LIMIT 1) WHERE codigo = 'SEA-OL-ZT-AC-001';
UPDATE olts SET activo = 1, oficina_id = (SELECT id FROM oficinas WHERE codigo = 'LZT' LIMIT 1) WHERE codigo = 'LZT-OL-ZT-AC-001';
UPDATE olts SET activo = 1, oficina_id = (SELECT id FROM oficinas WHERE codigo = 'LPS' LIMIT 1) WHERE codigo = 'LPS-OL-ZT-AC-001';
UPDATE olts SET activo = 1, oficina_id = (SELECT id FROM oficinas WHERE codigo = 'GYB' LIMIT 1) WHERE codigo = 'GYB-OL-ZT-AC-001';
UPDATE olts SET activo = 1, oficina_id = (SELECT id FROM oficinas WHERE codigo = 'TBY' LIMIT 1) WHERE codigo = 'TBY-OL-ZT-AC-001';
UPDATE olts SET activo = 1, oficina_id = (SELECT id FROM oficinas WHERE codigo = 'TBY' LIMIT 1) WHERE codigo = 'TBY-OL-ZT-AC-002';
UPDATE olts SET activo = 1, oficina_id = (SELECT id FROM oficinas WHERE codigo = 'EJI' LIMIT 1) WHERE codigo = 'EJI-OL-ZT-AC-001';
UPDATE olts SET activo = 1, oficina_id = (SELECT id FROM oficinas WHERE codigo = 'CAF' LIMIT 1) WHERE codigo = 'CAF-OL-ZT-AC-001';
UPDATE olts SET activo = 1, oficina_id = (SELECT id FROM oficinas WHERE codigo = 'DCC' LIMIT 1) WHERE codigo = 'DCC-OL-ZT-AC-001';
UPDATE olts SET activo = 1, oficina_id = (SELECT id FROM oficinas WHERE codigo = 'CCG' LIMIT 1) WHERE codigo = 'CCG-OL-ZT-AC-001';
UPDATE olts SET activo = 1, oficina_id = (SELECT id FROM oficinas WHERE codigo = 'BTA' LIMIT 1) WHERE codigo = 'BTA-OL-ZT-AC-001';
UPDATE olts SET activo = 1, oficina_id = (SELECT id FROM oficinas WHERE codigo = 'HPT' LIMIT 1) WHERE codigo = 'HPT-OL-ZT-AC-001';
UPDATE olts SET activo = 1, oficina_id = (SELECT id FROM oficinas WHERE codigo = 'MAT' LIMIT 1) WHERE codigo = 'MAT-OL-ZT-AC-001';
UPDATE olts SET activo = 1, oficina_id = (SELECT id FROM oficinas WHERE codigo = 'MAT' LIMIT 1) WHERE codigo = 'MAT-OL-ZT-AC-002';
UPDATE olts SET activo = 1, oficina_id = (SELECT id FROM oficinas WHERE codigo = 'TMB' LIMIT 1) WHERE codigo = 'TMB-OL-ZT-AC-001';
UPDATE olts SET activo = 1, oficina_id = (SELECT id FROM oficinas WHERE codigo = 'CPT' LIMIT 1) WHERE codigo = 'CPT-OL-ZT-AC-001';
UPDATE olts SET activo = 1, oficina_id = (SELECT id FROM oficinas WHERE codigo = 'CPT' LIMIT 1) WHERE codigo = 'CPT-OL-ZT-AC-002';
UPDATE olts SET activo = 1, oficina_id = (SELECT id FROM oficinas WHERE codigo = 'PDM' LIMIT 1) WHERE codigo = 'PDM-OL-ZT-AC-001';
UPDATE olts SET activo = 1, oficina_id = (SELECT id FROM oficinas WHERE codigo = 'PDM' LIMIT 1) WHERE codigo = 'PDM-OL-ZT-AC-002';
UPDATE olts SET activo = 1, oficina_id = (SELECT id FROM oficinas WHERE codigo = 'PDM' LIMIT 1) WHERE codigo = 'PDM-OL-ZT-AC-003';
UPDATE olts SET activo = 1, oficina_id = (SELECT id FROM oficinas WHERE codigo = 'TPR' LIMIT 1) WHERE codigo = 'TPR-OL-ZT-AC-001';
UPDATE olts SET activo = 1, oficina_id = (SELECT id FROM oficinas WHERE codigo = 'MAZ' LIMIT 1) WHERE codigo = 'MAZ-OL-ZT-AC-001';
UPDATE olts SET activo = 1, oficina_id = (SELECT id FROM oficinas WHERE codigo = 'MAZ' LIMIT 1) WHERE codigo = 'MAZ-OL-ZT-AC-002';
UPDATE olts SET activo = 1, oficina_id = (SELECT id FROM oficinas WHERE codigo = 'CUM' LIMIT 1) WHERE codigo = 'CUM-OL-ZT-AC-001';
UPDATE olts SET activo = 1, oficina_id = (SELECT id FROM oficinas WHERE codigo = 'CRP' LIMIT 1) WHERE codigo = 'CRC-OL-ZT-AC-001';
UPDATE olts SET activo = 1, oficina_id = (SELECT id FROM oficinas WHERE codigo = 'LFR' LIMIT 1) WHERE codigo = 'LFR-OL-ZT-AC-001';
UPDATE olts SET activo = 1, oficina_id = (SELECT id FROM oficinas WHERE codigo = 'LFR' LIMIT 1) WHERE codigo = 'LFR-OL-ZT-AC-002';
UPDATE olts SET activo = 1, oficina_id = (SELECT id FROM oficinas WHERE codigo = 'CTO' LIMIT 1) WHERE codigo = 'CTO-OL-ZT-AC-001';
UPDATE olts SET activo = 1, oficina_id = (SELECT id FROM oficinas WHERE codigo = 'CTO' LIMIT 1) WHERE codigo = 'CTO-OL-ZT-AC-002';
UPDATE olts SET activo = 1, oficina_id = (SELECT id FROM oficinas WHERE codigo = 'CLN' LIMIT 1) WHERE codigo = 'CLN-OL-ZT-AC-001';
UPDATE olts SET activo = 1, oficina_id = (SELECT id FROM oficinas WHERE codigo = 'RBO' LIMIT 1) WHERE codigo = 'RBO-OL-ZT-AC-001';
UPDATE olts SET activo = 1, oficina_id = (SELECT id FROM oficinas WHERE codigo = 'RBO' LIMIT 1) WHERE codigo = 'RBO-OL-ZT-AC-002';
UPDATE olts SET activo = 1, oficina_id = (SELECT id FROM oficinas WHERE codigo = 'CPC' LIMIT 1) WHERE codigo = 'CPC-OL-ZT-AC-001';
UPDATE olts SET activo = 1, oficina_id = (SELECT id FROM oficinas WHERE codigo = 'UNA' LIMIT 1) WHERE codigo = 'UNA-OL-ZT-AC-001';
UPDATE olts SET activo = 1, oficina_id = (SELECT id FROM oficinas WHERE codigo = 'SAT' LIMIT 1) WHERE codigo = 'SAT-OL-ZT-AC-001';
UPDATE olts SET activo = 1, oficina_id = (SELECT id FROM oficinas WHERE codigo = 'SAT' LIMIT 1) WHERE codigo = 'SAT-OL-ZT-AC-002';
UPDATE olts SET activo = 1, oficina_id = (SELECT id FROM oficinas WHERE codigo = 'SCR' LIMIT 1) WHERE codigo = 'SCR-OL-ZT-AC-001';
UPDATE olts SET activo = 1, oficina_id = (SELECT id FROM oficinas WHERE codigo = 'SCR' LIMIT 1) WHERE codigo = 'SCR-OL-ZT-AC-002';
UPDATE olts SET activo = 1, oficina_id = (SELECT id FROM oficinas WHERE codigo = 'PGD' LIMIT 1) WHERE codigo = 'PGD-OL-ZT-AC-001';
UPDATE olts SET activo = 1, oficina_id = (SELECT id FROM oficinas WHERE codigo = 'PGD' LIMIT 1) WHERE codigo = 'PGD-OL-ZT-AC-002';
UPDATE olts SET activo = 1, oficina_id = (SELECT id FROM oficinas WHERE codigo = 'TRB' LIMIT 1) WHERE codigo = 'TRB-OL-ZT-AC-001';
UPDATE olts SET activo = 1, oficina_id = (SELECT id FROM oficinas WHERE codigo = 'VLR' LIMIT 1) WHERE codigo = 'VLR-OL-ZT-AC-001';
UPDATE olts SET activo = 1, oficina_id = (SELECT id FROM oficinas WHERE codigo = 'BNO' LIMIT 1) WHERE codigo = 'BNO-OL-ZT-AC-001';
UPDATE olts SET activo = 1, oficina_id = (SELECT id FROM oficinas WHERE codigo = 'CVJ' LIMIT 1) WHERE codigo = 'CVJ-OL-ZT-AC-001';
UPDATE olts SET activo = 1, oficina_id = (SELECT id FROM oficinas WHERE codigo = 'CVJ' LIMIT 1) WHERE codigo = 'CVJ-OL-ZT-AC-002';
UPDATE olts SET activo = 1, oficina_id = (SELECT id FROM oficinas WHERE codigo = 'CVJ' LIMIT 1) WHERE codigo = 'CVJ-OL-ZT-AC-003';
UPDATE olts SET activo = 1, oficina_id = (SELECT id FROM oficinas WHERE codigo = 'CSC' LIMIT 1) WHERE codigo = 'CSC-OL-ZT-AC-001';
UPDATE olts SET activo = 1, oficina_id = (SELECT id FROM oficinas WHERE codigo = 'MCQ' LIMIT 1) WHERE codigo = 'MCQ-OL-ZT-AC-001';
UPDATE olts SET activo = 1, oficina_id = (SELECT id FROM oficinas WHERE codigo = 'MCQ' LIMIT 1) WHERE codigo = 'MCQ-OL-ZT-AC-002';
UPDATE olts SET activo = 1, oficina_id = (SELECT id FROM oficinas WHERE codigo = 'SJP' LIMIT 1) WHERE codigo = 'SJP-OL-ZT-AC-001';
UPDATE olts SET activo = 1, oficina_id = (SELECT id FROM oficinas WHERE codigo = 'SCZ' LIMIT 1) WHERE codigo = 'SCZ-OL-ZT-AC-001';
UPDATE olts SET activo = 1, oficina_id = (SELECT id FROM oficinas WHERE codigo = 'LVR' LIMIT 1) WHERE codigo = 'LVR-OL-ZT-AC-001';
UPDATE olts SET activo = 1, oficina_id = (SELECT id FROM oficinas WHERE codigo = 'LVR' LIMIT 1) WHERE codigo = 'LVR-OL-ZT-AC-002';
UPDATE olts SET activo = 1, oficina_id = (SELECT id FROM oficinas WHERE codigo = 'GBO' LIMIT 1) WHERE codigo = 'GBO-OL-ZT-AC-001';
UPDATE olts SET activo = 1, oficina_id = (SELECT id FROM oficinas WHERE codigo = 'CLA' LIMIT 1) WHERE codigo = 'CLA-OL-ZT-AC-001';
UPDATE olts SET activo = 1, oficina_id = (SELECT id FROM oficinas WHERE codigo = 'JBT' LIMIT 1) WHERE codigo = 'JBT-OL-ZT-AC-001';
UPDATE olts SET activo = 1, oficina_id = (SELECT id FROM oficinas WHERE codigo = 'PAL' LIMIT 1) WHERE codigo = 'PAL-OL-ZT-AC-001';
UPDATE olts SET activo = 1, oficina_id = (SELECT id FROM oficinas WHERE codigo = 'ACC' LIMIT 1) WHERE codigo = 'ACC-OL-ZT-AC-001';
UPDATE olts SET activo = 1, oficina_id = (SELECT id FROM oficinas WHERE codigo = 'MCC' LIMIT 1) WHERE codigo = 'MCC-OL-ZT-AC-001';
UPDATE olts SET activo = 1, oficina_id = (SELECT id FROM oficinas WHERE codigo = 'MBO' LIMIT 1) WHERE codigo = 'MBO-OL-ZT-AC-001';
UPDATE olts SET activo = 1, oficina_id = (SELECT id FROM oficinas WHERE codigo = 'CRP' LIMIT 1) WHERE codigo = 'CRP-OL-ZT-AC-001';
UPDATE olts SET activo = 1, oficina_id = (SELECT id FROM oficinas WHERE codigo = 'ESM' LIMIT 1) WHERE codigo = 'ESM-OL-ZT-AC-001';
UPDATE olts SET activo = 1, oficina_id = (SELECT id FROM oficinas WHERE codigo = 'SCP' LIMIT 1) WHERE codigo = 'SCP-OL-ZT-AC-001';
UPDATE olts SET activo = 1, oficina_id = (SELECT id FROM oficinas WHERE codigo = 'STB' LIMIT 1) WHERE codigo = 'STB-OL-ZT-AC-001';

-- 2) Desactiva todo lo que no esté en la lista (errores de digitación, combinaciones, etc.)
UPDATE olts SET activo = 0 WHERE codigo NOT IN (
  'MON-OL-ZT-AC-001',
  'VIC-OL-ZT-AC-001',
  'VIC-OL-ZT-AC-002',
  'VIC-OL-ZT-AC-003',
  'SBE-OL-ZT-AC-001',
  'SBE-OL-ZT-AC-002',
  'STF-OL-ZT-AC-001',
  'CAT-OL-ZT-AC-001',
  'CAT-OL-ZT-AC-002',
  'ANA-OL-ZT-AC-001',
  'CTR-OL-ZT-AC-001',
  'TGR-OL-ZT-AC-001',
  'TGO-OL-ZT-AC-001',
  'CIO-OL-ZT-AC-001',
  'BRS-OL-ZT-AC-001',
  'SPS-OL-ZT-AC-001',
  'STS-OL-ZT-AC-001',
  'BCS-OL-ZT-AC-001',
  'ECS-OL-ZT-AC-001',
  'PTO-OL-ZT-AC-001',
  'PCO-OL-ZT-AC-001',
  'CDB-OL-ZT-AC-001',
  'CDB-OL-ZT-AC-002',
  'CVE-OL-ZT-AC-001',
  'SFX-OL-ZT-AC-001',
  'SFX-OL-ZT-AC-002',
  'VAL-OL-ZT-AC-001',
  'VAL-OL-ZT-AC-002',
  'VBN-OL-ZT-AC-001',
  'VBF-OL-ZT-AC-001',
  'SJM-OL-ZT-AC-001',
  'SMI-OL-ZT-AC-001',
  'VDP-OL-ZT-AC-001',
  'ESB-OL-ZT-AC-001',
  'CRA-OL-ZT-AC-001',
  'MRD-OL-ZT-AC-001',
  'MRD-OL-ZT-AC-002',
  'HUM-OL-ZT-AC-001',
  'LMG-OL-ZT-AC-001',
  'LMG-OL-ZT-AC-002',
  'CRB-OL-ZT-AC-001',
  'CRB-OL-ZT-AC-002',
  'APD-OL-ZT-AC-001',
  'VIG-OL-ZT-AC-001',
  'VIG-OL-ZT-AC-002',
  'VIG-OL-ZT-AC-003',
  'VIG-OL-ZT-AC-004',
  'SEA-OL-ZT-AC-001',
  'LZT-OL-ZT-AC-001',
  'LPS-OL-ZT-AC-001',
  'GYB-OL-ZT-AC-001',
  'TBY-OL-ZT-AC-001',
  'TBY-OL-ZT-AC-002',
  'EJI-OL-ZT-AC-001',
  'CAF-OL-ZT-AC-001',
  'DCC-OL-ZT-AC-001',
  'CCG-OL-ZT-AC-001',
  'BTA-OL-ZT-AC-001',
  'HPT-OL-ZT-AC-001',
  'MAT-OL-ZT-AC-001',
  'MAT-OL-ZT-AC-002',
  'TMB-OL-ZT-AC-001',
  'CPT-OL-ZT-AC-001',
  'CPT-OL-ZT-AC-002',
  'PDM-OL-ZT-AC-001',
  'PDM-OL-ZT-AC-002',
  'PDM-OL-ZT-AC-003',
  'TPR-OL-ZT-AC-001',
  'MAZ-OL-ZT-AC-001',
  'MAZ-OL-ZT-AC-002',
  'CUM-OL-ZT-AC-001',
  'CRC-OL-ZT-AC-001',
  'LFR-OL-ZT-AC-001',
  'LFR-OL-ZT-AC-002',
  'CTO-OL-ZT-AC-001',
  'CTO-OL-ZT-AC-002',
  'CLN-OL-ZT-AC-001',
  'RBO-OL-ZT-AC-001',
  'RBO-OL-ZT-AC-002',
  'CPC-OL-ZT-AC-001',
  'UNA-OL-ZT-AC-001',
  'SAT-OL-ZT-AC-001',
  'SAT-OL-ZT-AC-002',
  'SCR-OL-ZT-AC-001',
  'SCR-OL-ZT-AC-002',
  'PGD-OL-ZT-AC-001',
  'PGD-OL-ZT-AC-002',
  'TRB-OL-ZT-AC-001',
  'VLR-OL-ZT-AC-001',
  'BNO-OL-ZT-AC-001',
  'CVJ-OL-ZT-AC-001',
  'CVJ-OL-ZT-AC-002',
  'CVJ-OL-ZT-AC-003',
  'CSC-OL-ZT-AC-001',
  'MCQ-OL-ZT-AC-001',
  'MCQ-OL-ZT-AC-002',
  'SJP-OL-ZT-AC-001',
  'SCZ-OL-ZT-AC-001',
  'LVR-OL-ZT-AC-001',
  'LVR-OL-ZT-AC-002',
  'GBO-OL-ZT-AC-001',
  'CLA-OL-ZT-AC-001',
  'JBT-OL-ZT-AC-001',
  'PAL-OL-ZT-AC-001',
  'ACC-OL-ZT-AC-001',
  'MCC-OL-ZT-AC-001',
  'MBO-OL-ZT-AC-001',
  'CRP-OL-ZT-AC-001',
  'ESM-OL-ZT-AC-001',
  'SCP-OL-ZT-AC-001',
  'STB-OL-ZT-AC-001'
);
