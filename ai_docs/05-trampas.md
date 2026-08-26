# Trampas

Errores reales de este repo, con su síntoma, su causa y cómo detectarlos. Leer
esto antes de depurar.

---

## 1. `.env.local` invisible que rompe `/parse`

**Síntoma.** La app hace POST a `/` en vez de `/parse`, recibe el `index.html` y
falla con "La dirección del intérprete no es correcta".

**Causa.** Un `.env.local` con `VITE_PARSE_URL=https://food-track...workers.dev`
(sin `/parse`). Vite lo incrusta en tiempo de build y, como el valor es truthy,
**elimina el fallback relativo como código muerto**. El bundle desplegado no
tiene ni una mención a `/parse`.

**Por qué es insidioso.** `.env.local` está en `.gitignore`, así que nunca
aparece en `git status` ni en una revisión de código.

**Cómo detectarlo.**
```bash
grep -c '"/parse"' dist/assets/*.js          # debe ser 1
grep -o 'https://[^"]*workers\.dev' dist/assets/*.js   # debe estar vacío
```

**Mitigaciones ya en el repo.** `resolveParseUrl()` normaliza una URL sin ruta, y
`vite.config.ts` falla el build si `VITE_PARSE_URL` apunta a localhost.

---

## 2. `response_format` con la envoltura equivocada

**Síntoma.** `7003: Model execution failed (User Input Error)`, y el Worker
responde 502.

**Causa.** El gateway traduce a la API de OpenAI para modelos de terceros y
espera `{ name, strict, schema }`. Mandar el esquema pelado (lo que documenta
Workers AI para sus propios modelos) falla.

**Cómo detectarlo.** Logs del gateway: un status 400 con `tokens_in: 0`.

**Detalle encadenado.** El reintento con `json_object` no se disparaba porque
`looksLikeBadRequest()` buscaba `400|422|invalid|...` y el mensaje real dice
`7003 ... User Input Error`. Un fallo de formato se convertía directo en 502 sin
degradar. Si vuelve a fallar el formato, ahora verás **dos llamadas por petición**
en los logs y seguirá funcionando.

Tabla verificada en [02-pipeline-llm.md](02-pipeline-llm.md).

---

## 3. RxDB dev-mode no se ejercita en el build

**Síntoma.** `npm run build` pasa, la app revienta al abrirla con `npm run dev`.
Error típico: `DVM1`.

**Causa.** El plugin `dev-mode` de RxDB aplica chequeos que producción no hace,
como exigir que el storage vaya envuelto en un validador de esquema. Solo se
carga bajo `import.meta.env.DEV`.

**Regla.** Si tocaste `db.ts`, `store.ts` o los esquemas, **`npm run build` no es
suficiente**. Abre `npm run dev` y verifica que la consola esté limpia.

Relacionado: en dev, RxDB congela los documentos. Toda función de mutación debe
devolver un objeto nuevo, nunca mutar el argumento.

---

## 4. Porciones fraccionarias contra el apego exacto

**Síntoma.** La racha se rompe y no vuelve nunca.

**Causa.** `dayAdherence` exige `count === target`. Las entradas por peso
producen fracciones (150 g de pechuga = 3.75 porciones POA), así que `count`
nunca cae exactamente en 12.

**Solución.** `totalPortions()` redondea el total combinado antes de comparar.
Los chips de la UI deben usar **la misma función**, o mostrarán un número que
contradice a la racha.

---

## 5. `pkill -f "algo"` mata tu propio shell

**Síntoma.** Un comando termina con `Exit code 144` y los pasos siguientes no se
ejecutan. Los archivos que ibas a borrar siguen ahí.

**Causa.** `pkill -f` compara contra la línea de comando completa, que incluye el
shell que ejecuta el propio `pkill`. Se autoextermina.

**Qué hacer.** Verificar el efecto en un comando **aparte** en vez de encadenar:

```bash
curl -s -m 2 -o /dev/null http://localhost:8787/ && echo "vivo" || echo "detenido"
```

Esto pasó tres veces en este repo y dejó estado sin limpiar cada vez.

