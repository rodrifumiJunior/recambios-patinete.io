// Referencia general de qué recambios de patinete eléctrico se venden más en el
// sector (tiendas especializadas y marketplaces), a fecha de agosto de 2026.
// No es una medición en tiempo real de tus competidores (nadie publica sus
// cifras de ventas): es un resumen de fuentes públicas para orientar qué
// categorías conviene tener en catálogo. Actualízalo a mano si lo revisas más adelante.

import { suggestCategory } from "./ai.js";

export const SECTOR_TRENDS = [
  {
    rank: 1,
    category: "Ruedas y neumáticos",
    reason: "La pieza que más se repone por desgaste normal. Es de lo primero que se busca al fallar un patinete, con alta demanda de compatibilidad por modelo.",
    sourceTitle: "Accio — Best selling scooter parts reviews",
    sourceUrl: "https://www.accio.com/business/best-selling-scooter-parts-reviews",
  },
  {
    rank: 2,
    category: "Baterías",
    reason: "Recambio más buscado junto a los cargadores: se sustituyen por degradación natural de la batería con el uso.",
    sourceTitle: "Accio — Electric scooter spare parts top sellers",
    sourceUrl: "https://www.accio.com/business/electric-scooter-spare-parts-top-sellers",
  },
  {
    rank: 3,
    category: "Cargadores",
    reason: "Universales o específicos por marca, con alta rotación porque se pierden o se estropean con facilidad.",
    sourceTitle: "Levy Electric — Essential spare parts for electric scooters",
    sourceUrl: "https://www.levyelectric.com/resources/essential-spare-parts-for-electric-scooters-a-comprehensive-guide",
  },
  {
    rank: 4,
    category: "Frenos",
    reason: "Pastillas, discos, cables y palancas: reposición frecuente por desgaste y por ser una pieza crítica de seguridad.",
    sourceTitle: "Accio — Best selling scooter parts reviews",
    sourceUrl: "https://www.accio.com/business/best-selling-scooter-parts-reviews",
  },
  {
    rank: 5,
    category: "Electrónica / controladoras",
    reason: "Placas controladoras y componentes \"smart\": buscadas tanto para reparar averías como para mejorar el rendimiento.",
    sourceTitle: "Accio — Electric scooter spare parts top sellers",
    sourceUrl: "https://www.accio.com/business/electric-scooter-spare-parts-top-sellers",
  },
  {
    rank: 6,
    category: "Pantallas y displays",
    reason: "Reposición habitual tras caídas o golpes; pieza visible que se sustituye rápido si falla.",
    sourceTitle: "Electyum — Patinetes eléctricos más vendidos",
    sourceUrl: "https://electyum.com/blogs/news/patinetes-electricos-mas-vendidos",
  },
  {
    rank: 7,
    category: "Iluminación",
    reason: "Luces traseras y delanteras: repuesto habitual, además de ser obligatorio por normativa circular con ellas en buen estado.",
    sourceTitle: "Electyum — Patinetes eléctricos más vendidos",
    sourceUrl: "https://electyum.com/blogs/news/patinetes-electricos-mas-vendidos",
  },
];

export const SECTOR_BRAND_NOTE = {
  text: "Xiaomi es la marca con más unidades en circulación y la más reparada en España: cualquier tienda de barrio conoce sus averías típicas y suele tener piezas en stock. Si tus artículos son compatibles con modelos Xiaomi, parten con ventaja de demanda.",
  sourceTitle: "Electyum — Patinetes eléctricos más vendidos",
  sourceUrl: "https://electyum.com/blogs/news/patinetes-electricos-mas-vendidos",
};

/** Cuenta cuántos artículos (no vendidos) tienes en catálogo para una categoría dada. */
export function countItemsInCategory(items, category) {
  return items.filter((item) => !item.sold && suggestCategory(item.type) === category).length;
}
