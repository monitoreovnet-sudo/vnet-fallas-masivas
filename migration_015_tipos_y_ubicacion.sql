-- Migración 015: nuevos TIPOS, "Tipo de ubicación" (ENLACE / TRAMO / No aplica /
-- OFICINA) y oficinas especiales.
--
--  1. oficinas.tipo ('oficina' | 'especial'): separa las oficinas físicas de las
--     entradas especiales (ENLACE, TRAMO, "1. Soporte Técnico pero no aplica",
--     CENTRAL TELEFÓNICA, HERRAMIENTAS VNET, MERCADEO, PAGOS).
--  2. Corrige códigos/estado/localidad de las oficinas reales por NOMBRE (algunas
--     quedaron con código viejo, ej. MASIVO), y agrega ACA y BCS que faltaban.
--  3. Desactiva (activo = 0, NO borra) las oficinas "basura" que se colaron desde
--     el Excel viejo (GLPI, CAJA POS, PORTAL DE PAGOS, etc.), para que la lista
--     de OFICINA solo muestre oficinas reales. Se pueden reactivar desde
--     Administración si alguna era válida.
--  4. Catálogo de Tipos: SOPORTE TÉCNICO, CENTRAL TELEFÓNICA, HERRAMIENTAS VNET,
--     MERCADEO, PAGOS (renombra los existentes, agrega MERCADEO y quita
--     "Control de Cambios" junto con sus afectaciones/comentarios). También
--     actualiza el texto del Tipo en los tickets ya guardados.
--  5. Unidades Resolutorias nuevas: SISTEMAS y MERCADEO.
--  6. Elimina el índice único viejo de ticket_puertos (ya no se usa; impedía
--     registrar dos filas ENLACE con el mismo OLT).
--
-- Correr UNA sola vez (el ALTER TABLE falla si se repite):
--   npx wrangler d1 execute vnet_fallas_masivas --remote --file=./migration_015_tipos_y_ubicacion.sql

ALTER TABLE oficinas ADD COLUMN tipo TEXT NOT NULL DEFAULT 'oficina';