---

## 6. Valores nutricionales guardados como total

**Síntoma.** `POA · 562.5 porc.` en una tarjeta.

**Causa.** Guardar `portions: 3.75` como total y luego multiplicarlo por
`qty: 150`.

**Regla.** Todo va **por unidad**. El Worker además rechaza `kcalPerUnit > 9.5`
cuando la unidad es `g`/`ml`.

---

## 7. `normalizeFoodId` duplicada

Existe en `src/foods.ts` y `worker/src/foods.ts` porque el Worker no puede
importar de `src/`. **Deben ser idénticas.** Si divergen, "Pan de Caja" y
"pan de caja" se guardan como dos alimentos distintos y la memoria deja de
funcionar sin dar ningún error.

```bash
diff <(sed -n '/export function normalizeFoodId/,/^}/p' src/foods.ts) \
     <(sed -n '/export function normalizeFoodId/,/^}/p' worker/src/foods.ts)
```

Nota: el regex de marcas combinantes va en forma escapada
(`/[\u0300-\u036f]/g`), no con los caracteres crudos, que son invisibles en el
fuente y se rompen al copiar o al reindentar.

---

## 8. CORS que rechaza su propio origen

**Síntoma.** 403 "origen no permitido" al llamar `/parse` desde la propia app en
`workers.dev`.

**Causa.** La lista de orígenes permitidos enumeraba `diet.gomezh.dev` y
localhost, pero no el origen propio.

**Solución.** `isAllowedOrigin()` acepta siempre `selfOrigin`. Eso cubre
`workers.dev`, las Preview URLs por versión y el dominio final sin enumerarlos.

---

## 9. Comida perdida en silencio por una tarjeta que falta

**Síntoma.** Guardar en "Colación PM" sube el total del día, muestra el toast de
éxito, y el alimento no aparece en ninguna parte.

**Causa.** El contenedor de esa comida no existía en el DOM y el guardado hacía
`if (logEl)`, fallando sin ruido.

**Regla.** Las 5 comidas de `plan.ts` deben tener tarjeta siempre: `desayuno`,
`colacion1`, `comida`, `colacion2`, `cena`.

---

## 10. `AbortError` sin manejar al cancelar

**Síntoma.** Unhandled rejection al cerrar la hoja durante la carga.

**Causa.** `parseText` rechaza con `DOMException` de nombre `AbortError`, igual
que `fetch`. No resuelve con `{ status: "error" }`.

**Regla.** Toda llamada en try/catch, tratando `err.name === "AbortError"` como
cancelación silenciosa. Los timeouts internos sí resuelven normalmente.

---

## 11. Estado residual de wrangler

**Síntoma.** `wrangler dev` falla con:
```
There is a deploy configuration at ".wrangler/deploy/config.json".
But the redirected configuration path it points to, "dist/wrangler.json", does not exist.
```

**Causa.** `.wrangler/` quedó de una configuración anterior (por ejemplo, del
`@cloudflare/vite-plugin`).

**Solución.** `rm -rf .wrangler`. Es un directorio de artefactos, ya ignorado.

---

## 12. El proyecto raíz convertido en Worker sin querer

**Síntoma.** `package.json` con el script `preview` reemplazado por
`wrangler dev`, `@cloudflare/vite-plugin` en `vite.config.ts`, y un
`wrangler.jsonc` en la raíz que nadie escribió a mano.

**Contexto.** Hoy la raíz **sí** es un Worker, y eso es correcto e intencional.
Pero llegó ahí por decisión explícita del usuario, no por un scaffold automático.
Si vuelve a aparecer un cambio así sin que se haya pedido, revísalo: el
`@cloudflare/vite-plugin` **no** se usa en este proyecto.

---

## 13. Nombre del Worker y despliegues huérfanos

Desplegar con un `name` distinto en `wrangler.jsonc` **crea otro Worker** en vez
de actualizar el existente, y deja el anterior sirviendo en su URL pública
indefinidamente.

El nombre correcto es `food-track`. Antes de cambiarlo, comprobar qué hay
desplegado.
