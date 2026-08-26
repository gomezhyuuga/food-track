// Copia del plan CLIDDI y de la lista de equivalentes.
//
// Está duplicado a propósito: el Worker se despliega aparte de la PWA y no
// puede importar desde `src/`. Si la nutrióloga cambia el plan hay que editar
// `src/data/plan.ts`, `src/data/equivalents.ts` **y** este archivo.

export const CATEGORY_IDS = [
  "lacteos",
  "poa",
  "leguminosas",
  "cereales",
  "frutas",
  "verduras",
  "grasas",
  "azucares",
] as const;

export type CategoryId = (typeof CATEGORY_IDS)[number];

export const MEAL_IDS = ["desayuno", "colacion1", "comida", "colacion2", "cena"] as const;

export type MealId = (typeof MEAL_IDS)[number];

/** Nombre legible y pistas de qué cae en cada categoría (material del prompt). */
export const CATEGORIES: Record<CategoryId, { name: string; hint: string }> = {
  lacteos: {
    name: "Lácteos",
    hint: "leche, yoghurt, jocoque, leche en polvo, helado de yoghurt",
  },
  poa: {
    name: "Productos de origen animal",
    hint: "huevo, clara, res, cerdo, pollo, pavo, pescado, atún, mariscos, quesos (panela, cottage, Oaxaca), jamón y salchicha de pavo",
  },
  leguminosas: {
    name: "Leguminosas",
    hint: "frijol, lenteja, haba, garbanzo, soya (la nutrióloga las marcó como EVITAR)",
  },
  cereales: {
    name: "Cereales y tubérculos",
    hint: "tortilla, arroz, pasta, pan, avena, granola, galletas, elote, hot cake, papa, camote, palomitas, barras de cereal",
  },
  frutas: { name: "Frutas", hint: "cualquier fruta fresca, en almíbar natural o deshidratada" },
  verduras: {
    name: "Verduras",
    hint: "verduras y hortalizas; son libres (sin límite de porciones) pero sí se registran",
  },
  grasas: {
    name: "Grasas",
    hint: "aguacate, nueces y semillas, aceites, crema, mayonesa, mantequilla, margarina, crema de cacahuate, mole",
  },
  azucares: {
    name: "Azúcares",
    hint: "azúcar, miel, mermelada, cajeta, dulces, chocolates, refrescos, jugos, nieves (la nutrióloga los marcó como EVITAR)",
  },
};

export const MEALS: { id: MealId; name: string; fromHour: number; targets: string }[] = [
  { id: "desayuno", name: "Desayuno", fromHour: 5, targets: "2 POA + verduras libres" },
  { id: "colacion1", name: "Colación (media mañana)", fromHour: 11, targets: "1 lácteo + 1 fruta" },
  {
    id: "comida",
    name: "Comida",
    fromHour: 13,
    targets: "6 POA + 2 cereales + 1 fruta + verduras libres",
  },
  { id: "colacion2", name: "Colación PM", fromHour: 17, targets: "sin meta fija" },
  { id: "cena", name: "Cena", fromHour: 19, targets: "4 POA + 1 cereal + verduras libres" },
];