-- ---- 2. Oficinas reales (lista canónica, por nombre) ----
UPDATE oficinas SET codigo = 'ACC', estado = 'ZULIA', localidad = 'PUERTOS DE ALTAGRACIA', activo = 1 WHERE nombre = 'ACC - ACACIAS';
INSERT OR IGNORE INTO oficinas (codigo, nombre, estado, localidad) VALUES ('ACC', 'ACC - ACACIAS', 'ZULIA', 'PUERTOS DE ALTAGRACIA');
UPDATE oficinas SET codigo = 'ANA', estado = 'ANZOATEGUI', localidad = 'ANACO', activo = 1 WHERE nombre = 'ANA - ANACO';
INSERT OR IGNORE INTO oficinas (codigo, nombre, estado, localidad) VALUES ('ANA', 'ANA - ANACO', 'ANZOATEGUI', 'ANACO');
UPDATE oficinas SET codigo = 'APD', estado = 'MERIDA', localidad = 'ALTO PRADO', activo = 1 WHERE nombre = 'APD - ALTO PRADO';
INSERT OR IGNORE INTO oficinas (codigo, nombre, estado, localidad) VALUES ('APD', 'APD - ALTO PRADO', 'MERIDA', 'ALTO PRADO');
UPDATE oficinas SET codigo = 'BNO', estado = 'TRUJILLO', localidad = 'BOCONO', activo = 1 WHERE nombre = 'BNO - BOCONO';
INSERT OR IGNORE INTO oficinas (codigo, nombre, estado, localidad) VALUES ('BNO', 'BNO - BOCONO', 'TRUJILLO', 'BOCONO');
UPDATE oficinas SET codigo = 'BRS', estado = 'BARINAS', localidad = 'BARINAS', activo = 1 WHERE nombre = 'BRS - BARINAS';
INSERT OR IGNORE INTO oficinas (codigo, nombre, estado, localidad) VALUES ('BRS', 'BRS - BARINAS', 'BARINAS', 'BARINAS');
UPDATE oficinas SET codigo = 'BTA', estado = 'DISTRITO CAPITAL', localidad = 'CARACAS', activo = 1 WHERE nombre = 'BTA - BARUTA';
INSERT OR IGNORE INTO oficinas (codigo, nombre, estado, localidad) VALUES ('BTA', 'BTA - BARUTA', 'DISTRITO CAPITAL', 'CARACAS');
UPDATE oficinas SET codigo = 'CAF', estado = 'DISTRITO CAPITAL', localidad = 'CARACAS', activo = 1 WHERE nombre = 'CAF - CAFETAL';
INSERT OR IGNORE INTO oficinas (codigo, nombre, estado, localidad) VALUES ('CAF', 'CAF - CAFETAL', 'DISTRITO CAPITAL', 'CARACAS');
UPDATE oficinas SET codigo = 'CAT', estado = 'DISTRITO CAPITAL', localidad = 'CARACAS', activo = 1 WHERE nombre = 'CAT - CATIA';
INSERT OR IGNORE INTO oficinas (codigo, nombre, estado, localidad) VALUES ('CAT', 'CAT - CATIA', 'DISTRITO CAPITAL', 'CARACAS');
UPDATE oficinas SET codigo = 'CAU', estado = 'DISTRITO CAPITAL', localidad = 'CARACAS', activo = 1 WHERE nombre = 'CAU - CAURIMARE';
INSERT OR IGNORE INTO oficinas (codigo, nombre, estado, localidad) VALUES ('CAU', 'CAU - CAURIMARE', 'DISTRITO CAPITAL', 'CARACAS');
UPDATE oficinas SET codigo = 'CCG', estado = 'DISTRITO CAPITAL', localidad = 'CARACAS', activo = 1 WHERE nombre = 'CCG - CAUCAGUA';
INSERT OR IGNORE INTO oficinas (codigo, nombre, estado, localidad) VALUES ('CCG', 'CCG - CAUCAGUA', 'DISTRITO CAPITAL', 'CARACAS');
UPDATE oficinas SET codigo = 'CCS', estado = 'DISTRITO CAPITAL', localidad = 'CARACAS', activo = 1 WHERE nombre = 'CCS - CARACAS';
INSERT OR IGNORE INTO oficinas (codigo, nombre, estado, localidad) VALUES ('CCS', 'CCS - CARACAS', 'DISTRITO CAPITAL', 'CARACAS');
UPDATE oficinas SET codigo = 'CDA', estado = 'CENTRO DE ATENCION', localidad = 'CENTRO DE ATENCION', activo = 1 WHERE nombre = 'CDA - CENTRO DE ATENCION';
INSERT OR IGNORE INTO oficinas (codigo, nombre, estado, localidad) VALUES ('CDA', 'CDA - CENTRO DE ATENCION', 'CENTRO DE ATENCION', 'CENTRO DE ATENCION');
UPDATE oficinas SET codigo = 'CDB', estado = 'BOLIVAR', localidad = 'CIUDAD BOLIVAR', activo = 1 WHERE nombre = 'CDB - CIUDAD BOLIVAR';
INSERT OR IGNORE INTO oficinas (codigo, nombre, estado, localidad) VALUES ('CDB', 'CDB - CIUDAD BOLIVAR', 'BOLIVAR', 'CIUDAD BOLIVAR');
UPDATE oficinas SET codigo = 'CDC', estado = 'CONTROL DE CAMBIOS', localidad = 'CONTROL DE CAMBIOS', activo = 1 WHERE nombre = 'CDC - CONTROL DE CAMBIOS';
INSERT OR IGNORE INTO oficinas (codigo, nombre, estado, localidad) VALUES ('CDC', 'CDC - CONTROL DE CAMBIOS', 'CONTROL DE CAMBIOS', 'CONTROL DE CAMBIOS');
UPDATE oficinas SET codigo = 'CIO', estado = 'BOLIVAR', localidad = 'CIUDAD BOLIVAR', activo = 1 WHERE nombre = 'CIO - CIUDAD ORINOCO';
INSERT OR IGNORE INTO oficinas (codigo, nombre, estado, localidad) VALUES ('CIO', 'CIO - CIUDAD ORINOCO', 'BOLIVAR', 'CIUDAD BOLIVAR');
UPDATE oficinas SET codigo = 'CLA', estado = 'ZULIA', localidad = 'PUERTOS DE ALTAGRACIA', activo = 1 WHERE nombre = 'CLA - CELINA';
INSERT OR IGNORE INTO oficinas (codigo, nombre, estado, localidad) VALUES ('CLA', 'CLA - CELINA', 'ZULIA', 'PUERTOS DE ALTAGRACIA');
UPDATE oficinas SET codigo = 'CLN', estado = 'TACHIRA', localidad = 'SAN JUAN DE COLON', activo = 1 WHERE nombre = 'CLN - COLON';
INSERT OR IGNORE INTO oficinas (codigo, nombre, estado, localidad) VALUES ('CLN', 'CLN - COLON', 'TACHIRA', 'SAN JUAN DE COLON');
UPDATE oficinas SET codigo = 'CORP', estado = 'INTERNO', localidad = 'INTERNO', activo = 1 WHERE nombre = 'CORP - INTERNO';
INSERT OR IGNORE INTO oficinas (codigo, nombre, estado, localidad) VALUES ('CORP', 'CORP - INTERNO', 'INTERNO', 'INTERNO');
UPDATE oficinas SET codigo = 'CPC', estado = 'TACHIRA', localidad = 'SAN CRISTOBAL', activo = 1 WHERE nombre = 'CPC - CAPACHO';
INSERT OR IGNORE INTO oficinas (codigo, nombre, estado, localidad) VALUES ('CPC', 'CPC - CAPACHO', 'TACHIRA', 'SAN CRISTOBAL');
UPDATE oficinas SET codigo = 'CPT', estado = 'MONAGAS', localidad = 'CARIPITO', activo = 1 WHERE nombre = 'CPT - CARIPITO';
INSERT OR IGNORE INTO oficinas (codigo, nombre, estado, localidad) VALUES ('CPT', 'CPT - CARIPITO', 'MONAGAS', 'CARIPITO');
UPDATE oficinas SET codigo = 'CRA', estado = 'LARA', localidad = 'CARORA', activo = 1 WHERE nombre = 'CRA - CARORA';
INSERT OR IGNORE INTO oficinas (codigo, nombre, estado, localidad) VALUES ('CRA', 'CRA - CARORA', 'LARA', 'CARORA');
UPDATE oficinas SET codigo = 'CRB', estado = 'MERIDA', localidad = 'MERIDA', activo = 1 WHERE nombre = 'CRB - LA CARABOBO';
INSERT OR IGNORE INTO oficinas (codigo, nombre, estado, localidad) VALUES ('CRB', 'CRB - LA CARABOBO', 'MERIDA', 'MERIDA');
UPDATE oficinas SET codigo = 'CRP', estado = 'SUCRE', localidad = 'CARUPANO', activo = 1 WHERE nombre = 'CRP - CARUPANO';
INSERT OR IGNORE INTO oficinas (codigo, nombre, estado, localidad) VALUES ('CRP', 'CRP - CARUPANO', 'SUCRE', 'CARUPANO');
UPDATE oficinas SET codigo = 'CSC', estado = 'ZULIA', localidad = 'CAJA SECA', activo = 1 WHERE nombre = 'CSC - CAJA SECA';
INSERT OR IGNORE INTO oficinas (codigo, nombre, estado, localidad) VALUES ('CSC', 'CSC - CAJA SECA', 'ZULIA', 'CAJA SECA');
UPDATE oficinas SET codigo = 'CTO', estado = 'TACHIRA', localidad = 'COLONCITO', activo = 1 WHERE nombre = 'CTO - COLONCITO';
INSERT OR IGNORE INTO oficinas (codigo, nombre, estado, localidad) VALUES ('CTO', 'CTO - COLONCITO', 'TACHIRA', 'COLONCITO');
UPDATE oficinas SET codigo = 'CTR', estado = 'ANZOATEGUI', localidad = 'ANACO', activo = 1 WHERE nombre = 'CTR - CANTAURA';
INSERT OR IGNORE INTO oficinas (codigo, nombre, estado, localidad) VALUES ('CTR', 'CTR - CANTAURA', 'ANZOATEGUI', 'ANACO');
UPDATE oficinas SET codigo = 'CUM', estado = 'SUCRE', localidad = 'SUCRE', activo = 1 WHERE nombre = 'CUM - CUMANA';
INSERT OR IGNORE INTO oficinas (codigo, nombre, estado, localidad) VALUES ('CUM', 'CUM - CUMANA', 'SUCRE', 'SUCRE');
UPDATE oficinas SET codigo = 'CVE', estado = 'BOLIVAR', localidad = 'CIUDAD BOLIVAR', activo = 1 WHERE nombre = 'CVE - AV ESPAÑA';
INSERT OR IGNORE INTO oficinas (codigo, nombre, estado, localidad) VALUES ('CVE', 'CVE - AV ESPAÑA', 'BOLIVAR', 'CIUDAD BOLIVAR');
UPDATE oficinas SET codigo = 'CVJ', estado = 'VALERA', localidad = 'TRUJILLO', activo = 1 WHERE nombre = 'CVJ - CARVAJAL';
INSERT OR IGNORE INTO oficinas (codigo, nombre, estado, localidad) VALUES ('CVJ', 'CVJ - CARVAJAL', 'VALERA', 'TRUJILLO');
UPDATE oficinas SET codigo = 'DCC', estado = 'DISTRITO CAPITAL', localidad = 'CARACAS', activo = 1 WHERE nombre = 'DCC - DOS CAMINOS';
INSERT OR IGNORE INTO oficinas (codigo, nombre, estado, localidad) VALUES ('DCC', 'DCC - DOS CAMINOS', 'DISTRITO CAPITAL', 'CARACAS');
UPDATE oficinas SET codigo = 'ECS', estado = 'BARINAS', localidad = 'EL CANTON', activo = 1 WHERE nombre = 'ECS - EL CANTON';
INSERT OR IGNORE INTO oficinas (codigo, nombre, estado, localidad) VALUES ('ECS', 'ECS - EL CANTON', 'BARINAS', 'EL CANTON');
UPDATE oficinas SET codigo = 'EJI', estado = 'MERIDA', localidad = 'EJIDO', activo = 1 WHERE nombre = 'EJI - EJIDO';
INSERT OR IGNORE INTO oficinas (codigo, nombre, estado, localidad) VALUES ('EJI', 'EJI - EJIDO', 'MERIDA', 'EJIDO');
UPDATE oficinas SET codigo = 'ESM', estado = 'GUARICO', localidad = 'EL SOMBRERO', activo = 1 WHERE nombre = 'ESM - EL SOMBRERO';
INSERT OR IGNORE INTO oficinas (codigo, nombre, estado, localidad) VALUES ('ESM', 'ESM - EL SOMBRERO', 'GUARICO', 'EL SOMBRERO');
UPDATE oficinas SET codigo = 'GBO', estado = 'ZULIA', localidad = 'EL GUAYABO', activo = 1 WHERE nombre = 'GBO - EL GUAYABO';
INSERT OR IGNORE INTO oficinas (codigo, nombre, estado, localidad) VALUES ('GBO', 'GBO - EL GUAYABO', 'ZULIA', 'EL GUAYABO');
UPDATE oficinas SET codigo = 'GYB', estado = 'MERIDA', localidad = 'EL VIGIA', activo = 1 WHERE nombre = 'GYB - GUAYABONES';
INSERT OR IGNORE INTO oficinas (codigo, nombre, estado, localidad) VALUES ('GYB', 'GYB - GUAYABONES', 'MERIDA', 'EL VIGIA');
UPDATE oficinas SET codigo = 'HPT', estado = 'DISTRITO CAPITAL', localidad = 'CARACAS', activo = 1 WHERE nombre = 'HPT - HOYO DE LA PUERTA';
INSERT OR IGNORE INTO oficinas (codigo, nombre, estado, localidad) VALUES ('HPT', 'HPT - HOYO DE LA PUERTA', 'DISTRITO CAPITAL', 'CARACAS');
UPDATE oficinas SET codigo = 'HUM', estado = 'MERIDA', localidad = 'MERIDA', activo = 1 WHERE nombre = 'HUM - LA HUMBOLDT';
INSERT OR IGNORE INTO oficinas (codigo, nombre, estado, localidad) VALUES ('HUM', 'HUM - LA HUMBOLDT', 'MERIDA', 'MERIDA');
UPDATE oficinas SET codigo = 'JBT', estado = 'ZULIA', localidad = 'PUERTOS DE ALTAGRACIA', activo = 1 WHERE nombre = 'JBT - JOBITOS';
INSERT OR IGNORE INTO oficinas (codigo, nombre, estado, localidad) VALUES ('JBT', 'JBT - JOBITOS', 'ZULIA', 'PUERTOS DE ALTAGRACIA');
UPDATE oficinas SET codigo = 'LFR', estado = 'TACHIRA', localidad = 'LA FRIA', activo = 1 WHERE nombre = 'LFR - LA FRIA';
INSERT OR IGNORE INTO oficinas (codigo, nombre, estado, localidad) VALUES ('LFR', 'LFR - LA FRIA', 'TACHIRA', 'LA FRIA');
UPDATE oficinas SET codigo = 'LMG', estado = 'MERIDA', localidad = 'MERIDA', activo = 1 WHERE nombre = 'LMG - LA MILAGROSA';
INSERT OR IGNORE INTO oficinas (codigo, nombre, estado, localidad) VALUES ('LMG', 'LMG - LA MILAGROSA', 'MERIDA', 'MERIDA');
UPDATE oficinas SET codigo = 'LPS', estado = 'MERIDA', localidad = 'MERIDA', activo = 1 WHERE nombre = 'LPS - LA PEDREGOSA';
INSERT OR IGNORE INTO oficinas (codigo, nombre, estado, localidad) VALUES ('LPS', 'LPS - LA PEDREGOSA', 'MERIDA', 'MERIDA');
UPDATE oficinas SET codigo = 'LVR', estado = 'ZULIA', localidad = 'MACHIQUES', activo = 1 WHERE nombre = 'LVR - VILLA DEL ROSARIO';
INSERT OR IGNORE INTO oficinas (codigo, nombre, estado, localidad) VALUES ('LVR', 'LVR - VILLA DEL ROSARIO', 'ZULIA', 'MACHIQUES');
UPDATE oficinas SET codigo = 'LZT', estado = 'MERIDA', localidad = 'EL VIGIA', activo = 1 WHERE nombre = 'LZT - LA AZULITA';
INSERT OR IGNORE INTO oficinas (codigo, nombre, estado, localidad) VALUES ('LZT', 'LZT - LA AZULITA', 'MERIDA', 'EL VIGIA');
UPDATE oficinas SET codigo = 'MASIVO', estado = 'MASIVO', localidad = 'MASIVO', activo = 1 WHERE nombre = 'MASIVO - MASIVO';
INSERT OR IGNORE INTO oficinas (codigo, nombre, estado, localidad) VALUES ('MASIVO', 'MASIVO - MASIVO', 'MASIVO', 'MASIVO');
UPDATE oficinas SET codigo = 'MAT', estado = 'MONAGAS', localidad = 'MATURIN', activo = 1 WHERE nombre = 'MAT - LA FLORESTA';
INSERT OR IGNORE INTO oficinas (codigo, nombre, estado, localidad) VALUES ('MAT', 'MAT - LA FLORESTA', 'MONAGAS', 'MATURIN');
UPDATE oficinas SET codigo = 'MAZ', estado = 'MONAGAS', localidad = 'MATURIN', activo = 1 WHERE nombre = 'MAZ - ZONA INDUSTRIAL';
INSERT OR IGNORE INTO oficinas (codigo, nombre, estado, localidad) VALUES ('MAZ', 'MAZ - ZONA INDUSTRIAL', 'MONAGAS', 'MATURIN');
UPDATE oficinas SET codigo = 'MBO', estado = 'ZULIA', localidad = 'MARACAIBO', activo = 1 WHERE nombre = 'MBO - MARACAIBO';
INSERT OR IGNORE INTO oficinas (codigo, nombre, estado, localidad) VALUES ('MBO', 'MBO - MARACAIBO', 'ZULIA', 'MARACAIBO');
UPDATE oficinas SET codigo = 'MCC', estado = 'ZULIA', localidad = 'PUERTOS DE ALTAGRACIA', activo = 1 WHERE nombre = 'MCC - MECOCAL';
INSERT OR IGNORE INTO oficinas (codigo, nombre, estado, localidad) VALUES ('MCC', 'MCC - MECOCAL', 'ZULIA', 'PUERTOS DE ALTAGRACIA');
UPDATE oficinas SET codigo = 'MCQ', estado = 'ZULIA', localidad = 'MACHIQUES', activo = 1 WHERE nombre = 'MCQ - MACHIQUES';
INSERT OR IGNORE INTO oficinas (codigo, nombre, estado, localidad) VALUES ('MCQ', 'MCQ - MACHIQUES', 'ZULIA', 'MACHIQUES');
UPDATE oficinas SET codigo = 'MON', estado = 'DISTRITO CAPITAL', localidad = 'CARACAS', activo = 1 WHERE nombre = 'MON - MONTALBAN';
INSERT OR IGNORE INTO oficinas (codigo, nombre, estado, localidad) VALUES ('MON', 'MON - MONTALBAN', 'DISTRITO CAPITAL', 'CARACAS');
UPDATE oficinas SET codigo = 'MRD', estado = 'MERIDA', localidad = 'MERIDA', activo = 1 WHERE nombre = 'MRD - MERIDA';
INSERT OR IGNORE INTO oficinas (codigo, nombre, estado, localidad) VALUES ('MRD', 'MRD - MERIDA', 'MERIDA', 'MERIDA');
UPDATE oficinas SET codigo = 'OLV', estado = 'ZULIA', localidad = 'MARACAIBO', activo = 1 WHERE nombre = 'OLV - LOS OLIVOS';
INSERT OR IGNORE INTO oficinas (codigo, nombre, estado, localidad) VALUES ('OLV', 'OLV - LOS OLIVOS', 'ZULIA', 'MARACAIBO');
UPDATE oficinas SET codigo = 'PAL', estado = 'ZULIA', localidad = 'PUERTOS DE ALTAGRACIA', activo = 1 WHERE nombre = 'PAL - PUERTOS DE ALTAGRACIA';
INSERT OR IGNORE INTO oficinas (codigo, nombre, estado, localidad) VALUES ('PAL', 'PAL - PUERTOS DE ALTAGRACIA', 'ZULIA', 'PUERTOS DE ALTAGRACIA');
UPDATE oficinas SET codigo = 'PCO', estado = 'BOLIVAR', localidad = 'PUERTO ORDAZ', activo = 1 WHERE nombre = 'PCO - CORE 8';
INSERT OR IGNORE INTO oficinas (codigo, nombre, estado, localidad) VALUES ('PCO', 'PCO - CORE 8', 'BOLIVAR', 'PUERTO ORDAZ');
UPDATE oficinas SET codigo = 'PDM', estado = 'MONAGAS', localidad = 'MATURIN', activo = 1 WHERE nombre = 'PDM - PUNTA DE MATA';
INSERT OR IGNORE INTO oficinas (codigo, nombre, estado, localidad) VALUES ('PDM', 'PDM - PUNTA DE MATA', 'MONAGAS', 'MATURIN');
UPDATE oficinas SET codigo = 'PGD', estado = 'TACHIRA', localidad = 'SAN CRISTOBAL', activo = 1 WHERE nombre = 'PGD - PALO GORDO';
INSERT OR IGNORE INTO oficinas (codigo, nombre, estado, localidad) VALUES ('PGD', 'PGD - PALO GORDO', 'TACHIRA', 'SAN CRISTOBAL');
UPDATE oficinas SET codigo = 'PTO', estado = 'BOLIVAR', localidad = 'PUERTO ORDAZ', activo = 1 WHERE nombre = 'PTO - PUERTO ORDAZ';
INSERT OR IGNORE INTO oficinas (codigo, nombre, estado, localidad) VALUES ('PTO', 'PTO - PUERTO ORDAZ', 'BOLIVAR', 'PUERTO ORDAZ');
UPDATE oficinas SET codigo = 'RBO', estado = 'TACHIRA', localidad = 'SAN CRISTOBAL', activo = 1 WHERE nombre = 'RBO - RUBIO';
INSERT OR IGNORE INTO oficinas (codigo, nombre, estado, localidad) VALUES ('RBO', 'RBO - RUBIO', 'TACHIRA', 'SAN CRISTOBAL');
UPDATE oficinas SET codigo = 'SAT', estado = 'TACHIRA', localidad = 'SAN ANTONIO DEL TACHIRA', activo = 1 WHERE nombre = 'SAT - SAN ANTONIO DEL TACHIRA';
INSERT OR IGNORE INTO oficinas (codigo, nombre, estado, localidad) VALUES ('SAT', 'SAT - SAN ANTONIO DEL TACHIRA', 'TACHIRA', 'SAN ANTONIO DEL TACHIRA');
UPDATE oficinas SET codigo = 'SBE', estado = 'DISTRITO CAPITAL', localidad = 'CARACAS', activo = 1 WHERE nombre = 'SBE - SAN BERNARDINO';
INSERT OR IGNORE INTO oficinas (codigo, nombre, estado, localidad) VALUES ('SBE', 'SBE - SAN BERNARDINO', 'DISTRITO CAPITAL', 'CARACAS');
UPDATE oficinas SET codigo = 'SCP', estado = 'BARINAS', localidad = 'SOCOPO', activo = 1 WHERE nombre = 'SCP - SOCOPO';
INSERT OR IGNORE INTO oficinas (codigo, nombre, estado, localidad) VALUES ('SCP', 'SCP - SOCOPO', 'BARINAS', 'SOCOPO');
UPDATE oficinas SET codigo = 'SCR', estado = 'TACHIRA', localidad = 'SAN CRISTOBAL', activo = 1 WHERE nombre = 'SCR - SAN CRISTOBAL';
INSERT OR IGNORE INTO oficinas (codigo, nombre, estado, localidad) VALUES ('SCR', 'SCR - SAN CRISTOBAL', 'TACHIRA', 'SAN CRISTOBAL');
UPDATE oficinas SET codigo = 'SCZ', estado = 'ZULIA', localidad = 'SANTA BARBARA', activo = 1 WHERE nombre = 'SCZ - SAN CARLOS';
INSERT OR IGNORE INTO oficinas (codigo, nombre, estado, localidad) VALUES ('SCZ', 'SCZ - SAN CARLOS', 'ZULIA', 'SANTA BARBARA');
UPDATE oficinas SET codigo = 'SEA', estado = 'MERIDA', localidad = 'EL VIGIA', activo = 1 WHERE nombre = 'SEA - SANTA ELENA DE ARENALES';
INSERT OR IGNORE INTO oficinas (codigo, nombre, estado, localidad) VALUES ('SEA', 'SEA - SANTA ELENA DE ARENALES', 'MERIDA', 'EL VIGIA');
UPDATE oficinas SET codigo = 'SFX', estado = 'BOLIVAR', localidad = 'PUERTO ORDAZ', activo = 1 WHERE nombre = 'SFX - SAN FELIX';
INSERT OR IGNORE INTO oficinas (codigo, nombre, estado, localidad) VALUES ('SFX', 'SFX - SAN FELIX', 'BOLIVAR', 'PUERTO ORDAZ');
UPDATE oficinas SET codigo = 'SJM', estado = 'GUARICO', localidad = 'SAN JUAN DE LOS MORROS', activo = 1 WHERE nombre = 'SJM - SAN JUAN DE LOS MORROS';
INSERT OR IGNORE INTO oficinas (codigo, nombre, estado, localidad) VALUES ('SJM', 'SJM - SAN JUAN DE LOS MORROS', 'GUARICO', 'SAN JUAN DE LOS MORROS');
UPDATE oficinas SET codigo = 'SJP', estado = 'ZULIA', localidad = 'MACHIQUES', activo = 1 WHERE nombre = 'SJP - SAN JOSE DE PERIJA';
INSERT OR IGNORE INTO oficinas (codigo, nombre, estado, localidad) VALUES ('SJP', 'SJP - SAN JOSE DE PERIJA', 'ZULIA', 'MACHIQUES');
UPDATE oficinas SET codigo = 'SMI', estado = 'GUARICO', localidad = 'SANTA MARIA DE IPIRE', activo = 1 WHERE nombre = 'SMI - SANTA MARIA DE IPIRE';
INSERT OR IGNORE INTO oficinas (codigo, nombre, estado, localidad) VALUES ('SMI', 'SMI - SANTA MARIA DE IPIRE', 'GUARICO', 'SANTA MARIA DE IPIRE');
UPDATE oficinas SET codigo = 'STB', estado = 'BARINAS', localidad = 'BARINAS', activo = 1 WHERE nombre = 'STB - SANTA BARBARA DE BARINAS';
INSERT OR IGNORE INTO oficinas (codigo, nombre, estado, localidad) VALUES ('STB', 'STB - SANTA BARBARA DE BARINAS', 'BARINAS', 'BARINAS');
UPDATE oficinas SET codigo = 'STF', estado = 'DISTRITO CAPITAL', localidad = 'CARACAS', activo = 1 WHERE nombre = 'STF - SANTA FE';
INSERT OR IGNORE INTO oficinas (codigo, nombre, estado, localidad) VALUES ('STF', 'STF - SANTA FE', 'DISTRITO CAPITAL', 'CARACAS');
UPDATE oficinas SET codigo = 'SVZ', estado = 'ZULIA', localidad = 'SANTA BARBARA DEL ZULIA', activo = 1 WHERE nombre = 'SVZ - SANTA BARBARA DEL ZULIA';
INSERT OR IGNORE INTO oficinas (codigo, nombre, estado, localidad) VALUES ('SVZ', 'SVZ - SANTA BARBARA DEL ZULIA', 'ZULIA', 'SANTA BARBARA DEL ZULIA');
UPDATE oficinas SET codigo = 'TBY', estado = 'MERIDA', localidad = 'MERIDA', activo = 1 WHERE nombre = 'TBY - TABAY';
INSERT OR IGNORE INTO oficinas (codigo, nombre, estado, localidad) VALUES ('TBY', 'TBY - TABAY', 'MERIDA', 'MERIDA');
UPDATE oficinas SET codigo = 'TGO', estado = 'ANZOATEGUI', localidad = 'EL TIGRE', activo = 1 WHERE nombre = 'TGO - EL TIGRITO';
INSERT OR IGNORE INTO oficinas (codigo, nombre, estado, localidad) VALUES ('TGO', 'TGO - EL TIGRITO', 'ANZOATEGUI', 'EL TIGRE');
UPDATE oficinas SET codigo = 'TGR', estado = 'ANZOATEGUI', localidad = 'EL TIGRE', activo = 1 WHERE nombre = 'TGR - EL TIGRE';
INSERT OR IGNORE INTO oficinas (codigo, nombre, estado, localidad) VALUES ('TGR', 'TGR - EL TIGRE', 'ANZOATEGUI', 'EL TIGRE');
UPDATE oficinas SET codigo = 'TMB', estado = 'MONAGAS', localidad = 'TEMBLADOR', activo = 1 WHERE nombre = 'TMB - TEMBLADOR';
INSERT OR IGNORE INTO oficinas (codigo, nombre, estado, localidad) VALUES ('TMB', 'TMB - TEMBLADOR', 'MONAGAS', 'TEMBLADOR');
UPDATE oficinas SET codigo = 'TPR', estado = 'MONAGAS', localidad = 'MATURIN', activo = 1 WHERE nombre = 'TPR - TIPURO';
INSERT OR IGNORE INTO oficinas (codigo, nombre, estado, localidad) VALUES ('TPR', 'TPR - TIPURO', 'MONAGAS', 'MATURIN');
UPDATE oficinas SET codigo = 'TRB', estado = 'TACHIRA', localidad = 'SAN CRISTOBAL', activo = 1 WHERE nombre = 'TRB - TARIBA';
INSERT OR IGNORE INTO oficinas (codigo, nombre, estado, localidad) VALUES ('TRB', 'TRB - TARIBA', 'TACHIRA', 'SAN CRISTOBAL');
UPDATE oficinas SET codigo = 'UNA', estado = 'TACHIRA', localidad = 'UREÑA', activo = 1 WHERE nombre = 'UNA - UREÑA';
INSERT OR IGNORE INTO oficinas (codigo, nombre, estado, localidad) VALUES ('UNA', 'UNA - UREÑA', 'TACHIRA', 'UREÑA');
UPDATE oficinas SET codigo = 'VAL', estado = 'CARABOBO', localidad = 'VALENCIA', activo = 1 WHERE nombre = 'VAL - PASEO LAS INDUSTRIAS';
INSERT OR IGNORE INTO oficinas (codigo, nombre, estado, localidad) VALUES ('VAL', 'VAL - PASEO LAS INDUSTRIAS', 'CARABOBO', 'VALENCIA');
UPDATE oficinas SET codigo = 'VBF', estado = 'CARABOBO', localidad = 'VALENCIA', activo = 1 WHERE nombre = 'VBF - BELLA FLORIDA';
INSERT OR IGNORE INTO oficinas (codigo, nombre, estado, localidad) VALUES ('VBF', 'VBF - BELLA FLORIDA', 'CARABOBO', 'VALENCIA');
UPDATE oficinas SET codigo = 'VBN', estado = 'CARABOBO', localidad = 'VALENCIA', activo = 1 WHERE nombre = 'VBN - BOLIVAR NORTE';
INSERT OR IGNORE INTO oficinas (codigo, nombre, estado, localidad) VALUES ('VBN', 'VBN - BOLIVAR NORTE', 'CARABOBO', 'VALENCIA');
UPDATE oficinas SET codigo = 'VDP', estado = 'GUARICO', localidad = 'VALLE DE LA PASCUA', activo = 1 WHERE nombre = 'VDP - VALLE DE LA PASCUA';
INSERT OR IGNORE INTO oficinas (codigo, nombre, estado, localidad) VALUES ('VDP', 'VDP - VALLE DE LA PASCUA', 'GUARICO', 'VALLE DE LA PASCUA');
UPDATE oficinas SET codigo = 'VIC', estado = 'DISTRITO CAPITAL', localidad = 'CARACAS', activo = 1 WHERE nombre = 'VIC - AV VICTORIA';
INSERT OR IGNORE INTO oficinas (codigo, nombre, estado, localidad) VALUES ('VIC', 'VIC - AV VICTORIA', 'DISTRITO CAPITAL', 'CARACAS');
UPDATE oficinas SET codigo = 'VIG', estado = 'MERIDA', localidad = 'EL VIGIA', activo = 1 WHERE nombre = 'VIG - EL VIGIA';
INSERT OR IGNORE INTO oficinas (codigo, nombre, estado, localidad) VALUES ('VIG', 'VIG - EL VIGIA', 'MERIDA', 'EL VIGIA');
UPDATE oficinas SET codigo = 'VLR', estado = 'TRUJILLO', localidad = 'VALERA', activo = 1 WHERE nombre = 'VLR - VALERA';
INSERT OR IGNORE INTO oficinas (codigo, nombre, estado, localidad) VALUES ('VLR', 'VLR - VALERA', 'TRUJILLO', 'VALERA');
UPDATE oficinas SET codigo = 'SGU', estado = 'DISTRITO CAPITAL', localidad = 'CARACAS', activo = 1 WHERE nombre = 'SGU - SAN AGUSTIN';
INSERT OR IGNORE INTO oficinas (codigo, nombre, estado, localidad) VALUES ('SGU', 'SGU - SAN AGUSTIN', 'DISTRITO CAPITAL', 'CARACAS');

