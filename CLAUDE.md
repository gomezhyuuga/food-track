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
CLIDDI del usuario. Los datos se guardan en `localStorage` del dispositivo.

## Estructura

```
src/
├── data/plan.ts          # Metas de porciones por comida (esquema de la nutrióloga)
├── data/equivalents.ts   # Lista de equivalentes de alimentos (1 porción por grupo)
├── store.ts              # Persistencia en localStorage + hooks
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
  en cada push a la rama de desarrollo o `main`.
- Verificar con `npm run build` (incluye chequeo de tipos) antes de hacer push.
- La UI es mobile-first y en español; priorizar registro con un toque y
  objetivos táctiles grandes.
