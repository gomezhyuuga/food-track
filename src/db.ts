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
import type { DayLog } from "./store";

export type DayCollection = RxCollection<DayLog>;
export type MiDietaCollections = { days: DayCollection };
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

  await db.addCollections({ days: { schema: daySchema } });
  await migrateLegacyLocalStorage(db.days);
  return db;
}

let dbPromise: Promise<MiDietaDatabase> | null = null;

/** Singleton: llamadas concurrentes comparten la misma base. */
export function getDb(): Promise<MiDietaDatabase> {
  if (!dbPromise) dbPromise = create();
  return dbPromise;
}
