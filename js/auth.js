// Puerta de acceso con "Iniciar sesión con Google", y origen del token que usa
// js/sync.js para sincronizar tu catálogo entre dispositivos. El backend SÍ
// verifica la firma de este token (contra las claves públicas de Google) antes
// de guardar o devolver tus datos, así que la sincronización es segura aunque
// el gate de entrada en sí sea solo una comodidad de uso, no una barrera.

const CLIENT_ID = "731313791471-s5h00hvciketaiemlov9o8lcivjbbs4m.apps.googleusercontent.com";

const AUTH_KEY = "rc_patinete_auth";

let currentIdToken = null;

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

export function getIdToken() {
  return currentIdToken;
}

function handleCredentialResponse(response) {
  try {
    currentIdToken = response.credential;
    const profile = decodeJwt(response.credential);
    localStorage.setItem(AUTH_KEY, JSON.stringify({ name: profile.name, email: profile.email, picture: profile.picture }));
    hideGate();
    renderProfileChip();
    document.dispatchEvent(new CustomEvent("google-token-ready"));
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

/** Pide a Google un token fresco sin mostrar UI, aprovechando que el navegador
 *  ya tiene sesión iniciada en Google — necesario porque el ID token caduca
 *  (~1h) y lo usamos para autenticar la sincronización en la nube. */
function trySilentTokenRefresh(attemptsLeft = 25) {
  if (!window.google?.accounts?.id) {
    if (attemptsLeft > 0) setTimeout(() => trySilentTokenRefresh(attemptsLeft - 1), 200);
    return;
  }
  window.google.accounts.id.initialize({ client_id: CLIENT_ID, callback: handleCredentialResponse, auto_select: true });
  window.google.accounts.id.prompt();
}

export function signOut() {
  localStorage.removeItem(AUTH_KEY);
  currentIdToken = null;
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
    trySilentTokenRefresh();
    return;
  }
  showGate();
  renderGoogleButton();
}
