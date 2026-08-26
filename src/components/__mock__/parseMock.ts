/* =========================================================================
 * ANDAMIAJE — NO ES PARTE DEL DISEÑO FINAL.
 *
 * `src/api.ts` declara el contrato del registro por texto, pero la
 * implementación (Worker + memoria local) la escribe el agente de datos en
 * paralelo. Este módulo permite construir y probar la interfaz sin esperarlo:
 *
 *   - Si `src/api.ts` ya exporta funciones reales, se usan **esas**.
 *   - Si todavía no existen (hoy son `export declare`), se usa la simulación.
 *
 * Cuando el Worker esté listo, borrar esta carpeta y cambiar los imports de
 * los componentes de `./__mock__/parseMock` a `../api`.
 *
 * Interruptor manual desde la consola del navegador (recargar después):
 *   localStorage["midieta:mock"] = "1"         → forzar simulación
 *   localStorage["midieta:mock"] = "unknown"   → forzar "No estoy seguro"
 *   localStorage["midieta:mock"] = "offline"   → forzar sin conexión
 *   localStorage["midieta:mock"] = "error"     → forzar falla del servicio
 *   localStorage.removeItem("midieta:mock")    → volver a lo normal
 * ========================================================================= */

import * as realApi from "../../api";
import type { ParseOptions, ParseOutcome, ParsedItem, RepeatShortcut } from "../../api";
import { MEALS, type MealId } from "../../data/plan";
import { normalizeFoodId } from "../../foods";
import { addEntries, listEntries, lookupFood, rememberFood } from "../../store";
import type { FoodEntry, FoodMemory } from "../../types";

interface Api {
  parseText: (text: string, options?: ParseOptions) => Promise<ParseOutcome>;
  toEntries: (date: string, meal: MealId, items: ParsedItem[]) => FoodEntry[];
  commitEntries: (entries: FoodEntry[], remember: boolean) => Promise<void>;
  repeatShortcuts: (today: string) => RepeatShortcut[];
  memoryFor: (name: string) => FoodMemory | undefined;
}

/* ------------------------------------------------------------- simulación */

function forced(): string | null {
  try {
    return localStorage.getItem("midieta:mock");
  } catch {
    return null;
  }
}

function item(
  name: string,
  unit: string,
  qty: number,
  kcal: number,
  protein: number,
  fat: number,
  carbs: number,
  portions: ParsedItem["portions"],
  source: ParsedItem["source"],
  assumedQty = false
): ParsedItem {
  return {
    name,
    unit,
    qty,
    kcalPerUnit: kcal,
    proteinPerUnit: protein,
    fatPerUnit: fat,
    carbsPerUnit: carbs,
    portions,
    source,
    assumedQty,
  };
}

const SCRIPTS: { match: RegExp; meal: MealId; items: () => ParsedItem[] }[] = [
  {
    match: /huevo|pan de caja|desayun/i,
    meal: "desayuno",
    items: () => [
      item("Huevo revuelto", "pieza", 2, 75, 6.3, 5.3, 0.4, { poa: 1 }, "estimado"),
      item("Pan de caja", "rebanada", 1, 110, 3.6, 1.5, 20.2, { cereales: 1 }, "recordado"),
    ],
  },
  {
    // Platillo compuesto: UN elemento que toca tres grupos del plan, no tres
    // elementos separados de pescado, arroz y aceite.
    match: /handroll|sushi|roll/i,
    meal: "cena",
    items: () => [
      item("Handroll de toro", "pieza", 4, 190, 9, 8, 20,
        { poa: 0.75, cereales: 0.5, grasas: 0.2 }, "aproximado", true),
      item("Handroll de salmón", "pieza", 1, 175, 8, 6.5, 20,
        { poa: 0.7, cereales: 0.5, grasas: 0.15 }, "aproximado", true),
    ],
  },
  {
    match: /pollo|arroz|ensalada|comer|comida/i,
    meal: "comida",
    items: () => [
      item("Pechuga de pollo a la plancha", "g", 150, 1.65, 0.31, 0.036, 0, { poa: 0.025 }, "aproximado", true),
      item("Arroz blanco cocido", "taza", 1, 205, 4.3, 0.4, 44.5, { cereales: 2 }, "estimado"),
      item("Ensalada verde con aceite de oliva", "porción", 1, 95, 1.2, 9.1, 3.4, { verduras: 1 }, "aproximado"),
    ],
  },
  {
    match: /yog(h)?urt|manzana|colaci/i,
    meal: "colacion1",
    items: () => [
      item("Yoghurt griego natural", "g", 125, 1.04, 0.08, 0.032, 0.036, { lacteos: 0.008 }, "recordado"),
      item("Manzana", "pieza", 1, 85, 0.4, 0.3, 22, { frutas: 1 }, "recordado"),
    ],
  },
];

function wait(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener("abort", () => {
      clearTimeout(timer);
      reject(new DOMException("Cancelado", "AbortError"));
    });
  });
}

