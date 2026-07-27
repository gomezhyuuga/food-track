# CLAUDE.md

Guía para Claude Code al trabajar en este proyecto.

## Idioma

- **Toda la documentación de este proyecto se escribe en español** (README,
  comentarios de docs, mensajes dirigidos al usuario).
- **Las conversaciones con el usuario también son en español.**
- Los mensajes de commit y los identificadores en el código pueden seguir en
  inglés (convención estándar).

## Resumen del proyecto

**Mi Dieta** es una PWA móvil (Vite + React 18 + TypeScript, sin backend)
para registrar porciones diarias de alimentos según el plan nutricional
CLIDDI del usuario. Los datos se guardan en el dispositivo con RxDB sobre
IndexedDB (storage Dexie).

## Estructura

```
src/
├── data/plan.ts          # Metas de porciones por comida (esquema de la nutrióloga)
├── data/equivalents.ts   # Lista de equivalentes de alimentos (1 porción por grupo)
├── db.ts                 # Base RxDB: esquema, plugins e importación desde localStorage
├── store.ts              # Puente reactivo RxDB → React + hooks
├── adherence.ts          # Apego diario y rachas (umbral en STREAK_THRESHOLD)
├── App.tsx               # Navegación por pestañas (Hoy / Historial / Porciones)
├── views/                # TodayView, HistoryView, EquivalentsView
└── components/           # PortionDots, etc.
```

## Puntos clave

- Cuando cambie el plan de la nutrióloga, editar `src/data/plan.ts` y
  `src/data/equivalents.ts`.
- Los alimentos tachados por la nutrióloga llevan `status: "avoid"`; los
  resaltados (preferidos) llevan `status: "star"`.
- El deploy a GitHub Pages es automático vía `.github/workflows/deploy.yml`
  en cada push a `main`. La app vive en
  https://diet.gomezh.dev (dominio custom configurado en los settings de
  Pages; no se necesita archivo CNAME con deploys vía Actions).
- Cualquier otra rama publica un preview en Cloudflare Pages vía
  `.github/workflows/preview.yml`, con su propio subdominio y por tanto su
  propia IndexedDB — los previews nunca tocan los datos de producción. Ver
  `docs/previews.md`.
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
- La UI es mobile-first y en español; priorizar registro con un toque y
  objetivos táctiles grandes.
