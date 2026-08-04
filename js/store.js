// Estado y persistencia local (localStorage). Nada sale de este navegador.

const STORAGE_KEY = "rc_patinete_app_v1";

const PLATFORM_KEYS = ["wallapop", "vinted", "milanuncios", "ebay", "facebook"];

function uid(prefix = "id") {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function emptyPlatformState() {
  const state = {};
  for (const key of PLATFORM_KEYS) {
    state[key] = { selected: false, published: false, publishedAt: null };
  }
  return state;
}

function defaultState() {
  return { items: [], seeded: false, connections: {} };
}

/** Rellena campos añadidos en versiones posteriores (mensajes, fase de pedido,
 *  conexiones) para que los datos ya guardados en localStorage no rompan la app. */
function migrateState(state) {
  if (!state.connections) state.connections = {};
  if (!state.updatedAt) state.updatedAt = 0;
  for (const item of state.items) {
    if (!Array.isArray(item.messages)) item.messages = [];
    if (!item.orderStage) item.orderStage = item.sold ? "vendido" : "disponible";
  }
  return state;
}

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultState();
    const parsed = JSON.parse(raw);
    if (!parsed || !Array.isArray(parsed.items)) return defaultState();
    return migrateState(parsed);
  } catch (err) {
    console.warn("No se pudo leer el almacenamiento local, se reinicia.", err);
    return defaultState();
  }
}

function saveState(state) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    return true;
  } catch (err) {
    console.error("No se pudo guardar (¿localStorage lleno?)", err);
    return false;
  }
}

/** Redimensiona una imagen a un ancho máximo y la devuelve como dataURL JPEG,
 *  para no reventar el límite de localStorage con fotos a resolución completa. */
function resizeImageToDataURL(file, maxDim = 900, quality = 0.82) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("No se pudo leer el archivo"));
    reader.onload = () => {
      img.onload = () => {
        const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
        const w = Math.round(img.width * scale);
        const h = Math.round(img.height * scale);
        const canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL("image/jpeg", quality));
      };
      img.onerror = () => reject(new Error("Archivo de imagen no válido"));
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

function newItem(data) {
  const now = new Date().toISOString();
  return {
    id: uid("item"),
    createdAt: now,
    updatedAt: now,
    photos: data.photos || [],
    type: data.type || "",
    brand: data.brand || "",
    condition: data.condition || "usado",
    defect: data.defect || "",
    price: Number(data.price) || 0,
    minPrice: data.minPrice !== undefined && data.minPrice !== "" ? Number(data.minPrice) : null,
    stock: Number(data.stock) || 1,
    title: data.title || "",
    description: data.description || "",
    status: "borrador", // 'borrador' | 'aprobado'
    platforms: emptyPlatformState(),
    offers: [],
    messages: [],
    orderStage: "disponible",
    sold: false,
    soldAt: null,
  };
}

