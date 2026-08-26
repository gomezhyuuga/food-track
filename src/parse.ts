// Cliente del Worker que interpreta texto libre.
//
// Orden de resolución:
//   1. La memoria local del usuario (sus alimentos exactos) se busca primero y
//      se manda al Worker para que el modelo no vuelva a estimar esos valores.
//   2. Si no hay red, se resuelve lo que la memoria alcance y el resto queda
//      pendiente; nunca se inventan números para lo que no se conoce.
//   3. Si hay red, decide el modelo, pero la respuesta se valida otra vez aquí
//      antes de devolverla.

import type { ParseOptions, ParseOutcome, ParseResult, ParsedItem } from "./api";
import { CATEGORIES, MEALS, type CategoryId, type MealId } from "./data/plan";
import { normalizeFoodId } from "./foods";
import { listMemory, todayKey } from "./store";
import type { FoodMemory } from "./types";

/** Tope del texto libre; el Worker aplica el mismo. */
const MAX_TEXT = 2000;
/** Alimentos de memoria que se mandan como contexto. */
const MAX_MEMORY = 24;
/** El modelo suele tardar 2–5 s; 20 s ya es una falla. */
const TIMEOUT_MS = 20_000;

/** La memoria recortada a lo que el Worker necesita (sin useCount ni fechas). */
interface FoodMemoryLite {
  id: string;
  name: string;
  unit: string;
  kcalPerUnit: number;
  proteinPerUnit: number;
  fatPerUnit: number;
  carbsPerUnit: number;
  portions: Partial<Record<CategoryId, number>>;
}

function lite(food: FoodMemory): FoodMemoryLite {
  return {
    id: food.id,
    name: food.name,
    unit: food.unit,
    kcalPerUnit: food.kcalPerUnit,
    proteinPerUnit: food.proteinPerUnit,
    fatPerUnit: food.fatPerUnit,
    carbsPerUnit: food.carbsPerUnit,
    portions: { ...food.portions },
  };
}

/* ---------------------------------------------------------------- memoria */

/**
 * ¿El texto menciona este alimento?
 *
 * Se compara sobre slugs para que "Plátano" y "platano" coincidan. Es un
 * `includes` a propósito y no una comparación exacta: en español los plurales
 * son sufijos ("huevo" ⊂ "2-huevos") y el modelo decide al final si aplica.
 */
function mentions(textSlug: string, foodId: string): boolean {
  return foodId.length > 2 && textSlug.includes(foodId);
}

/** Alimentos de memoria que se mandan: primero los mencionados, luego los más usados. */
function memoryPayload(text: string): FoodMemoryLite[] {
  const textSlug = normalizeFoodId(text);
  const all = listMemory(); // ya viene ordenada por useCount desc
  const mentioned = all.filter((food) => mentions(textSlug, food.id));
  const rest = all.filter((food) => !mentions(textSlug, food.id));
  return [...mentioned, ...rest].slice(0, MAX_MEMORY).map(lite);
}

/* -------------------------------------------------------- modo sin conexión */

const WORD_QTY: Record<string, number> = {
  un: 1,
  una: 1,
  uno: 1,
  dos: 2,
  tres: 3,
  cuatro: 4,
  cinco: 5,
  seis: 6,
  siete: 7,
  ocho: 8,
  nueve: 9,
  diez: 10,
  medio: 0.5,
  media: 0.5,
};

/** Cantidad que aparece en un fragmento ("2 huevos" → 2). `undefined` si no hay. */
function readQty(fragment: string): number | undefined {
  const digits = fragment.match(/(\d+(?:[.,]\d+)?)/);
  if (digits) {
    const value = Number(digits[1].replace(",", "."));
    if (Number.isFinite(value) && value > 0) return value;
  }
  for (const word of normalizeFoodId(fragment).split("-")) {
    const value = WORD_QTY[word];
    if (value !== undefined) return value;
  }
  return undefined;
}

/** Parte el texto en trozos que suelen corresponder a un alimento cada uno. */
function fragments(text: string): string[] {
  return text
    .split(/[,;\n+]|\s+y\s+|\s+con\s+/i)
    .map((part) => part.trim())
    .filter(Boolean);
}

/**
 * Sin red: se resuelve solo lo que la memoria conoce con certeza y el resto
 * se devuelve como pendiente. No se estima nada.
 */