async function mockParseText(text: string, options?: ParseOptions): Promise<ParseOutcome> {
  await wait(1400, options?.signal);

  const force = forced();
  if (force === "unknown") return { status: "unknown", text };
  if (force === "error") return { status: "error", message: "El servicio no respondió" };
  if (force === "offline") {
    return {
      status: "offline",
      resolved: [
        item("Arroz blanco cocido", "taza", 1, 205, 4.3, 0.4, 44.5, { cereales: 2 }, "recordado"),
        item("Ensalada verde", "porción", 1, 95, 1.2, 9.1, 3.4, { verduras: 1 }, "recordado"),
      ],
      pending: "pechuga de pollo",
    };
  }

  const script = SCRIPTS.find((s) => s.match.test(text));
  // Sin coincidencia no se inventa comida: se admite que no se entendió.
  if (!script) return { status: "unknown", text };
  return { status: "ok", result: { meal: script.meal, items: script.items() } };
}

function newId(): string {
  const c = globalThis.crypto;
  if (c && typeof c.randomUUID === "function") return c.randomUUID();
  return `mock-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function mockToEntries(date: string, meal: MealId, items: ParsedItem[]): FoodEntry[] {
  const now = Date.now();
  return items.map((it, i) => ({
    id: newId(),
    date,
    meal,
    name: it.name,
    unit: it.unit,
    qty: it.qty,
    kcalPerUnit: it.kcalPerUnit,
    proteinPerUnit: it.proteinPerUnit,
    fatPerUnit: it.fatPerUnit,
    carbsPerUnit: it.carbsPerUnit,
    portions: { ...it.portions },
    source: it.source,
    createdAt: now + i,
  }));
}

async function mockCommitEntries(entries: FoodEntry[], remember: boolean): Promise<void> {
  await addEntries(entries);
  if (!remember) return;
  for (const e of entries) {
    await rememberFood({
      id: normalizeFoodId(e.name),
      name: e.name,
      unit: e.unit,
      kcalPerUnit: e.kcalPerUnit,
      proteinPerUnit: e.proteinPerUnit,
      fatPerUnit: e.fatPerUnit,
      carbsPerUnit: e.carbsPerUnit,
      portions: { ...e.portions },
      updatedAt: Date.now(),
      useCount: 1,
    });
  }
}

function shiftDate(date: string, days: number): string {
  const [y, m, d] = date.split("-").map(Number);
  const next = new Date(y, m - 1, d + days);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${next.getFullYear()}-${pad(next.getMonth() + 1)}-${pad(next.getDate())}`;
}

function weekday(date: string): string {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("es-MX", { weekday: "long" });
}

/** Repetir es local: sin red, sin espera, sin modelo. */
function mockRepeatShortcuts(today: string): RepeatShortcut[] {
  const out: RepeatShortcut[] = [];
  const seen = new Set<MealId>();
  for (let back = 1; back <= 14 && out.length < 3; back++) {
    const date = shiftDate(today, -back);
    for (const meal of MEALS) {
      if (seen.has(meal.id) || out.length >= 3) continue;
      const entries = listEntries(date, meal.id);
      if (!entries.length) continue;
      seen.add(meal.id);
      out.push({
        meal: meal.id,
        label: `${meal.name} de ${back === 1 ? "ayer" : `el ${weekday(date)}`}`,
        kcal: entries.reduce((sum, e) => sum + e.kcalPerUnit * e.qty, 0),
        items: entries.map((e) => ({
          name: e.name,
          unit: e.unit,
          qty: e.qty,
          kcalPerUnit: e.kcalPerUnit,
          proteinPerUnit: e.proteinPerUnit,
          fatPerUnit: e.fatPerUnit,
          carbsPerUnit: e.carbsPerUnit,
          portions: { ...e.portions },
          source: e.source,
        })),
      });
    }
  }
  return out;
}

function mockMemoryFor(name: string): FoodMemory | undefined {
  return lookupFood(normalizeFoodId(name));
}

/* ------------------------------------------------------------------ puente */

const mockApi: Api = {
  parseText: mockParseText,
  toEntries: mockToEntries,
  commitEntries: mockCommitEntries,
  repeatShortcuts: mockRepeatShortcuts,
  memoryFor: mockMemoryFor,
};

// El spread materializa el namespace sin exigir que los nombres existan: hoy
// `api.ts` solo tiene `export declare`, así que en runtime queda vacío.
const loaded: Partial<Api> = { ...(realApi as Partial<Api>) };
const FORCE_MOCK = forced() !== null;

function pick<K extends keyof Api>(key: K): Api[K] {
  const real = loaded[key];
  if (!FORCE_MOCK && typeof real === "function") return real as Api[K];
  return mockApi[key];
}

/** True mientras la interfaz corra contra la simulación. */
export const USING_MOCK = FORCE_MOCK || typeof loaded.parseText !== "function";

export const parseText = pick("parseText");
export const toEntries = pick("toEntries");
export const commitEntries = pick("commitEntries");
export const repeatShortcuts = pick("repeatShortcuts");
export const memoryFor = pick("memoryFor");
