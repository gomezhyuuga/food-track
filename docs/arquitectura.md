# Arquitectura de Mi Dieta

PWA móvil sin backend para registrar porciones de comida contra el plan de
equivalentes CLIDDI. Todo corre en el navegador; los datos nunca salen del
dispositivo.

**Stack:** Vite · React 18 · TypeScript · RxDB (storage Dexie sobre IndexedDB).

---

## 1. Mapa de módulos

```mermaid
graph TD
    main["main.tsx<br/>arranque"]

    subgraph persistencia["Persistencia"]
        db["db.ts<br/>esquema RxDB · plugins · migración"]
        store["store.ts<br/>puente reactivo · hooks"]
        idb[("IndexedDB<br/>rxdb-dexie-midieta")]
    end

    subgraph datos["Datos estáticos — el plan de la nutrióloga"]
        plan["data/plan.ts<br/>CATEGORIES · MEALS<br/>DAILY_TARGETS · WATER"]
        equiv["data/equivalents.ts<br/>EQUIVALENTS · FREE_FOODS · MEASURES"]
    end

    subgraph ui["UI"]
        app["App.tsx<br/>navegación por pestañas"]
        today["views/TodayView"]
        hist["views/HistoryView"]
        eqv["views/EquivalentsView"]
        dots["components/PortionDots"]
    end

    adh["adherence.ts<br/>apego diario y rachas"]

    main --> store
    main --> app
    store --> db
    db <--> idb
    app --> today
    app --> hist
    app --> eqv
    today --> store
    today --> adh
    today --> dots
    today --> plan
    hist --> store
    hist --> adh
    hist --> dots
    hist --> plan
    adh --> store
    adh --> plan
    eqv --> equiv
```

El plan vive en datos estáticos, no en la base. La base guarda **solo lo que el
usuario registró**; las metas se comparan contra `plan.ts` al vuelo.

---

## 2. Modelo de datos

Un documento por día. La llave primaria es la fecha.

```ts
interface DayLog {
  date: string;    // "YYYY-MM-DD" — llave primaria (maxLength 10)
  meals: {         // JSON libre a propósito
    [comida: string]: { [categoría: string]: number };
  };
  waterMl: number;
}
```

`meals` se declara en el esquema como `{ type: "object" }` **sin propiedades**.
Es deliberado: cambiar las comidas o categorías en `plan.ts` no obliga a subir
la `version` del esquema ni a escribir migraciones de RxDB.

### El plan codificado

| Comida | Metas |
|---|---|
| 🍳 Desayuno | 2 POA · verduras libres |
| 🥛 Colación | 1 lácteo · 1 fruta |
| 🍽️ Comida | 6 POA · 2 cereales · 1 fruta · verduras libres |
| 🫖 Colación PM | — |
| 🌙 Cena | 4 POA · 1 cereal · verduras libres |

`DAILY_TARGETS` **se deriva sumando las comidas**, no se escribe a mano:
POA 12 · Cereales 3 · Frutas 2 · Lácteos 1 · Verduras libre.
Agua: meta 2.2–3.4 L, 1 vaso = 250 ml.

---

## 3. Arranque

RxDB abre de forma asíncrona, así que la app espera al primer snapshot antes de
renderizar. Ahí mismo ocurre, una sola vez, la importación de los datos que dejó
la versión anterior basada en `localStorage`.

```mermaid
sequenceDiagram
    participant M as main.tsx
    participant S as store.ts
    participant D as db.ts
    participant LS as localStorage
    participant IDB as IndexedDB

    M->>S: initStore()
    S->>D: getDb()
    Note over D: solo en dev:<br/>dev-mode + validador ajv
    D->>IDB: createRxDatabase + colección "days"

    D->>LS: ¿existe midieta:rxdb-migrated?
    alt primera vez
        LS-->>D: no
        D->>LS: leer llaves midieta:day:*
        Note over D: las entradas corruptas<br/>se saltan sin romper nada
        D->>IDB: bulkUpsert de los días
        D->>LS: marcar migrado
        Note over LS: las llaves viejas NO se borran,<br/>quedan como respaldo
    else ya migrado
        LS-->>D: sí
    end

    D-->>S: RxDatabase
    S->>IDB: suscribirse a days.find().$
    IDB-->>S: primer snapshot
    S-->>M: listo
    M->>M: render App
```

Si IndexedDB no abre (modo privado, permisos, cuota) se muestra una pantalla de
error. **No** cae a storage en memoria: eso perdería registros en silencio.

---

## 4. Lectura — el puente reactivo

Las vistas y el cálculo de rachas leen los días de forma **síncrona**, aunque
RxDB sea asíncrono. El truco: `store.ts` mantiene un espejo en memoria
alimentado por la suscripción de RxDB.

```mermaid
flowchart LR
    IDB[("IndexedDB")] -->|"days.find dollar-observable"| SUB["suscripción RxDB"]
    SUB -->|"toMutableJSON"| SNAP["snapshot<br/>Map fecha → DayLog"]
    SNAP --> N["notify — version++"]
    N -->|useSyncExternalStore| RE["React re-renderiza"]
    RE -->|"loadDay fecha — síncrono"| SNAP
```

