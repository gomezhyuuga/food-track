# Overview

## Qué es

PWA móvil para que una persona registre lo que come contra el plan de su
nutrióloga. Un solo usuario, sin cuentas, sin login.

Stack: Vite 6, React 18, TypeScript, RxDB sobre IndexedDB (storage Dexie), y un
Worker de Cloudflare que interpreta texto con un LLM.

## El modelo mental que hay que tener

El sistema original cuenta **porciones** por categoría de alimento, no calorías.
Ese es el plan CLIDDI: la nutrióloga asigna a cada comida un número de porciones
por grupo (POA, cereales, frutas, verduras, lácteos). El usuario tocaba `+` y `-`.

El feature nuevo agrega **texto libre**. El usuario escribe lo que comió, un LLM
lo interpreta y devuelve calorías, macronutrientes y las porciones CLIDDI que
corresponden. La decisión de diseño central es que **los dos sistemas conviven**:
un registro por texto alimenta también las porciones, la racha y el apego.

Esto importa al programar. Las porciones totales de un día son **aditivas**:

```
porciones(cat) = tocadas a mano (days.meals) + derivadas de las entradas (entries)
```

Sumar en vez de escribir en `days.meals` desde las entradas evita un problema de
sincronización: borrar una entrada simplemente la quita de la suma, sin tener
que decrementar un contador que podría quedar desajustado en silencio.

## Principios que no se negocian

Salieron de una revisión de UX y de bugs reales. Romperlos rompe el producto.

1. **La app nunca inventa comida.** Si el modelo no entiende algo, lo admite
   (`unknown`) y ofrece salidas. No fabrica un alimento genérico con números
   plausibles, que era el comportamiento del primer prototipo.
2. **La incertidumbre se ve.** Tres niveles: `recordado`, `estimado`,
   `aproximado`. Lo no recordado se redondea a la decena y lleva tilde
   (`~250 kcal`). Un decimal sobre una cantidad adivinada es una mentira
   tipográfica.
3. **Todo es editable, siempre.** Antes de guardar y después. El modelo se
   equivoca; si el usuario no puede corregir, el dato malo se queda.
4. **Recordar es opt-in.** Un valor mal estimado que entra a la memoria se
   propaga a todos los registros futuros sin que el usuario se entere.
5. **Registrar rápido gana.** Para la comida de diario, los atajos de repetición
   (un toque, sin red) son mejores que escribir. El texto libre es para lo
   irregular.

## Qué NO es

- No hay backend con base de datos. El Worker no guarda nada.
- No hay sincronización entre dispositivos. Los datos viven en un solo navegador.
- No hay autenticación.

## Estado actual

El feature de texto está implementado y desplegado en
`https://food-track.gomezhyuuga.workers.dev`, verificado contra el modelo real.

**Producción (`diet.gomezh.dev`) sigue en GitHub Pages** con la versión anterior.
La migración del dominio es por etapas y deliberada; ver
[04-despliegue.md](04-despliegue.md).
