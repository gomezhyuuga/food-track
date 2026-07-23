// Lista de Equivalentes de Alimentos (CLIDDI) — 1 porción de cada categoría.
// status: "ok" = permitido, "avoid" = tachado por la nutrióloga, "star" = resaltado (preferido).

import type { CategoryId } from "./plan";

export interface FoodItem {
  name: string;
  portion: string;
  status?: "avoid" | "star";
  note?: string;
}

export const EQUIVALENTS: Partial<Record<CategoryId, FoodItem[]>> = {
  lacteos: [
    { name: "Leche descremada o light", portion: "1 taza" },
    { name: "Leche en polvo descremada o light", portion: "3 cdas." },
    { name: "Yoghurt light, natural o Sofúl", portion: "125 g", note: "≤ 100 kcal" },
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
    { name: "Jamón de pavo", portion: "40 g (3 reb. delg.)" },
    { name: "Salchicha de pavo", portion: "½ pieza" },
  ],
  leguminosas: [
    { name: "Frijol, lenteja, haba o garbanzo (cocidos)", portion: "½ taza", status: "avoid" },
    { name: "Soya texturizada", portion: "½ taza", status: "avoid" },
    { name: "Bebida de soya", portion: "1 taza", status: "avoid" },
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
    { name: "Aguacate", portion: "⅓ pza chica", status: "star" },
    {
      name: "Almendra, avellana, cacahuate, nuez, nuez de la india, piñón o pistache",
      portion: "1 cda.",
      status: "star",
    },
    { name: "Aceite en spray", portion: "2 rociadas" },
    {
      name: "Pepitas, ajonjolí, crema, coco, mayonesa, paté, crema de cacahuate, aceites (cártamo, oliva, maíz, soya, girasol, canola, aguacate, pepita de uva)",
      portion: "1 cdita.",
      status: "avoid",
    },
    { name: "Margarina o mantequilla, chía", portion: "1 cdita.", status: "avoid" },
    { name: "Mole en pasta", portion: "1 cda.", status: "avoid" },
  ],
  azucares: [
    { name: "Lunetas, ate o pasitas con chocolate", portion: "1 cda.", status: "avoid" },
    {
      name: "Azúcar, maple, miel de abeja, cajeta, mermelada, Nutella o leche condensada",
      portion: "2 cditas.",
      status: "avoid",
    },
    { name: "Dulces o chiclosos", portion: "1 pza", status: "avoid" },
    { name: "Kisses o malvaviscos", portion: "2 pzas", status: "avoid" },
    { name: "Gomitas", portion: "3 pzas", status: "avoid" },
    { name: "Gatorade, Powerade o Enerplex", portion: "¾ taza", status: "avoid" },
    { name: "Nieve de agua o con fruta", portion: "½ taza", status: "avoid" },
    { name: "Refrescos, jugos o leche saborizada", portion: "⅓ taza", status: "avoid" },
  ],
};

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
  "1 cucharada = 15 g = 15 ml",
  "1 cucharadita = 5 g = 5 ml",
];
