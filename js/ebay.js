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
