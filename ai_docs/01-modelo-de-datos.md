# Modelo de datos

## Regla que gobierna todo

**No se toca `daySchema`.**

Agregar un campo de primer nivel a `days` obligaría a subir `version`, escribir
migraciones y, lo importante, cargar el plugin de migración de RxDB **también en
producción**. Hoy el bundle de producción lleva solo el core de RxDB más Dexie:
ningún plugin. Colecciones nuevas no disparan nada de eso, porque cada una tiene
su propia `version: 0`.

Si necesitas guardar algo nuevo, crea una colección, no un campo en `days`.

## Las cuatro colecciones

Definidas en `src/db.ts`, tipos en `src/types.ts`.

### `days` (existía antes)

```ts
{ date: "YYYY-MM-DD", meals: {...}, waterMl: number }
```

`meals` es `{ type: "object" }` **sin `properties`**, a propósito: es JSON libre,
así cambiar `src/data/plan.ts` nunca obliga a migrar. Guarda solo las porciones
que el usuario tocó a mano.

### `entries` (nueva) - el detalle por alimento

```ts
{
  id, date, meal, name, unit, qty,
  kcalPerUnit, proteinPerUnit, fatPerUnit, carbsPerUnit,
  portions, source, createdAt
}
```

Documento por alimento, no por día. Como cada uno tiene id propio, no hay
contención sobre el mismo documento y no hace falta cola de escritura.
Indexada por `date`.

### `foods` (nueva) - la memoria

```ts
{ id, name, unit, kcalPerUnit, ..., portions, updatedAt, useCount }
```

`id` es el slug del nombre (`normalizeFoodId`). Solo entran los alimentos que el
usuario pidió recordar explícitamente.

### `settings` (nueva) - las metas

```ts
{ id: "user", kcalGoal, proteinGoal, fatGoal, carbsGoal }
```

Un solo documento con id fijo.

## Un platillo es UN item, con porciones repartidas

`portions` es un mapa de grupo del plan a porciones **por unidad**. Un platillo
compuesto no se descompone en ingredientes: es un solo item que toca varios
grupos a la vez.

```ts
// 4 handrolls de toro: un item, tres grupos
{
  name: "handroll de toro", unit: "pieza", qty: 4,
  kcalPerUnit: 190, proteinPerUnit: 9, fatPerUnit: 8, carbsPerUnit: 20,
  portions: { poa: 0.75, cereales: 0.5, grasas: 0.2 },
}
// total: 760 kcal, 3 porciones POA, 2 cereales, 0.8 grasas
```

En el esquema de RxDB `portions` es un objeto libre, igual que `days.meals`:
añadir categorías nunca exigirá migración.

**Consecuencia en el store.** `entryPortionsFor(date, cat)` recorre TODOS los
alimentos del día, no solo los de categoría coincidente — un mismo item suma a
varios grupos.

## POR UNIDAD, nunca el total

Todos los valores nutricionales y las porciones se guardan **por unidad**. El
total se calcula multiplicando por `qty` al mostrar.

```ts
// 150 g de pechuga, 0.025 porciones POA por gramo
{ unit: "g", qty: 150, kcalPerUnit: 1.65, portions: { poa: 0.025 } }
// total: 247.5 kcal, 3.75 porciones POA
```

Guardar totales produjo un bug de "562.5 porciones" en el prototipo. El Worker
además rechaza respuestas donde la unidad sea `g`/`ml` y `kcalPerUnit > 9.5`:
ningún alimento pasa de ~9 kcal/g, así que ese número solo puede ser un total
colado como valor por unidad.

## El apego y el redondeo

`src/adherence.ts` cuenta una meta como cumplida solo con **igualdad exacta**
(`count === target`). Es deliberado y está documentado: premia dar en el blanco,
no acumular.

Las entradas de texto producen porciones **fraccionarias** (150 g de pechuga son
3.75 porciones POA). Con fracciones, `count === 12` sería inalcanzable y la racha
se rompería para siempre.

Solución, decidida por el usuario: **redondear el total combinado** antes de
comparar.

```ts
export function totalPortions(log: DayLog, cat: CategoryId): number {
  return Math.round(mealTotal(log, cat) + entryPortionsFor(log.date, cat));
}
```

Verificado: 6 manuales + 5.75 de alimentos = 11.75 crudo, **12 redondeado**, meta
cumplida. Con igualdad exacta ese día habría contado como fallido.

Conserva la regla original y mantiene comparables los días registrados antes del
cambio. **Los chips de la UI usan el mismo `totalPortions()`**, para que nunca se
contradigan con la racha.

## Nunca metas kcal en `DAILY_TARGETS`

`adherence.ts` recorre `Object.entries(DAILY_TARGETS)` casteando las llaves a
`CategoryId`. Una llave `kcal` ahí haría que `mealTotal` devuelva 0, esa meta
nunca se cumpliría, el total pasaría de 4 a 5 metas y **todas las rachas
históricas cambiarían de valor**. Las metas calóricas viven en `settings`.

## `store.ts`

Mantiene un espejo síncrono en memoria de las cuatro colecciones, alimentado por
suscripciones de RxDB. Así las vistas y `adherence.ts` leen sin `async`.

- `initStore()` resuelve con `Promise.all` del primer snapshot de cada colección.
- El contador `version` y `useStoreVersion()` son globales: una colección nueva
  no obliga a cambiar las vistas.
- Las escrituras sobre `days` van serializadas por fecha (`mutateDay`) para que
  los toques rápidos en `+` no se pisen. Las `entries` no lo necesitan.
- En dev, RxDB **congela** los documentos: toda mutación debe devolver un objeto
  nuevo.

## Gotchas de esquema en RxDB

- Una `primaryKey` de tipo string exige `maxLength`.
- Todo campo indexado debe ser `required` y, si es string, llevar `maxLength`.
- Nombres con prefijo `_` están reservados (`_deleted`, `_rev`, `_meta`).
