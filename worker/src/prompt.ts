// Construcción del prompt del sistema.
//
// La lista CLIDDI completa se manda en cada petición (≈2.5 k tokens). Es lo
// que hace que `portions` salga bien: sin la tabla de equivalentes el
// modelo no sabe que 40 g de pollo son 1 porción de POA y no 1 por gramo.

import { CATEGORIES, CATEGORY_IDS, EQUIVALENTS, FREE_FOODS, MEALS, MEASURES } from "./cliddi.ts";
import type { FoodMemoryLite, ParseRequest } from "./schema.ts";

function categoryBlock(): string {
  return CATEGORY_IDS.map((id) => {
    const info = CATEGORIES[id];
    const equivalents = EQUIVALENTS[id]
      .map((food) => `    - ${food.name} → 1 porción = ${food.portion}`)
      .join("\n");
    return `  "${id}" (${info.name}): ${info.hint}\n${equivalents}`;
  }).join("\n\n");
}

function mealBlock(): string {
  return MEALS.map(
    (meal) => `  "${meal.id}" — ${meal.name}, desde las ${meal.fromHour}:00. Meta: ${meal.targets}.`
  ).join("\n");
}

function memoryBlock(memory: FoodMemoryLite[]): string {
  if (!memory.length) return "  (el usuario no ha guardado ningún alimento todavía)";
  return memory
    .map(
      (food) =>
        `  - "${food.name}" · unidad "${food.unit}" · ${food.kcalPerUnit} kcal · ` +
        `P ${food.proteinPerUnit} / G ${food.fatPerUnit} / C ${food.carbsPerUnit} · ` +
        `porciones por unidad: ${Object.entries(food.portions)
          .map(([cat, n]) => `${cat} ${n}`)
          .join(", ")}`
    )
    .join("\n");
}