function seedExampleItems() {
  const now = Date.now();
  const daysAgo = (n) => new Date(now - n * 86400000).toISOString();
  const items = [
    {
      ...newItem({
        type: "Placa base / controladora",
        brand: "Xiaomi M365",
        condition: "usado",
        defect: "Pequeño roce en la carcasa, funciona perfectamente",
        price: 40,
        minPrice: 30,
        stock: 2,
        title: "Placa controladora Xiaomi M365 (usado, funcionando)",
        description:
          "Placa base / controladora original para patinete Xiaomi M365. Estado usado con un pequeño roce estético en la carcasa que no afecta al funcionamiento. Probada y funcionando correctamente. Compatible con Xiaomi M365 y versiones Pro (verificar modelo antes de comprar). Envío a coordinar con el comprador.",
      }),
      status: "aprobado",
      orderStage: "negociando",
      platforms: { ...emptyPlatformState(), wallapop: { selected: true, published: true, publishedAt: daysAgo(20) }, vinted: { selected: true, published: true, publishedAt: daysAgo(20) } },
      createdAt: daysAgo(22),
      updatedAt: daysAgo(20),
      offers: [
        {
          id: uid("offer"),
          date: daysAgo(3),
          platform: "wallapop",
          buyerOffer: 32,
          suggestedAction: "aceptar",
          suggestedMessage: "¡Hola! Sin problema, acepto los 32€. Cuando quieras coordinamos la entrega.",
          finalAction: null,
          finalMessage: null,
          sentAt: null,
        },
      ],
      messages: [
        { id: uid("msg"), date: daysAgo(3), platform: "wallapop", from: "comprador", text: "Hola, ¿sigue disponible? ¿Aceptas 32€?" },
        { id: uid("msg"), date: daysAgo(3), platform: "wallapop", from: "yo", text: "¡Hola! Sí, sigue disponible. Te lo dejo en 32€ sin problema.", sentAt: daysAgo(3) },
      ],
    },
    {
      ...newItem({
        type: "Rueda delantera con neumático",
        brand: "Segway Ninebot ES2",
        condition: "nuevo",
        defect: "",
        price: 55,
        minPrice: 45,
        stock: 1,
        title: "Rueda delantera Segway Ninebot ES2 — nueva, a estrenar",
        description:
          "Rueda delantera completa con neumático para Segway Ninebot ES2, a estrenar (comprada de más, nunca montada). Incluye llanta y neumático en perfecto estado. Ideal para sustitución o repuesto. Se entrega tal cual se muestra en las fotos.",
      }),
      status: "borrador",
      createdAt: daysAgo(2),
      updatedAt: daysAgo(2),
    },
    {
      ...newItem({
        type: "Cargador",
        brand: "Genérico 42V 2A",
        condition: "usado",
        defect: "Cable algo desgastado en la punta, carga sin problema",
        price: 15,
        minPrice: 10,
        stock: 3,
        title: "",
        description: "",
      }),
      status: "borrador",
      createdAt: daysAgo(1),
      updatedAt: daysAgo(1),
    },
  ];
  return items;
}

const listeners = [];

export const Store = {
  PLATFORM_KEYS,
  uid,
  emptyPlatformState,
  newItem,
  resizeImageToDataURL,

  state: loadState(),

  persist(silent = false) {
    this.state.updatedAt = Date.now();
    saveState(this.state);
    if (!silent) listeners.forEach((fn) => fn(this.state));
  },

  /** Se llama cada vez que hay un cambio local guardado (para sincronizar con la nube). */
  subscribe(fn) {
    listeners.push(fn);
  },

  /** Sustituye todo el estado (usado al traer una copia más reciente desde la nube).
   *  No dispara los listeners, para no volver a subir inmediatamente lo que acabamos de bajar. */
  replaceState(newState) {
    this.state = newState;
    saveState(this.state);
  },

  getItems() {
    return this.state.items;
  },

  getItem(id) {
    return this.state.items.find((i) => i.id === id) || null;
  },

  addItem(data) {
    const item = newItem(data);
    this.state.items.unshift(item);
    this.persist();
    return item;
  },

  updateItem(id, patch) {
    const item = this.getItem(id);
    if (!item) return null;
    Object.assign(item, patch, { updatedAt: new Date().toISOString() });
    this.persist();
    return item;
  },

  deleteItem(id) {
    this.state.items = this.state.items.filter((i) => i.id !== id);
    this.persist();
  },

  addOffer(itemId, offer) {
    const item = this.getItem(itemId);
    if (!item) return null;
    item.offers.unshift(offer);
    this.persist();
    return offer;
  },

  updateOffer(itemId, offerId, patch) {
    const item = this.getItem(itemId);
    if (!item) return null;
    const offer = item.offers.find((o) => o.id === offerId);
    if (!offer) return null;
    Object.assign(offer, patch);
    this.persist();
    return offer;
  },

  addMessage(itemId, message) {
    const item = this.getItem(itemId);
    if (!item) return null;
    item.messages.push(message);
    item.updatedAt = new Date().toISOString();
    this.persist();
    return message;
  },

  getConnections() {
    return this.state.connections || {};
  },

  updateConnection(platformKey, patch) {
    if (!this.state.connections) this.state.connections = {};
    this.state.connections[platformKey] = { ...(this.state.connections[platformKey] || {}), ...patch };
    this.persist();
    return this.state.connections[platformKey];
  },

  seedIfEmpty(force = false) {
    if (!force && (this.state.items.length > 0 || this.state.seeded)) return false;
    this.state.items = seedExampleItems().concat(this.state.items);
    this.state.seeded = true;
    this.persist();
    return true;
  },

  clearAll() {
    this.state = defaultState();
    this.persist();
  },
};
