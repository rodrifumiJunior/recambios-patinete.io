// Aviso de conexión: la app funciona igual sin cobertura (todo vive en este
// dispositivo). Esto solo avisa del estado y, al recuperar cobertura, recuerda
// cuántos artículos aprobados están listos para publicarse manualmente.

import { Store } from "./store.js";
import { isPublishedAnywhere } from "./maintenance.js";

function pendingPublishCount() {
  return Store.getItems().filter((item) => !item.sold && item.status === "aprobado" && !isPublishedAnywhere(item)).length;
}

function updateStatusPills() {
  const offline = !navigator.onLine;
  document.querySelectorAll(".conn-status").forEach((el) => {
    el.hidden = !offline;
  });
}

/** @param {(msg: string, duration?: number) => void} toast */
export function initConnectivity(toast) {
  updateStatusPills();
  let wasOffline = !navigator.onLine;

  window.addEventListener("offline", () => {
    wasOffline = true;
    updateStatusPills();
    toast("📴 Sin conexión — puedes seguir creando y editando artículos, se guardan en tu móvil.", 3600);
  });

  window.addEventListener("online", () => {
    updateStatusPills();
    if (!wasOffline) return;
    wasOffline = false;
    const pending = pendingPublishCount();
    if (pending > 0) {
      toast(`🌐 Ya tienes cobertura. Tienes ${pending} artículo${pending === 1 ? "" : "s"} listo${pending === 1 ? "" : "s"} para publicar — revisa Mantenimiento.`, 5000);
    } else {
      toast("🌐 Ya tienes cobertura de nuevo.", 2600);
    }
  });
}
