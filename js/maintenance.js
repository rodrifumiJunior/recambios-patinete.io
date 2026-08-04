// Motor de mantenimiento: solo genera sugerencias. Nada se cambia ni se
// republica automáticamente — todo pasa por revisión y aprobación manual.

import { icon } from "./icons.js";

export function daysSince(isoDate) {
  if (!isoDate) return Infinity;
  return (Date.now() - new Date(isoDate).getTime()) / 86400000;
}

export function earliestPublishedAt(item) {
  const dates = Object.values(item.platforms || {})
    .filter((p) => p.published && p.publishedAt)
    .map((p) => new Date(p.publishedAt).getTime());
  if (dates.length === 0) return null;
  return new Date(Math.min(...dates)).toISOString();
}

export function isPublishedAnywhere(item) {
  return Object.values(item.platforms || {}).some((p) => p.published);
}

export function computeSuggestions(items) {
  const suggestions = [];

  for (const item of items) {
    if (item.sold) continue;
    const label = item.title || `${item.brand || ""} ${item.type || ""}`.trim() || "Artículo sin título";

    if (item.status === "borrador" && daysSince(item.createdAt) >= 2) {
      suggestions.push({
        itemId: item.id,
        itemTitle: label,
        icon: icon("edit"),
        kind: "revisar-borrador",
        title: "Borrador pendiente de revisar",
        text: `Lleva ${Math.floor(daysSince(item.createdAt))} días en borrador sin aprobar. Revisa el texto generado y apruébalo para poder publicarlo.`,
      });
    }

    if ((item.photos?.length || 0) <= 1) {
      suggestions.push({
        itemId: item.id,
        itemTitle: label,
        icon: icon("camera"),
        kind: "fotos",
        title: "Añadir más fotos",
        text: "Este artículo tiene una foto o ninguna. Los anuncios con varias fotos suelen tener mejor visualización.",
      });
    }

    if (item.status === "aprobado" && !isPublishedAnywhere(item)) {
      suggestions.push({
        itemId: item.id,
        itemTitle: label,
        icon: icon("send"),
        kind: "publicar",
        title: "Listo para publicar, aún no publicado",
        text: "El anuncio está aprobado pero no se ha marcado como publicado en ninguna plataforma. Publícalo manualmente cuando puedas.",
      });
    }

    if (isPublishedAnywhere(item) && daysSince(item.updatedAt) >= 14) {
      suggestions.push({
        itemId: item.id,
        itemTitle: label,
        icon: icon("refresh"),
        kind: "refrescar",
        title: "Conviene refrescar el anuncio",
        text: `No se actualiza desde hace ${Math.floor(daysSince(item.updatedAt))} días. Prueba a mejorar fotos, título o precio para ganar visibilidad, y vuelve a publicarlo.`,
      });
    }

    const firstPublished = earliestPublishedAt(item);
    if (firstPublished && (item.offers?.length || 0) === 0 && daysSince(firstPublished) >= 21) {
      suggestions.push({
        itemId: item.id,
        itemTitle: label,
        icon: icon("tag"),
        kind: "precio",
        title: "Sin ofertas en 3 semanas",
        text: "Ninguna oferta desde que se publicó. Revisa si el precio es competitivo comparándolo con artículos similares.",
      });
    }

    if (firstPublished && daysSince(firstPublished) >= 30) {
      suggestions.push({
        itemId: item.id,
        itemTitle: label,
        icon: icon("clock"),
        kind: "renovar",
        title: "Anuncio antiguo, valorar renovarlo",
        text: `Publicado hace más de un mes. Renovar o volver a publicarlo (con moderación) puede ayudar a la visibilidad.`,
      });
    }
  }

  return suggestions;
}
