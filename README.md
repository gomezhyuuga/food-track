# Mi Dieta — Registro de Porciones

PWA móvil para registrar las porciones diarias de alimentos según el plan de
la nutrióloga (sistema de equivalentes CLIDDI). Local-first: todos los datos
se guardan en el dispositivo (`localStorage`), sin backend.

**App en vivo:** https://gomezhyuuga.github.io/food-track-/

## Funcionalidades

- **Hoy** — el día de un vistazo: puntos de porciones por categoría (ej.
  POA 4/12), organizado por comida (Desayuno, Colación, Comida, Colación PM,
  Cena). La comida actual se expande automáticamente según la hora del día.
  Un toque = una porción; `−` para deshacer.
- **Agua** — un toque por vaso de 250 ml, con la meta diaria de 2.2–3.4 L.
- **Historial** — días anteriores con porcentaje de apego; toca un día para
  ver el registro completo.
- **Porciones** — referencia buscable de equivalentes (1 porción de cada
  grupo), con las anotaciones de la nutrióloga: los alimentos tachados se
  muestran como *evitar* y los resaltados (aguacate, nueces) como
  preferidos ⭐.
- PWA instalable (agregar a pantalla de inicio), funciona sin conexión.

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

## Despliegue

Cada push a la rama de desarrollo (o a `main`) ejecuta
`.github/workflows/deploy.yml`, que construye la app y la publica en
GitHub Pages automáticamente.

Stack: Vite · React 18 · TypeScript. Sin otras dependencias en runtime.
