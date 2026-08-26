// Pruebas de la validación y del desenvuelto de la respuesta del modelo.
//
// Se corren sin dependencias: `node test/validate.test.ts` (Node ≥ 22.18
// entiende TypeScript borrando los tipos). No tocan la red ni el modelo.

import { extractJson, parseLoose, ModelError } from "../src/model.ts";
import { validateRequest, validateResult } from "../src/validate.ts";

let passed = 0;
const failures: string[] = [];

function check(name: string, run: () => void): void {
  try {
    run();
    passed++;
  } catch (error) {
    failures.push(`${name}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function equal(actual: unknown, expected: unknown, message: string): void {
  const a = JSON.stringify(actual);
  const b = JSON.stringify(expected);
  if (a !== b) throw new Error(`${message}\n    esperado: ${b}\n    obtenido: ${a}`);
}

/* ------------------------------------------------------------- fixtures */

const goodItem = {
  name: "huevo",
  unit: "pieza",
  qty: 3,
  kcalPerUnit: 70,
  proteinPerUnit: 6.3,
  fatPerUnit: 4.8,
  carbsPerUnit: 0.4,
  portions: [{ cat: "poa", perUnit: 1 }],
  source: "estimado",
};

const goodResponse = { meal: "desayuno", items: [goodItem] };

/* ------------------------------------------------- validateResult: feliz */

check("respuesta bien formada", () => {
  const result = validateResult(goodResponse);
  assert(result.ok, `debería validar: ${result.ok ? "" : result.error}`);
  equal(result.value.meal, "desayuno", "la comida se conserva");
  equal(result.value.items.length, 1, "un solo alimento");
  equal(result.value.items[0].kcalPerUnit, 70, "kcal por unidad intacta");
  assert(result.value.unknown === undefined, "sin unknown cuando no lo hay");
});

check("respuesta con unknown", () => {
  const result = validateResult({
    ...goodResponse,
    unknown: "  y un poco de eso que sobró  ",
  });
  assert(result.ok, "debería validar");
  equal(result.value.unknown, "y un poco de eso que sobró", "unknown recortado");
});

check("unknown vacío se omite", () => {
  const result = validateResult({ ...goodResponse, unknown: "   " });
  assert(result.ok, "debería validar");
  assert(result.value.unknown === undefined, "unknown en blanco no se propaga");
});

check("items vacíos son válidos", () => {
  const result = validateResult({ meal: "cena", items: [], unknown: "no entendí nada" });
  assert(result.ok, "una respuesta sin alimentos es legítima");
  equal(result.value.items, [], "arreglo vacío");
});

check("valores por gramo pasan", () => {
  const result = validateResult({
    meal: "comida",
    items: [{ ...goodItem, name: "pechuga de pollo", unit: "g", qty: 120, kcalPerUnit: 1.65, portions: [{ cat: "poa", perUnit: 0.025 }] }],
  });
  assert(result.ok, `debería validar: ${result.ok ? "" : result.error}`);
  equal(result.value.items[0].portions.poa, 0.025, "porciones por gramo");
});

check("assumedQty se conserva solo si es true", () => {
  const yes = validateResult({ meal: "cena", items: [{ ...goodItem, assumedQty: true }] });
  assert(yes.ok, "debería validar");
  equal(yes.value.items[0].assumedQty, true, "assumedQty true");
  const no = validateResult({ meal: "cena", items: [{ ...goodItem, assumedQty: false }] });
  assert(no.ok, "debería validar");
  assert(no.value.items[0].assumedQty === undefined, "assumedQty false se omite");
});

/* ------------------------------------------------ validateResult: rechazos */

function rejects(name: string, payload: unknown, hint: string): void {
  check(name, () => {
    const result = validateResult(payload);
    assert(!result.ok, `debería rechazarse (${hint})`);
    assert(result.error.length > 0, "el error debe explicar qué pasó");
  });
}

rejects(
  "categoría inválida",
  { meal: "comida", items: [{ ...goodItem, portions: [{ cat: "postres", perUnit: 1 }] }] },
  "categoría"
);
rejects(
  "porciones ausentes",
  { meal: "comida", items: [{ ...goodItem, portions: undefined }] },
  "portions"
);
rejects(
  "porciones vacías: un alimento siempre toca algún grupo del plan",
  { meal: "comida", items: [{ ...goodItem, portions: [] }] },
  "ningún grupo"
);
rejects("comida inválida", { ...goodResponse, meal: "merienda" }, "meal");
rejects("comida ausente", { items: [goodItem] }, "meal");
rejects("kcal negativas", { meal: "cena", items: [{ ...goodItem, kcalPerUnit: -70 }] }, "kcal");
rejects("proteína negativa", { meal: "cena", items: [{ ...goodItem, proteinPerUnit: -1 }] }, "protein");
rejects(
  "porciones negativas",
  { meal: "cena", items: [{ ...goodItem, portions: [{ cat: "poa", perUnit: -1 }] }] },
  "portions"
);
rejects("cantidad cero", { meal: "cena", items: [{ ...goodItem, qty: 0 }] }, "qty");
rejects("cantidad negativa", { meal: "cena", items: [{ ...goodItem, qty: -2 }] }, "qty");
rejects("NaN", { meal: "cena", items: [{ ...goodItem, kcalPerUnit: Number.NaN }] }, "NaN");
rejects("Infinity", { meal: "cena", items: [{ ...goodItem, fatPerUnit: Number.POSITIVE_INFINITY }] }, "Infinity");
rejects("kcal como texto", { meal: "cena", items: [{ ...goodItem, kcalPerUnit: "70" }] }, "tipo");
rejects("nombre vacío", { meal: "cena", items: [{ ...goodItem, name: "   " }] }, "name");
rejects("source inventado", { meal: "cena", items: [{ ...goodItem, source: "adivinado" }] }, "source");
rejects("items no es arreglo", { meal: "cena", items: {} }, "items");
rejects("respuesta nula", null, "objeto");
rejects("respuesta que es texto", "no soy un objeto", "objeto");
rejects(
  "demasiados alimentos",
  { meal: "cena", items: Array.from({ length: 21 }, () => goodItem) },
  "MAX_ITEMS"
);

check("totales colados como valor por gramo", () => {
  // 562 kcal "por gramo" es justo el bug que se quiere atrapar.
  const result = validateResult({
    meal: "comida",
    items: [{ ...goodItem, unit: "g", qty: 120, kcalPerUnit: 562.5 }],
  });
  assert(!result.ok, "debería rechazarse: ningún alimento pasa de 9 kcal/g");
  assert(/por unidad/.test(result.error), `el error debe señalar el problema: ${result.error}`);
});

/* ----------------------------------------------------- validateRequest */

check("petición válida", () => {
  const result = validateRequest({
    text: "2 huevos y una tortilla",
    memory: [],
    today: "2026-08-24",
    hour: 8,
  });
  assert(result.ok, `debería validar: ${result.ok ? "" : result.error}`);
  equal(result.value.hour, 8, "la hora se conserva");
});

check("petición sin memoria ni hora", () => {
  const result = validateRequest({ text: "una manzana", today: "2026-08-24" });
  assert(result.ok, `debería validar: ${result.ok ? "" : result.error}`);
  equal(result.value.memory, [], "memoria vacía por defecto");
});

check("memoria válida", () => {
  const result = validateRequest({
    text: "mi pan",
    today: "2026-08-24",
    memory: [
      {
        id: "pan-de-caja",
        name: "pan de caja",
        unit: "rebanada",
        kcalPerUnit: 80,
        proteinPerUnit: 3,
        fatPerUnit: 1,
        carbsPerUnit: 15,
        portions: { cereales: 1 },
      },
    ],
  });
  assert(result.ok, `debería validar: ${result.ok ? "" : result.error}`);
  equal(result.value.memory[0].id, "pan-de-caja", "el id se conserva");
});

function rejectsRequest(name: string, payload: unknown): void {
  check(name, () => {
    const result = validateRequest(payload);
    assert(!result.ok, "debería rechazarse");
  });
}

rejectsRequest("texto vacío", { text: "   ", today: "2026-08-24" });
rejectsRequest("sin texto", { today: "2026-08-24" });
rejectsRequest("fecha con formato malo", { text: "algo", today: "24/08/2026" });
rejectsRequest("sin fecha", { text: "algo" });
rejectsRequest("hora fuera de rango", { text: "algo", today: "2026-08-24", hour: 25 });
rejectsRequest("memoria con categoría inválida", {
  text: "algo",
  today: "2026-08-24",
  memory: [{ ...goodItem, portions: { postres: 1 } }],
});
rejectsRequest("texto larguísimo", { text: "a".repeat(2001), today: "2026-08-24" });

/* --------------------------------------------------------- extractJson */

check("Chat Completions con contenido JSON", () => {
  const raw = { choices: [{ message: { content: JSON.stringify(goodResponse) } }] };
  equal(extractJson(raw), goodResponse, "se desenvuelve choices[0].message.content");
});

check("Chat Completions con cerca de código", () => {
  const raw = {
    choices: [{ message: { content: "```json\n" + JSON.stringify(goodResponse) + "\n```" } }],
  };
  equal(extractJson(raw), goodResponse, "se quitan las cercas de markdown");
});

check("Chat Completions con prosa alrededor", () => {
  const raw = {
    choices: [{ message: { content: "Claro, aquí va:\n" + JSON.stringify(goodResponse) + "\nEspero sirva." } }],
  };
  equal(extractJson(raw), goodResponse, "se recorta la prosa");
});

check("JSON Mode de Workers AI", () => {
  equal(extractJson({ response: goodResponse }), goodResponse, "se desenvuelve response");
});

check("formato nativo de Gemini", () => {
  const raw = { candidates: [{ content: { parts: [{ text: JSON.stringify(goodResponse) }] } }] };
  equal(extractJson(raw), goodResponse, "se desenvuelve candidates");
});

check("respuesta vacía", () => {
  let threw = false;
  try {
    extractJson({ choices: [{ message: { content: "" } }] });
  } catch (error) {
    threw = error instanceof ModelError;
  }
  assert(threw, "una respuesta vacía debe lanzar ModelError");
});

check("texto que no es JSON", () => {
  let threw = false;
  try {
    parseLoose("lo siento, no puedo ayudarte con eso");
  } catch (error) {
    threw = error instanceof ModelError;
  }
  assert(threw, "texto libre debe lanzar ModelError");
});

/* ------------------------------- validación encadenada: modelo → cliente */

check("modelo devuelve categoría inválida dentro de choices", () => {
  const raw = {
    choices: [
      {
        message: {
          content: JSON.stringify({ meal: "comida", items: [{ ...goodItem, portions: [{ cat: "chatarra", perUnit: 1 }] }] }),
        },
      },
    ],
  };
  const result = validateResult(extractJson(raw));
  assert(!result.ok, "la validación atrapa la categoría inventada tras desenvolver");
});

/* ------------------------------------------------------------ resultado */

if (failures.length) {
  console.error(`\n${failures.length} prueba(s) fallaron:\n`);
  for (const failure of failures) console.error(`  ✗ ${failure}`);
  throw new Error(`${failures.length} de ${passed + failures.length} pruebas fallaron`);
}
// --- platillo compuesto: UN item que toca varios grupos ---
check("platillo compuesto conserva todos sus grupos", () => {
  const result = validateResult({
    meal: "cena",
    items: [
      {
        ...goodItem,
        name: "handroll de toro",
        unit: "pieza",
        qty: 4,
        kcalPerUnit: 190,
        portions: [
          { cat: "poa", perUnit: 0.75 },
          { cat: "cereales", perUnit: 0.5 },
          { cat: "grasas", perUnit: 0.2 },
        ],
      },
    ],
  });
  assert(result.ok, `debería validar: ${result.ok ? "" : result.error}`);
  const p = result.value.items[0].portions;
  equal(Object.keys(p).length, 3, "tres grupos en un solo item");
  equal(p.poa, 0.75, "poa");
  equal(p.cereales, 0.5, "cereales");
  equal(p.grasas, 0.2, "grasas");
});

check("un perUnit en 0 se descarta sin romper", () => {
  const result = validateResult({
    meal: "cena",
    items: [
      { ...goodItem, portions: [{ cat: "poa", perUnit: 1 }, { cat: "grasas", perUnit: 0 }] },
    ],
  });
  assert(result.ok, `debería validar: ${result.ok ? "" : result.error}`);
  equal(Object.keys(result.value.items[0].portions).length, 1, "solo el grupo que suma");
});

check("el mapa del cliente también se acepta", () => {
  const result = validateResult({
    meal: "cena",
    items: [{ ...goodItem, portions: { poa: 0.5, cereales: 1 } }],
  });
  assert(result.ok, `debería validar: ${result.ok ? "" : result.error}`);
  equal(result.value.items[0].portions.cereales, 1, "cereales desde el mapa");
});

console.log(`✓ ${passed} pruebas pasaron`);
