// Registro del service worker (permite abrir la app sin conexión) y el aviso
// para "instalar" la app en la pantalla de inicio, en Android e iOS.

const DISMISS_KEY = "rc_patinete_install_dismissed_at";
const DISMISS_DAYS = 14;

let deferredPrompt = null;

function isStandalone() {
  return window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone === true;
}

export function isIOS() {
  return /iphone|ipad|ipod/i.test(navigator.userAgent);
}

export function isMobileDevice() {
  return /android|iphone|ipad|ipod|mobile/i.test(navigator.userAgent) || window.matchMedia("(pointer: coarse)").matches;
}

export function isInstalled() {
  return isStandalone();
}

export function canPromptInstall() {
  return !!deferredPrompt;
}

export async function promptInstall() {
  if (!deferredPrompt) return null;
  deferredPrompt.prompt();
  const choice = await deferredPrompt.userChoice;
  deferredPrompt = null;
  return choice;
}

function recentlyDismissed() {
  const raw = localStorage.getItem(DISMISS_KEY);
  if (!raw) return false;
  return (Date.now() - Number(raw)) / 86400000 < DISMISS_DAYS;
}

function showBanner(text, { showInstallButton, onInstall }) {
  const banner = document.getElementById("install-banner");
  const textEl = document.getElementById("install-banner-text");
  const actionBtn = document.getElementById("install-banner-action");
  const dismissBtn = document.getElementById("install-banner-dismiss");
  if (!banner) return;

  textEl.textContent = text;
  actionBtn.hidden = !showInstallButton;
  banner.hidden = false;

  const autoHide = setTimeout(() => {
    banner.hidden = true;
  }, 60000);

  if (showInstallButton) {
    actionBtn.onclick = async () => {
      clearTimeout(autoHide);
      await onInstall();
      banner.hidden = true;
    };
  }
  dismissBtn.onclick = () => {
    clearTimeout(autoHide);
    banner.hidden = true;
    localStorage.setItem(DISMISS_KEY, String(Date.now()));
  };
}

export function initPWA() {
  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("sw.js").catch((err) => console.warn("No se pudo registrar el service worker", err));
    });
  }

  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    deferredPrompt = event;
    document.dispatchEvent(new CustomEvent("pwa-install-available"));
    if (isStandalone() || recentlyDismissed()) return;
    showBanner("Instala esta app para abrirla como una app y usarla sin conexión.", {
      showInstallButton: true,
      onInstall: () => promptInstall(),
    });
  });

  if (isStandalone() || recentlyDismissed()) return;

  if (isIOS()) {
    showBanner("Instala esta app: toca Compartir 􀈂 y luego \"Añadir a pantalla de inicio\".", {
      showInstallButton: false,
    });
  }
}
