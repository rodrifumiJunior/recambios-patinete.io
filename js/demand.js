// Estima la demanda de cada artículo a partir de tu propia actividad registrada
// (mensajes de compradores y ofertas) — no hay analíticas reales de cada
// plataforma conectadas, así que esto es una aproximación, no una medición exacta.

import { daysSince, earliestPublishedAt, isPublishedAnywhere } from "./maintenance.js";

function activityScore(item) {
  const buyerMessages = item.messages.filter((m) => m.from === "comprador").length;
  const offers = item.offers.length;
  return buyerMessages + offers * 2;
}

/**
 * @returns {Array<{item, score:number, level:'estrella'|'baja'|'normal', daysLive:number, buyerMessages:number, offers:number}>}
 */
export function computeDemand(items) {
  return items
    .filter((item) => !item.sold)
    .map((item) => {
      const published = isPublishedAnywhere(item);
      const firstPublished = earliestPublishedAt(item);
      const daysLive = published ? daysSince(firstPublished) : daysSince(item.createdAt);
      const activity = activityScore(item);
      const weeksLive = Math.max(daysLive, 3) / 7;
      const score = activity / weeksLive;

      let level = "normal";
      if (!published) {
        level = "sin-publicar";
      } else if (activity > 0 && score >= 1.5) {
        level = "estrella";
      } else if (activity === 0 && daysLive >= 10) {
        level = "baja";
      }

      return {
        item,
        score,
        level,
        daysLive: Math.floor(daysLive),
        buyerMessages: item.messages.filter((m) => m.from === "comprador").length,
        offers: item.offers.length,
        published,
      };
    });
}

export function topStars(demandList, n = 3) {
  return demandList
    .filter((d) => d.level === "estrella")
    .sort((a, b) => b.score - a.score)
    .slice(0, n);
}

export function lowDemand(demandList, n = 3) {
  return demandList
    .filter((d) => d.level === "baja")
    .sort((a, b) => b.daysLive - a.daysLive)
    .slice(0, n);
}

/** Sugerencia concreta para relanzar un artículo de baja demanda. */
export function suggestionForLowDemand(d) {
  const item = d.item;
  const selectedPlatforms = Object.values(item.platforms).filter((p) => p.selected).length;

  if ((item.photos?.length || 0) <= 1) {
    return "Añade más fotos: los anuncios con una sola foto (o ninguna) suelen pasar desapercibidos.";
  }
  if (selectedPlatforms <= 1) {
    return "Está publicado en una sola plataforma. Prepararlo también para otra (por ejemplo Milanuncios o Vinted) puede darle más visibilidad.";
  }
  if (d.daysLive >= 30) {
    return "Lleva más de un mes sin generar interés. Prueba a bajar el precio o renovar el anuncio con fotos/título distintos.";
  }
  return "Prueba a refrescar el título o las fotos para relanzarlo con nuevas palabras de búsqueda.";
}
