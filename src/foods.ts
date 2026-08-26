// Normalización de nombres de alimentos.
//
// El id de la memoria es un slug del nombre, así que la normalización tiene
// que ser idéntica en el cliente y en el Worker: si difieren, "Pan de Caja" y
// "pan de caja" se guardarían como dos alimentos distintos.

/**
 * "Pan de Caja  integral" → "pan-de-caja-integral"
 *
 * Quita acentos (NFD + rango combinante) para que "plátano" y "platano"
 * resuelvan al mismo id.
 */
export function normalizeFoodId(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120);
}
