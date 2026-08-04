// Sincroniza el catálogo (Store.state) en la nube, asociado a tu cuenta de
// Google, para que el mismo catálogo aparezca en cualquier dispositivo donde
// inicies sesión con esa cuenta. Si no hay conexión o no hay sesión, la app
// sigue funcionando igual solo con los datos locales — la sincronización es
// una mejora, no un requisito para poder trabajar.

import { Store } from "./store.js";
import { getSessionToken } from "./auth.js";

const WORKER_URL = "https://ebay-mensajeria.rodricarf2.workers.dev";
const PUSH_DEBOUNCE_MS = 2500;

let pushTimer = null;
let lastPushedAt = 0;

async function pullFromCloud() {
  const token = getSessionToken();
  if (!token) return null;
  const res = await fetch(`${WORKER_URL}/api/sync/load`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error("No se pudo consultar la nube (" + res.status + ")");
  const data = await res.json();
  if (!data.found) return null;
  return { updatedAt: data.updatedAt, state: JSON.parse(data.data) };
}

async function pushToCloud() {
  const token = getSessionToken();
  if (!token) return;
  const res = await fetch(`${WORKER_URL}/api/sync/save`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify(Store.state),
  });
  if (res.ok) lastPushedAt = Store.state.updatedAt;
}

function schedulePush() {
  if (!navigator.onLine || !getSessionToken()) return;
  clearTimeout(pushTimer);
  pushTimer = setTimeout(() => {
    pushToCloud().catch((err) => console.warn("No se pudo sincronizar con la nube", err));
  }, PUSH_DEBOUNCE_MS);
}

/**
 * @param {() => void} onRemoteApplied Se llama si se sustituyó el estado local por uno más reciente de la nube (para volver a pintar la app).
 */
export async function initialSync(onRemoteApplied) {
  if (!navigator.onLine) return;
  try {
    const remote = await pullFromCloud();
    if (remote && remote.updatedAt > (Store.state.updatedAt || 0)) {
      Store.replaceState(remote.state);
      lastPushedAt = remote.updatedAt;
      onRemoteApplied?.();
    } else {
      await pushToCloud();
    }
  } catch (err) {
    console.warn("No se pudo sincronizar el catálogo con la nube", err);
  }
}

export function initSync(onRemoteApplied) {
  Store.subscribe(() => schedulePush());
  document.addEventListener("google-token-ready", () => initialSync(onRemoteApplied));
  // si hubo cambios locales mientras estaba offline, al recuperar cobertura se suben ahora
  window.addEventListener("online", () => {
    if (Store.state.updatedAt > lastPushedAt) schedulePush();
  });
}
