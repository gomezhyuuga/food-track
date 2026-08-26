# CLAUDE.md

Guía para Claude Code al trabajar en este proyecto.

## Idioma

- **Toda la documentación de este proyecto se escribe en español** (README,
  comentarios de docs, mensajes dirigidos al usuario).
- **Las conversaciones con el usuario también son en español.**
- Los mensajes de commit y los identificadores en el código pueden seguir en
  inglés (convención estándar).

## Resumen del proyecto

**Mi Dieta** es una PWA móvil (Vite + React 18 + TypeScript) para registrar lo
que come el usuario. Tiene dos formas de registro que conviven:

1. **Porciones CLIDDI**, tocando `+`/`-` por categoría según el plan de la
   nutrióloga. Es el modo original.
2. **Texto libre**, escribiendo "dos huevos revueltos con un pan de caja". Un
   LLM lo interpreta y devuelve calorías, macros y las porciones CLIDDI que
   corresponden, así que un registro alimenta ambos sistemas.

Los datos viven en el dispositivo con RxDB sobre IndexedDB (storage Dexie). Lo
único que sale del dispositivo es el texto que el usuario escribe, y solo para
interpretarlo.

> Documentación extendida para agentes en [`ai_docs/`](ai_docs/README.md).
> Ahí está el detalle del modelo de datos, el pipeline del LLM y, sobre todo,
> `ai_docs/05-trampas.md`, que recoge los errores que ya costaron tiempo.

## Estructura

```
src/
├── types.ts              # Tipos compartidos. Rompe el ciclo db.ts <-> store.ts
├── api.ts                # CONTRATO único que consume la interfaz
├── data/plan.ts          # Metas de porciones por comida (esquema de la nutrióloga)
├── data/equivalents.ts   # Lista de equivalentes de alimentos (1 porción por grupo)
├── db.ts                 # RxDB: 4 colecciones (days, entries, foods, settings)
├── store.ts              # Puente reactivo RxDB -> React + hooks
├── parse.ts              # Cliente del Worker. Memoria local antes que red
├── entries.ts            # toEntries, commitEntries, repeatShortcuts, memoryFor
├── foods.ts              # normalizeFoodId (slug); debe coincidir con el Worker
├── adherence.ts          # Apego y rachas. totalPortions() redondea
├── App.tsx               # Navegación por pestañas (Hoy / Historial / Porciones)
├── views/                # TodayView, HistoryView, EquivalentsView
└── components/           # Composer, ReviewSheet, FoodItem, FoodEditor,
                          # ProgressCard, Toast, PortionDots, format.ts

worker/
├── src/index.ts          # POST /parse: CORS, validación, orquestación
├── src/model.ts          # env.AI.run() vía AI Gateway + desenvuelto tolerante
├── src/prompt.ts         # Prompt del sistema en español con la tabla CLIDDI
├── src/cliddi.ts         # Copia de plan.ts + equivalents.ts para el Worker
├── src/schema.ts         # Tipos del contrato + PARSE_SCHEMA
├── src/validate.ts       # Validación estricta de petición y respuesta
└── test/                 # 70 pruebas, sin dependencias (npm run test:worker)
```

## Puntos clave

- Cuando cambie el plan de la nutrióloga, editar `src/data/plan.ts` y
  `src/data/equivalents.ts`.
- Los alimentos tachados por la nutrióloga llevan `status: "avoid"`; los
  resaltados (preferidos) llevan `status: "star"`.
- **Todo es un solo Worker de Cloudflare**: `wrangler.jsonc` sirve `dist/` como
  assets y manda solo `/parse` al código del Worker (`run_worker_first`). Mismo
  origen ⇒ sin CORS y sin variable de build con la URL del parser; la llamada en
  `src/parse.ts` es relativa.
- El deploy es automático vía `.github/workflows/deploy.yml` en cada push a
  `main` (`wrangler deploy`). Mientras `wrangler.jsonc` **no** declare `routes`,
  el despliegue solo publica en `workers.dev` y no toca https://diet.gomezh.dev
  — es la migración por etapas. Al atar el dominio, el origen no cambia y la
  IndexedDB de producción sigue ahí; conservarlo es lo que salva los datos.
- Cualquier otra rama sube una versión sin promoverla (`wrangler versions
  upload`) vía `.github/workflows/preview.yml`, con Preview URL propia y por
  tanto su propia IndexedDB — los previews nunca tocan los datos de producción.
  Ver `docs/previews.md`.
- El código del Worker vive en `worker/src/` y sus pruebas en `worker/test/`
  (`npm run test:worker`, sin dependencias). `npm run preview` levanta app y
  `/parse` juntos como en producción.
- Verificar con `npm run build` (incluye chequeo de tipos) antes de hacer push.
  Ojo: el build **no** ejercita RxDB en dev-mode; probar también con
  `npm run dev`, porque dev-mode aplica chequeos que producción no hace (p. ej.
  exige envolver el storage con un validador de esquema, error `DVM1`).
- `src/store.ts` mantiene un snapshot síncrono en memoria alimentado por la
  suscripción de RxDB, para que las vistas y `adherence.ts` sigan leyendo los
  días sin `async`. Las escrituras van serializadas por fecha (`mutateDay`) para
  que los toques rápidos en `+` no se pisen.
- `meals` es JSON libre en el esquema a propósito: cambiar `plan.ts` no obliga a
  subir `version` ni a escribir migraciones de RxDB.
- **La interfaz solo importa de `src/api.ts`.** Ahí están `parseText`,
  `toEntries`, `commitEntries`, `repeatShortcuts` y `memoryFor`, más los tipos
  `ParsedItem`, `ParseOutcome` y `RepeatShortcut`. No importar `parse.ts` ni
  `entries.ts` directamente desde componentes.
- **Todos los valores nutricionales se guardan POR UNIDAD**, nunca el total. El
  total se calcula multiplicando por `qty` al mostrar. Guardar totales fue el
  origen de un bug de "562.5 porciones".
- **La app nunca inventa comida.** Si el modelo no entiende, devuelve `unknown`
  y la UI muestra "No estoy seguro de esto" con dos salidas. Nunca se fabrica un
  alimento genérico con números plausibles.
- **Tres niveles de certeza**: `recordado` (dato del usuario, exacto),
  `estimado` (base genérica), `aproximado` (el modelo adivinó la cantidad; se
  pinta en ámbar). Lo no recordado se muestra redondeado a la decena y con
  tilde: `~250 kcal`, nunca `248`.
- **Recordar un alimento es opt-in.** Checkbox desactivado por defecto, se
  reinicia en cada registro. Un valor mal estimado que entra a la memoria se
  propaga a todos los registros futuros.
- Probar en local sin desplegar: `npm run preview` levanta app y `/parse` juntos.
  Ojo: `/parse` en local llama al modelo real y consume créditos. Para no
  gastar, usar el mock: `localStorage["midieta:mock"] = "1"` (o `"unknown"`,
  `"offline"`, `"error"`).
- **`normalizeFoodId` está duplicada** en `src/foods.ts` y `worker/src/foods.ts`
  porque el Worker no puede importar de `src/`. Deben ser idénticas: si divergen,
  "Pan de Caja" y "pan de caja" se guardan como dos alimentos distintos.
- La UI es mobile-first y en español; priorizar registro con un toque y
  objetivos táctiles grandes.
