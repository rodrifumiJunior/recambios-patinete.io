// Puerta de acceso con "Iniciar sesión con Google". Es una verificación de
// identidad real (Google emite el token), pero la comprobación se hace aquí
// mismo en el navegador: no hay servidor que la valide, así que es una puerta
// de uso, no una barrera de seguridad. Los datos del catálogo siguen viviendo
// solo en este dispositivo, el login no los sincroniza entre aparatos.

// Sustituir por el Client ID real creado en Google Cloud Console (ver Conexiones > Google).
const CLIENT_ID = "TU_CLIENT_ID.apps.googleusercontent.com";

const AUTH_KEY = "rc_patinete_auth";

function decodeJwt(token) {
  const payload = token.split(".")[1];
  const json = decodeURIComponent(
    atob(payload.replace(/-/g, "+").replace(/_/g, "/"))
      .split("")
      .map((c) => "%" + c.charCodeAt(0).toString(16).padStart(2, "0"))
      .join("")
  );
  return JSON.parse(json);
}

function showGate() {
  document.documentElement.classList.remove("auth-ok");
}
function hideGate() {
  document.documentElement.classList.add("auth-ok");
}

function getProfile() {
  const raw = localStorage.getItem(AUTH_KEY);
  return raw ? JSON.parse(raw) : null;
}

function renderProfileChip() {
  const chip = document.getElementById("auth-profile-chip");
  if (!chip) return;
  const profile = getProfile();
  if (!profile) {
    chip.hidden = true;
    return;
  }
  chip.hidden = false;
  chip.querySelector("img").src = profile.picture || "";
  chip.querySelector("span").textContent = profile.name || profile.email || "";
}

function handleCredentialResponse(response) {
  try {
    const profile = decodeJwt(response.credential);
    localStorage.setItem(AUTH_KEY, JSON.stringify({ name: profile.name, email: profile.email, picture: profile.picture }));
    hideGate();
    renderProfileChip();
  } catch (err) {
    console.error("No se pudo procesar el inicio de sesión con Google", err);
  }
}

function renderGoogleButton(attemptsLeft = 25) {
  if (!window.google?.accounts?.id) {
    if (attemptsLeft > 0) setTimeout(() => renderGoogleButton(attemptsLeft - 1), 200);
    return;
  }
  window.google.accounts.id.initialize({ client_id: CLIENT_ID, callback: handleCredentialResponse });
  const slot = document.getElementById("g_id_signin");
  if (slot) {
    slot.innerHTML = "";
    window.google.accounts.id.renderButton(slot, { theme: "outline", size: "large", shape: "pill", text: "signin_with", locale: "es" });
  }
}

export function signOut() {
  localStorage.removeItem(AUTH_KEY);
  if (window.google?.accounts?.id) {
    window.google.accounts.id.disableAutoSelect();
  }
  renderProfileChip();
  showGate();
  renderGoogleButton();
}

export function initAuth() {
  renderProfileChip();

  if (getProfile()) {
    hideGate();
    return;
  }
  showGate();
  renderGoogleButton();
}
