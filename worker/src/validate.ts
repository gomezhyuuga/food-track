// Validación estricta de lo que devuelve el modelo.
//
// Un modelo puede devolver JSON bien formado y aun así basura: categorías que
// no existen, números negativos, o —el error caro— totales en vez de valores
// por unidad. Nada sale de aquí sin pasar por estas comprobaciones: si algo no
// valida, el Worker responde error y la app no guarda nada.

import { CATEGORY_IDS, CERTAINTIES, MEAL_IDS, type CategoryId, type Certainty, type MealId } from "./cliddi.ts";
import {
  MAX_ITEMS,
  MAX_MEMORY,
  MAX_TEXT,
  type FoodMemoryLite,
  type ParseRequest,
  type ParseResult,
  type ParsedItem,
} from "./schema.ts";

export type Validated<T> = { ok: true; value: T } | { ok: false; error: string };

function fail(error: string): { ok: false; error: string } {
  return { ok: false, error };
}

/* --------------------------------------------------------------- límites */

/** Ninguna comida real pasa de 9 kcal por gramo (grasa pura). */
const MAX_KCAL_PER_GRAM = 9.5;
const MAX_KCAL_PER_UNIT = 5000;
const MAX_MACRO_PER_UNIT = 2000;
const MAX_QTY = 5000;
const MAX_PORTIONS_PER_UNIT = 100;
const MAX_NAME = 120;
const MAX_UNIT = 24;
const MAX_UNKNOWN = 2000;

/** Unidades donde el valor "por unidad" es por gramo o mililitro. */
const GRAM_UNITS = new Set(["g", "gr", "gramo", "gramos", "ml", "mililitro", "mililitros"]);

const CATEGORY_SET: ReadonlySet<string> = new Set(CATEGORY_IDS);
const MEAL_SET: ReadonlySet<string> = new Set(MEAL_IDS);
const CERTAINTY_SET: ReadonlySet<string> = new Set(CERTAINTIES);

/* --------------------------------------------------------------- helpers */

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Número finito, no negativo y dentro de un tope. NaN e Infinity fuera. */
function number(value: unknown, max: number, field: string): Validated<number> {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return fail(`"${field}" no es un número finito`);
  }
  if (value < 0) return fail(`"${field}" es negativo`);
  if (value > max) return fail(`"${field}" fuera de rango (${value} > ${max})`);
  return { ok: true, value };
}

function text(value: unknown, max: number, field: string): Validated<string> {
  if (typeof value !== "string") return fail(`"${field}" no es texto`);
  const trimmed = value.trim();
  if (!trimmed) return fail(`"${field}" está vacío`);
  if (trimmed.length > max) return fail(`"${field}" es demasiado largo`);
  return { ok: true, value: trimmed };
}

