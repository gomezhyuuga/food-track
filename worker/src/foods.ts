// Copia EXACTA de `src/foods.ts` de la PWA.
//
// El id de la memoria es un slug del nombre. Si esta función difiere de la del
// cliente, "Pan de Caja" y "pan de caja" se guardarían como dos alimentos
// distintos y la memoria dejaría de acertar. Cualquier cambio va en los dos
// archivos a la vez.
export function normalizeFoodId(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120);
}
