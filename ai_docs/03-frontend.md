# Frontend

## El contrato

**La interfaz solo importa de `src/api.ts`.** No importar `parse.ts` ni
`entries.ts` desde componentes.

```ts
parseText(text, { signal }): Promise<ParseOutcome>
toEntries(date, meal, items): FoodEntry[]
commitEntries(entries, remember): Promise<void>
repeatShortcuts(today): RepeatShortcut[]
memoryFor(name): FoodMemory | undefined
```

`ParseOutcome` es una unión discriminada:

```ts
| { status: "ok"; result: ParseResult }
| { status: "unknown"; text: string }
| { status: "offline"; resolved: ParsedItem[]; pending: string }
| { status: "error"; message: string }
```

Del store se puede leer directamente: `listEntries`, `dayMacros`,
`entryPortionsFor`, `getSettings`, `loadDay`, `mealTotal`, `todayKey`,
`useStoreVersion`, `useDayActions`, `updateEntry`, `removeEntry`. De
`adherence.ts`: `dayAdherence`, `computeStreaks`, `totalPortions`.

### Cancelación: cuidado

Si `options.signal` se aborta, `parseText` **rechaza** con un `DOMException` de
nombre `AbortError`, igual que `fetch`. No resuelve con `{ status: "error" }`.

Toda llamada debe ir en try/catch tratando `err.name === "AbortError"` como
cancelación silenciosa. Si no, hay un unhandled rejection cada vez que el usuario
cierra la hoja durante la carga.

Los timeouts internos **sí** resuelven con `{ status: "error" }`.

## Componentes

| Archivo | Qué hace |
|---|---|
| `Composer.tsx` | Barra fija sobre la tab bar. Portal a `#composer-slot`. Atajos `↺`, micrófono placeholder. Publica `--composer-h` con `ResizeObserver`. |
| `ReviewSheet.tsx` | Bottom sheet con 6 estados: `loading`, `result`, `edit`, `unknown`, `offline`, `error`. Portal a `body`, foco de entrada/salida, `inert` al fondo. |
| `FoodItem.tsx` | Tarjeta de alimento: badge de certeza, borde ámbar en aproximado, stepper, kcal por unidad, macros, chip CLIDDI. |
| `FoodEditor.tsx` | Editor inline. Cualquier cambio marca `source: "recordado"` y borra `assumedQty`. |
| `ProgressCard.tsx` | Porciones vs. plan arriba, kcal y macros debajo, contra `getSettings()`. |
| `Toast.tsx` | Aviso efímero con acción (Deshacer). |
| `format.ts` | `nf`, `num`, `unitText` (pluralización), `kcalText` (redondeo por certeza), `stepFor`, `perUnitText`. |

## Invariantes de UX

Salieron de una revisión de UX externa. No cambiarlos sin motivo explícito.

1. **Botón Cancelar visible desde el primer frame de la carga.** No dejar al
   usuario encerrado en un modal durante una espera de red.
2. **Tres niveles de certeza** con tratamiento visual distinto. `aproximado`
   lleva borde ámbar en la tarjeta, no solo un badge.
3. **Redondeo proporcional a la confianza.** `kcalText()` aplica `~` y redondea
   a la decena si `source !== "recordado"`. Macros a entero.
4. **Nunca inventar comida.** El estado `unknown` muestra el fragmento sin
   interpretar y dos salidas: Reescribir, o registrar solo como porción.
   "+ Agregar alimento" crea una fila en **ceros**, no con valores plausibles.
5. **Todo editable, antes y después de guardar.** Tocar una fila ya guardada abre
   el editor con Eliminar / Guardar cambios.
6. **Recordar es opt-in.** Checkbox desactivado por defecto, se reinicia en cada
   registro, y solo aparece si hay algo estimado.
7. **Atajos de repetición** en vez de ejemplos de sintaxis. Un toque, sin red.
8. **Las 5 comidas tienen tarjeta**, incluida `colacion2` (Colación PM). Omitirla
   causaba pérdida silenciosa de datos.
9. **Deshacer** en el toast, tanto al guardar como al borrar.

## Formato numérico

- Pluralización correcta: `2 piezas`, `1 rebanada`, `125 g`. Nunca `2 porcións`
  ni `150 × g`. El pluralizador ingenuo (`unit + "s"`) rompe con palabras
  terminadas en consonante o acento.
- Pasos del stepper: `0.5` para piezas y tazas, `25` para gramos.
- `font-variant-numeric: tabular-nums` en todo dato numérico, para que no tiemble
  al actualizar.

## Accesibilidad

Implementado y verificado: foco entra al diálogo y regresa al cerrar, `inert` en
el fondo mientras la hoja está abierta, `aria-live` en el estado de carga y en
los totales, targets de 44 px, Escape y scrim cierran.

Nota: tras cerrar, el `inert` queda **sobre la hoja**, no sobre el fondo. Es
correcto: evita que su contenido fuera de pantalla siga siendo enfocable.

## Design system

Dark-only a propósito (`color-scheme: dark`). Tokens en `src/styles.css`:

```
--bg: #10151f   --card: #1a2230   --card-2: #222c3d
--text: #e8edf5 --muted: #8b98ab  --accent: #4ade80
--danger: #f87171 --warn: #fbbf24 --radius: 16px
```

Los macros usan hues que **no chocan** con ningún color de categoría CLIDDI
(`--prot`, `--fat`, `--carb`). Dentro de cada alimento los macros van en texto
muted, para no competir con el punto de categoría.

Ancho máximo 560 px, system font stack, sin `box-shadow`: la jerarquía es por
capas de fondo.

## Andamiaje de pruebas

`src/components/__mock__/parseMock.ts` es un puente que usa `src/api.ts` real y
cae al mock solo si la función falta. Interruptor:

```js
localStorage["midieta:mock"] = "1" | "unknown" | "offline" | "error"
```

Para borrar el andamiaje: eliminar `src/components/__mock__/` y cambiar el import
de `TodayView.tsx` a `../api`.

## Pendiente conocido

`HistoryView` sigue mostrando solo porciones manuales. Ahora hay días con
`FoodEntry` que ahí no se ven.