/** Recorta el ruido de coma flotante sin cambiar el valor de verdad. */
function round(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

/* ------------------------------------------------------- entrada (cliente) */

function validateMemoryItem(raw: unknown, index: number): Validated<FoodMemoryLite> {
  if (!isObject(raw)) return fail(`memory[${index}] no es un objeto`);
  const name = text(raw.name, MAX_NAME, `memory[${index}].name`);
  if (!name.ok) return name;
  const unit = text(raw.unit, MAX_UNIT, `memory[${index}].unit`);
  if (!unit.ok) return unit;
  const memPortions = validatePortions(raw.portions, `memory[${index}].portions`);
  if (!memPortions.ok) {
    return fail(`memory[${index}].portions inválidas`);
  }

  const numbers: Record<string, number> = {};
  for (const [field, max] of [
    ["kcalPerUnit", MAX_KCAL_PER_UNIT],
    ["proteinPerUnit", MAX_MACRO_PER_UNIT],
    ["fatPerUnit", MAX_MACRO_PER_UNIT],
    ["carbsPerUnit", MAX_MACRO_PER_UNIT],
  ] as const) {
    const parsed = number(raw[field], max, `memory[${index}].${field}`);
    if (!parsed.ok) return parsed;
    numbers[field] = parsed.value;
  }

  return {
    ok: true,
    value: {
      id: typeof raw.id === "string" ? raw.id.slice(0, 120) : "",
      name: name.value,
      unit: unit.value,

      kcalPerUnit: numbers.kcalPerUnit,
      proteinPerUnit: numbers.proteinPerUnit,
      fatPerUnit: numbers.fatPerUnit,
      carbsPerUnit: numbers.carbsPerUnit,
      portions: memPortions.value,
    },
  };
}

/** Valida el cuerpo que manda la PWA. */
export function validateRequest(raw: unknown): Validated<ParseRequest> {
  if (!isObject(raw)) return fail("el cuerpo no es un objeto JSON");

  const body = text(raw.text, MAX_TEXT, "text");
  if (!body.ok) return body;

  if (typeof raw.today !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(raw.today)) {
    return fail('"today" debe ser una fecha YYYY-MM-DD');
  }

  let hour: number | undefined;
  if (raw.hour !== undefined && raw.hour !== null) {
    if (typeof raw.hour !== "number" || !Number.isInteger(raw.hour) || raw.hour < 0 || raw.hour > 23) {
      return fail('"hour" debe ser un entero entre 0 y 23');
    }
    hour = raw.hour;
  }

  const memory: FoodMemoryLite[] = [];
  if (raw.memory !== undefined) {
    if (!Array.isArray(raw.memory)) return fail('"memory" debe ser un arreglo');
    if (raw.memory.length > MAX_MEMORY) return fail('"memory" trae demasiados alimentos');
    for (let i = 0; i < raw.memory.length; i++) {
      const item = validateMemoryItem(raw.memory[i], i);
      if (!item.ok) return item;
      memory.push(item.value);
    }
  }

  return { ok: true, value: { text: body.value, memory, today: raw.today, hour } };
}

/* ------------------------------------------------------- salida (modelo) */

/**
 * Porciones CLIDDI por unidad, por grupo del plan.
 *
 * Acepta las dos formas: el ARRAY de pares `{cat, perUnit}` que pide el
 * esquema del modelo (un objeto de 8 claves opcionales choca con `strict:
 * true`, que exige listarlas todas en `required`), y el MAPA que usa el
 * cliente. Siempre devuelve el mapa.
 */
function validatePortions(
  raw: unknown,
  path: string
): Validated<Partial<Record<CategoryId, number>>> {
  const pairs: [unknown, unknown][] = [];

  if (Array.isArray(raw)) {
    for (const entry of raw) {
      if (!isObject(entry)) return fail(`${path} trae un elemento que no es objeto`);
      pairs.push([entry.cat, entry.perUnit]);
    }
  } else if (isObject(raw)) {
    for (const [cat, value] of Object.entries(raw)) pairs.push([cat, value]);
  } else {
    return fail(`${path} no es una lista ni un objeto`);
  }

  const out: Partial<Record<CategoryId, number>> = {};
  for (const [cat, value] of pairs) {
    if (typeof cat !== "string" || !CATEGORY_SET.has(cat)) {
      return fail(`${path}: "${String(cat)}" no es una categoría válida`);
    }
    const n = number(value, MAX_PORTIONS_PER_UNIT, `${path}.${cat}`);
    if (!n.ok) return n;
    // Un 0 explícito no es un error: significa "este grupo no aplica".
    if (n.value > 0) out[cat as CategoryId] = round(n.value, 4);
  }

  if (Object.keys(out).length === 0) return fail(`${path} no asigna ningún grupo del plan`);
  return { ok: true, value: out };
}

function validateItem(raw: unknown, index: number): Validated<ParsedItem> {
  if (!isObject(raw)) return fail(`items[${index}] no es un objeto`);

  const name = text(raw.name, MAX_NAME, `items[${index}].name`);
  if (!name.ok) return name;
  const unit = text(raw.unit, MAX_UNIT, `items[${index}].unit`);
  if (!unit.ok) return unit;

  if (typeof raw.source !== "string" || !CERTAINTY_SET.has(raw.source)) {
    return fail(`items[${index}].source "${String(raw.source)}" no es válido`);
  }
  if (raw.assumedQty !== undefined && typeof raw.assumedQty !== "boolean") {
    return fail(`items[${index}].assumedQty no es booleano`);
  }

  const qty = number(raw.qty, MAX_QTY, `items[${index}].qty`);
  if (!qty.ok) return qty;
  if (qty.value === 0) return fail(`items[${index}].qty es 0`);

  const kcal = number(raw.kcalPerUnit, MAX_KCAL_PER_UNIT, `items[${index}].kcalPerUnit`);
  if (!kcal.ok) return kcal;
  const protein = number(raw.proteinPerUnit, MAX_MACRO_PER_UNIT, `items[${index}].proteinPerUnit`);
  if (!protein.ok) return protein;
  const fat = number(raw.fatPerUnit, MAX_MACRO_PER_UNIT, `items[${index}].fatPerUnit`);
  if (!fat.ok) return fat;
  const carbs = number(raw.carbsPerUnit, MAX_MACRO_PER_UNIT, `items[${index}].carbsPerUnit`);
  if (!carbs.ok) return carbs;
  const portions = validatePortions(raw.portions, `items[${index}].portions`);
  if (!portions.ok) return portions;

  // Trampa para el error caro: si la unidad es gramo o mililitro, los valores
  // "por unidad" son por gramo. Ningún alimento pasa de ~9 kcal/g, así que un
  // número mayor significa que el modelo mandó el total.
  if (GRAM_UNITS.has(unit.value.toLowerCase()) && kcal.value > MAX_KCAL_PER_GRAM) {
    return fail(
      `items[${index}] parece traer el total y no el valor por unidad ` +
        `(${kcal.value} kcal por "${unit.value}")`
    );
  }

  return {
    ok: true,
    value: {
      name: name.value,
      unit: unit.value,
      qty: round(qty.value, 3),
      kcalPerUnit: round(kcal.value, 2),
      proteinPerUnit: round(protein.value, 2),
      fatPerUnit: round(fat.value, 2),
      carbsPerUnit: round(carbs.value, 2),
      portions: portions.value,
      source: raw.source as Certainty,
      ...(raw.assumedQty === true ? { assumedQty: true } : {}),
    },
  };
}

/** Valida la respuesta del modelo. Nada se devuelve al cliente sin pasar por aquí. */
export function validateResult(raw: unknown): Validated<ParseResult> {
  if (!isObject(raw)) return fail("la respuesta del modelo no es un objeto JSON");

  if (typeof raw.meal !== "string" || !MEAL_SET.has(raw.meal)) {
    return fail(`"meal" "${String(raw.meal)}" no es una de las cinco comidas`);
  }
  if (!Array.isArray(raw.items)) return fail('"items" no es un arreglo');
  if (raw.items.length > MAX_ITEMS) return fail('"items" trae demasiados alimentos');

  const items: ParsedItem[] = [];
  for (let i = 0; i < raw.items.length; i++) {
    const item = validateItem(raw.items[i], i);
    if (!item.ok) return item;
    items.push(item.value);
  }

  let unknown: string | undefined;
  if (raw.unknown !== undefined && raw.unknown !== null) {
    if (typeof raw.unknown !== "string") return fail('"unknown" no es texto');
    const trimmed = raw.unknown.trim().slice(0, MAX_UNKNOWN);
    if (trimmed) unknown = trimmed;
  }

  return {
    ok: true,
    value: { meal: raw.meal as MealId, items, ...(unknown ? { unknown } : {}) },
  };
}