Gracias a esto, `adherence.ts`, `TodayView` y `HistoryView` no saben que existe
RxDB: siguen llamando `loadDay()` y `listLoggedDates()` como siempre.

Los días son documentos pequeños y son pocos (uno por día), así que caben de
sobra en memoria.

**Efecto secundario gratis:** como la suscripción escucha a la base y RxDB
sincroniza instancias vía BroadcastChannel, dos pestañas abiertas se actualizan
solas entre sí.

---

## 5. Escritura — cola por fecha

Registrar es un toque, y los toques llegan rápido. Si las escrituras corrieran
en paralelo darían conflictos (409) o perderían incrementos: dos toques que leen
`0` y ambos escriben `1`.

`mutateDay()` encadena las escrituras **por fecha**, y cada una recibe el estado
más reciente del documento vía `incrementalModify`.

```mermaid
sequenceDiagram
    participant U as Usuario
    participant V as TodayView
    participant Q as mutateDay — cola
    participant DB as RxDB
    participant S as snapshot

    U->>V: toca "+" 10 veces seguidas
    loop cada toque
        V->>Q: mutateDay(fecha, mutar)
        Note over Q: prev.then(run, run)<br/>se encola, no corre aún
    end

    loop en serie, uno tras otro
        Q->>DB: findOne(fecha)
        Q->>DB: incrementalModify(mutar)
        DB-->>S: emite el nuevo estado
        S-->>V: re-render
    end

    Note over U,S: resultado: exactamente 10 porciones
```

La función `mutar` siempre devuelve un objeto **nuevo** (spreads) y nunca muta el
argumento — en dev RxDB congela los documentos.

---

## 6. Apego y rachas

El apego premia dar en el blanco, no acumular: una meta cuenta solo si el total
del día es **exactamente** el objetivo. Las verduras quedan fuera del cálculo
porque son libres, así que son 4 metas: POA, cereales, frutas y lácteos.

```mermaid
flowchart TD
    A["dayAdherence(log)"] --> B["por cada meta con objetivo > 0<br/>POA · Cereales · Frutas · Lácteos"]
    B --> C{"total del día<br/>== meta exacta?"}
    C -->|sí| D["cuenta"]
    C -->|no| E["no cuenta"]
    D --> F["pct = cumplidas / 4"]
    E --> F
    F --> G{"hubo registro<br/>y pct >= 0.75?"}
    G -->|sí| H["🔥 el día califica<br/>3 de 4 metas"]
    G -->|no| I["rompe la racha"]
```

La racha actual se cuenta hacia atrás desde hoy — o desde ayer si hoy todavía no
califica, para no castigar un día en curso. La mejor racha se calcula recorriendo
todos los días registrados. El umbral vive en `STREAK_THRESHOLD`.

---

## 7. Las tres pestañas

```mermaid
flowchart LR
    T["☀️ Hoy"] --> T1["racha · resumen del día<br/>agua · comidas plegables<br/>un toque = una porción"]
    H["📅 Historial"] --> H1["días anteriores con % de apego<br/>toca uno para ver el detalle"]
    P["📖 Porciones"] --> P1["referencia buscable de equivalentes<br/>evitar ⊘ · preferidos ⭐"]
```

`TodayView` abre automáticamente la comida que corresponde a la hora del día
(según `fromHour` de cada comida). `PortionDots` dibuja los puntos: llenos
cuando se cumplió, marcados aparte cuando se pasó, y sin límite para verduras.

---

## 8. Deploy

```mermaid
flowchart TD
    push{"git push"}
    push -->|"main"| gha["deploy.yml"]
    push -->|"cualquier otra rama"| pv["preview.yml"]

    gha --> b1["npm ci · npm run build"]
    b1 --> pages["GitHub Pages"]
    pages --> live["diet.gomezh.dev<br/>datos reales"]

    pv --> b2["npm ci · npm run build"]
    b2 --> cf["Cloudflare Pages"]
    cf --> prev["rama.food-track-e0l.pages.dev<br/>origen propio, datos aislados"]
```

El dominio custom se configura en los settings de Pages; con deploys vía Actions
no hace falta archivo `CNAME`. El service worker cachea el shell de la app para
que funcione sin conexión — al cambiar los assets hay que subir el número de
`CACHE` en `public/sw.js`.

Los previews por rama se configuran una sola vez; los pasos están en
[previews.md](previews.md).

---

## 9. Dónde tocar

| Cambio | Archivo |
|---|---|
| Cambió el plan de la nutrióloga | `src/data/plan.ts` |
| Cambió la lista de equivalentes | `src/data/equivalents.ts` |
| Umbral de la racha | `STREAK_THRESHOLD` en `src/adherence.ts` |
| Esquema o migraciones de la base | `src/db.ts` |
| Cómo React ve los datos | `src/store.ts` |

### Antes de hacer push

```sh
npm run build   # incluye tsc -b
npm run dev     # y probar en el navegador
```

`npm run build` **no** ejercita RxDB en dev-mode. Hay que abrir también
`npm run dev`, porque dev-mode aplica chequeos que producción no hace — por
ejemplo exige envolver el storage con un validador de esquema (error `DVM1`).
