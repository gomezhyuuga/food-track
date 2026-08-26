// Pruebas del handler HTTP con el binding de AI simulado.
//
// `wrangler dev` no sirve para esto: el binding de AI solo existe en remoto y
// exige autenticarse con Cloudflare. Aquí se invoca `worker.fetch()` directo
// con un `env.AI` falso, así que se ejercita CORS, el guardia de método, la
// validación de la petición y el camino completo modelo → validación.
//
//   node test/http.test.ts

import worker, { type Env } from "../src/index.ts";

let passed = 0;
const failures: string[] = [];

async function check(name: string, run: () => Promise<void>): Promise<void> {
  try {
    await run();
    passed++;
  } catch (error) {
    failures.push(`${name}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function equal(actual: unknown, expected: unknown, message: string): void {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`${message} (esperado ${JSON.stringify(expected)}, obtenido ${JSON.stringify(actual)})`);
  }
}

/* ------------------------------------------------------------- utilidades */

const PROD = "https://diet.gomezh.dev";

/** Env con un modelo que siempre devuelve `reply`, en formato Chat Completions. */
function envWith(reply: unknown, onCall?: (model: string, input: unknown, options: unknown) => void): Env {
  return {
    AI: {
      run(model: string, input: unknown, options?: unknown) {
        onCall?.(model, input, options);
        if (reply instanceof Error) return Promise.reject(reply);
        return Promise.resolve({ choices: [{ message: { content: JSON.stringify(reply) } }] });
      },
    },
  };
}

function post(body: unknown, origin: string | null = PROD): Request {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (origin) headers.Origin = origin;
  return new Request("https://parse.example.com/parse", {
    method: "POST",
    headers,
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

const goodBody = { text: "2 huevos", memory: [], today: "2026-08-24", hour: 8 };

const goodReply = {
  meal: "desayuno",
  items: [
    {
      name: "huevo",
      unit: "pieza",
      qty: 2,
      kcalPerUnit: 70,
      proteinPerUnit: 6.3,
      fatPerUnit: 4.8,
      carbsPerUnit: 0.4,
      portions: [{ cat: "poa", perUnit: 1 }],
      source: "estimado",
    },
  ],
};

async function body(response: Response): Promise<Record<string, unknown>> {
  return (await response.json()) as Record<string, unknown>;
}

/* ------------------------------------------------------------------ CORS */

await check("preflight desde producción", async () => {
  const request = new Request("https://parse.example.com/parse", {
    method: "OPTIONS",
    headers: { Origin: PROD, "Access-Control-Request-Method": "POST" },
  });
  const response = await worker.fetch(request, envWith(goodReply));
  equal(response.status, 204, "el preflight responde 204");
  equal(response.headers.get("Access-Control-Allow-Origin"), PROD, "eco del origen");
  assert(response.headers.get("Access-Control-Allow-Methods")?.includes("POST"), "permite POST");
  equal(response.headers.get("Vary"), "Origin", "Vary: Origin");
});

await check("preflight desde localhost con puerto", async () => {
  const request = new Request("https://parse.example.com/parse", {
    method: "OPTIONS",
    headers: { Origin: "http://localhost:5173" },
  });
  const response = await worker.fetch(request, envWith(goodReply));
  equal(response.status, 204, "204");
  equal(
    response.headers.get("Access-Control-Allow-Origin"),
    "http://localhost:5173",
    "localhost permitido en cualquier puerto"
  );
});

await check("origen ajeno rechazado", async () => {
  const response = await worker.fetch(post(goodBody, "https://evil.example"), envWith(goodReply));
  equal(response.status, 403, "403 para un origen no permitido");
  assert(!response.headers.get("Access-Control-Allow-Origin"), "sin cabecera CORS");
});

await check("origen extra por variable de entorno", async () => {
  const env = { ...envWith(goodReply), EXTRA_ORIGINS: "https://preview.pages.dev" };
  const response = await worker.fetch(post(goodBody, "https://preview.pages.dev"), env);
  equal(response.status, 200, "el origen extra pasa");
});

await check("sin Origin (curl) funciona", async () => {
  const response = await worker.fetch(post(goodBody, null), envWith(goodReply));
  equal(response.status, 200, "sin navegador no hay CORS que aplicar");
});

/* ------------------------------------------------------- método y ruta */

await check("GET rechazado", async () => {
  const request = new Request("https://parse.example.com/parse", {
    method: "GET",
    headers: { Origin: PROD },
  });
  const response = await worker.fetch(request, envWith(goodReply));
  equal(response.status, 405, "405: el service worker cachearía un GET para siempre");
  assert(response.headers.get("Allow")?.includes("POST"), "anuncia POST en Allow");
});

await check("ruta desconocida", async () => {
  const request = new Request("https://parse.example.com/otra", {
    method: "POST",
    headers: { Origin: PROD, "Content-Type": "application/json" },
    body: JSON.stringify(goodBody),
  });
  const response = await worker.fetch(request, envWith(goodReply));
  equal(response.status, 404, "404 fuera de /parse");
});

await check("respuestas sin caché", async () => {
  const response = await worker.fetch(post(goodBody), envWith(goodReply));
  equal(response.headers.get("Cache-Control"), "no-store", "no-store siempre");
});

/* --------------------------------------------------- validación de entrada */

await check("cuerpo que no es JSON", async () => {
  const response = await worker.fetch(post("{no json"), envWith(goodReply));
  equal(response.status, 400, "400");
});

await check("texto vacío", async () => {
  const response = await worker.fetch(post({ ...goodBody, text: "  " }), envWith(goodReply));
  equal(response.status, 400, "400");
});

await check("fecha inválida", async () => {
  const response = await worker.fetch(post({ ...goodBody, today: "ayer" }), envWith(goodReply));
  equal(response.status, 400, "400");
});

await check("el modelo no se llama si la petición no valida", async () => {
  let called = false;
  const env = envWith(goodReply, () => {
    called = true;
  });
  await worker.fetch(post({ text: "algo" }), env);
  assert(!called, "no se gasta una llamada al modelo con una petición inválida");
});

/* ----------------------------------------------- respuestas simuladas del modelo */

await check("respuesta bien formada", async () => {
  const response = await worker.fetch(post(goodBody), envWith(goodReply));
  equal(response.status, 200, "200");
  const payload = await body(response);
  equal(payload.meal, "desayuno", "comida");
  equal((payload.items as unknown[]).length, 1, "un alimento");
});

await check("respuesta con unknown", async () => {
  const reply = { ...goodReply, unknown: "y algo que no supe qué era" };
  const response = await worker.fetch(post(goodBody), envWith(reply));
  equal(response.status, 200, "200");
  equal((await body(response)).unknown, "y algo que no supe qué era", "unknown se propaga");
});

await check("solo unknown, sin alimentos", async () => {
  const reply = { meal: "comida", items: [], unknown: "un vaso de agua" };
  const response = await worker.fetch(post(goodBody), envWith(reply));
  equal(response.status, 200, "200: no entender no es un error del servidor");
  equal((await body(response)).items, [], "sin alimentos inventados");
});

await check("categoría inválida", async () => {
  const reply = { meal: "comida", items: [{ ...goodReply.items[0], portions: [{ cat: "postres", perUnit: 1 }] }] };
  const response = await worker.fetch(post(goodBody), envWith(reply));
  equal(response.status, 422, "422");
  assert(String((await body(response)).error).includes("cat"), "el error señala la categoría");
});

await check("números negativos", async () => {
  const reply = { meal: "comida", items: [{ ...goodReply.items[0], kcalPerUnit: -70 }] };
  const response = await worker.fetch(post(goodBody), envWith(reply));
  equal(response.status, 422, "422");
  assert(String((await body(response)).error).includes("negativo"), "el error dice que es negativo");
});

await check("comida inválida", async () => {
  const response = await worker.fetch(post(goodBody), envWith({ ...goodReply, meal: "brunch" }));
  equal(response.status, 422, "422");
});

await check("el modelo devuelve prosa en vez de JSON", async () => {
  const env: Env = {
    AI: {
      run: () =>
        Promise.resolve({ choices: [{ message: { content: "Perdón, no puedo ayudarte." } }] }),
    },
  };
  const response = await worker.fetch(post(goodBody), env);
  equal(response.status, 502, "502: el fallo es del modelo, no del cliente");
});

await check("el modelo falla", async () => {
  const response = await worker.fetch(post(goodBody), envWith(new Error("boom")));
  equal(response.status, 502, "502");
});

await check("reintento sin esquema cuando el gateway rechaza response_format", async () => {
  const seen: unknown[] = [];
  let call = 0;
  const env: Env = {
    AI: {
      run(_model: string, input: unknown) {
        call++;
        seen.push((input as { response_format?: unknown }).response_format);
        if (call === 1) return Promise.reject(new Error("400 invalid response_format"));
        return Promise.resolve({ choices: [{ message: { content: JSON.stringify(goodReply) } }] });
      },
    },
  };
  const response = await worker.fetch(post(goodBody), env);
  equal(response.status, 200, "el reintento salva la petición");
  equal(call, 2, "exactamente un reintento");
  equal((seen[1] as { type: string }).type, "json_object", "el reintento va sin esquema");
});

/* --------------------------------------------- lo que se le manda al modelo */

await check("se usan el modelo y el gateway configurados", async () => {
  let seenModel = "";
  let seenGateway: unknown;
  const env = {
    ...envWith(goodReply, (model, _input, options) => {
      seenModel = model;
      seenGateway = (options as { gateway?: { id?: string } }).gateway?.id;
    }),
    MODEL: "anthropic/claude-sonnet-4-5",
    GATEWAY_ID: "otro",
  };
  await worker.fetch(post(goodBody), env);
  equal(seenModel, "anthropic/claude-sonnet-4-5", "modelo de la variable de entorno");
  equal(seenGateway, "otro", "gateway de la variable de entorno");
});

await check("el prompt lleva la memoria y la lista CLIDDI", async () => {
  let system = "";
  let user = "";
  const env = envWith(goodReply, (_model, input) => {
    const messages = (input as { messages: { role: string; content: string }[] }).messages;
    system = messages[0].content;
    user = messages[1].content;
  });
  await worker.fetch(
    post({
      text: "mi pan de siempre",
      today: "2026-08-24",
      hour: 20,
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
    }),
    env
  );
  assert(system.includes("pan de caja"), "la memoria del usuario va en el prompt");
  assert(system.includes("Tortilla de maíz"), "la lista de equivalentes va en el prompt");
  assert(system.includes("NUNCA INVENTES COMIDA"), "la regla de no inventar va en el prompt");
  assert(system.includes("POR UNIDAD"), "la regla de valores por unidad va en el prompt");
  assert(user.includes("2026-08-24"), "la fecha va en el mensaje del usuario");
  assert(user.includes("20:00"), "la hora va en el mensaje del usuario");
});

/* ------------------------------------------------------------ resultado */

if (failures.length) {
  console.error(`\n${failures.length} prueba(s) fallaron:\n`);
  for (const failure of failures) console.error(`  ✗ ${failure}`);
  throw new Error(`${failures.length} de ${passed + failures.length} pruebas fallaron`);
}
console.log(`✓ ${passed} pruebas pasaron`);
