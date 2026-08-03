// Metadatos de cada plataforma de venta entre particulares y adaptación de texto.
// La publicación es siempre manual: aquí solo preparamos el contenido.

export const PLATFORMS = {
  wallapop: {
    key: "wallapop",
    name: "Wallapop",
    demand: "Muy alto",
    maxTitle: 60,
    maxDesc: 1000,
    url: "https://es.wallapop.com/upload/product",
    offerChannel: "Chat de la app (\"hacer oferta\")",
    notes: "Cuenta gratuita de particular. Sin Wallapop Business ni destacados.",
    apiAvailable: false,
    syncNote: "No ofrece API pública para cuentas de particular. Los mensajes se copian y pegan aquí manualmente.",
  },
  vinted: {
    key: "vinted",
    name: "Vinted",
    demand: "Alto",
    maxTitle: 50,
    maxDesc: 500,
    url: "https://www.vinted.es/items/new",
    offerChannel: "Chat de la app (\"ofrecer precio\")",
    notes: "Cuenta gratuita, sin usar la API de Vinted Pro.",
    apiAvailable: false,
    syncNote: "Sin API pública para particulares. Los mensajes se copian y pegan aquí manualmente.",
  },
  milanuncios: {
    key: "milanuncios",
    name: "Milanuncios",
    demand: "Alto (generalista)",
    maxTitle: 80,
    maxDesc: 4000,
    url: "https://www.milanuncios.com/publicar-anuncios",
    offerChannel: "Chat o teléfono",
    notes: "Publicación gratuita manual, copiar/pegar texto y fotos.",
    apiAvailable: false,
    syncNote: "Sin API pública. Los mensajes se copian y pegan aquí manualmente.",
  },
  ebay: {
    key: "ebay",
    name: "eBay",
    demand: "Medio (piezas/coleccionismo)",
    maxTitle: 80,
    maxDesc: 4000,
    url: "https://www.ebay.es/sl/sell",
    offerChannel: "\"Best Offer\"",
    notes: "Cuenta gratuita de particular, sin usar la API para publicar.",
    apiAvailable: true,
    syncNote: "Conectada de verdad a través de un backend propio: ver los mensajes reales y responderlos en la pestaña Conexiones.",
  },
  facebook: {
    key: "facebook",
    name: "Facebook Marketplace",
    demand: "Alto",
    maxTitle: 100,
    maxDesc: 9000,
    url: "https://www.facebook.com/marketplace/create/item",
    offerChannel: "Messenger",
    notes: "Publicación manual y gratuita, como vendedor particular.",
    apiAvailable: false,
    syncNote: "El acceso a Messenger para negocios requiere verificación como empresa, no como particular. Los mensajes se copian y pegan aquí manualmente.",
  },
};

export const PLATFORM_LIST = Object.values(PLATFORMS);

function truncateAtWord(text, maxLen) {
  if (text.length <= maxLen) return text;
  const cut = text.slice(0, maxLen - 1);
  const lastSpace = cut.lastIndexOf(" ");
  return `${cut.slice(0, lastSpace > 0 ? lastSpace : maxLen - 1)}…`;
}

/** Adapta título/descripción base al formato/longitud de cada plataforma. */
export function adaptForPlatform(platformKey, title, description) {
  const meta = PLATFORMS[platformKey];
  if (!meta) return { title, description };
  return {
    title: truncateAtWord(title || "", meta.maxTitle),
    description: truncateAtWord(description || "", meta.maxDesc),
  };
}
