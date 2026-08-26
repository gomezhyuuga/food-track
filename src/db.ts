// Base de datos local: RxDB sobre IndexedDB (storage Dexie).
// Sin backend — los datos siguen viviendo solo en el dispositivo.

import {
  addRxPlugin,
  createRxDatabase,
  type RxCollection,
  type RxDatabase,
  type RxJsonSchema,
  type RxStorage,
} from "rxdb";
import { getRxStorageDexie } from "rxdb/plugins/storage-dexie";
import type { DayLog, FoodEntry, FoodMemory, Settings } from "./types";

export type DayCollection = RxCollection<DayLog>;
export type EntryCollection = RxCollection<FoodEntry>;
export type FoodCollection = RxCollection<FoodMemory>;
export type SettingsCollection = RxCollection<Settings>;

export type MiDietaCollections = {
  days: DayCollection;
  entries: EntryCollection;
  foods: FoodCollection;
  settings: SettingsCollection;
};
export type MiDietaDatabase = RxDatabase<MiDietaCollections>;

const daySchema: RxJsonSchema<DayLog> = {
  version: 0,
  primaryKey: "date",
  type: "object",
  properties: {
    date: { type: "string", maxLength: 10 }, // "YYYY-MM-DD"
    // Llaves dinámicas (MealId → CategoryId → porciones). Se deja como JSON
    // libre a propósito: así cambiar src/data/plan.ts nunca obliga a subir la
    // versión del esquema ni a escribir una migración.
    meals: { type: "object" },
    waterMl: { type: "number" },
  },
  required: ["date", "meals", "waterMl"],
};

/**
 * Alimentos registrados por texto. Documento por alimento, no por día: así no
 * hay contención sobre un mismo documento y no hace falta cola de escritura.
 *
 * Todos los valores son *por unidad*; el total se calcula al mostrar.
 */
const entrySchema: RxJsonSchema<FoodEntry> = {
  version: 0,
  primaryKey: "id",
  type: "object",
  properties: {
    id: { type: "string", maxLength: 36 },
    // Indexado: RxDB exige que un campo indexado sea `required` y, si es
    // string, que declare `maxLength`.
    date: { type: "string", maxLength: 10 },
    meal: { type: "string", maxLength: 16 },
    name: { type: "string" },
    unit: { type: "string" },
    qty: { type: "number" },
    kcalPerUnit: { type: "number" },
    proteinPerUnit: { type: "number" },
    fatPerUnit: { type: "number" },
    carbsPerUnit: { type: "number" },
    // JSON libre a propósito, igual que `days.meals`: un platillo puede tocar
    // varios grupos del plan y añadir categorías no debe exigir migración.
    portions: { type: "object" },
    source: { type: "string", maxLength: 12 },
    createdAt: { type: "number" },
  },
  required: [
    "id",
    "date",
    "meal",
    "name",
    "unit",
    "qty",
    "kcalPerUnit",
    "proteinPerUnit",
    "fatPerUnit",
    "carbsPerUnit",
    "portions",
    "source",
    "createdAt",
  ],
  indexes: ["date"],
};

/** Memoria de alimentos: solo lo que el usuario pidió recordar. */
const foodSchema: RxJsonSchema<FoodMemory> = {
  version: 0,
  primaryKey: "id",
  type: "object",
  properties: {
    id: { type: "string", maxLength: 120 },
    name: { type: "string" },
    unit: { type: "string" },
    kcalPerUnit: { type: "number" },
    proteinPerUnit: { type: "number" },
    fatPerUnit: { type: "number" },
    carbsPerUnit: { type: "number" },
    portions: { type: "object" },
    updatedAt: { type: "number" },
    useCount: { type: "number" },
  },
  required: [
    "id",
    "name",
    "unit",
    "kcalPerUnit",
    "proteinPerUnit",
    "fatPerUnit",
    "carbsPerUnit",
    "portions",
    "updatedAt",
    "useCount",
  ],
};

/** Metas de kcal y macros. Un solo documento, id fijo "user". */
const settingsSchema: RxJsonSchema<Settings> = {
  version: 0,
  primaryKey: "id",
  type: "object",
  properties: {
    id: { type: "string", maxLength: 8 },
    kcalGoal: { type: "number" },
    proteinGoal: { type: "number" },
    fatGoal: { type: "number" },
    carbsGoal: { type: "number" },
  },
  required: ["id", "kcalGoal", "proteinGoal", "fatGoal", "carbsGoal"],
};

/** Llaves de la versión anterior del store, basada en localStorage. */
const LEGACY_PREFIX = "midieta:day:";
const MIGRATED_FLAG = "midieta:rxdb-migrated";

/** Importa una sola vez los días guardados por la versión de localStorage. */
async function migrateLegacyLocalStorage(days: DayCollection) {
  if (localStorage.getItem(MIGRATED_FLAG)) return;

  const legacy: DayLog[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (!key?.startsWith(LEGACY_PREFIX)) continue;
    try {
      const raw = JSON.parse(localStorage.getItem(key) ?? "");
      legacy.push({
        date: key.slice(LEGACY_PREFIX.length),
        meals: raw?.meals ?? {},
        waterMl: raw?.waterMl ?? 0,
      });
    } catch {
      // datos corruptos: se salta ese día
    }
  }

  if (legacy.length) await days.bulkUpsert(legacy);
  // Las llaves viejas se conservan como respaldo; solo se marca la migración.
  localStorage.setItem(MIGRATED_FLAG, new Date().toISOString());
}

async function create(): Promise<MiDietaDatabase> {
  let storage: RxStorage<unknown, unknown> = getRxStorageDexie();

  if (import.meta.env.DEV) {
    // Imports dinámicos para que ni dev-mode ni ajv entren al bundle de producción.
    const { RxDBDevModePlugin } = await import("rxdb/plugins/dev-mode");
    addRxPlugin(RxDBDevModePlugin);
    // dev-mode exige un validador de esquema al nivel del storage (error DVM1).
    const { wrappedValidateAjvStorage } = await import("rxdb/plugins/validate-ajv");
    storage = wrappedValidateAjvStorage({ storage });
  }

  const db = await createRxDatabase<MiDietaCollections>({
    name: "midieta",
    storage,
    // El HMR de Vite reevalúa este módulo; sin esto RxDB lanza DB8.
    ignoreDuplicate: import.meta.env.DEV,
  });

  // Colecciones nuevas: cada una lleva su propia `version: 0` y no dispara
  // migración de `days` ni obliga a cargar el plugin de migración en producción.
  await db.addCollections({
    days: { schema: daySchema },
    entries: { schema: entrySchema },
    foods: { schema: foodSchema },
    settings: { schema: settingsSchema },
  });
  await migrateLegacyLocalStorage(db.days);
  return db;
}

let dbPromise: Promise<MiDietaDatabase> | null = null;

/** Singleton: llamadas concurrentes comparten la misma base. */
export function getDb(): Promise<MiDietaDatabase> {
  if (!dbPromise) dbPromise = create();
  return dbPromise;
}
