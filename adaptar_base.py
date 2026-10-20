#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
adaptar_base.py  -  Adapta tu Excel/CSV/TSV histórico al formato de la pestaña Repositorio.

Uso:   python adaptar_base.py MI_ARCHIVO.xlsx          (también .csv / .tsv / .txt)
Salida: base_adaptada.xlsx  con 3 hojas:
   Importar  -> súbela tal cual en Administración > Repositorio
   Cambios   -> cada valor que el script corrigió (para que lo audites)
   Revisión  -> cosas que NO se pueden decidir solas (revísalas a mano)
Requiere:  pip install pandas openpyxl
"""
import sys, re, unicodedata, json
import pandas as pd

OFICINAS = {"ACC": "ACC - ACACIAS", "ANA": "ANA - ANACO", "APD": "APD - ALTO PRADO", "BNO": "BNO - BOCONO", "BRS": "BRS - BARINAS", "BTA": "BTA - BARUTA", "CAF": "CAF - CAFETAL", "CAT": "CAT - CATIA", "CAU": "CAU - CAURIMARE", "CCG": "CCG - CAUCAGUA", "CCS": "CCS - CARACAS", "CDA": "CDA - CENTRO DE ATENCION", "CDB": "CDB - CIUDAD BOLIVAR", "CDC": "CDC - CONTROL DE CAMBIOS", "CIO": "CIO - CIUDAD ORINOCO", "CLA": "CLA - CELINA", "CLN": "CLN - COLON", "CORP": "CORP - INTERNO", "CPC": "CPC - CAPACHO", "CPT": "CPT - CARIPITO", "CRA": "CRA - CARORA", "CRB": "CRB - LA CARABOBO", "CRP": "CRP - CARUPANO", "CSC": "CSC - CAJA SECA", "CTO": "CTO - COLONCITO", "CTR": "CTR - CANTAURA", "CUM": "CUM - CUMANA", "CVE": "CVE - AV ESPAÑA", "CVJ": "CVJ - CARVAJAL", "DCC": "DCC - DOS CAMINOS", "ECS": "ECS - EL CANTON", "EJI": "EJI - EJIDO", "ESM": "ESM - EL SOMBRERO", "GBO": "GBO - EL GUAYABO", "GYB": "GYB - GUAYABONES", "HPT": "HPT - HOYO DE LA PUERTA", "HUM": "HUM - LA HUMBOLDT", "JBT": "JBT - JOBITOS", "LFR": "LFR - LA FRIA", "LMG": "LMG - LA MILAGROSA", "LPS": "LPS - LA PEDREGOSA", "LVR": "LVR - VILLA DEL ROSARIO", "LZT": "LZT - LA AZULITA", "MASIVO": "MASIVO - MASIVO", "MAT": "MAT - LA FLORESTA", "MAZ": "MAZ - ZONA INDUSTRIAL", "MBO": "MBO - MARACAIBO", "MCC": "MCC - MECOCAL", "MCQ": "MCQ - MACHIQUES", "MON": "MON - MONTALBAN", "MRD": "MRD - MERIDA", "OLV": "OLV - LOS OLIVOS", "PAL": "PAL - PUERTOS DE ALTAGRACIA", "PCO": "PCO - CORE 8", "PDM": "PDM - PUNTA DE MATA", "PGD": "PGD - PALO GORDO", "PTO": "PTO - PUERTO ORDAZ", "RBO": "RBO - RUBIO", "SAT": "SAT - SAN ANTONIO DEL TACHIRA", "SBE": "SBE - SAN BERNARDINO", "SCP": "SCP - SOCOPO", "SCR": "SCR - SAN CRISTOBAL", "SCZ": "SCZ - SAN CARLOS", "SEA": "SEA - SANTA ELENA DE ARENALES", "SFX": "SFX - SAN FELIX", "SJM": "SJM - SAN JUAN DE LOS MORROS", "SJP": "SJP - SAN JOSE DE PERIJA", "SMI": "SMI - SANTA MARIA DE IPIRE", "STB": "STB - SANTA BARBARA DE BARINAS", "STF": "STF - SANTA FE", "SVZ": "SVZ - SANTA BARBARA DEL ZULIA", "TBY": "TBY - TABAY", "TGO": "TGO - EL TIGRITO", "TGR": "TGR - EL TIGRE", "TMB": "TMB - TEMBLADOR", "TPR": "TPR - TIPURO", "TRB": "TRB - TARIBA", "UNA": "UNA - UREÑA", "VAL": "VAL - PASEO LAS INDUSTRIAS", "VBF": "VBF - BELLA FLORIDA", "VBN": "VBN - BOLIVAR NORTE", "VDP": "VDP - VALLE DE LA PASCUA", "VIC": "VIC - AV VICTORIA", "VIG": "VIG - EL VIGIA", "VLR": "VLR - VALERA", "SGU": "SGU - SAN AGUSTIN", "ACA": "ACA - ACARIGUA", "BCS": "BCS - BARRANCAS"}          # código -> nombre de catálogo (oficinas reales)
OLTS     = {"MON-OL-ZT-AC-001": "MON", "VIC-OL-ZT-AC-001": "VIC", "VIC-OL-ZT-AC-002": "VIC", "VIC-OL-ZT-AC-003": "VIC", "SBE-OL-ZT-AC-001": "SBE", "SBE-OL-ZT-AC-002": "SBE", "STF-OL-ZT-AC-001": "STF", "CAT-OL-ZT-AC-001": "CAT", "CAT-OL-ZT-AC-002": "CAT", "ANA-OL-ZT-AC-001": "ANA", "CTR-OL-ZT-AC-001": "CTR", "TGR-OL-ZT-AC-001": "TGR", "TGO-OL-ZT-AC-001": "TGO", "CIO-OL-ZT-AC-001": "CIO", "BRS-OL-ZT-AC-001": "BRS", "SPS-OL-ZT-AC-001": "SCP", "STS-OL-ZT-AC-001": "STB", "BCS-OL-ZT-AC-001": "BCS", "ECS-OL-ZT-AC-001": "ECS", "PTO-OL-ZT-AC-001": "PTO", "PCO-OL-ZT-AC-001": "PCO", "CDB-OL-ZT-AC-001": "CDB", "CDB-OL-ZT-AC-002": "CDB", "CVE-OL-ZT-AC-001": "CVE", "SFX-OL-ZT-AC-001": "SFX", "SFX-OL-ZT-AC-002": "SFX", "VAL-OL-ZT-AC-001": "VAL", "VAL-OL-ZT-AC-002": "VAL", "VBN-OL-ZT-AC-001": "VBN", "VBF-OL-ZT-AC-001": "VBF", "SJM-OL-ZT-AC-001": "SJM", "SMI-OL-ZT-AC-001": "SMI", "VDP-OL-ZT-AC-001": "VDP", "ESB-OL-ZT-AC-001": "ESM", "CRA-OL-ZT-AC-001": "CRA", "MRD-OL-ZT-AC-001": "MRD", "MRD-OL-ZT-AC-002": "MRD", "HUM-OL-ZT-AC-001": "HUM", "LMG-OL-ZT-AC-001": "LMG", "LMG-OL-ZT-AC-002": "LMG", "CRB-OL-ZT-AC-001": "CRB", "CRB-OL-ZT-AC-002": "CRB", "APD-OL-ZT-AC-001": "APD", "VIG-OL-ZT-AC-001": "VIG", "VIG-OL-ZT-AC-002": "VIG", "VIG-OL-ZT-AC-003": "VIG", "VIG-OL-ZT-AC-004": "VIG", "SEA-OL-ZT-AC-001": "SEA", "LZT-OL-ZT-AC-001": "LZT", "LPS-OL-ZT-AC-001": "LPS", "GYB-OL-ZT-AC-001": "GYB", "TBY-OL-ZT-AC-001": "TBY", "TBY-OL-ZT-AC-002": "TBY", "EJI-OL-ZT-AC-001": "EJI", "CAF-OL-ZT-AC-001": "CAF", "DCC-OL-ZT-AC-001": "DCC", "CCG-OL-ZT-AC-001": "CCG", "BTA-OL-ZT-AC-001": "BTA", "HPT-OL-ZT-AC-001": "HPT", "MAT-OL-ZT-AC-001": "MAT", "MAT-OL-ZT-AC-002": "MAT", "TMB-OL-ZT-AC-001": "TMB", "CPT-OL-ZT-AC-001": "CPT", "CPT-OL-ZT-AC-002": "CPT", "PDM-OL-ZT-AC-001": "PDM", "PDM-OL-ZT-AC-002": "PDM", "PDM-OL-ZT-AC-003": "PDM", "TPR-OL-ZT-AC-001": "TPR", "MAZ-OL-ZT-AC-001": "MAZ", "MAZ-OL-ZT-AC-002": "MAZ", "CUM-OL-ZT-AC-001": "CUM", "CRC-OL-ZT-AC-001": "CRP", "LFR-OL-ZT-AC-001": "LFR", "LFR-OL-ZT-AC-002": "LFR", "CTO-OL-ZT-AC-001": "CTO", "CTO-OL-ZT-AC-002": "CTO", "CLN-OL-ZT-AC-001": "CLN", "RBO-OL-ZT-AC-001": "RBO", "RBO-OL-ZT-AC-002": "RBO", "CPC-OL-ZT-AC-001": "CPC", "UNA-OL-ZT-AC-001": "UNA", "SAT-OL-ZT-AC-001": "SAT", "SAT-OL-ZT-AC-002": "SAT", "SCR-OL-ZT-AC-001": "SCR", "SCR-OL-ZT-AC-002": "SCR", "PGD-OL-ZT-AC-001": "PGD", "PGD-OL-ZT-AC-002": "PGD", "TRB-OL-ZT-AC-001": "TRB", "VLR-OL-ZT-AC-001": "VLR", "BNO-OL-ZT-AC-001": "BNO", "CVJ-OL-ZT-AC-001": "CVJ", "CVJ-OL-ZT-AC-002": "CVJ", "CVJ-OL-ZT-AC-003": "CVJ", "CSC-OL-ZT-AC-001": "CSC", "MCQ-OL-ZT-AC-001": "MCQ", "MCQ-OL-ZT-AC-002": "MCQ", "SJP-OL-ZT-AC-001": "SJP", "SCZ-OL-ZT-AC-001": "SCZ", "LVR-OL-ZT-AC-001": "LVR", "LVR-OL-ZT-AC-002": "LVR", "GBO-OL-ZT-AC-001": "GBO", "CLA-OL-ZT-AC-001": "CLA", "JBT-OL-ZT-AC-001": "JBT", "PAL-OL-ZT-AC-001": "PAL", "ACC-OL-ZT-AC-001": "ACC", "MCC-OL-ZT-AC-001": "MCC", "MBO-OL-ZT-AC-001": "MBO", "CRP-OL-ZT-AC-001": "CRP", "ESM-OL-ZT-AC-001": "ESM", "SCP-OL-ZT-AC-001": "SCP", "STB-OL-ZT-AC-001": "STB"}              # código OLT -> código de oficina
ESPECIAL_SOPORTE_NO_APLICA = "SOPORTE TÉCNICO PERO NO APLICA"

# Afectaciones del catálogo (seed_catalogos.sql) y su Tipo. Si en Administración agregaste
# más, agrégalas aquí también.
AFECTACIONES = {
  "SOPORTE TÉCNICO": ["SIN CONEXIÓN","INTERMITENCIAS","DEGRADACIÓN","SIN ACCESO A PÁGINAS","FALLA DE NAVEGACIÓN",
                      "CAPACIDAD","PÉRDIDA DE GESTIÓN OLT","PLEY","VPN","VENTANA DE MANTENIMIENTO"],
  "CENTRAL TELEFÓNICA": ["FALLA EN LLAMADAS","CENTRAL TELEFÓNICA"],
  "PAGOS": ["PORTAL DE PAGOS","CAJA POS","FACTURACIÓN","MÉTODO DE PAGO NO DISPONIBLE"],
  "HERRAMIENTAS VNET": ["ARADIAL","GLPI","TOOLBOX","NICE","CXONE"],
  "MERCADEO": ["PORTAL WEB VNET"],
}
# Correcciones de escritura seguras (clave normalizada -> nombre de catálogo)
ALIAS_AFECTACION = {
  "PERDIDA DE GESTION OLT": "PÉRDIDA DE GESTIÓN OLT",
  "FALLA EN NAVEGACION": "FALLA DE NAVEGACIÓN",
}
# Palabras que delatan el Tipo cuando la afectación no está en el catálogo
PISTAS_TIPO = [("ARADIAL","HERRAMIENTAS VNET"),("NICE","HERRAMIENTAS VNET"),("GLPI","HERRAMIENTAS VNET"),
               ("TOOLBOX","HERRAMIENTAS VNET"),("CXONE","HERRAMIENTAS VNET"),("PLEY","SOPORTE TÉCNICO"),
               ("VPN","SOPORTE TÉCNICO"),("PAGO","PAGOS"),("POS","PAGOS"),("LLAMADA","CENTRAL TELEFÓNICA")]
OFICINA_POR_TIPO = {"HERRAMIENTAS VNET":"HERRAMIENTAS VNET","CENTRAL TELEFÓNICA":"CENTRAL TELEFÓNICA",
                    "PAGOS":"PAGOS","MERCADEO":"MERCADEO"}

def norm(s):
    s = "" if s is None or (isinstance(s,float) and pd.isna(s)) else str(s)
    s = unicodedata.normalize("NFD", s); s = "".join(c for c in s if unicodedata.category(c)!="Mn")
    return re.sub(r"\s+"," ",re.sub(r"[^A-Z0-9-]+"," ",s.upper())).strip()
def vacio(v): return v is None or (isinstance(v,float) and pd.isna(v)) or str(v).strip()==""
def txt(v): return "" if vacio(v) else str(v).strip()

NOM2COD = {norm(n):c for c,n in OFICINAS.items()}
AF_NORM = {norm(a):(a,t) for t,l in AFECTACIONES.items() for a in l}

def parse_tarjeta(v):
    """'["Tarjeta 8 - "]' / 'Tarjeta 5' / '["TODAS"]' / '["N/A"]' -> 'Tarjeta 8' / 'Tarjeta 5' / 'TODAS' / 'N/A' (None si no se entiende)."""
    t = txt(v).replace("\xa0"," ")
    t = re.sub(r'[\[\]"\']',"",t).strip()
    if not t: return ""
    if norm(t) in ("TODAS","TODOS"): return "TODAS"
    if norm(t) in ("N A","NA","N-A","NINGUNA"): return "N/A"
    m = re.search(r"(\d+)", t)
    return f"Tarjeta {int(m[1])}" if m else None

def parse_puerto(v):
    """Devuelve (tarjeta_embebida|None, [puertos]) a partir de '7', 'Puerto 10', 'TODOS', 'Tarjeta 5: 9-12-13'..."""
    t = txt(v).replace("\xa0"," ").strip()
    if not t: return None, []
    if norm(t) in ("TODOS","TODAS"): return None, ["TODOS"]
    if norm(t) in ("N A","NA"): return None, ["N/A"]
    tarj = None
    m = re.match(r"(?i)^\s*tarjeta\s*(\d+)\s*[:\-]\s*(.*)$", t)
    if m: tarj, t = f"Tarjeta {int(m[1])}", m[2]
    nums = re.findall(r"\d+", t)
    if not nums: return tarj, None
    return tarj, [f"Puerto {int(n)}" for n in nums]

def leer(ruta):
    if ruta.lower().endswith((".xlsx",".xlsm",".xls")):
        return pd.read_excel(ruta, dtype=object)
    sep = "\t" if ruta.lower().endswith((".tsv",".txt")) else None
    return pd.read_csv(ruta, sep=sep, engine="python", dtype=object, encoding="utf-8-sig")

def fecha_txt(v):
    if vacio(v): return ""
    if hasattr(v,"strftime"): return v.strftime("%d/%m/%Y %H:%M")
    return str(v).strip()
def fecha_dt(v):
    if vacio(v): return None
    if hasattr(v,"to_pydatetime"): return v.to_pydatetime()
    m = re.match(r"^(\d{1,2})/(\d{1,2})/(\d{4})(?: (\d{1,2}):(\d{2}))?", str(v).strip())
    if not m: return None
    d,mo,y,h,mi = int(m[1]),int(m[2]),int(m[3]),int(m[4] or 0),int(m[5] or 0)
    try:
        from datetime import datetime; return datetime(y,mo,d,h,mi)
    except ValueError: return None
def num(v):
    if vacio(v): return 0
    m = re.sub(r"[^\d]","",str(v)); return int(m) if m else 0

def main(ruta):
    df = leer(ruta)
    df.columns = [norm(c) for c in df.columns]
    def col(r,*nombres):
        for n in nombres:
            v = r.get(norm(n))
            if not vacio(v): return v
        return None
    out, cambios, rev = [], [], []
    vistos = set()
    for i, r in df.iterrows():
        fila = i + 2
        tk = re.sub(r"[^\d]","",txt(col(r,"Title")).replace(".0",""))
        if not tk:
            rev.append(("", fila, "Fila sin número de ticket (Title): se omite")); continue
        def cambio(campo, antes, despues):
            if txt(antes)!=txt(despues): cambios.append((tk,fila,campo,txt(antes),txt(despues)))

        # ---- Afectación ----
        af0 = txt(col(r,"AFECTACION"))
        n = norm(af0); n = norm(ALIAS_AFECTACION.get(n, n))
        if n in AF_NORM: af, tipo_cat = AF_NORM[n]
        else:
            af, tipo_cat = af0, None
            for clave,t in PISTAS_TIPO:
                if clave in n: tipo_cat = t; break
            rev.append((tk,fila,f"Afectación «{af0}» no está en el catálogo: se importa tal cual. Agrégala en Administración > Catálogos (o dime a cuál mapearla)."))
        cambio("AFECTACIÓN", af0, af)

        # ---- OLT / Oficina ----
        olt = txt(col(r,"OLT")); olt_k = olt.upper().strip()
        cod = OLTS.get(olt_k)
        of0 = txt(col(r,"OFICINA"))
        of_n = norm(of0)
        cod_txt = None
        if of_n in NOM2COD: cod_txt = NOM2COD[of_n]
        else:
            m = re.match(r"^([A-Z0-9]{2,6})\s*-", of_n)
            if m and m[1] in OFICINAS: cod_txt = m[1]
        tipo0 = txt(col(r,"TIPO"))
        if cod:                                   # el OLT manda: su oficina sale del catálogo de OLTs
            of = OFICINAS[cod]
            if cod_txt and cod_txt != cod:
                cambio("OFICINA (según el OLT)", of0, of)
        elif cod_txt:
            of = OFICINAS[cod_txt]
            if olt_k not in ("","N/A") and not cod:
                rev.append((tk,fila,f"OLT «{olt}» no está en la lista oficial de OLTs"))
        else:
            of = None                              # no es oficina real
        # Tipo
        tipo = tipo0.upper() if tipo0 else None
        if not tipo:
            tipo = tipo_cat or ("SOPORTE TÉCNICO" if (cod or cod_txt) else None)
        if not tipo:
            tipo = "SOPORTE TÉCNICO"
            rev.append((tk,fila,f"No se pudo deducir el Tipo (afectación «{af0}», oficina «{of0}»): se puso SOPORTE TÉCNICO"))
        cambio("TIPO", tipo0, tipo)
        # Oficina para tipos sin ubicación física
        if tipo in OFICINA_POR_TIPO:
            of = OFICINA_POR_TIPO[tipo]; olt_out = "N/A"
        elif of is None:                           # Soporte sin oficina real (PLEY, MIGURA, ...)
            of = ESPECIAL_SOPORTE_NO_APLICA; olt_out = "N/A"
        else:
            olt_out = olt or "N/A"
        cambio("OFICINA", of0, of)
        if tipo in OFICINA_POR_TIPO or of == ESPECIAL_SOPORTE_NO_APLICA:
            cambio("OLT", olt, "N/A")

        # ---- fechas / estado ----
        f_cda, f_cmr = col(r,"FECHA DE CREACION DEL CDA"), col(r,"FECHA DE CREACION DEL CMR","FECHA DE CREACION DEL CRM")
        s_cmr, s_cda = col(r,"FECHA DE SOLUCION DEL CMR","FECHA DE SOLUCION DEL CRM"), col(r,"FECHA DE SOLUCION DEL CDA")
        estado = txt(col(r,"ESTADO DEL TICKET")).upper() or "CERRADO"
        d_cmr, d_cda, ds_cmr, ds_cda = map(fecha_dt,(f_cmr,f_cda,s_cmr,s_cda))
        if estado in ("CERRADO","RESUELTO"):
            if not s_cmr: rev.append((tk,fila,f"Estado {estado} sin FECHA DE SOLUCION DEL CRM/CMR"))
            if not s_cda: rev.append((tk,fila,f"Estado {estado} sin FECHA DE SOLUCION DEL CDA"))
        for nom,a,b in (("solución CRM < creación CRM",ds_cmr,d_cmr),("solución CDA < creación CDA",ds_cda,d_cda)):
            if a and b and a < b: rev.append((tk,fila,f"Fecha inconsistente: {nom} ({a:%d/%m/%Y %H:%M} < {b:%d/%m/%Y %H:%M})"))
        for nom,v in (("creación CRM",f_cmr),("creación CDA",f_cda),("solución CRM",s_cmr),("solución CDA",s_cda)):
            if not vacio(v) and not fecha_dt(v) and not hasattr(v,"strftime"):
                rev.append((tk,fila,f"Fecha ilegible en {nom}: «{v}»"))

        # ---- conteos ----
        afect, repor = num(col(r,"CANTIDAD DE CLIENTES AFECTADOS")), num(col(r,"N CLIENTES QUE REPORTARON FALLA","N° CLIENTES QUE REPORTARON FALLA"))
        if repor > afect and afect > 0:
            rev.append((tk,fila,f"Reportaron ({repor}) > afectados ({afect})"))
        for campo,v in (("CANTIDAD DE CLIENTES AFECTADOS",col(r,"CANTIDAD DE CLIENTES AFECTADOS")),("N° CLIENTES QUE REPORTARON FALLA",col(r,"N CLIENTES QUE REPORTARON FALLA"))):
            if not vacio(v) and not re.fullmatch(r"\s*\d+\s*", str(v)): cambio(campo, v, "0")

        # ---- Tarjeta / Puerto ----
        tj0, pu0 = col(r,"Tarjeta"), col(r,"PUERTO")
        tj = parse_tarjeta(tj0)
        tj_emb, pus = parse_puerto(pu0)
        if tj_emb: tj = tj_emb
        if tj is None:
            rev.append((tk,fila,f"Tarjeta ilegible «{tj0}»: se importa como DESCONOCIDO")); tj = "DESCONOCIDO"
        if pus is None:
            rev.append((tk,fila,f"Puerto ilegible «{pu0}»: se importa como DESCONOCIDO")); pus = ["DESCONOCIDO"]
        if not tj: tj = "DESCONOCIDO"
        if not pus:
            pus = ["TODOS"] if tj == "TODAS" else (["N/A"] if tj == "N/A" else ["DESCONOCIDO"])
        if tipo in OFICINA_POR_TIPO or of == ESPECIAL_SOPORTE_NO_APLICA:
            tj, pus = "N/A", ["N/A"]
        if txt(tj0) != tj: cambio("Tarjeta", tj0, tj)
        if len(pus) > 1: cambio("PUERTO (se separa en filas)", pu0, " | ".join(pus))
        elif txt(pu0) != pus[0]: cambio("PUERTO", pu0, pus[0])

        base = {
          "Title": tk,
          "Tickets Vinculados": re.sub(r"[^\d]","",txt(col(r,"Tickets Vinculados"))),
          "AFECTACIÓN": af,
          "UNIDAD RESOLUTORIA": txt(col(r,"UNIDAD RESOLUTORIA")).upper(),
          "TIPO": tipo,
          "ESTADO DEL TICKET": estado,
          "OLT": olt_out, "OFICINA": of, "Tarjeta": tj, "PUERTO": "{P}",
          "NOMBRE DEL EDIFICIO (SI APLICA)": txt(col(r,"NOMBRE DEL EDIFICIO (SI APLICA)")) or "N/A",
          "UBICACIÓN": txt(col(r,"UBICACION")) or "N/A",
          "FECHA DE CREACION DEL CMR": fecha_txt(f_cmr), "FECHA DE CREACION DEL CDA": fecha_txt(f_cda),
          "FECHA DE SOLUCION DEL CMR": fecha_txt(s_cmr), "FECHA DE SOLUCION DEL CDA": fecha_txt(s_cda),
          "CANTIDAD DE CLIENTES AFECTADOS": afect, "N° CLIENTES QUE REPORTARON FALLA": repor,
          "COMENTARIO": txt(col(r,"COMENTARIO")), "AVANCE DEL CMR": txt(col(r,"AVANCE DEL CMR")),
          "DESCRIPCIÓN": txt(col(r,"DESCRIPCION")),
        }
        for pu in pus:
            reg = dict(base); reg["PUERTO"] = pu
            clave = tuple(reg.values())
            if clave in vistos: continue           # fila idéntica repetida
            vistos.add(clave); out.append(reg)
        continue

    res = pd.DataFrame(out)
    # Un mismo ticket con datos de ticket distintos entre filas: el sistema usa la primera fila
    for tk,g in res.groupby("Title"):
        for c in ("AFECTACIÓN","FECHA DE CREACION DEL CMR","FECHA DE SOLUCION DEL CMR","UNIDAD RESOLUTORIA"):
            if g[c].nunique() > 1:
                rev.append((tk,"",f"El ticket tiene varias filas con {c} distinto ({' | '.join(map(str,g[c].unique()))}). El sistema conserva el de la primera fila; considera separarlo en tickets distintos."))
    with pd.ExcelWriter("base_adaptada.xlsx", engine="openpyxl") as w:
        res.to_excel(w, sheet_name="Importar", index=False)
        pd.DataFrame(cambios, columns=["Ticket","Fila","Campo","Antes","Después"]).to_excel(w,sheet_name="Cambios",index=False)
        pd.DataFrame(sorted(set(rev),key=lambda x:(str(x[0]),str(x[1]))), columns=["Ticket","Fila","Observación"]).to_excel(w,sheet_name="Revisión",index=False)
    print(f"Filas leídas: {len(df)}  ->  filas a importar: {len(res)}  (tickets: {res['Title'].nunique()})")
    print(f"Valores corregidos: {len(cambios)}   Observaciones por revisar: {len(set(rev))}")
    print("Generado: base_adaptada.xlsx")

if __name__ == "__main__":
    if len(sys.argv) < 2: sys.exit(__doc__)
    main(sys.argv[1])
