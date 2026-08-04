// Puerta de acceso con "Iniciar sesión con Google". Tras el primer inicio de
// sesión, la app canjea el token de Google por una sesión propia (guardada en
// este dispositivo, en localStorage) que no caduca cada hora ni depende de que
// Google pueda reautenticar en segundo plano — así la sincronización entre
// dispositivos sigue funcionando aunque el navegador bloquee los inicios de
// sesión silenciosos de Google, algo habitual sobre todo en móvil.

const CLIENT_ID = "731313791471-s5h00hvciketaiemlov9o8lcivjbbs4m.apps.googleusercontent.com";
const WORKER_URL = "https://ebay-mensajeria.rodricarf2.workers.dev";

const AUTH_KEY = "rc_patinete_auth";
const SESSION_KEY = "rc_patinete_session";

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

/** Token de sesión propio (no el de Google): se guarda en localStorage y lo usa
 *  js/sync.js para autenticar las llamadas de sincronización con el Worker. */
export function getSessionToken() {
  return localStorage.getItem(SESSION_KEY);
}

async function exchangeForSession(googleIdToken) {
  const res = await fetch(`${WORKER_URL}/api/auth/session`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ idToken: googleIdToken }),
  });
  if (!res.ok) throw new Error("No se pudo crear la sesión (" + res.status + ")");
  const data = await res.json();
  localStorage.setItem(SESSION_KEY, data.sessionToken);
}

async function handleCredentialResponse(response) {
  try {
    const profile = decodeJwt(response.credential);
    localStorage.setItem(AUTH_KEY, JSON.stringify({ name: profile.name, email: profile.email, picture: profile.picture }));
    hideGate();
    renderProfileChip();
    await exchangeForSession(response.credential);
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

export function signOut() {
  localStorage.removeItem(AUTH_KEY);
  localStorage.removeItem(SESSION_KEY);
  if (window.google?.accounts?.id) {
    window.google.accounts.id.disableAutoSelect();
  }
  renderProfileChip();
  showGate();
  renderGoogleButton();
}

export function initAuth() {
  renderProfileChip();

  if (getProfile() && getSessionToken()) {
    hideGate();
    document.dispatchEvent(new CustomEvent("google-token-ready"));
    return;
  }
  // Si había sesión de una versión anterior de la app pero no hay sesión
  // propia guardada (o nunca se guardó), pedimos un inicio de sesión más
  // para poder crearla — solo hace falta una vez.
  showGate();
  renderGoogleButton();
}