-- Oficinas reales que faltaban en la lista canónica (BCS ya existía con otro nombre)
UPDATE oficinas SET nombre = 'BCS - BARRANCAS', estado = 'BARINAS', localidad = 'BARINAS', activo = 1 WHERE codigo = 'BCS' AND nombre <> 'BCS - BARRANCAS';
INSERT OR IGNORE INTO oficinas (codigo, nombre, estado, localidad) VALUES ('ACA', 'ACA - ACARIGUA', 'PORTUGUESA', 'ACARIGUA');
INSERT OR IGNORE INTO oficinas (codigo, nombre, estado, localidad) VALUES ('BCS', 'BCS - BARRANCAS', 'BARINAS', 'BARINAS');

-- ---- Oficinas ESPECIALES ----
-- (la comodín vieja '1. Soporte técnico, pero no aplica' tiene código SOP: se RENOMBRA, así los tickets que ya la usan siguen apuntando a ella)
UPDATE oficinas SET nombre = '1. Soporte Técnico pero no aplica', estado = '1. Soporte Técnico pero no aplica', localidad = '1. Soporte Técnico pero no aplica', tipo = 'especial', activo = 1 WHERE codigo = 'SOP';
UPDATE oficinas SET codigo = 'ENLACE', estado = 'ENLACE', localidad = 'ENLACE', tipo = 'especial', activo = 1 WHERE nombre = 'ENLACE';
UPDATE oficinas SET codigo = 'TRAMO', estado = 'TRAMO', localidad = 'TRAMO', tipo = 'especial', activo = 1 WHERE nombre = 'TRAMO';
UPDATE oficinas SET codigo = 'CENTRAL', estado = 'CENTRAL TELEFÓNICA', localidad = 'CENTRAL TELEFÓNICA', tipo = 'especial', activo = 1 WHERE nombre = 'CENTRAL TELEFÓNICA';
UPDATE oficinas SET codigo = 'HERRAM', estado = 'HERRAMIENTAS VNET', localidad = 'HERRAMIENTAS VNET', tipo = 'especial', activo = 1 WHERE nombre = 'HERRAMIENTAS VNET';
UPDATE oficinas SET codigo = 'MERCAD', estado = 'MERCADEO', localidad = 'MERCADEO', tipo = 'especial', activo = 1 WHERE nombre = 'MERCADEO';
UPDATE oficinas SET codigo = 'PAGOS', estado = 'PAGOS', localidad = 'PAGOS', tipo = 'especial', activo = 1 WHERE nombre = 'PAGOS';
INSERT OR IGNORE INTO oficinas (codigo, nombre, estado, localidad, tipo) VALUES ('SOP', '1. Soporte Técnico pero no aplica', '1. Soporte Técnico pero no aplica', '1. Soporte Técnico pero no aplica', 'especial');
INSERT OR IGNORE INTO oficinas (codigo, nombre, estado, localidad, tipo) VALUES ('ENLACE', 'ENLACE', 'ENLACE', 'ENLACE', 'especial');
INSERT OR IGNORE INTO oficinas (codigo, nombre, estado, localidad, tipo) VALUES ('TRAMO', 'TRAMO', 'TRAMO', 'TRAMO', 'especial');
INSERT OR IGNORE INTO oficinas (codigo, nombre, estado, localidad, tipo) VALUES ('CENTRAL', 'CENTRAL TELEFÓNICA', 'CENTRAL TELEFÓNICA', 'CENTRAL TELEFÓNICA', 'especial');
INSERT OR IGNORE INTO oficinas (codigo, nombre, estado, localidad, tipo) VALUES ('HERRAM', 'HERRAMIENTAS VNET', 'HERRAMIENTAS VNET', 'HERRAMIENTAS VNET', 'especial');
INSERT OR IGNORE INTO oficinas (codigo, nombre, estado, localidad, tipo) VALUES ('MERCAD', 'MERCADEO', 'MERCADEO', 'MERCADEO', 'especial');
INSERT OR IGNORE INTO oficinas (codigo, nombre, estado, localidad, tipo) VALUES ('PAGOS', 'PAGOS', 'PAGOS', 'PAGOS', 'especial');