/** 1 porción de cada categoría, tal cual la lista de equivalentes. */
export const EQUIVALENTS: Record<CategoryId, { name: string; portion: string }[]> = {
  lacteos: [
    { name: "Leche descremada o light", portion: "1 taza" },
    { name: "Leche en polvo descremada o light", portion: "3 cdas." },
    { name: "Yoghurt light, natural o Sofúl", portion: "125 g (máx. 100 kcal)" },
    { name: "Helado de yoghurt", portion: "½ ración" },
    { name: "Leche evaporada light", portion: "½ taza" },
    { name: "Jocoque", portion: "1 taza" },
  ],
  poa: [
    { name: "Huevo", portion: "1 pieza" },
    { name: "Clara de huevo", portion: "2 piezas" },
    { name: "Carne de res (aguayón, bola, falda, filete, molida)", portion: "40 g" },
    { name: "Carne de cerdo (pierna, lomo, espaldilla)", portion: "30 g" },
    { name: "Pollo, pavo o guajolote, sin piel", portion: "40 g" },
    { name: "Pescado", portion: "40 g" },
    { name: "Sardinas", portion: "1 pieza" },
    { name: "Atún en agua", portion: "½ lata" },
    { name: "Surimi", portion: "1 barra" },
    { name: "Mariscos", portion: "30 g" },
    { name: "Queso panela, canasto o fresco", portion: "45 g" },
    { name: "Queso cottage o requesón", portion: "45 g" },
    { name: "Queso Oaxaca", portion: "30 g" },
    { name: "Jamón de pavo", portion: "40 g (3 rebanadas delgadas)" },
    { name: "Salchicha de pavo", portion: "½ pieza" },
  ],
  leguminosas: [
    { name: "Frijol, lenteja, haba o garbanzo (cocidos)", portion: "½ taza" },
    { name: "Soya texturizada", portion: "½ taza" },
    { name: "Bebida de soya", portion: "1 taza" },
  ],
  cereales: [
    { name: "Tortilla de maíz o harina integral", portion: "1 pieza" },
    { name: "Tortilla de nopal", portion: "2 piezas" },
    { name: "Arroz cocido / sushi", portion: "½ taza · ½ barra" },
    { name: "Sopa de pasta, spaghetti o tallarines", portion: "½ taza" },
    { name: "Pan integral, pan tostado o de granos", portion: "1 rebanada" },
    { name: "Bolillo integral sin migajón o pan árabe", portion: "½ pieza" },
    { name: "Avena cocida", portion: "½ taza" },
    { name: "Hojuelas de maíz, trigo o arroz · cereal de salvado o multigrano", portion: "½ taza" },
    { name: "Avena, amaranto, granola o tapioca · quinoa (1.5)", portion: "2 cdas." },
    { name: "Salmas / galletas habaneras o Marías", portion: "3–4 piezas" },
    { name: "Elote natural / elote de lata", portion: "½ pieza · ½ lata" },
    { name: "Hot cake o waffle integral", portion: "1 pieza" },
    { name: "Papa cocida", portion: "1 mediana" },
    { name: "Camote", portion: "⅓ taza" },
    { name: "Palomitas naturales", portion: "3 tazas" },
    { name: "Barras de cereal (All-Bran, Linaza, Doble Fibra, Special K)", portion: "1 barra" },
  ],
  frutas: [
    { name: "Ciruela o ciruela pasa", portion: "3 piezas" },
    { name: "Chabacano", portion: "4 piezas" },
    { name: "Durazno, pérsimo o granada china", portion: "2 piezas" },
    { name: "Fresa, frambuesa, cereza o capulín", portion: "1 taza" },
    { name: "Granada roja", portion: "1 pieza" },
    { name: "Guayaba, maracuyá o higo", portion: "3 piezas" },
    { name: "Mamey", portion: "⅓ pieza" },
    { name: "Kiwi", portion: "1 pieza" },
    { name: "Mandarina", portion: "1 pieza" },
    { name: "Mango", portion: "½ pieza" },
    { name: "Manzana o pera", portion: "1 pieza" },
    { name: "Melón, papaya o cocktail natural", portion: "1 taza" },
    { name: "Naranja", portion: "1 pieza" },
    { name: "Nanches, lichis o guanábana", portion: "1 taza" },
    { name: "Piña", portion: "¾ taza" },
    { name: "Plátano tabasco o dominico", portion: "1 pza ch. · 3 pzas" },
    { name: "Sandía", portion: "1 taza" },
    { name: "Toronja", portion: "1 pieza" },
    { name: "Tuna o pitahaya", portion: "2 piezas" },
    { name: "Uvas o zapote negro", portion: "½ taza" },
    { name: "Zarzamoras, moras, berries", portion: "¾ taza" },
  ],
  verduras: [
    {
      name: "Alfalfa germinada, alcachofa, apio, calabaza, cebolla, berenjena, berro, champiñón, chayote, col, coliflor, ejote, espárrago, espinaca, flor de calabaza, jícama, jitomate, lechuga, nopal, pepino, pimiento, rábano, setas, tomate o verdolagas",
      portion: "1 taza",
    },
    {
      name: "Acelga, betabel, brócoli, chícharo, chile poblano, col de Bruselas, lenteja germinada, pepinillos, poro, puré de tomate, quelite, romeritos, soya germinada, salsas picantes o zanahoria",
      portion: "½ taza",
    },
  ],
  grasas: [
    { name: "Aguacate", portion: "⅓ pieza chica" },
    {
      name: "Almendra, avellana, cacahuate, nuez, nuez de la india, piñón o pistache",
      portion: "1 cda.",
    },
    { name: "Aceite en spray", portion: "2 rociadas" },
    {
      name: "Pepitas, ajonjolí, crema, coco, mayonesa, paté, crema de cacahuate, aceites (cártamo, oliva, maíz, soya, girasol, canola, aguacate, pepita de uva)",
      portion: "1 cdita.",
    },
    { name: "Margarina o mantequilla, chía", portion: "1 cdita." },
    { name: "Mole en pasta", portion: "1 cda." },
  ],
  azucares: [
    { name: "Lunetas, ate o pasitas con chocolate", portion: "1 cda." },
    {
      name: "Azúcar, maple, miel de abeja, cajeta, mermelada, Nutella o leche condensada",
      portion: "2 cditas.",
    },
    { name: "Dulces o chiclosos", portion: "1 pieza" },
    { name: "Kisses o malvaviscos", portion: "2 piezas" },
    { name: "Gomitas", portion: "3 piezas" },
    { name: "Gatorade, Powerade o Enerplex", portion: "¾ taza" },
    { name: "Nieve de agua o con fruta", portion: "½ taza" },
    { name: "Refrescos, jugos o leche saborizada", portion: "⅓ taza" },
  ],
};

/** Alimentos libres: no cuentan porciones ni se registran como alimento. */
export const FREE_FOODS: string[] = [
  "Agua natural o mineral sin azúcar",
  "Agua con sabor y refrescos sin azúcar",
  "Café o té, sin azúcar",
  "Gelatina light",
  "Caldo de pollo o res sin grasa",
  "Condimentos, picantes y sazonadores: jugo Maggi, salsa inglesa, salsa de soya, vinagre, mostaza y limón",
];

export const MEASURES: string[] = [
  "1 taza = taza medidora = 237 ml",
  "1 vaso = 250 ml",
  "1 cucharada (cda.) = 15 g = 15 ml",
  "1 cucharadita (cdita.) = 5 g = 5 ml",
];

export const CERTAINTIES = ["recordado", "estimado", "aproximado"] as const;
export type Certainty = (typeof CERTAINTIES)[number];
