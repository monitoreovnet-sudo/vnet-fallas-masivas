# Registro y Monitoreo de Fallas Masivas CDA

Aplicación para creación, modificación y cierre de tickets de fallas masivas,
con estructura anidada Ticket → OLT → Tarjeta → Puerto (cada uno editable
individualmente) y log de auditoría de todos los cambios.

- **Frontend:** HTML/CSS/JS estático (sin build) en `/public`
- **Backend:** Cloudflare Pages Functions en `/functions` (API en `/api/...`)
- **Base de datos:** Cloudflare D1 (SQL)
- **Repositorio de código:** GitHub (con despliegue automático a Cloudflare Pages en cada `git push`)

## 1. Estructura del proyecto

```
vnet-fallas/
  schema.sql              -> esquema de la base de datos D1
  seed_oficinas.sql        -> oficinas reales extraídas de tu Excel
  seed_olts.sql             -> OLTs reales extraídos de tu Excel
  seed_catalogos.sql        -> catálogos (categorías, afectaciones, estados, etc.)
  wrangler.toml             -> configuración de Cloudflare (Pages + D1)
  public/                   -> frontend (lo que se sirve al navegador)
    index.html
    styles.css
    app.js
  functions/                -> backend (Cloudflare Pages Functions)
    _middleware.js
    _lib/helpers.js
    api/lookups.js
    api/tickets/index.js         (GET listar / POST crear ticket)
    api/tickets/[id].js          (GET detalle de un ticket)
    api/tickets/[id]/masivo.js   (PATCH "Cambiar Todo el Ticket")
    api/tickets/[id]/puertos.js  (PATCH "Cambiar Puertos Seleccionados")
    api/tickets/[id]/cerrar.js   (POST "Cerrar este Ticket")
    api/tickets/[id]/log.js      (GET log de cambios)
```

## 2. Subir el código a GitHub

```bash
cd vnet-fallas
git init
git add .
git commit -m "Aplicación inicial de monitoreo de fallas masivas"
git branch -M main
git remote add origin https://github.com/TU_USUARIO/vnet-fallas-masivas.git
git push -u origin main
```

## 3. Crear la base de datos D1

Necesitas Node.js instalado. Luego:

```bash
npm install
npx wrangler login                 # abre el navegador para autenticar tu cuenta Cloudflare
npm run db:create                  # crea la base "vnet_fallas_masivas"
```

El comando anterior imprime un bloque como:

```toml
[[d1_databases]]
binding = "DB"
database_name = "vnet_fallas_masivas"
database_id = "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
```

Copia ese `database_id` y pégalo en `wrangler.toml`, reemplazando
`REEMPLAZA_ESTE_ID_DESPUES_DE_CREAR_LA_BASE`. Haz commit y push de ese cambio.

Después carga el esquema y los datos:

```bash
npm run db:schema      # crea las tablas
npm run db:seed        # carga oficinas, OLTs y catálogos reales de tu Excel
```

## 4. Conectar el repositorio a Cloudflare Pages

1. Entra a **Cloudflare Dashboard → Workers & Pages → Create → Pages → Connect to Git**.
2. Selecciona el repositorio `vnet-fallas-masivas`.
3. Configuración de build:
   - **Framework preset:** None
   - **Build command:** (vacío)
   - **Build output directory:** `public`
4. Despliega. Cloudflare detecta automáticamente la carpeta `/functions` y publica
   la API en `https://tu-proyecto.pages.dev/api/...`.

## 5. Enlazar la base de datos D1 al proyecto Pages

En el proyecto Pages recién creado:

**Settings → Functions → D1 database bindings → Add binding**
- Variable name: `DB`
- D1 database: `vnet_fallas_masivas`

Guarda y vuelve a desplegar (Cloudflare pedirá un "retry deployment" para que
el binding tome efecto).

A partir de aquí, cada `git push` a `main` despliega automáticamente la nueva
versión (GitHub → Cloudflare Pages, CI/CD nativo, sin pasos manuales).

## 6. Probar en local (opcional)

```bash
npm run db:schema:local
npm run db:seed:local
npm run dev
```

Esto levanta la app en `http://localhost:8788` con una base D1 local (SQLite)
para pruebas, sin tocar la base de producción.

## 7. Control de acceso por correo corporativo (pendiente, a futuro)

Quedó pendiente a propósito para esta primera versión. Cuando quieras activarlo,
la forma recomendada en Cloudflare es **Zero Trust → Access → Applications**:

1. Crea una aplicación Access apuntando a tu dominio de Pages.
2. Crea una política con **Include → Emails** y pega la lista de correos autorizados
   (o **Emails ending in** `@tuempresa.com` para todo el dominio).
3. Cloudflare bloqueará a cualquiera que no esté en la lista antes de que la
   petición llegue a la aplicación — no requiere cambios de código.
4. Cuando Access esté activo, `Cf-Access-Authenticated-User-Email` llega
   automáticamente en cada request y `functions/_lib/helpers.js` ya lo lee
   (función `currentUserEmail`) para registrar quién hizo cada cambio en el log.

## 8. Resumen de reglas de negocio implementadas

- **Crear Ticket:** requiere Ticket CRM-COR numérico único, y al menos un
  OLT/Tarjeta/Puerto. Cada combinación se guarda como una fila independiente
  en `ticket_puertos`, editable individualmente después.
- **Cambiar Todo el Ticket (masivo):** solo permite tocar `estado_ticket`,
  `olt` (se aplica a TODOS los puertos del ticket), `avance_cmr`,
  `fecha_apertura_cda`, `fecha_apertura_crm`, `unidad_resolutoria`, `oficina_id`.
  Cualquier otro campo enviado es ignorado por el backend (no solo oculto en el
  frontend).
- **Cambiar Puertos Seleccionados (individual):** solo permite tocar `tarjeta`,
  `puerto` y `estado_puerto` de los puertos marcados, uno por uno.
- **Cerrar Ticket:** solo pide `fecha_solucion_crm` y `fecha_solucion_cda`,
  y automáticamente fija `estado_ticket = 'CIERRE DEL TICKET'`.
- **Log de cambios:** toda creación, modificación masiva, modificación
  individual de puerto y cierre queda registrada en `ticket_log` con usuario,
  campo, valor anterior/nuevo y fecha. Visible desde la pestaña
  "Consultar / Log".

## 9. Próximos pasos sugeridos

- Activar Cloudflare Access (paso 7) cuando tengas la lista de correos lista.
- Pantalla de administración de catálogos (oficinas, OLTs, afectaciones) en vez
  de editarlos directo en la base.
- Cálculo automático de SLA / semáforo (los campos `TIEMPO EN CURSO`,
  `SEMAFORO SLA`, etc. de tu Excel eran calculados, no digitados — se pueden
  agregar como columnas generadas o calculadas en el frontend).