-- ---- 3. Desactivar oficinas basura (las reales y las especiales no se tocan) ----
UPDATE oficinas SET activo = 0 WHERE tipo = 'oficina' AND codigo NOT IN ('ACC', 'ANA', 'APD', 'BNO', 'BRS', 'BTA', 'CAF', 'CAT', 'CAU', 'CCG', 'CCS', 'CDA', 'CDB', 'CDC', 'CIO', 'CLA', 'CLN', 'CORP', 'CPC', 'CPT', 'CRA', 'CRB', 'CRP', 'CSC', 'CTO', 'CTR', 'CUM', 'CVE', 'CVJ', 'DCC', 'ECS', 'EJI', 'ESM', 'GBO', 'GYB', 'HPT', 'HUM', 'JBT', 'LFR', 'LMG', 'LPS', 'LVR', 'LZT', 'MASIVO', 'MAT', 'MAZ', 'MBO', 'MCC', 'MCQ', 'MON', 'MRD', 'OLV', 'PAL', 'PCO', 'PDM', 'PGD', 'PTO', 'RBO', 'SAT', 'SBE', 'SCP', 'SCR', 'SCZ', 'SEA', 'SFX', 'SJM', 'SJP', 'SMI', 'STB', 'STF', 'SVZ', 'TBY', 'TGO', 'TGR', 'TMB', 'TPR', 'TRB', 'UNA', 'VAL', 'VBF', 'VBN', 'VDP', 'VIC', 'VIG', 'VLR', 'SGU', 'ACA', 'BCS');