function offlineOutcome(text: string): ParseOutcome {
  const memory = listMemory();
  const resolved: ParsedItem[] = [];
  const pending: string[] = [];

  for (const fragment of fragments(text)) {
    const slug = normalizeFoodId(fragment);
    const food = memory.find((item) => mentions(slug, item.id));
    if (!food) {
      pending.push(fragment);
      continue;
    }
    const qty = readQty(fragment);
    resolved.push({
      name: food.name,
      unit: food.unit,
      qty: qty ?? 1,
      kcalPerUnit: food.kcalPerUnit,
      proteinPerUnit: food.proteinPerUnit,
      fatPerUnit: food.fatPerUnit,
      carbsPerUnit: food.carbsPerUnit,
      portions: { ...food.portions },
      source: "recordado",
      ...(qty === undefined ? { assumedQty: true } : {}),
    });
  }

  return { status: "offline", resolved, pending: pending.join(", ") };
}

/* ------------------------------------------------------------- validación */

const MEAL_IDS = new Set<string>(MEALS.map((meal) => meal.id));
const CATEGORY_IDS = new Set<string>(Object.keys(CATEGORIES));
const SOURCES = new Set<string>(["recordado", "estimado", "aproximado"]);

function isPositive(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

/**
 * Segunda validación, del lado del cliente.
 *
 * El Worker ya valida, pero esto es lo que separa la base de datos de una
 * respuesta corrupta si algún día la URL apunta a otra cosa.
 */
/**
 * Porciones por grupo del plan.
 *
 * Un alimento siempre toca al menos un grupo; un mapa vacío o con números
 * inválidos se rechaza. El Worker ya normaliza, pero el cliente no da por
 * hecho lo que llega por la red.
 */
function readPortions(raw: unknown): Partial<Record<CategoryId, number>> | undefined {
  if (typeof raw !== "object" || raw === null) return undefined;
  const out: Partial<Record<CategoryId, number>> = {};
  for (const [cat, value] of Object.entries(raw as Record<string, unknown>)) {
    if (!CATEGORY_IDS.has(cat)) return undefined;
    if (!isPositive(value)) return undefined;
    if ((value as number) > 0) out[cat as CategoryId] = value as number;
  }
  return Object.keys(out).length ? out : undefined;
}

function readResult(body: unknown): ParseResult | undefined {
  if (typeof body !== "object" || body === null) return undefined;
  const raw = body as Record<string, unknown>;
  if (typeof raw.meal !== "string" || !MEAL_IDS.has(raw.meal)) return undefined;
  if (!Array.isArray(raw.items)) return undefined;

  const items: ParsedItem[] = [];
  for (const entry of raw.items) {
    if (typeof entry !== "object" || entry === null) return undefined;
    const item = entry as Record<string, unknown>;
    if (typeof item.name !== "string" || !item.name.trim()) return undefined;
    if (typeof item.unit !== "string" || !item.unit.trim()) return undefined;
    if (typeof item.source !== "string" || !SOURCES.has(item.source)) return undefined;
    if (!isPositive(item.qty) || item.qty === 0) return undefined;
    if (!isPositive(item.kcalPerUnit)) return undefined;
    if (!isPositive(item.proteinPerUnit)) return undefined;
    if (!isPositive(item.fatPerUnit)) return undefined;
    if (!isPositive(item.carbsPerUnit)) return undefined;
    const portions = readPortions(item.portions);
    if (!portions) return undefined;

    items.push({
      name: item.name.trim(),
      unit: item.unit.trim(),
      qty: item.qty,
      kcalPerUnit: item.kcalPerUnit,
      proteinPerUnit: item.proteinPerUnit,
      fatPerUnit: item.fatPerUnit,
      carbsPerUnit: item.carbsPerUnit,
      portions,
      source: item.source as ParsedItem["source"],
      ...(item.assumedQty === true ? { assumedQty: true } : {}),
    });
  }

  const unknown = typeof raw.unknown === "string" ? raw.unknown.trim() : "";
  return { meal: raw.meal as MealId, items, ...(unknown ? { unknown } : {}) };
}

/* ------------------------------------------------------------- red y HTTP */

function httpMessage(status: number, detail: string): string {
  if (status === 403) return "El intérprete no acepta peticiones desde esta dirección.";
  if (status === 404 || status === 405) return "La dirección del intérprete no es correcta.";
  if (status === 400) return detail || "El texto no se pudo enviar.";
  if (status === 422) return "No pude interpretar lo que escribiste. Intenta con otras palabras.";
  if (status === 429) return "Demasiadas peticiones seguidas. Espera un momento.";
  return "El intérprete no está disponible ahora. Intenta más tarde.";
}

async function detailOf(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as { error?: unknown };
    return typeof body.error === "string" ? body.error : "";
  } catch {
    return "";
  }
}

