# Despliegue y entornos

## Un solo Worker

`wrangler.jsonc` en la raíz:

```jsonc
{
  "name": "food-track",
  "main": "./worker/src/index.ts",
  "assets": {
    "directory": "./dist/",
    "binding": "ASSETS",
    "not_found_handling": "single-page-application",
    "run_worker_first": ["/parse"]
  },
  "ai": { "binding": "AI" },
  "workers_dev": true
}
```

Enrutado resultante, verificado:

| Petición | Resultado |
|---|---|
| `GET /` | la app |
| `GET /parse` | 405 del Worker, **no** el index.html |
| `POST /parse` inválido | 400 en validación, sin llamar al modelo |
| `GET /ruta-inventada` | 200, fallback del SPA |

## Migración del dominio: por etapas, a propósito

**Mientras `wrangler.jsonc` no declare `routes`, el despliegue publica solo en
`workers.dev` y no toca `diet.gomezh.dev`.**

Hoy producción sigue en GitHub Pages. Eso es deliberado: permite probar con datos
de prueba sin arriesgar los reales.

**Por qué el dominio no es opcional.** IndexedDB se aísla por **origen**. Los
datos reales del usuario viven atados a `https://diet.gomezh.dev`. Conservando
ese dominio, el origen no cambia al mover el hosting y la base reaparece intacta.
Arrancar en `workers.dev` como app definitiva dejaría el historial huérfano
(recuperable solo volviendo a ese dominio).

Para completar la migración:

1. Borrar el registro CNAME de `diet.gomezh.dev` que apunta a GitHub Pages.
   Workers no permite crear un Custom Domain sobre un hostname con CNAME
   existente.
2. Añadir a `wrangler.jsonc`:
   ```jsonc
   "routes": [{ "pattern": "diet.gomezh.dev", "custom_domain": true }]
   ```
3. `npm run deploy`.

Requisito: los nameservers del dominio deben estar en Cloudflare. Workers no
admite dominios gestionados fuera.

## Workflows

| Archivo | Disparador | Qué hace |
|---|---|---|
| `deploy.yml` | push a `main` | `test:worker`, build, `wrangler deploy` |
| `preview.yml` | push a otra rama | `test:worker`, build, `wrangler versions upload` |

`versions upload` sube una versión **sin promoverla**: aunque corriera sobre
`main`, no reemplazaría lo que sirve producción.

Ambos tienen un job `gate` que comprueba los secrets y **se salta en verde** si
faltan, en vez de fallar en rojo.

Secrets necesarios: `CLOUDFLARE_API_TOKEN` y `CLOUDFLARE_ACCOUNT_ID`. El token
necesita **Account → Workers Scripts → Edit** (el permiso de Pages ya no sirve).

Cada Preview URL es un origen distinto, así que su IndexedDB va aparte de la de
producción. `*.workers.dev` está en la Public Suffix List, así que los previews
tampoco comparten almacenamiento entre sí.

## Probar en local

### Como producción, sin desplegar

```bash
npm run preview     # build + wrangler dev, en :8787
```

Sirve la app **y** `/parse` juntos. Es el flujo recomendado: no necesita
`.env.local`, así que evita el riesgo de la sección siguiente.

Advertencia: `/parse` en local **llama al modelo real** y consume créditos. El
binding de AI solo existe en remoto, no hay modo offline.

### Con hot reload

Dos terminales:

```bash
npx wrangler dev --port 8787    # solo el Worker
npm run dev                     # Vite con hot reload
```

Y `.env.local`:

```
VITE_PARSE_URL=http://localhost:8787
```

El Worker acepta `localhost` en cualquier puerto, así que el CORS pasa. Aunque
escribas solo el origen sin `/parse`, `resolveParseUrl()` lo normaliza.

### Sin gastar créditos

```js
localStorage["midieta:mock"] = "1"   // o "unknown" | "offline" | "error"
```

## La guardia de `.env.local`

`VITE_PARSE_URL` se incrusta en el bundle en tiempo de build. Si apunta a
localhost y construyes para desplegar, producción llamaría a una máquina que no
existe, y el error solo aparecería en el navegador del usuario.

`vite.config.ts` **falla el build** en ese caso:

```
VITE_PARSE_URL apunta a localhost (http://localhost:8787).
Borra .env.local antes de construir para desplegar.
```

## Service worker

`public/sw.js` cachea el shell de la app. Al cambiar assets hay que subir el
número de `CACHE` (va en `v3`).

La llamada a `/parse` va por **POST a propósito**: la estrategia del service
worker es cache-first para todo lo que no sea navegación, así que un GET quedaría
cacheado en el dispositivo para siempre. Los POST hacen early return
(`if (request.method !== "GET") return;`).

## Verificación antes de subir

```bash
npm run build          # incluye tsc -b
npm run test:worker    # 70 pruebas
npx tsc -p worker/tsconfig.json
npm run dev            # OBLIGATORIO si tocaste RxDB
```

El build **no** ejercita el dev-mode de RxDB, que aplica chequeos que producción
no hace. Ver [05-trampas.md](05-trampas.md).