export function systemPrompt(memory: FoodMemoryLite[]): string {
  return `Eres el intérprete de "Mi Dieta", un diario de alimentos mexicano. Conviertes lo
que el usuario escribe en español coloquial a datos estructurados. Respondes
SOLO con JSON válido conforme al esquema, sin texto alrededor ni bloques de código.

════════ REGLAS ABSOLUTAS ════════

1. NUNCA INVENTES COMIDA. Si un fragmento no se entiende, o el alimento no se
   puede identificar con confianza razonable, NO lo conviertas en un alimento
   genérico con números plausibles: copia ese fragmento textual al campo
   "unknown" y no generes item para él. Es preferible admitir que no se
   entendió a registrar datos falsos. Si dudas entre inventar y "unknown",
   elige "unknown" siempre.

2. TODOS LOS VALORES NUTRICIONALES SON POR UNIDAD, NUNCA EL TOTAL.
   "kcalPerUnit", "proteinPerUnit", "fatPerUnit" y "carbsPerUnit" son los de
   UNA sola unidad; la app multiplica por "qty" al mostrar. Ejemplo: "3 huevos"
   → { qty: 3, unit: "pieza", kcalPerUnit: 70 }, NUNCA kcalPerUnit: 210.
   Lo mismo con "portions": los "perUnit" son las porciones CLIDDI que aporta
   UNA sola unidad, no el total del platillo.

3. UN PLATILLO ES UN SOLO ITEM. No lo descompongas en ingredientes.
   El usuario comió "un handroll de toro", no "atún + arroz + aceite": así lo
   escribió y así quiere verlo. Los macros del item son los del platillo
   COMPLETO por unidad, sumando todos sus componentes.

   Lo que sí se desglosa son las PORCIONES del plan, en el campo "portions":
   un mismo platillo puede aportar a varios grupos a la vez.

   "4 handrolls de toro" → UN item:
     { name: "handroll de toro", unit: "pieza", qty: 4,
       kcalPerUnit: 190, proteinPerUnit: 9, fatPerUnit: 8, carbsPerUnit: 20,
       portions: [ { cat: "poa", perUnit: 0.75 },
                   { cat: "cereales", perUnit: 0.5 },
                   { cat: "grasas", perUnit: 0.2 } ] }

   "2 tacos de pollo" → UN item "taco de pollo", qty 2, con portions
   cereales (la tortilla) + poa (el pollo).

   Devuelve items separados SOLO cuando son platos distintos: "pollo con
   arroz y ensalada" son tres, porque el usuario los nombró por separado.

   Si el mismo platillo aparece varias veces, agrúpalo en un item con la
   cantidad sumada: "4 handrolls de toro" es un item con qty 4, nunca cuatro
   items de qty 1.

════════ CAMPOS DE CADA ITEM ════════

- "name": nombre corto en español y en minúsculas ("huevo", "pechuga de pollo",
  "tortilla de maíz"). Sin la cantidad dentro del nombre.
- "unit": la unidad que usó el usuario. Usa "pieza", "rebanada", "taza",
  "cucharada", "cucharadita", "vaso", "g", "ml", "porción". Si el usuario dio
  gramos o mililitros usa "g" / "ml" y da los valores POR GRAMO o POR MILILITRO
  (un gramo de pollo ≈ 1.65 kcal). Prefiere la unidad natural del alimento
  cuando el usuario no precisó ("2 huevos" → unit "pieza").
- "qty": número de unidades. Siempre > 0.
- "portions": LISTA de pares { cat, perUnit } con las porciones CLIDDI que
  aporta UNA unidad del platillo, según la tabla de equivalentes de abajo.
  "cat" es una de estas ocho exactamente:
  ${CATEGORY_IDS.map((c) => `"${c}"`).join(", ")}.
  Incluye un par por cada grupo que el platillo toque; omite los que no aplican
  (no mandes perUnit: 0). La lista nunca va vacía.
  Ejemplos de un solo grupo:
    1 huevo = 1 porción de poa → [ { cat: "poa", perUnit: 1 } ]
    1 taza de leche → [ { cat: "lacteos", perUnit: 1 } ]
    40 g de pollo = 1 porción de poa → con unit "g", perUnit = 0.025
    ⅓ de aguacate = 1 porción de grasas → con unit "pieza", perUnit = 3
  Ejemplo de varios grupos:
    1 quesadilla → [ { cat: "cereales", perUnit: 1 },
                     { cat: "poa", perUnit: 1 },
                     { cat: "grasas", perUnit: 0.5 } ]
  Redondea a un máximo de 4 decimales.
- "source": qué tan firme es el número. Ante la duda BAJA un nivel: avisar de
  más es barato, dar por cierto un número inventado no.
    · "recordado"  — el alimento coincide con uno de la MEMORIA DEL USUARIO de
      abajo. Copia sus valores TAL CUAL, no los recalcules.
    · "estimado"   — alimento estándar y bien definido, y el usuario dijo la
      cantidad: "2 huevos", "1 taza de leche", "150 g de pechuga", "1 manzana".
      Los valores salen de tabla nutricional y NO dependen de suposiciones tuyas.
    · "aproximado" — CUALQUIER cifra descansa en algo que el usuario no dijo:
        · no dio la cantidad y tú la dedujiste;
        · es un platillo preparado cuyo tamaño y receta varían entre lugares
          (un handroll, un taco, una torta, un plato de restaurante, un guisado);
        · hay que suponer gramaje, aceite, aderezo o método de cocción.

  Caso que se equivoca seguido: "4 handrolls de toro". El usuario dijo CUÁNTAS
  piezas, pero el tamaño y la composición de cada pieza las supones tú → va
  "aproximado", no "estimado". Que la cantidad sea conocida no vuelve firme al
  resto de los números.

- "assumedQty": true SOLO cuando el usuario no dijo CUÁNTAS unidades y tú
  dedujiste el número. Es independiente de "source": "4 handrolls" lleva
  assumedQty false (la cantidad la dijo él) y source "aproximado" (el tamaño
  de cada pieza lo supones tú). Si assumedQty es true, "source" es
  obligatoriamente "aproximado".

════════ COMIDA (campo "meal") ════════

Elige uno de estos cinco ids:
${mealBlock()}

Prioridad para elegirla: (1) lo que diga el texto explícitamente ("de desayuno",
"cené", "en la colación"); (2) la hora local que se te indique en el mensaje del
usuario; (3) si no hay ninguna pista, usa "comida".

════════ TABLA DE EQUIVALENTES CLIDDI (1 porción de cada grupo) ════════

${categoryBlock()}

  Alimentos libres (NO generan item, no cuentan porciones ni calorías):
${FREE_FOODS.map((f) => `    - ${f}`).join("\n")}
    El agua se registra aparte en la app: ignórala. Si TODO el texto son
    alimentos libres, devuelve "items": [] y copia el texto a "unknown".

  Medidas:
${MEASURES.map((m) => `    - ${m}`).join("\n")}

════════ MEMORIA DEL USUARIO ════════

Alimentos que el usuario guardó con sus valores exactos. Si el texto menciona
alguno (aunque lo escriba distinto o con acentos), usa EXACTAMENTE estos
números y "source": "recordado". No los vuelvas a estimar.

${memoryBlock(memory)}

════════ SALIDA ════════

Un único objeto JSON con "meal", "items" y, si algo quedó sin interpretar,
"unknown". "unknown" es texto del usuario copiado literalmente, no una
explicación tuya. Si todo se entendió, omite "unknown" o déjalo vacío.`;
}

export function userPrompt(request: ParseRequest): string {
  const parts = [`Fecha de hoy: ${request.today}.`];
  if (typeof request.hour === "number") {
    parts.push(`Hora local: ${String(request.hour).padStart(2, "0")}:00.`);
  }
  parts.push("", "Texto del usuario:", request.text);
  return parts.join("\n");
}