function abortError(): DOMException {
  return new DOMException("parseText cancelado", "AbortError");
}

/**
 * Interpreta texto libre.
 *
 * Nota para quien consuma esto desde la interfaz: si `options.signal` se
 * aborta, la promesa **rechaza** con un `DOMException` de nombre `AbortError`,
 * que es la convención de `fetch`. Los timeouts internos no abortan: esos sí
 * regresan `{ status: "error" }`.
 */
/**
 * Resuelve a dónde mandar el texto.
 *
 * Por defecto es la ruta relativa `/parse`: la PWA y el Worker viven en el
 * mismo origen. `VITE_PARSE_URL` queda como escape para apuntar a otro Worker
 * (p. ej. probar contra producción desde `npm run dev`).
 *
 * Si la variable trae solo el origen —el error fácil de cometer— se le añade
 * `/parse`. Sin esto, la app hace POST a la raíz, recibe el index.html y falla
 * con un mensaje que no señala la causa real.
 */
function resolveParseUrl(): string {
  const configured = import.meta.env.VITE_PARSE_URL?.trim();
  if (!configured) return "/parse";
  const base = configured.replace(/\/+$/, "");
  return base.endsWith("/parse") ? base : `${base}/parse`;
}

export async function parseText(text: string, options: ParseOptions = {}): Promise<ParseOutcome> {
  const trimmed = text.trim();
  if (!trimmed) return { status: "error", message: "Escribe qué comiste." };
  if (trimmed.length > MAX_TEXT) {
    return { status: "error", message: "El texto es demasiado largo; divídelo en dos registros." };
  }

  // La PWA y el Worker viven en el mismo origen, así que la ruta es relativa:
  // no hace falta variable de build ni negociar CORS. `VITE_PARSE_URL` queda
  // como escape para apuntar a otro Worker (p. ej. probar contra producción
  // desde `npm run dev`).
  const url = resolveParseUrl();

  if (options.signal?.aborted) throw abortError();
  if (typeof navigator !== "undefined" && navigator.onLine === false) {
    return offlineOutcome(trimmed);
  }

  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, TIMEOUT_MS);
  const forward = () => controller.abort();
  options.signal?.addEventListener("abort", forward, { once: true });

  try {
    const response = await fetch(url, {
      method: "POST", // nunca GET: el service worker cachearía la respuesta
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        text: trimmed,
        memory: memoryPayload(trimmed),
        today: todayKey(),
        hour: new Date().getHours(),
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      return { status: "error", message: httpMessage(response.status, await detailOf(response)) };
    }

    let body: unknown;
    try {
      body = await response.json();
    } catch {
      return { status: "error", message: "El intérprete respondió algo que no se entiende." };
    }

    const result = readResult(body);
    if (!result) {
      return { status: "error", message: "El intérprete respondió datos inválidos." };
    }
    if (!result.items.length) {
      return { status: "unknown", text: result.unknown ?? trimmed };
    }
    return { status: "ok", result };
  } catch (cause) {
    if (options.signal?.aborted) throw abortError();
    if (timedOut) {
      return { status: "error", message: "La interpretación tardó demasiado. Intenta de nuevo." };
    }
    // `fetch` solo lanza por fallo de red (o por abort, ya descartado arriba).
    // Un CORS mal configurado o una URL equivocada llegan aquí disfrazados de
    // "sin conexión", así que se deja rastro en la consola: es la única pista
    // que distingue "estoy en el metro" de "el Worker no está publicado".
    console.warn("[mi-dieta] no se pudo llamar al intérprete:", cause);
    return offlineOutcome(trimmed);
  } finally {
    clearTimeout(timer);
    options.signal?.removeEventListener("abort", forward);
  }
}
