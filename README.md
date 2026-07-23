# Mi Dieta — Registro de Porciones

Mobile-first PWA to track daily food portions against a nutritionist's meal plan
(CLIDDI food-equivalents system). Local-first: all data is stored on-device in
`localStorage`, no backend required.

## Features

- **Hoy** — the day at a glance: per-category portion dots (e.g. POA 4/12),
  organized by meal (Desayuno, Colación, Comida, Colación PM, Cena). The current
  meal auto-expands based on time of day. One tap = one portion; `−` to undo.
- **Agua** — one tap per 250 ml glass, with the 2.2–3.4 L daily target band.
- **Historial** — past days with an adherence percentage; tap a day to see the
  full log.
- **Porciones** — searchable food-equivalents reference (1 portion of each
  group), including the nutritionist's annotations: crossed-out items are shown
  as *evitar*, highlighted ones (aguacate, nueces) as preferred ⭐.
- Installable PWA (add to home screen), works offline.

## Plan encoded (per day)

| Comida | Porciones |
|---|---|
| Desayuno | 2 POA · verduras libres |
| Colación | 1 lácteo · 1 fruta |
| Comida | 6 POA · 2 cereales · 1 fruta · verduras libres |
| Cena | 4 POA · 1 cereal · verduras libres |

Leguminosas and azúcares are marked **evitar**. Targets live in
`src/data/plan.ts`; the equivalents list in `src/data/equivalents.ts` — edit
those files when the plan changes.

## Development

```sh
npm install
npm run dev       # local dev server
npm run build     # type-check + production build (dist/)
npm run preview   # serve the production build
```

Stack: Vite · React 18 · TypeScript. No other runtime dependencies.