-- ---- 4. Catálogo de Tipos ----
UPDATE catalogo_categorias SET nombre = 'SOPORTE TÉCNICO' WHERE nombre = 'Soporte Técnico (Internet / Pley)';
UPDATE catalogo_categorias SET nombre = 'CENTRAL TELEFÓNICA' WHERE nombre = 'Central Telefónica';
UPDATE catalogo_categorias SET nombre = 'HERRAMIENTAS VNET' WHERE nombre = 'Herramientas VNET';
UPDATE catalogo_categorias SET nombre = 'PAGOS' WHERE nombre = 'Pagos';
INSERT OR IGNORE INTO catalogo_categorias (nombre, orden) VALUES ('MERCADEO', 4);
UPDATE catalogo_categorias SET orden = 1 WHERE nombre = 'SOPORTE TÉCNICO';
UPDATE catalogo_categorias SET orden = 2 WHERE nombre = 'CENTRAL TELEFÓNICA';
UPDATE catalogo_categorias SET orden = 3 WHERE nombre = 'HERRAMIENTAS VNET';
UPDATE catalogo_categorias SET orden = 4 WHERE nombre = 'MERCADEO';
UPDATE catalogo_categorias SET orden = 5 WHERE nombre = 'PAGOS';

-- Afectación de MERCADEO (la que aparece en la base de datos)
INSERT OR IGNORE INTO catalogo_afectaciones (categoria_id, nombre, orden)
  VALUES ((SELECT id FROM catalogo_categorias WHERE nombre = 'MERCADEO'), 'PORTAL WEB VNET', 1);

