# Mi Dieta — Registro de Porciones

PWA móvil para registrar las porciones diarias de alimentos según el plan de
la nutrióloga (sistema de equivalentes CLIDDI). Local-first: todos los datos
se guardan en el dispositivo con [RxDB](https://rxdb.info) sobre IndexedDB,
sin backend.

**App en vivo:** https://diet.gomezh.dev

## Funcionalidades

- **Hoy** — el día de un vistazo: puntos de porciones por categoría (ej.
  POA 4/12), organizado por comida (Desayuno, Colación, Comida, Colación PM,
  Cena). La comida actual se expande automáticamente según la hora del día.
  Un toque = una porción; `−` para deshacer.
- **Agua** — un toque por vaso de 250 ml, con la meta diaria de 2.2–3.4 L.
- **Historial** — días anteriores con porcentaje de apego; toca un día para
  ver el registro completo. Los días que cumplen llevan 🔥.
- **Racha de apego** — días consecutivos cumpliendo al menos 3 de las 4 metas
  diarias exactas; la vista Hoy muestra la racha actual, la mejor racha y las
  metas del día en vivo.
- **Porciones** — referencia buscable de equivalentes (1 porción de cada
  grupo), con las anotaciones de la nutrióloga: los alimentos tachados se
  muestran como *evitar* y los resaltados (aguacate, nueces) como
  preferidos ⭐.
- PWA instalable (agregar a pantalla de inicio), funciona sin conexión.
- Los registros se sincronizan solos entre pestañas abiertas del navegador.

## Datos

Todo vive en el dispositivo, en una base RxDB (`midieta`) sobre IndexedDB. Al
abrir la app por primera vez tras la migración se importan automáticamente los
días guardados por la versión anterior (llaves `midieta:day:*` de
`localStorage`); esas llaves **no se borran**, quedan como respaldo. La
importación corre una sola vez y se marca con `midieta:rxdb-migrated`.

No hay replicación configurada: los datos no salen del navegador. El esquema
vive en `src/db.ts` y el puente reactivo hacia React en `src/store.ts`.

## Plan codificado (por día)

| Comida | Porciones |
|---|---|
| Desayuno | 2 POA · verduras libres |
| Colación | 1 lácteo · 1 fruta |
| Comida | 6 POA · 2 cereales · 1 fruta · verduras libres |
| Cena | 4 POA · 1 cereal · verduras libres |

Leguminosas y azúcares están marcados como **evitar**. Las metas viven en
`src/data/plan.ts`; la lista de equivalentes en `src/data/equivalents.ts` —
edita esos archivos cuando cambie el plan.

## Desarrollo

```sh
npm install
npm run dev       # servidor de desarrollo local
npm run build     # verificación de tipos + build de producción (dist/)
npm run preview   # servir el build de producción
```

`npm run build` **no** ejercita RxDB en modo desarrollo. Antes de subir cambios
que toquen la base, abre también `npm run dev`: el plugin `dev-mode` de RxDB
aplica validaciones que producción no hace, y algunos errores solo aparecen ahí.

## Despliegue

Todo vive en un **solo Worker de Cloudflare**: sirve los archivos estáticos de la
app y atiende la ruta `/parse` que interpreta el texto. Mismo origen, así que no
hay CORS que negociar ni URL del parser que configurar.

Cada push a `main` ejecuta `.github/workflows/deploy.yml`: pruebas del Worker,
build y `wrangler deploy`.

Cualquier otra rama sube una **versión** sin promoverla (`wrangler versions
upload`) y recibe su propia Preview URL en `workers.dev`. Cada preview es un
origen distinto, así que probar un cambio nunca toca los datos reales.
Configuración en [`docs/previews.md`](docs/previews.md).

Para levantar la app y `/parse` juntos en local, como en producción:

```bash
npm run preview   # build + wrangler dev
```

## Documentación

- [Arquitectura](docs/arquitectura.md) — cómo funciona el proyecto, con diagramas.
- [Previews por rama](docs/previews.md) — entornos de prueba por rama.
- [El Worker](worker/README.md) — endpoint `/parse` y despliegue.
- [`ai_docs/`](ai_docs/README.md) — contexto para agentes: modelo de datos,
  pipeline del LLM, y las trampas que ya costaron tiempo.

Stack: Vite · React 18 · TypeScript · RxDB (storage Dexie/IndexedDB) ·
Cloudflare Workers + AI Gateway.
