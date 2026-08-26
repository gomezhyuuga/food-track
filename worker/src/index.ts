// Worker "midieta-parse": interpreta texto libre y devuelve alimentos.
//
//   POST /parse
//   → { text, memory, today, hour? }
//   ← { meal, items, unknown? }
//
// Solo POST, nunca GET: el service worker de la PWA hace cache-first genérico
// para todo lo que no sea navegación y se quedaría con un GET cacheado para
// siempre.

import { runModel, ModelError } from "./model.ts";
import { validateRequest, validateResult } from "./validate.ts";

export interface Env {
  /** Binding de AI Gateway (wrangler: { "ai": { "binding": "AI" } }). */
  AI: { run(model: string, input: unknown, options?: unknown): Promise<unknown> };
  /** Id del gateway. Por defecto "midieta". */
  GATEWAY_ID?: string;
  /** Modelo. Por defecto "google/gemini-2.5-flash". */
  MODEL?: string;
  /** Orígenes extra permitidos, separados por coma (p. ej. previews). */
  EXTRA_ORIGINS?: string;
}

const PROD_ORIGIN = "https://diet.gomezh.dev";
/** localhost y 127.0.0.1 en cualquier puerto, para `npm run dev`. */
const LOCAL_ORIGIN = /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/;

function isAllowedOrigin(origin: string, env: Env, selfOrigin: string): boolean {
  // Mismo origen: la PWA y esta ruta viven en el mismo Worker, así que el
  // origen propio siempre vale. Cubre workers.dev, las Preview URLs por
  // versión y el dominio final sin tener que enumerarlos.
  if (origin === selfOrigin) return true;
  if (origin === PROD_ORIGIN) return true;
  if (LOCAL_ORIGIN.test(origin)) return true;
  const extra = (env.EXTRA_ORIGINS ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  return extra.includes(origin);
}

function corsHeaders(origin: string | null, env: Env, selfOrigin: string): Record<string, string> {
  const headers: Record<string, string> = {
    // La respuesta depende del origen: sin esto una caché intermedia podría
    // servirle a un origen la cabecera calculada para otro.
    Vary: "Origin",
    "Cache-Control": "no-store",
  };
  if (origin && isAllowedOrigin(origin, env, selfOrigin)) {
    headers["Access-Control-Allow-Origin"] = origin;
  }
  return headers;
}

function json(body: unknown, status: number, headers: Record<string, string>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...headers, "Content-Type": "application/json; charset=utf-8" },
  });
}

function error(message: string, status: number, headers: Record<string, string>): Response {
  return json({ error: message }, status, headers);
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const origin = request.headers.get("Origin");
    const selfOrigin = new URL(request.url).origin;
    const headers = corsHeaders(origin, env, selfOrigin);

    // Un navegador con origen no permitido: se corta aquí en vez de gastar
    // una llamada al modelo cuyo resultado el navegador va a descartar.
    if (origin && !isAllowedOrigin(origin, env, selfOrigin)) {
      return error("origen no permitido", 403, headers);
    }

    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: {
          ...headers,
          "Access-Control-Allow-Methods": "POST, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type",
          "Access-Control-Max-Age": "86400",
        },
      });
    }

    const { pathname } = new URL(request.url);
    if (pathname !== "/parse") {
      return error("ruta no encontrada; usa POST /parse", 404, headers);
    }

    if (request.method !== "POST") {
      return error("solo se acepta POST", 405, { ...headers, Allow: "POST, OPTIONS" });
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return error("el cuerpo no es JSON válido", 400, headers);
    }

    const parsedRequest = validateRequest(body);
    if (!parsedRequest.ok) return error(parsedRequest.error, 400, headers);

    let raw: unknown;
    try {
      raw = await runModel(env.AI, parsedRequest.value, {
        model: env.MODEL,
        gatewayId: env.GATEWAY_ID,
      });
    } catch (cause) {
      const status = cause instanceof ModelError ? cause.status : 502;
      const message = cause instanceof Error ? cause.message : "fallo al llamar al modelo";
      return error(message, status, headers);
    }

    // Nada llega al cliente sin validarse: una categoría inventada o un total
    // colado como valor por unidad se rechazan aquí.
    const result = validateResult(raw);
    if (!result.ok) {
      return error(`el modelo devolvió datos inválidos: ${result.error}`, 422, headers);
    }

    return json(result.value, 200, headers);
  },
};