-- Quitar "Control de Cambios" (ya no es un Tipo) y lo que dependía de él
DELETE FROM catalogo_afectaciones WHERE categoria_id = (SELECT id FROM catalogo_categorias WHERE nombre = 'Control de Cambios');
DELETE FROM catalogo_comentarios WHERE categoria_id = (SELECT id FROM catalogo_categorias WHERE nombre = 'Control de Cambios');
DELETE FROM catalogo_categorias WHERE nombre = 'Control de Cambios';

-- Texto del Tipo en los tickets ya guardados
UPDATE tickets SET categoria_afectacion = 'SOPORTE TÉCNICO' WHERE categoria_afectacion = 'Soporte Técnico (Internet / Pley)';
UPDATE tickets SET categoria_afectacion = 'CENTRAL TELEFÓNICA' WHERE categoria_afectacion = 'Central Telefónica';
UPDATE tickets SET categoria_afectacion = 'HERRAMIENTAS VNET' WHERE categoria_afectacion = 'Herramientas VNET';
UPDATE tickets SET categoria_afectacion = 'PAGOS' WHERE categoria_afectacion = 'Pagos';

-- ---- 5. Unidades Resolutorias nuevas ----
INSERT OR IGNORE INTO catalogo_unidades_resolutorias (nombre, orden) VALUES ('SISTEMAS', 9);
INSERT OR IGNORE INTO catalogo_unidades_resolutorias (nombre, orden) VALUES ('MERCADEO', 10);

-- ---- 6. Índice único viejo (ya no se usa) ----
DROP INDEX IF EXISTS idx_ticket_puertos_unico;
