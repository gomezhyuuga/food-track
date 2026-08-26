// Llamada al modelo a través del binding de AI Gateway.
//
// Se usa la variante *Chat Completions* (`messages` + `response_format`) y no
// el formato nativo de Gemini (`contents` / `generationConfig`) porque es la
// portable: cambiar MODEL a "anthropic/…" u "openai/…" no toca nada más.

import { systemPrompt, userPrompt } from "./prompt.ts";
import { PARSE_SCHEMA, type ParseRequest } from "./schema.ts";

/** Modelo por defecto. Se puede sobreescribir con la var `MODEL` en wrangler. */
export const DEFAULT_MODEL = "google/gemini-2.5-flash";
/** Gateway por defecto. Se puede sobreescribir con la var `GATEWAY_ID`. */
export const DEFAULT_GATEWAY = "midieta";

export class ModelError extends Error {
  readonly status: number;
  constructor(message: string, status = 502) {
    super(message);
    this.name = "ModelError";
    this.status = status;
  }
}

/**
 * Forma de `response_format`.
 *
 * VERIFICADO contra el gateway real (2026-08-25) con el esquema de verdad:
 *
 *   { type: "json_schema", json_schema: SCHEMA }              → 7003 User Input Error
 *   { type: "json_schema", json_schema: {name,strict,schema} } → 200 ✅
 *   { type: "json_object" }                                    → 200 ✅
 *
 * El gateway traduce a la API de OpenAI para los modelos de terceros, así que
 * espera la envoltura `{ name, strict, schema }`. Mandar el esquema pelado
 * —que es lo que documenta Workers AI para sus propios modelos— falla.
 *
 * `strict: true` funciona pese a que el esquema tiene campos opcionales
 * (`assumedQty`, `unknown`); también se probó y pasó.
 */
const JSON_SCHEMA_FORMAT = {
  type: "json_schema",
  json_schema: { name: "registro", strict: true, schema: PARSE_SCHEMA },
};
const JSON_OBJECT_FORMAT = { type: "json_object" };

interface AiRunner {
  run(model: string, input: unknown, options?: unknown): Promise<unknown>;
}

export interface ModelOptions {
  model?: string;
  gatewayId?: string;
}

/** Extrae el objeto JSON de la respuesta, sea cual sea la envoltura. */
export function extractJson(response: unknown): unknown {
  if (response == null) throw new ModelError("el modelo no devolvió nada");

  // Chat Completions (lo esperado con `messages`).
  const choices = (response as { choices?: unknown }).choices;
  if (Array.isArray(choices) && choices.length) {
    const message = (choices[0] as { message?: Record<string, unknown> }).message;
    if (message) {
      if (message.parsed && typeof message.parsed === "object") return message.parsed;
      if (typeof message.content === "string") return parseLoose(message.content);
      // Algunos proveedores parten el contenido en bloques.
      if (Array.isArray(message.content)) {
        const joined = message.content
          .map((part) => (typeof part === "string" ? part : ((part as { text?: string }).text ?? "")))
          .join("");
        return parseLoose(joined);
      }
    }
  }

  // JSON Mode de Workers AI: { response: {...} }.
  const wrapped = (response as { response?: unknown }).response;
  if (wrapped !== undefined) {
    return typeof wrapped === "string" ? parseLoose(wrapped) : wrapped;
  }

  // Formato nativo de Gemini, por si el gateway lo deja pasar tal cual.
  const candidates = (response as { candidates?: unknown }).candidates;
  if (Array.isArray(candidates) && candidates.length) {
    const parts = (candidates[0] as { content?: { parts?: { text?: string }[] } }).content?.parts;
    if (Array.isArray(parts)) return parseLoose(parts.map((p) => p.text ?? "").join(""));
  }

  if (typeof response === "string") return parseLoose(response);

  // Ya viene desenvuelto.
  if (typeof response === "object" && "items" in (response as object)) return response;

  throw new ModelError("no se reconoció la forma de la respuesta del modelo");
}

/** JSON.parse tolerante: quita cercas de código y prosa alrededor del objeto. */
export function parseLoose(raw: string): unknown {
  const trimmed = raw.trim();
  if (!trimmed) throw new ModelError("el modelo devolvió una respuesta vacía");

  const withoutFence = trimmed
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "")
    .trim();

  try {
    return JSON.parse(withoutFence);
  } catch {
    // Última oportunidad: quedarse con lo que hay entre la primera "{" y la
    // última "}". Cubre el caso de un modelo que añade una frase antes.
    const start = withoutFence.indexOf("{");
    const end = withoutFence.lastIndexOf("}");
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(withoutFence.slice(start, end + 1));
      } catch {
        /* cae al error de abajo */
      }
    }
    throw new ModelError("el modelo no devolvió JSON válido");
  }
}

/**
 * ¿El gateway rechazó el cuerpo?
 *
 * Incluye `7003 User Input Error`, que es como el binding reporta un cuerpo mal
 * formado. Sin ese patrón el reintento no se disparaba y un fallo de formato se
 * convertía directamente en 502 — que es exactamente lo que pasó la primera vez.
 */
function looksLikeBadRequest(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /\b(400|422|7003)\b|invalid|unsupported|unrecognized|response_format|user input error/i.test(
    message
  );
}

export async function runModel(
  ai: AiRunner,
  request: ParseRequest,
  options: ModelOptions = {}
): Promise<unknown> {
  const model = options.model ?? DEFAULT_MODEL;
  const gateway = { id: options.gatewayId ?? DEFAULT_GATEWAY };
  const messages = [
    { role: "system", content: systemPrompt(request.memory) },
    { role: "user", content: userPrompt(request) },
  ];

  const call = (responseFormat: unknown) =>
    ai.run(model, { messages, temperature: 0, response_format: responseFormat }, { gateway });

  let raw: unknown;
  try {
    raw = await call(JSON_SCHEMA_FORMAT);
  } catch (error) {
    if (!looksLikeBadRequest(error)) {
      throw new ModelError(`el modelo falló: ${error instanceof Error ? error.message : String(error)}`);
    }
    // Reintento único con el modo JSON sin esquema.
    try {
      raw = await call(JSON_OBJECT_FORMAT);
    } catch (retryError) {
      throw new ModelError(
        `el modelo falló: ${retryError instanceof Error ? retryError.message : String(retryError)}`
      );
    }
  }

  return extractJson(raw);
}
