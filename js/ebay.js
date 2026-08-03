// Cliente del backend de eBay (Cloudflare Worker). A diferencia de las demás
// plataformas, esta sí envía y recibe mensajes de verdad, sin copiar/pegar.

const WORKER_URL = "https://ebay-mensajeria.rodricarf2.workers.dev";

export function getConnectUrl() {
  return `${WORKER_URL}/auth/start`;
}

export async function getEbayStatus() {
  try {
    const res = await fetch(`${WORKER_URL}/api/status`);
    if (!res.ok) return { connected: false };
    return await res.json();
  } catch {
    return { connected: false, offline: true };
  }
}

export async function getEbayMessages() {
  const res = await fetch(`${WORKER_URL}/api/messages`);
  const data = await res.json();
  if (!res.ok || data.error) throw new Error(data.error ? JSON.stringify(data) : "Error consultando mensajes de eBay");
  return data.messages || [];
}

export async function uploadEbayPhoto(dataUrl) {
  const res = await fetch(`${WORKER_URL}/api/photos`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ dataUrl }),
  });
  const data = await res.json();
  if (!res.ok || data.error) throw new Error(data.error || "No se pudo subir la foto a eBay");
  return data.url;
}

/**
 * @param {{title:string, description:string, price:number, quantity:number,
 *          conditionId:number, minOfferPrice:number|null, autoAcceptPrice:number|null,
 *          pictureUrls:string[]}} listing
 */
export async function createEbayListing(listing) {
  const res = await fetch(`${WORKER_URL}/api/listings`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(listing),
  });
  const data = await res.json();
  if (!res.ok || data.error || data.published === false) {
    const base = data.error || "eBay rechazó la publicación";
    const detail = data.raw ? ` (${data.raw.slice(0, 300)})` : "";
    throw new Error(base + detail);
  }
  return data; // { published: true, itemId, viewUrl }
}

export async function sendEbayReply({ itemId, recipientId, text }) {
  const res = await fetch(`${WORKER_URL}/api/messages/reply`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ itemId, recipientId, text }),
  });
  const data = await res.json();
  if (!res.ok || data.error || data.sent === false) throw new Error(data.error || "eBay rechazó el envío");
  return data;
}
