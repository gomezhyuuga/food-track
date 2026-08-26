# midieta-parse

Cloudflare Worker que interpreta texto libre ("2 huevos y una tortilla") y lo
convierte en alimentos con sus macros y sus porciones CLIDDI. Es la única pieza
de "Mi Dieta" que no vive en el dispositivo, y no guarda nada.

**Vive dentro del mismo Worker que sirve la PWA.** La configuración está en el
`wrangler.jsonc` de la raíz: `dist/` se sirve como assets estáticos y solo
`/parse` entra a este código (`run_worker_first`). Por eso la app lo llama con
una ruta relativa, sin CORS que negociar ni URL que configurar.

## Endpoint

```
POST /parse
Content-Type: application/json

→ {
    "text":   "2 huevos y una tortilla",   // obligatorio, máx. 2000 caracteres
    "today":  "2026-08-24",                 // obligatorio, YYYY-MM-DD
    "memory": [ /* FoodMemoryLite[] */ ],   // opcional, máx. 40
    "hour":   8                             // opcional, 0-23, hora local
  }

← 200 {
    "meal":  "desayuno",
    "items": [ /* ParsedItem[] */ ],
    "unknown": "…"                          // solo si algo no se entendió
  }
```

Errores: `400` petición inválida, `403` origen no permitido, `404` ruta,
`405` método, `422` el modelo devolvió datos que no pasaron la validación,
`502` el modelo falló.

**Solo POST, nunca GET.** El service worker de la PWA (`public/sw.js`) hace
cache-first para todo lo que no sea navegación, así que un GET a `/parse`
quedaría cacheado en el dispositivo para siempre. Los POST ni siquiera entran
al service worker (`if (request.method !== "GET") return;`).

`hour` es un añadido sobre el contrato mínimo: sin ella el modelo no puede
deducir la comida de un texto que no la menciona ("me comí un plátano") y
tendría que adivinar. Es opcional; si no viene, el modelo usa lo que diga el
texto y, en última instancia, `"comida"`.

## Cómo funciona

1. `validate.ts` valida la petición. Si no pasa, **no se llama al modelo**.
2. `prompt.ts` arma el prompt del sistema con la tabla CLIDDI completa
   (`cliddi.ts`) y la memoria del usuario que mandó el cliente.
3. `model.ts` llama a `env.AI.run()` a través del gateway.
4. `validate.ts` valida la respuesta. Nada llega al cliente sin pasar por ahí.

### Por qué Chat Completions y no el formato nativo de Gemini

`google/gemini-2.5-flash` acepta dos esquemas: el nativo (`contents` /
`generationConfig`) y Chat Completions (`messages` / `response_format`). Se usa
el segundo porque es el portable: cambiar `MODEL` a `anthropic/…` u `openai/…`
no toca nada más del código.

### Nunca inventar comida

Es un requisito de producto, no un detalle. El prompt lo pide explícitamente y
la validación lo respalda: si el modelo devuelve algo que no cuadra, el Worker
responde error en vez de dejar pasar datos plausibles pero falsos. Lo que el
modelo no entienda se devuelve textual en `unknown`.

La validación incluye una trampa específica para el error caro: si la unidad es
gramo o mililitro y `kcalPerUnit` pasa de 9.5, se rechaza — ningún alimento
tiene más de ~9 kcal/g, así que ese número solo puede ser el total colado como
valor por unidad.

## Desarrollo

```sh
npm install
npm run typecheck   # tsc --noEmit
npm test            # validación + handler HTTP, sin red ni modelo
```

Las pruebas invocan `worker.fetch()` directo con un `env.AI` simulado. **Eso es
a propósito**: `wrangler dev` no sirve para probar este Worker porque el binding
de AI solo existe en remoto y exige `CLOUDFLARE_API_TOKEN` aunque no se llame al
modelo. `npx wrangler deploy --dry-run` sí funciona sin credenciales y verifica
que el bundle compila y que los bindings están bien declarados.

## Despliegue

Desde la **raíz** del repo, no desde aquí:

```sh
npx wrangler login          # o export CLOUDFLARE_API_TOKEN=…
npm run deploy              # build + wrangler deploy
```

Para levantar app y `/parse` juntos en local, como en producción:

```sh
npm run preview             # build + wrangler dev
```

El `wrangler.jsonc` de la raíz declara el binding `AI` y tres variables:

| Variable        | Por defecto                | Para qué                                    |
| --------------- | -------------------------- | ------------------------------------------- |
| `GATEWAY_ID`    | `midieta`                  | Gateway de AI Gateway al que se enruta      |
| `MODEL`         | `google/gemini-2.5-flash`  | Modelo; formato `{autor}/{modelo}`          |
| `EXTRA_ORIGINS` | *(vacío)*                  | Orígenes CORS extra, separados por coma     |

El **origen propio siempre está permitido**, así que `workers.dev`, las Preview
URLs por versión y el dominio final funcionan sin listarlos. `EXTRA_ORIGINS`
solo hace falta para llamar al Worker desde otro origen distinto.

Las pruebas corren desde la raíz con `npm run test:worker` (70 pruebas, sin
dependencias).

## Lo que falta del lado del usuario

Verificado hasta donde se puede sin saldo: con `npm run preview` la ruta
responde, valida y llega hasta AI Gateway. La llamada real devuelve
`2021: Insufficient AI Gateway credits`, o sea que **toda la tubería está
conectada y solo faltan créditos**.

1. **Crear el gateway `midieta`** en el dashboard de Cloudflare
   (AI → AI Gateway → Create Gateway), con un *spend limit* mensual. Si
   prefieres otro nombre, cambia `GATEWAY_ID` en el `wrangler.jsonc` de la raíz.
2. **Cargar créditos de Unified Billing** (AI Gateway → Billing). Los modelos de
   terceros como Gemini solo funcionan con saldo prepagado.
3. **Desplegar**: `npm run deploy` desde la raíz. Anota la URL de `workers.dev`.
4. **Probar ahí** con datos de prueba. Es otro origen, así que su IndexedDB
   arranca vacía y no toca los datos reales.
5. **Mover el dominio** cuando estés conforme: borrar el CNAME de
   `diet.gomezh.dev` que apunta a GitHub Pages y añadir en el `wrangler.jsonc`
   de la raíz:

   ```jsonc
   "routes": [{ "pattern": "diet.gomezh.dev", "custom_domain": true }]
   ```

   El origen no cambia, así que **la IndexedDB de producción reaparece
   intacta**. Workers exige que los nameservers del dominio estén en Cloudflare
   y que no exista ya un CNAME para ese hostname.

## Punto sin verificar

La forma exacta de `response_format` no se pudo confirmar contra el gateway
real. La documentación vigente de Workers AI (JSON Mode, abr. 2026) pone el
esquema directamente bajo `json_schema`; la API de OpenAI —a la que el gateway
traduce para los modelos de terceros— lo envuelve en `{ name, strict, schema }`;
y un changelog de Cloudflare de 2025 usa una tercera forma (`schema` a secas).

`model.ts` manda la forma documentada por Cloudflare y, si el gateway la rechaza
con un 4xx, **reintenta una vez con `{ type: "json_object" }`**, que todas
aceptan. El prompt ya exige JSON puro y `extractJson` tolera cercas de código y
prosa alrededor, así que la respuesta se parsea igual sin esquema. Si en la
primera prueba real ves dos llamadas por petición en los logs del gateway, es
esta ruta: ajusta `JSON_SCHEMA_FORMAT` en `model.ts` a la forma que sí aceptó.

## Mantenimiento

`src/cliddi.ts` es una **copia** de `src/data/plan.ts` y `src/data/equivalents.ts`
de la PWA, y `src/foods.ts` es copia de `src/foods.ts`. Están duplicados porque
el Worker se despliega aparte y no puede importar de la app. Si la nutrióloga
cambia el plan, hay que editar los dos lados. Si `normalizeFoodId` deja de ser
idéntica, la memoria del usuario deja de acertar.
