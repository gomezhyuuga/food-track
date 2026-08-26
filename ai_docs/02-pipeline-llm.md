# Pipeline del LLM

## Forma general

```
PWA  --POST /parse (mismo origen)-->  Worker  -->  AI Gateway  -->  Gemini
```

La PWA y el Worker son **el mismo Worker de Cloudflare**. `wrangler.jsonc` sirve
`dist/` como assets estáticos y manda solo `/parse` al código
(`run_worker_first: ["/parse"]`). Consecuencia: mismo origen, sin CORS que
negociar y sin variable de build con la URL del parser.

## Configuración vigente

| Pieza | Valor |
|---|---|
| Worker | `food-track` |
| URL | `https://food-track.gomezhyuuga.workers.dev` |
| Gateway | `midieta` |
| Modelo | `google/gemini-2.5-flash` |
| Facturación | Unified Billing (créditos prepagados de Cloudflare) |
| Spend limit | 20 USD / 30 días, ventana deslizante |
| Caché del gateway | 300 s, solo peticiones idénticas |

El proveedor aparece en los logs como `google-vertex-ai`.

Con Unified Billing **no hay llaves de proveedor**: Cloudflare pone las
credenciales y descuenta de los créditos. Cambiar de modelo es cambiar el string
en `MODEL` (`wrangler.jsonc`) o en `DEFAULT_MODEL` (`worker/src/model.ts`).

## El contrato

```
POST /parse
→ { text, today, memory?, hour? }
← { meal, items[], unknown? }
```

- `memory`: alimentos que el cliente ya conoce, para que el modelo reutilice esos
  valores en vez de reestimarlos. Máximo 40.
- `hour`: hora local. Sin ella el modelo no puede deducir la comida de un texto
  que no la menciona ("me comí un plátano").
- `unknown`: fragmento que no se pudo interpretar. Existe para que la app nunca
  invente comida.

Errores: `400` petición inválida, `403` origen no permitido, `404` ruta, `405`
método, `422` el modelo devolvió datos que no pasaron validación, `502` el modelo
falló.

## `response_format`: la trampa que ya mordió

**Verificado contra el gateway real el 2026-08-25**, con el esquema de verdad:

| Forma | Resultado |
|---|---|
| `{ type: "json_schema", json_schema: SCHEMA }` | **7003 User Input Error** |
| `{ type: "json_schema", json_schema: { name, strict, schema } }` | 200 |
| `{ type: "json_object" }` | 200 |

El gateway traduce a la API de OpenAI para modelos de terceros, así que espera la
**envoltura** `{ name, strict, schema }`. Mandar el esquema pelado, que es lo que
documenta Workers AI para *sus propios* modelos, falla.

`strict: true` funciona pese a que el esquema tiene campos opcionales
(`assumedQty`, `unknown`). También se probó.

Hay un reintento con `json_object` si el gateway rechaza el cuerpo.
`looksLikeBadRequest()` debe reconocer `7003` y `user input error`: sin esos
patrones el reintento no se dispara y un fallo de formato se convierte
directamente en 502. Eso ya pasó.

## Robustez de la respuesta

`extractJson()` en `worker/src/model.ts` desenvuelve cuatro formas posibles:
Chat Completions (`choices[0].message`), JSON Mode de Workers AI (`{ response }`),
nativo de Gemini (`candidates[0].content.parts`), y ya desenvuelto.

`parseLoose()` tolera cercas de markdown y prosa alrededor del objeto.

`worker/src/validate.ts` valida estrictamente antes de devolver: categorías
válidas, números finitos y no negativos, `meal` dentro de los 5 ids, límites de
tamaño. Si algo no valida, responde error, no basura.

## Camino local antes que red

`src/parse.ts` busca en la memoria (`foods`) por slug **antes** de llamar al
Worker. Lo que el usuario ya enseñó no se reestima.

Los atajos de repetición (`repeatShortcuts`) reconstruyen registros del historial
sin red y sin LLM. Es lo que evita que el feature nuevo haga el registro diario
más lento que los `+`/`-`.

## Latencia observada

| Caso | Tiempo |
|---|---|
| "dos huevos revueltos con un pan de caja" | ~5.5 s |
| "4 handrolls de toro, 1 de salmón, 1 de bay scallop" | ~12 s |

Gemini 2.5 Flash trae *thinking* activo. Si se siente lento, limitarlo en el
prompt es la palanca.

## Dos reglas del prompt que costaron iteraciones

**Un platillo es UN item.** La primera versión pedía descomponer en
ingredientes: un pedido de sushi devolvía seis entradas (pescado + arroz por
cada pieza). Ahora devuelve una por platillo, con `portions` repartido entre
grupos. En el esquema del modelo `portions` viaja como ARRAY de pares
`{cat, perUnit}`, no como objeto: `strict: true` exige que todas las
propiedades estén en `required`, y un objeto de 8 categorías opcionales no
cumple. La validación convierte a mapa en la frontera y acepta ambas formas.

**`aproximado` cubre más que la cantidad.** La regla original decía
"aproximado cuando la cantidad no venía en el texto". El modelo la cumplía al
pie de la letra: en "4 handrolls de toro" la cantidad SÍ venía, así que ponía
`estimado` — pero se inventaba el tamaño y la receta de cada pieza. Ahora
`aproximado` cubre también los platillos preparados cuyo tamaño varía, y
`assumedQty` quedó desacoplado de `source`:

- `assumedQty` → "no dijiste cuántas unidades"
- `source: aproximado` → "estos números descansan en suposiciones mías"

Un handroll es lo segundo sin ser lo primero.

## Ajuste pendiente

**Reducir latencia** limitando el presupuesto de razonamiento. Gemini 2.5 Flash
tarda 5-12 s según lo compuesto que sea el plato.

## Pruebas

`npm run test:worker` corre 70 pruebas sin dependencias (`node test/*.test.ts`).
Cubren validación, CORS, métodos, formas de respuesta y que el modelo **no se
llame** si la petición no valida.

No cubren la llamada real al modelo: el binding de AI solo existe en remoto.
`wrangler dev` sí llega al modelo real y consume créditos.
