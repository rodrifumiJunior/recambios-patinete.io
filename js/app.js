import { Store } from "./store.js";
import { generateDraft, suggestCategory } from "./ai.js";
import { PLATFORM_LIST, PLATFORMS, adaptForPlatform } from "./platforms.js";
import { generateSuggestion, OFFER_ACTION_LABELS } from "./offers.js";
import { computeSuggestions } from "./maintenance.js";
import { ORDER_STAGES, stageMeta } from "./pipeline.js";
import { computeDemand, topStars, lowDemand, suggestionForLowDemand } from "./demand.js";
import { SECTOR_TRENDS, SECTOR_BRAND_NOTE, countItemsInCategory } from "./sectorTrends.js";
import { initPWA, isIOS, isInstalled, canPromptInstall, promptInstall } from "./pwa.js";
import { initConnectivity } from "./connectivity.js";
import { initAuth, signOut } from "./auth.js";
import { getConnectUrl, getEbayStatus, getEbayMessages, sendEbayReply } from "./ebay.js";

initPWA();
initConnectivity(toast);
initAuth();
document.addEventListener("pwa-install-available", () => {
  if ((parseHash().parts[0] || "inicio") === "descargar") render();
});

const PUBLIC_APP_URL = "https://rodrifumijunior.github.io/recambios-patinete.io/";

const main = document.getElementById("main");
const toastEl = document.getElementById("toast");

const QUICK_REPLIES = [
  "¡Hola! Sí, sigue disponible.",
  "Gracias por tu interés, ¿tienes alguna pregunta sobre el estado o la compatibilidad?",
  "Lo siento, ya está reservado/vendido.",
  "Te confirmo el envío en cuanto me pases la dirección.",
  "¿Te viene bien recogerlo en mano o prefieres envío?",
];

// ---------- transient (non-persisted) state ----------
let draftPhotos = []; // photos being added on the "nuevo artículo" form before saving
let currentGalleryIndex = 0;
let catalogFilters = { search: "", status: "todos" };

// ---------- helpers ----------
function esc(str) {
  return String(str ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function fmtEuro(n) {
  return `${Number(n).toFixed(2).replace(/\.00$/, "")} €`;
}

function fmtDate(iso) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("es-ES", { day: "2-digit", month: "short", year: "numeric" });
}

function daysAgoLabel(iso) {
  const d = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
  if (d <= 0) return "hoy";
  if (d === 1) return "hace 1 día";
  return `hace ${d} días`;
}

export function toast(msg, duration = 2600) {
  toastEl.textContent = msg;
  toastEl.hidden = false;
  clearTimeout(toast._t);
  toast._t = setTimeout(() => (toastEl.hidden = true), duration);
}

function navigate(hash) {
  window.location.hash = hash;
}

function statusBadge(item) {
  if (item.sold) return `<span class="badge badge-sold">Vendido</span>`;
  if (item.status === "aprobado") return `<span class="badge badge-approved">Aprobado</span>`;
  return `<span class="badge badge-draft">Borrador</span>`;
}

// ---------- router ----------
function parseHash() {
  const raw = window.location.hash.replace(/^#/, "") || "/inicio";
  const parts = raw.split("/").filter(Boolean);
  return { parts, raw };
}

function render() {
  const { parts } = parseHash();
  const route = parts[0] || "inicio";

  updateActiveNav(route);
  updateSidebarBadges();

  if (route === "inicio") renderInicio();
  else if (route === "catalogo") renderCatalogo();
  else if (route === "nuevo") renderNuevo();
  else if (route === "articulo") renderArticulo(parts[1], parts[2] || "descripcion");
  else if (route === "mantenimiento") renderMantenimiento();
  else if (route === "ofertas") renderOfertas();
  else if (route === "crm") renderCRM();
  else if (route === "conexiones") renderConexiones();
  else if (route === "tendencias") renderTendencias();
  else if (route === "descargar") renderDescargar();
  else renderInicio();

  main.classList.remove("fade-in");
  void main.offsetWidth;
  main.classList.add("fade-in");
}

function updateActiveNav(route) {
  document.querySelectorAll(".nav-link, .tab-item[data-route]").forEach((a) => {
    a.classList.toggle("active", a.dataset.route === `/${route}`);
  });
}

function updateSidebarBadges() {
  const items = Store.getItems();
  const suggestions = computeSuggestions(items);
  const pendingOffers = items.flatMap((i) => i.offers.filter((o) => !o.sentAt));

  const mBadge = document.getElementById("badge-mantenimiento");
  const oBadge = document.getElementById("badge-ofertas");
  const tabOBadge = document.getElementById("tab-badge-ofertas");
  mBadge.hidden = suggestions.length === 0;
  mBadge.textContent = suggestions.length;
  oBadge.hidden = pendingOffers.length === 0;
  oBadge.textContent = pendingOffers.length;
  tabOBadge.hidden = pendingOffers.length === 0;
  tabOBadge.textContent = pendingOffers.length;
}

// ---------- mobile drawer (hamburger + backdrop + "Más" tab) ----------
function closeDrawer() {
  document.querySelector(".sidebar")?.classList.remove("open");
  document.getElementById("sidebar-backdrop")?.classList.remove("open");
}
function openDrawer() {
  document.querySelector(".sidebar")?.classList.add("open");
  document.getElementById("sidebar-backdrop")?.classList.add("open");
}
function toggleDrawer() {
  document.querySelector(".sidebar")?.classList.contains("open") ? closeDrawer() : openDrawer();
}

document.getElementById("hamburger-btn")?.addEventListener("click", toggleDrawer);
document.getElementById("more-tab-btn")?.addEventListener("click", toggleDrawer);
document.getElementById("sidebar-backdrop")?.addEventListener("click", closeDrawer);
document.querySelector(".sidebar .nav")?.addEventListener("click", (e) => {
  if (e.target.closest(".nav-link")) closeDrawer();
});

// ---------- view: inicio (dashboard) ----------
function renderInicio() {
  const items = Store.getItems();

  if (items.length === 0) {
    main.innerHTML = `
      <div class="view-header">
        <div><h1>Inicio</h1><p>Aquí verás el flujo de venta, la demanda y qué artículos promocionar en cuanto tengas catálogo.</p></div>
      </div>
      <div class="card">
        <div class="empty-state">
          <div class="emoji">🏠</div>
          <p><strong>Todavía no hay datos que mostrar</strong></p>
          <div style="margin-top:16px; display:flex; gap:10px; justify-content:center;">
            <a href="#/nuevo" class="btn">➕ Nuevo artículo</a>
            <button class="btn-outline" data-action="seed">Cargar ejemplo</button>
          </div>
        </div>
      </div>`;
    return;
  }

  const activeItems = items.filter((i) => !i.sold);
  const totalValue = activeItems.reduce((sum, i) => sum + i.price * i.stock, 0);
  const soldCount = items.filter((i) => i.sold).length;
  const pendingOffers = items.flatMap((i) => i.offers).filter((o) => !o.sentAt).length;
  const pendingConversations = items.filter((i) => {
    const last = [...i.messages].sort((a, b) => new Date(b.date) - new Date(a.date))[0];
    return last && last.from === "comprador";
  }).length;

  const stageCounts = ORDER_STAGES.map((s) => ({ ...s, count: items.filter((i) => i.orderStage === s.key).length }));
  const maxCount = Math.max(1, ...stageCounts.map((s) => s.count));

  const demand = computeDemand(items);
  const stars = topStars(demand);
  const weak = lowDemand(demand);

  main.innerHTML = `
    <div class="view-header">
      <div><h1>Inicio</h1><p>Flujo de venta, demanda y qué artículos conviene promocionar ahora mismo.</p></div>
    </div>

    <div class="dash-stats">
      <div class="dash-stat"><div class="label">Artículos activos</div><div class="value">${activeItems.length}</div></div>
      <div class="dash-stat"><div class="label">Valor en catálogo</div><div class="value">${fmtEuro(totalValue)}</div></div>
      <div class="dash-stat"><div class="label">Vendidos</div><div class="value">${soldCount}</div></div>
      <div class="dash-stat"><div class="label">Ofertas pendientes</div><div class="value">${pendingOffers}</div><div class="sub">por confirmar</div></div>
      <div class="dash-stat"><div class="label">Conversaciones sin responder</div><div class="value">${pendingConversations}</div></div>
    </div>

    <div class="dash-section">
      <div class="dash-section-head">
        <div><h2>Flujo de venta</h2><p>Cuántos artículos hay en cada fase del pedido ahora mismo.</p></div>
        <a href="#/crm" class="btn-outline small">Ver CRM</a>
      </div>
      <div class="card card-pad">
        <div class="line-chart-wrap">${renderStageLineChart(stageCounts, maxCount)}</div>
      </div>
    </div>

    <div class="dash-section">
      <div class="dash-section-head">
        <div><h2>⭐ Productos estrella</h2><p>Los que más ofertas y mensajes están generando en relación al tiempo publicados.</p></div>
      </div>
      <div class="card card-pad">
        ${stars.length
          ? stars.map((d) => renderRankCard(d, "estrella")).join("")
          : `<p class="hint">Todavía no hay suficiente actividad (ofertas o mensajes) para destacar ningún artículo. Publica y da tiempo a que lleguen mensajes u ofertas.</p>`}
      </div>
    </div>

    <div class="dash-section">
      <div class="dash-section-head">
        <div><h2>📉 Necesitan un empujón</h2><p>Publicados hace tiempo sin ninguna oferta ni mensaje — sugerencia para promocionarlos.</p></div>
        <a href="#/mantenimiento" class="btn-outline small">Ver mantenimiento</a>
      </div>
      <div class="card card-pad">
        ${weak.length
          ? weak.map((d) => renderRankCard(d, "baja")).join("")
          : `<p class="hint">Ningún artículo publicado lleva demasiado tiempo sin actividad. Bien 👍</p>`}
      </div>
    </div>`;
}

function renderStageLineChart(stageCounts, maxCount) {
  const width = 700;
  const height = 260;
  const marginLeft = 34;
  const marginRight = 24;
  const marginTop = 26;
  const marginBottom = 78;
  const chartWidth = width - marginLeft - marginRight;
  const chartHeight = height - marginTop - marginBottom;
  const n = stageCounts.length;
  const xStep = n > 1 ? chartWidth / (n - 1) : 0;
  const baseline = marginTop + chartHeight;

  const points = stageCounts.map((s, i) => ({
    x: marginLeft + i * xStep,
    y: baseline - (s.count / maxCount) * chartHeight,
    ...s,
  }));

  const linePath = points.map((p) => `${p.x},${p.y}`).join(" ");

  const dots = points
    .map(
      (p) => `
      <circle cx="${p.x}" cy="${p.y}" r="4.5" fill="var(--navy-light)" stroke="var(--surface)" stroke-width="2" />
      <text x="${p.x}" y="${p.y - 12}" text-anchor="middle" font-size="12" font-weight="700" fill="var(--text)">${p.count}</text>
      <text x="${p.x}" y="${baseline + 18}" text-anchor="end" font-size="11" fill="var(--text-muted)" transform="rotate(-35 ${p.x} ${baseline + 18})">${esc(p.label)}</text>`
    )
    .join("");

  return `
    <svg viewBox="0 0 ${width} ${height}" style="width:100%; height:auto; min-width:520px; display:block;">
      <line x1="${marginLeft}" y1="${baseline}" x2="${width - marginRight}" y2="${baseline}" stroke="var(--border)" stroke-width="1" />
      <polyline points="${linePath}" fill="none" stroke="var(--navy)" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round" />
      ${dots}
    </svg>`;
}

function renderRankCard(d, kind) {
  const item = d.item;
  const label = item.title || `${item.brand || ""} ${item.type || ""}`.trim() || "Sin título";
  const photo = item.photos[0];
  return `
    <div class="rank-card">
      <div class="rank-thumb">${photo ? `<img src="${photo}" alt="">` : ""}</div>
      <div class="rank-body">
        <a class="title" href="#/articulo/${item.id}">${esc(label)}</a>
        <div class="meta">${d.published ? `Publicado hace ${d.daysLive} días` : "Sin publicar"} · ${d.offers} oferta${d.offers === 1 ? "" : "s"} · ${d.buyerMessages} mensaje${d.buyerMessages === 1 ? "" : "s"}</div>
        ${kind === "baja" ? `<div class="suggestion">💡 ${esc(suggestionForLowDemand(d))}</div>` : ""}
      </div>
      <a href="#/articulo/${item.id}" class="btn-outline small">Ver</a>
    </div>`;
}

// ---------- view: catálogo ----------
function renderCatalogo() {
  const items = Store.getItems();

  if (items.length === 0) {
    main.innerHTML = `
      <div class="view-header">
        <div><h1>Catálogo</h1><p>Todavía no has añadido ningún artículo.</p></div>
      </div>
      <div class="card">
        <div class="empty-state">
          <div class="emoji">🛴</div>
          <p><strong>Empieza subiendo tu primer recambio</strong></p>
          <p>Fotos, precio, stock y estado — la descripción la prepara la IA por ti, en borrador.</p>
          <div style="margin-top:16px; display:flex; gap:10px; justify-content:center;">
            <a href="#/nuevo" class="btn">➕ Nuevo artículo</a>
            <button class="btn-outline" data-action="seed">Cargar ejemplo</button>
          </div>
        </div>
      </div>`;
    return;
  }

  main.innerHTML = `
    <div class="view-header">
      <div><h1>Catálogo</h1><p>Fotos, precio y stock compartidos en todas las plataformas donde publiques.</p></div>
      <a href="#/nuevo" class="btn">➕ Nuevo artículo</a>
    </div>
    <div class="catalog-toolbar">
      <div class="catalog-search-wrap">
        <span class="search-icon">🔍</span>
        <input type="text" id="catalog-search" placeholder="Buscar por título, tipo o marca…" value="${esc(catalogFilters.search)}" />
      </div>
      <select id="catalog-status-filter">
        <option value="todos" ${catalogFilters.status === "todos" ? "selected" : ""}>Todos los estados</option>
        <option value="borrador" ${catalogFilters.status === "borrador" ? "selected" : ""}>Borrador</option>
        <option value="aprobado" ${catalogFilters.status === "aprobado" ? "selected" : ""}>Aprobado</option>
        <option value="vendido" ${catalogFilters.status === "vendido" ? "selected" : ""}>Vendido</option>
      </select>
      <span class="catalog-count" id="catalog-count"></span>
    </div>
    <div class="catalog-grid" id="catalog-grid"></div>`;

  updateCatalogGrid();
}

function itemMatchesFilters(item) {
  if (catalogFilters.status === "vendido" && !item.sold) return false;
  if (catalogFilters.status === "borrador" && (item.sold || item.status !== "borrador")) return false;
  if (catalogFilters.status === "aprobado" && (item.sold || item.status !== "aprobado")) return false;
  const q = catalogFilters.search.trim().toLowerCase();
  if (q) {
    const haystack = `${item.title} ${item.type} ${item.brand}`.toLowerCase();
    if (!haystack.includes(q)) return false;
  }
  return true;
}

function buildCatalogCards(items) {
  return items
    .map((item) => {
      const photo = item.photos[0];
      const label = item.title || `${item.brand || ""} ${item.type || ""}`.trim() || "Sin título";
      const lowStock = item.stock <= 1 && !item.sold;
      return `
      <a class="card item-card" href="#/articulo/${item.id}">
        <div class="item-photo">
          ${photo ? `<img src="${photo}" alt="">` : `<div class="no-photo">Sin foto</div>`}
          ${item.photos.length > 1 ? `<span class="item-photo-count">${item.photos.length} fotos</span>` : ""}
        </div>
        <div class="item-body">
          <div class="item-title">${esc(label)}</div>
          <div class="item-meta">
            <span class="item-price">${fmtEuro(item.price)}</span>
            <span>${item.sold ? "Vendido" : `Stock: ${item.stock}`}</span>
          </div>
          <div class="item-tags">
            ${statusBadge(item)}
            ${lowStock ? `<span class="badge badge-low">Queda poco</span>` : ""}
          </div>
        </div>
      </a>`;
    })
    .join("");
}

function updateCatalogGrid() {
  const grid = document.getElementById("catalog-grid");
  const countEl = document.getElementById("catalog-count");
  if (!grid) return;
  const filtered = Store.getItems().filter(itemMatchesFilters);
  grid.innerHTML = filtered.length
    ? buildCatalogCards(filtered)
    : `<div class="empty-state" style="grid-column:1/-1;"><div class="emoji">🔍</div><p>Ningún artículo coincide con la búsqueda o el filtro.</p></div>`;
  if (countEl) countEl.textContent = `${filtered.length} artículo${filtered.length === 1 ? "" : "s"}`;
}

// ---------- view: nuevo artículo ----------
function renderNuevo() {
  main.innerHTML = `
    <a href="#/catalogo" class="back-link">← Volver al catálogo</a>
    <div class="view-header">
      <div><h1>Nuevo artículo</h1><p>Sube las fotos y unos datos básicos: la IA prepara un título y descripción en borrador, que revisarás antes de publicar.</p></div>
    </div>
    <div class="card card-pad" style="max-width: 760px;">
      <form data-form="nuevo-item">
        <div class="section-title">Fotos</div>
        <div class="field">
          <div class="photo-drop" data-action="trigger-photo-input">
            📷 Haz clic para elegir fotos (puedes seleccionar varias)
          </div>
          <input type="file" id="photo-input" accept="image/*" multiple hidden />
          <div class="photo-preview-row" id="photo-preview"></div>
        </div>

        <div class="section-title" style="margin-top:24px;">Datos del artículo</div>
        <div class="form-grid">
          <div class="field">
            <label>Tipo de pieza</label>
            <input type="text" name="type" placeholder="Ej. Rueda delantera, placa base, cargador…" required />
          </div>
          <div class="field">
            <label>Marca / modelo compatible</label>
            <input type="text" name="brand" placeholder="Ej. Xiaomi M365, Segway Ninebot…" />
          </div>
        </div>

        <div class="field">
          <label>Estado</label>
          <div class="radio-row">
            <label class="radio-chip checked" data-radio-chip="condition">
              <input type="radio" name="condition" value="usado" checked /> Usado
            </label>
            <label class="radio-chip" data-radio-chip="condition">
              <input type="radio" name="condition" value="nuevo" /> Nuevo / a estrenar
            </label>
          </div>
        </div>

        <div class="field">
          <label>Defecto visible <span class="hint">(opcional — ayuda a que la descripción sea honesta)</span></label>
          <input type="text" name="defect" placeholder="Ej. pequeño roce en la carcasa" />
        </div>

        <div class="section-title" style="margin-top:24px;">Precio y stock</div>
        <div class="form-grid">
          <div class="field">
            <label>Precio de venta (€)</label>
            <input type="number" name="price" min="0" step="0.5" required />
          </div>
          <div class="field">
            <label>Precio mínimo orientativo (€) <span class="hint">para el asistente de ofertas</span></label>
            <input type="number" name="minPrice" min="0" step="0.5" />
          </div>
        </div>

        <div class="field" style="max-width:220px;">
          <label>Cantidad en stock</label>
          <input type="number" name="stock" min="1" step="1" value="1" required />
        </div>

        <button type="submit" class="btn btn-accent">✨ Crear borrador con IA</button>
      </form>
    </div>`;

  draftPhotos = [];
  renderPhotoPreview();

  document.getElementById("photo-input").addEventListener("change", async (e) => {
    const files = Array.from(e.target.files || []);
    for (const file of files) {
      try {
        const dataUrl = await Store.resizeImageToDataURL(file);
        draftPhotos.push(dataUrl);
      } catch (err) {
        toast("No se pudo cargar una de las fotos");
      }
    }
    renderPhotoPreview();
    e.target.value = "";
  });
}

function renderPhotoPreview() {
  const box = document.getElementById("photo-preview");
  if (!box) return;
  box.innerHTML = draftPhotos
    .map(
      (src, i) => `
      <div class="photo-thumb">
        <img src="${src}" alt="" />
        <button type="button" data-action="remove-draft-photo" data-index="${i}">✕</button>
      </div>`
    )
    .join("");
}

// ---------- view: artículo detalle ----------
function renderArticulo(id, tab) {
  const item = Store.getItem(id);
  if (!item) {
    main.innerHTML = `<a href="#/catalogo" class="back-link">← Volver al catálogo</a><div class="card card-pad">Artículo no encontrado.</div>`;
    return;
  }
  currentGalleryIndex = 0;

  const label = item.title || `${item.brand || ""} ${item.type || ""}`.trim() || "Sin título";

  const tabs = [
    ["descripcion", "Descripción"],
    ["plataformas", "Plataformas"],
    ["mensajes", `Mensajes${item.messages.length ? ` (${item.messages.length})` : ""}`],
    ["ofertas", `Ofertas${item.offers.length ? ` (${item.offers.length})` : ""}`],
    ["datos", "Datos y stock"],
  ];

  main.innerHTML = `
    <a href="#/catalogo" class="back-link">← Volver al catálogo</a>
    <div class="view-header">
      <div>
        <h1>${esc(label)} ${statusBadge(item)}</h1>
        <p>Creado ${fmtDate(item.createdAt)} · actualizado ${daysAgoLabel(item.updatedAt)}</p>
      </div>
      <div style="display:flex; gap:10px; align-items:center;">
        <label class="hint" style="display:flex; flex-direction:column; gap:3px;">
          Fase del pedido
          <select class="stage-select" data-action="change-stage" data-id="${item.id}">
            ${ORDER_STAGES.map((s) => `<option value="${s.key}" ${item.orderStage === s.key ? "selected" : ""}>${s.label}</option>`).join("")}
          </select>
        </label>
        <button class="icon-btn" title="Eliminar artículo" data-action="delete-item" data-id="${item.id}">🗑️</button>
      </div>
    </div>

    <div class="detail-layout">
      <div class="detail-gallery">
        <div class="card detail-gallery-main">
          ${item.photos.length ? `<img id="gallery-main-img" src="${item.photos[0]}" alt="">` : `<div class="no-photo" style="height:100%; display:flex; align-items:center; justify-content:center;">Sin fotos</div>`}
        </div>
        ${item.photos.length > 1 ? `<div class="detail-gallery-strip">${item.photos.map((p, i) => `<img src="${p}" data-action="gallery-select" data-index="${i}" data-id="${item.id}">`).join("")}</div>` : ""}
        <div class="card card-pad">
          <div class="stat-row">
            <div class="stat"><span class="label">Precio</span><span class="value">${fmtEuro(item.price)}</span></div>
            <div class="stat"><span class="label">Mínimo orientativo</span><span class="value">${item.minPrice !== null ? fmtEuro(item.minPrice) : "—"}</span></div>
            <div class="stat"><span class="label">Stock</span><span class="value">${item.sold ? "Vendido" : item.stock}</span></div>
          </div>
        </div>
      </div>

      <div>
        <div class="tabs">
          ${tabs.map(([key, lbl]) => `<button class="tab-btn ${tab === key ? "active" : ""}" data-action="go" data-href="#/articulo/${item.id}/${key}">${lbl}</button>`).join("")}
        </div>
        <div class="card card-pad">
          ${tab === "descripcion" ? renderTabDescripcion(item) : ""}
          ${tab === "plataformas" ? renderTabPlataformas(item) : ""}
          ${tab === "mensajes" ? renderTabMensajes(item) : ""}
          ${tab === "ofertas" ? renderTabOfertas(item) : ""}
          ${tab === "datos" ? renderTabDatos(item) : ""}
        </div>
      </div>
    </div>`;
}

function renderTabDescripcion(item) {
  const hasBasics = item.type;
  return `
    <div class="disclaimer-banner">💡 La IA solo prepara el borrador. No se publica nada hasta que apruebes el texto.</div>
    <div class="field">
      <label>Título del anuncio</label>
      <input type="text" id="edit-title" value="${esc(item.title)}" />
    </div>
    <div class="field">
      <label>Descripción</label>
      <textarea id="edit-description" rows="7">${esc(item.description)}</textarea>
    </div>
    <div style="display:flex; gap:10px; flex-wrap:wrap;">
      <button class="btn-outline" data-action="regenerate-ai" data-id="${item.id}" ${hasBasics ? "" : "disabled"}>✨ Regenerar con IA</button>
      <button class="btn-outline" data-action="save-draft" data-id="${item.id}">💾 Guardar cambios</button>
      ${item.status === "aprobado"
        ? `<span class="badge badge-approved" style="align-self:center;">Aprobado ✓</span>`
        : `<button class="btn btn-accent" data-action="approve-draft" data-id="${item.id}">✔ Aprobar borrador</button>`}
    </div>
    ${!hasBasics ? `<p class="hint" style="margin-top:10px;">Añade el tipo de pieza en «Datos y stock» para poder generar/regenerar con IA.</p>` : ""}
    <p class="hint" style="margin-top:14px;">Categoría sugerida: <strong>${esc(suggestCategory(item.type))}</strong></p>
  `;
}

function renderTabPlataformas(item) {
  const canPublish = item.status === "aprobado";
  const rows = PLATFORM_LIST.map((meta) => {
    const state = item.platforms[meta.key];
    const adapted = adaptForPlatform(meta.key, item.title, item.description);
    return `
      <div class="platform-row">
        <div class="platform-name">${meta.name}<div class="platform-meta">Demanda: ${meta.demand}</div></div>
        <div style="flex:1;">
          <label class="checkbox-row">
            <input type="checkbox" data-action="toggle-platform-select" data-id="${item.id}" data-platform="${meta.key}" ${state.selected ? "checked" : ""} />
            Incluir en este anuncio
          </label>
          ${state.selected ? `
            <div class="copy-box" style="margin-top:8px;"><strong>${esc(adapted.title)}</strong>\n\n${esc(adapted.description)}</div>
            <div style="display:flex; gap:8px; align-items:center; margin-top:8px; flex-wrap:wrap;">
              <button class="btn-outline small" data-action="copy-platform-text" data-id="${item.id}" data-platform="${meta.key}">📋 Copiar texto</button>
              <a class="btn-outline small" href="${meta.url}" target="_blank" rel="noopener">Abrir ${meta.name} ↗</a>
              <label class="checkbox-row" style="margin-left:auto;">
                <input type="checkbox" data-action="toggle-platform-publish" data-id="${item.id}" data-platform="${meta.key}" ${state.published ? "checked" : ""} ${canPublish ? "" : "disabled"} />
                Ya lo publiqué manualmente
              </label>
            </div>
            ${state.published ? `<p class="hint">Marcado como publicado el ${fmtDate(state.publishedAt)}.</p>` : !canPublish ? `<p class="hint">Aprueba el borrador en la pestaña «Descripción» antes de marcarlo como publicado.</p>` : ""}
          ` : ""}
        </div>
      </div>`;
  }).join("");

  return `
    <div class="disclaimer-banner">🖐️ La publicación es siempre manual: el botón final de "publicar" lo pulsas tú en cada app.</div>
    ${rows}`;
}

function renderTabOfertas(item) {
  const offersHtml = item.offers.length
    ? item.offers.map((o) => renderOfferCard(item, o)).join("")
    : `<p class="hint">Todavía no hay ofertas registradas para este artículo.</p>`;

  return `
    <div class="disclaimer-banner">🤝 El asistente sugiere una respuesta; nunca acepta ni cierra la venta por su cuenta.</div>
    <div class="section-title">Registrar oferta recibida</div>
    <form data-form="log-offer" data-id="${item.id}" style="display:flex; gap:10px; align-items:flex-end; flex-wrap:wrap; margin-bottom:22px;">
      <div class="field" style="margin-bottom:0; width:140px;">
        <label>Importe ofrecido (€)</label>
        <input type="number" name="buyerOffer" min="0" step="0.5" required />
      </div>
      <div class="field" style="margin-bottom:0; width:200px;">
        <label>Plataforma</label>
        <select name="platform">
          ${PLATFORM_LIST.map((p) => `<option value="${p.key}">${p.name}</option>`).join("")}
        </select>
      </div>
      <button type="submit" class="btn">Generar sugerencia</button>
    </form>
    <div class="section-title">Historial</div>
    ${offersHtml}`;
}

function renderOfferCard(item, offer) {
  const platformName = PLATFORMS[offer.platform]?.name || offer.platform;
  const pending = !offer.sentAt;
  return `
    <div class="offer-item ${pending && offer.priority ? "priority" : ""}">
      <div class="offer-head">
        <strong>${fmtEuro(offer.buyerOffer)} en ${platformName}</strong>
        <span class="hint">${fmtDate(offer.date)}</span>
      </div>
      <div class="offer-amounts">Precio: ${fmtEuro(item.price)} · Mínimo orientativo: ${item.minPrice !== null ? fmtEuro(item.minPrice) : "—"}</div>
      ${offer.priority && pending ? `<p class="hint" style="color:var(--danger); font-weight:600;">⚠ Atención prioritaria: ${esc(offer.reason || "revisar con cuidado")}</p>` : ""}
      <div class="offer-suggestion">
        Sugerencia del asistente: <strong>${OFFER_ACTION_LABELS[offer.suggestedAction] || offer.suggestedAction}</strong>
        ${offer.counterPrice ? ` (contraoferta: ${fmtEuro(offer.counterPrice)})` : ""}
      </div>
      ${pending ? `
        <div class="field" style="margin-bottom:8px;">
          <label>Mensaje a enviar (edítalo si quieres)</label>
          <textarea data-role="offer-message" data-offer="${offer.id}" rows="2">${esc(offer.suggestedMessage)}</textarea>
        </div>
        <div style="display:flex; gap:8px; flex-wrap:wrap;">
          <button class="btn btn-accent small" data-action="confirm-offer" data-id="${item.id}" data-offer="${offer.id}">✔ Confirmar y marcar enviado</button>
          <button class="btn-outline small" data-action="discard-offer" data-id="${item.id}" data-offer="${offer.id}">Descartar</button>
        </div>
      ` : `<p class="hint">Enviado el ${fmtDate(offer.sentAt)}: "${esc(offer.finalMessage)}"</p>`}
    </div>`;
}

function renderTabDatos(item) {
  return `
    <div class="form-grid">
      <div class="field">
        <label>Tipo de pieza</label>
        <input type="text" id="d-type" value="${esc(item.type)}" data-id="${item.id}" data-field="type" />
      </div>
      <div class="field">
        <label>Marca / modelo</label>
        <input type="text" id="d-brand" value="${esc(item.brand)}" data-id="${item.id}" data-field="brand" />
      </div>
    </div>
    <div class="field">
      <label>Estado</label>
      <div class="radio-row">
        <label class="radio-chip ${item.condition === "usado" ? "checked" : ""}" data-radio-chip="datos-condition">
          <input type="radio" name="datos-condition" value="usado" data-id="${item.id}" ${item.condition === "usado" ? "checked" : ""} /> Usado
        </label>
        <label class="radio-chip ${item.condition === "nuevo" ? "checked" : ""}" data-radio-chip="datos-condition">
          <input type="radio" name="datos-condition" value="nuevo" data-id="${item.id}" ${item.condition === "nuevo" ? "checked" : ""} /> Nuevo
        </label>
      </div>
    </div>
    <div class="field">
      <label>Defecto visible</label>
      <input type="text" id="d-defect" value="${esc(item.defect)}" data-id="${item.id}" data-field="defect" />
    </div>
    <div class="form-grid">
      <div class="field">
        <label>Precio (€)</label>
        <input type="number" id="d-price" value="${item.price}" min="0" step="0.5" data-id="${item.id}" data-field="price" />
      </div>
      <div class="field">
        <label>Precio mínimo orientativo (€)</label>
        <input type="number" id="d-minprice" value="${item.minPrice ?? ""}" min="0" step="0.5" data-id="${item.id}" data-field="minPrice" />
      </div>
    </div>
    <div class="field" style="max-width:220px;">
      <label>Stock disponible</label>
      <input type="number" id="d-stock" value="${item.stock}" min="0" step="1" data-id="${item.id}" data-field="stock" ${item.sold ? "disabled" : ""} />
    </div>
    <div class="field">
      <label>Fotos</label>
      <div class="photo-preview-row">
        ${item.photos.map((src, i) => `<div class="photo-thumb"><img src="${src}"><button type="button" data-action="remove-item-photo" data-id="${item.id}" data-index="${i}">✕</button></div>`).join("")}
        <div class="photo-thumb" style="display:flex;align-items:center;justify-content:center;cursor:pointer;background:var(--bg);" data-action="trigger-item-photo-input" data-id="${item.id}">➕</div>
      </div>
      <input type="file" id="item-photo-input" accept="image/*" multiple hidden data-id="${item.id}" />
    </div>
    <div style="display:flex; gap:10px; flex-wrap:wrap; margin-top:6px;">
      <button class="btn" data-action="save-datos" data-id="${item.id}">💾 Guardar datos</button>
      ${item.sold
        ? `<span class="badge badge-sold" style="align-self:center;">Vendido el ${fmtDate(item.soldAt)}</span>`
        : `<button class="btn-outline" data-action="mark-sold" data-id="${item.id}">Marcar como vendido</button>`}
    </div>`;
}

function renderTabMensajes(item) {
  const sorted = [...item.messages].sort((a, b) => new Date(a.date) - new Date(b.date));
  const chatHtml = sorted.length
    ? sorted
        .map(
          (m) => `
      <div class="chat-bubble ${m.from === "yo" ? "mine" : "buyer"}">
        <div class="chat-meta"><span>${m.from === "yo" ? "Tú" : "Comprador"}</span><span>·</span><span>${PLATFORMS[m.platform]?.name || m.platform}</span><span>·</span><span>${fmtDate(m.date)}</span></div>
        ${esc(m.text)}
      </div>`
        )
        .join("")
    : `<div class="chat-empty">Todavía no hay mensajes registrados para este artículo.</div>`;

  return `
    <div class="disclaimer-banner">🔌 Wallapop, Vinted, Milanuncios y Facebook no ofrecen API pública para particulares: copia aquí lo que te escriban y prepara la respuesta, el envío final lo haces en la propia app. <strong>Para eBay</strong>, ve a Conexiones — ahí los mensajes son reales, se leen y se responden sin copiar/pegar.</div>

    <div class="section-title">Conversación</div>
    <div class="chat-log">${chatHtml}</div>

    <div class="section-title" style="margin-top:18px;">Registrar mensaje recibido</div>
    <form data-form="log-message" data-id="${item.id}" class="msg-form-row" style="margin-bottom:22px;">
      <input type="hidden" name="from" value="comprador" />
      <select name="platform" style="width:170px;">
        ${PLATFORM_LIST.map((p) => `<option value="${p.key}">${p.name}</option>`).join("")}
      </select>
      <textarea name="text" rows="2" placeholder="Pega aquí lo que te ha escrito el comprador…" required></textarea>
      <button type="submit" class="btn-outline">Guardar mensaje</button>
    </form>

    <div class="section-title">Preparar respuesta</div>
    <div class="quick-replies">
      ${QUICK_REPLIES.map((q) => `<button type="button" class="quick-reply-chip" data-action="fill-reply" data-id="${item.id}">${esc(q)}</button>`).join("")}
    </div>
    <form data-form="send-message" data-id="${item.id}" class="msg-form-row">
      <select name="platform" style="width:170px;">
        ${PLATFORM_LIST.map((p) => `<option value="${p.key}">${p.name}</option>`).join("")}
      </select>
      <textarea id="reply-text-${item.id}" name="text" rows="2" placeholder="Escribe o elige una plantilla rápida arriba…" required></textarea>
      <button type="submit" class="btn btn-accent">📋 Copiar y marcar como enviado</button>
    </form>`;
}

// ---------- view: mantenimiento ----------
function renderMantenimiento() {
  const items = Store.getItems();
  const suggestions = computeSuggestions(items);

  main.innerHTML = `
    <div class="view-header">
      <div><h1>Mantenimiento</h1><p>El sistema solo sugiere mejoras (fotos, texto, precio, renovación). Nada se cambia ni se republica sin tu aprobación.</p></div>
    </div>
    <div class="card card-pad">
      ${suggestions.length
        ? suggestions
            .map(
              (s) => `
        <div class="suggestion-card">
          <div class="suggestion-icon">${s.icon}</div>
          <div class="suggestion-body">
            <h4><a href="#/articulo/${s.itemId}" style="color:inherit; text-decoration:none;">${esc(s.itemTitle)}</a> — ${esc(s.title)}</h4>
            <p>${esc(s.text)}</p>
          </div>
          <a href="#/articulo/${s.itemId}" class="btn-outline small" style="align-self:center;">Revisar</a>
        </div>`
            )
            .join("")
        : `<div class="empty-state"><div class="emoji">✅</div><p>No hay sugerencias pendientes por ahora.</p></div>`}
    </div>`;
}

// ---------- view: ofertas (global) ----------
function renderOfertas() {
  const items = Store.getItems().filter((i) => !i.sold);
  const allOffers = items.flatMap((item) => item.offers.map((o) => ({ item, offer: o })));
  allOffers.sort((a, b) => new Date(b.offer.date) - new Date(a.offer.date));

  main.innerHTML = `
    <div class="view-header">
      <div><h1>Ofertas</h1><p>El asistente sugiere una respuesta para cada oferta recibida; tú confirmas o editas el mensaje antes de enviarlo.</p></div>
    </div>

    <div class="card card-pad" style="margin-bottom:20px;">
      <div class="section-title">Registrar nueva oferta</div>
      <form data-form="log-offer-global" style="display:flex; gap:10px; align-items:flex-end; flex-wrap:wrap;">
        <div class="field" style="margin-bottom:0; width:220px;">
          <label>Artículo</label>
          <select name="itemId" required>
            <option value="">Selecciona…</option>
            ${items.map((i) => `<option value="${i.id}">${esc(i.title || i.type || "Sin título")}</option>`).join("")}
          </select>
        </div>
        <div class="field" style="margin-bottom:0; width:140px;">
          <label>Importe (€)</label>
          <input type="number" name="buyerOffer" min="0" step="0.5" required />
        </div>
        <div class="field" style="margin-bottom:0; width:200px;">
          <label>Plataforma</label>
          <select name="platform">
            ${PLATFORM_LIST.map((p) => `<option value="${p.key}">${p.name}</option>`).join("")}
          </select>
        </div>
        <button type="submit" class="btn">Generar sugerencia</button>
      </form>
    </div>

    <div class="card card-pad">
      ${allOffers.length
        ? allOffers.map(({ item, offer }) => `
          <div style="margin-bottom:4px;"><a href="#/articulo/${item.id}" style="font-size:12.5px; color:var(--text-muted); text-decoration:none;">${esc(item.title || item.type)} →</a></div>
          ${renderOfferCard(item, offer)}
        `).join("")
        : `<div class="empty-state"><div class="emoji">💬</div><p>Todavía no hay ofertas registradas.</p></div>`}
    </div>`;
}

// ---------- view: CRM ----------
function renderCRM() {
  const items = Store.getItems();

  const rows = items
    .map((item) => {
      const label = item.title || `${item.brand || ""} ${item.type || ""}`.trim() || "Sin título";
      const lastMessage = [...item.messages].sort((a, b) => new Date(b.date) - new Date(a.date))[0];
      const pendingOffers = item.offers.filter((o) => !o.sentAt).length;
      return `
      <tr>
        <td><a href="#/articulo/${item.id}" style="color:inherit; font-weight:600; text-decoration:none;">${esc(label)}</a></td>
        <td>${statusBadge(item)}</td>
        <td>
          <select class="stage-select" data-action="change-stage" data-id="${item.id}">
            ${ORDER_STAGES.map((s) => `<option value="${s.key}" ${item.orderStage === s.key ? "selected" : ""}>${s.label}</option>`).join("")}
          </select>
        </td>
        <td style="max-width:220px;">${lastMessage ? `<span class="hint">${fmtDate(lastMessage.date)} — ${esc(lastMessage.text.slice(0, 40))}${lastMessage.text.length > 40 ? "…" : ""}</span>` : `<span class="hint">Sin mensajes</span>`}</td>
        <td>${pendingOffers > 0 ? `<span class="badge badge-low">${pendingOffers} pendiente${pendingOffers > 1 ? "s" : ""}</span>` : `<span class="hint">—</span>`}</td>
        <td><a href="#/articulo/${item.id}" class="btn-outline small">Ver</a></td>
      </tr>`;
    })
    .join("");

  main.innerHTML = `
    <div class="view-header">
      <div><h1>CRM</h1><p>Vista rápida del estado de cada pedido. Cambia la fase manualmente cuando avance una venta.</p></div>
    </div>
    <div class="card card-pad">
      ${items.length
        ? `<div style="overflow-x:auto;"><table class="simple-table">
            <thead><tr><th>Artículo</th><th>Anuncio</th><th>Fase del pedido</th><th>Último mensaje</th><th>Ofertas</th><th></th></tr></thead>
            <tbody>${rows}</tbody>
          </table></div>`
        : `<div class="empty-state"><div class="emoji">📋</div><p>Añade artículos al catálogo para verlos aquí.</p></div>`}
    </div>`;
}

// ---------- view: conexiones ----------
function renderConexiones() {
  const connections = Store.getConnections();

  const cards = PLATFORM_LIST.filter((m) => m.key !== "ebay").map((meta) => {
    const conn = connections[meta.key] || {};
    return `
    <div class="connection-card">
      <div class="connection-head">
        <h3>${meta.name}</h3>
        <span class="api-pill ${meta.apiAvailable ? "yes" : "no"}">${meta.apiAvailable ? "Tiene API" : "Sin API pública"}</span>
      </div>
      <p class="hint" style="margin:0 0 12px;">${meta.syncNote}</p>
      <div class="form-grid">
        <div class="field" style="margin-bottom:0;">
          <label>Tu usuario en ${meta.name}</label>
          <input type="text" data-conn-field="username" data-platform="${meta.key}" value="${esc(conn.username || "")}" placeholder="Ej. @tunombre" />
        </div>
        <div class="field" style="margin-bottom:0;">
          <label>Enlace a tu perfil/tienda</label>
          <input type="text" data-conn-field="profileUrl" data-platform="${meta.key}" value="${esc(conn.profileUrl || "")}" placeholder="https://…" />
        </div>
      </div>
    </div>`;
  }).join("");

  const ebayConn = connections.ebay || {};

  main.innerHTML = `
    <div class="view-header">
      <div><h1>Conexiones</h1><p>No se piden contraseñas ni claves de acceso aquí, salvo eBay, que usa el inicio de sesión oficial de eBay (nunca ves ni guardas tu contraseña en esta app).</p></div>
    </div>
    <div class="disclaimer-banner">🔒 Wallapop, Vinted, Milanuncios y Facebook no tienen API pública para particulares: ahí mensajes y publicación se preparan aquí y se envían a mano. <strong>eBay es la excepción</strong>: está conectada de verdad a través de un backend propio, así que puedes leer y responder mensajes reales sin copiar/pegar.</div>

    <div class="connection-card" id="ebay-connection-card">
      <div class="connection-head">
        <h3>eBay</h3>
        <span class="api-pill yes">Conectado de verdad</span>
      </div>
      <p class="hint" id="ebay-status-text">Comprobando conexión…</p>
      <div id="ebay-connect-area"></div>
      <div class="form-grid" style="margin-top:14px;">
        <div class="field" style="margin-bottom:0;">
          <label>Tu usuario en eBay</label>
          <input type="text" data-conn-field="username" data-platform="ebay" value="${esc(ebayConn.username || "")}" placeholder="Ej. @tunombre" />
        </div>
        <div class="field" style="margin-bottom:0;">
          <label>Enlace a tu perfil/tienda</label>
          <input type="text" data-conn-field="profileUrl" data-platform="ebay" value="${esc(ebayConn.profileUrl || "")}" placeholder="https://…" />
        </div>
      </div>
      <div id="ebay-messages-area" style="margin-top:16px;"></div>
    </div>

    <form data-form="save-connections">
      ${cards}
      <button type="submit" class="btn">💾 Guardar conexiones</button>
    </form>`;

  loadEbayStatus();
}

async function loadEbayStatus() {
  const statusText = document.getElementById("ebay-status-text");
  const connectArea = document.getElementById("ebay-connect-area");
  if (!statusText) return;
  const status = await getEbayStatus();
  if (status.offline) {
    statusText.textContent = "No se pudo comprobar la conexión (sin acceso a internet ahora mismo).";
    return;
  }
  if (status.connected) {
    statusText.innerHTML = `<span class="badge badge-approved">Conectada</span> Ya puedes ver y responder mensajes reales de eBay.`;
    connectArea.innerHTML = `<button class="btn-outline small" data-action="ebay-refresh-messages">🔄 Actualizar mensajes</button>`;
    loadEbayMessages();
  } else {
    statusText.innerHTML = `<span class="badge badge-draft">No conectada</span>`;
    connectArea.innerHTML = `<a class="btn btn-accent small" href="${getConnectUrl()}" target="_blank" rel="noopener">🔗 Conectar mi cuenta de eBay</a>`;
  }
}

async function loadEbayMessages() {
  const messagesArea = document.getElementById("ebay-messages-area");
  if (!messagesArea) return;
  messagesArea.innerHTML = `<p class="hint">Cargando mensajes…</p>`;
  try {
    const messages = await getEbayMessages();
    messagesArea.innerHTML = messages.length
      ? messages
          .map(
            (m, i) => `
        <div class="offer-item">
          <div class="offer-head"><strong>${esc(m.sender)}</strong><span class="hint">${fmtDate(m.creationDate)}</span></div>
          <p style="font-size:13px; margin:6px 0;">${esc(m.text)}</p>
          <p class="hint" style="margin:0 0 8px;">Artículo eBay: ${esc(m.itemId)}</p>
          <div class="field" style="margin-bottom:8px;">
            <textarea data-role="ebay-reply-text" data-index="${i}" rows="2" placeholder="Escribe tu respuesta…"></textarea>
          </div>
          <button class="btn btn-accent small" data-action="ebay-send-reply" data-item-id="${esc(m.itemId)}" data-recipient="${esc(m.sender)}" data-index="${i}">📤 Enviar respuesta real</button>
        </div>`
          )
          .join("")
      : `<p class="hint">No tienes mensajes de compradores en eBay ahora mismo.</p>`;
  } catch (err) {
    messagesArea.innerHTML = `<p class="hint" style="color:var(--danger);">Error consultando mensajes de eBay: ${esc(err.message)}</p>`;
  }
}

// ---------- view: tendencias del sector ----------
function renderTendencias() {
  const items = Store.getItems();

  const rows = SECTOR_TRENDS.map((t) => {
    const count = countItemsInCategory(items, t.category);
    const has = count > 0;
    return `
      <div class="trend-card">
        <div class="trend-rank">${t.rank}</div>
        <div class="trend-body">
          <h4>${esc(t.category)} <span class="trend-coverage ${has ? "has" : "gap"}">${has ? `${count} en tu catálogo` : "no tienes ninguno"}</span></h4>
          <p>${esc(t.reason)}</p>
          <div class="trend-source">Fuente: <a href="${t.sourceUrl}" target="_blank" rel="noopener">${esc(t.sourceTitle)}</a></div>
        </div>
      </div>`;
  }).join("");

  main.innerHTML = `
    <div class="view-header">
      <div><h1>Tendencias del sector</h1><p>Qué recambios de patinete eléctrico se venden más según tiendas y marketplaces especializados, comparado con tu catálogo.</p></div>
    </div>
    <div class="disclaimer-banner">🔎 Esto no es una medición en tiempo real de tus competidores — ninguna empresa publica sus cifras de ventas exactas. Es un resumen de fuentes públicas del sector (agosto de 2026) para orientar qué categorías conviene tener en catálogo.</div>

    <div class="card card-pad" style="margin-bottom:20px;">
      ${rows}
    </div>

    <div class="card card-pad">
      <div class="section-title">Nota sobre marcas</div>
      <p style="font-size:13px; margin:0 0 8px;">${esc(SECTOR_BRAND_NOTE.text)}</p>
      <div class="trend-source">Fuente: <a href="${SECTOR_BRAND_NOTE.sourceUrl}" target="_blank" rel="noopener">${esc(SECTOR_BRAND_NOTE.sourceTitle)}</a></div>
    </div>`;
}

// ---------- view: descargar app (móvil) ----------
function renderDescargar() {
  const installed = isInstalled();
  const canInstallNow = canPromptInstall();
  const onIOS = isIOS();

  let installBoxHtml;
  if (installed) {
    installBoxHtml = `<div class="disclaimer-banner">✅ Ya estás usando la app instalada en este dispositivo.</div>`;
  } else if (canInstallNow) {
    installBoxHtml = `
      <div class="card card-pad" style="text-align:center;">
        <button class="btn btn-accent" id="install-now-btn" style="font-size:15px; padding:12px 22px;">📲 Instalar esta app ahora</button>
        <p class="hint" style="margin-top:10px;">Se añadirá un icono en tu pantalla de inicio para abrirla como una app.</p>
      </div>`;
  } else if (onIOS) {
    installBoxHtml = `
      <div class="card card-pad">
        <p style="margin:0 0 6px; font-size:13.5px;"><strong>En iPhone/iPad (Safari):</strong></p>
        <p style="margin:0; font-size:13px; color:var(--text-muted);">Toca el icono de Compartir 􀈂 en la barra inferior y luego "Añadir a pantalla de inicio".</p>
      </div>`;
  } else {
    installBoxHtml = `<div class="disclaimer-banner">Abre el enlace de abajo desde el navegador de tu móvil para poder instalarlo desde aquí mismo.</div>`;
  }

  main.innerHTML = `
    <div class="view-header">
      <div><h1>Descargar app en el móvil</h1><p>Instálala como una app en Android o iPhone, sin tiendas de aplicaciones: se abre desde el navegador y queda con icono propio y funcionando sin conexión.</p></div>
    </div>

    <div class="disclaimer-banner">🌐 Esta app está publicada en internet: se abre igual con WiFi o con datos móviles, desde cualquier sitio, sin depender de tu ordenador ni de tu red.</div>

    <div class="card card-pad" style="margin-bottom:18px;">
      <div class="section-title">1. Abre este enlace desde tu móvil</div>
      <div style="display:flex; gap:10px; align-items:center; flex-wrap:wrap;">
        <input type="text" id="lan-url-input" value="${esc(PUBLIC_APP_URL)}" readonly style="flex:1; min-width:220px;" />
        <button class="btn-outline small" data-action="copy-text" data-copy="${esc(PUBLIC_APP_URL)}">📋 Copiar enlace</button>
      </div>
      <p class="hint" style="margin-top:8px;">Envíatelo por WhatsApp, SMS o email para abrirlo cómodamente desde el móvil.</p>
    </div>

    <div class="card card-pad" style="margin-bottom:18px;">
      <div class="section-title">2. Instala la app</div>
      ${installBoxHtml}
    </div>`;

  const installBtn = document.getElementById("install-now-btn");
  if (installBtn) {
    installBtn.addEventListener("click", async () => {
      await promptInstall();
      toast("Si aceptaste, ya tienes el icono en tu pantalla de inicio");
      render();
    });
  }
}

// ---------- event delegation ----------
document.addEventListener("click", async (e) => {
  const el = e.target.closest("[data-action]");
  if (!el) return;
  const action = el.dataset.action;

  if (action === "go") {
    navigate(el.dataset.href);
    return;
  }

  if (action === "ebay-refresh-messages") {
    loadEbayMessages();
    return;
  }

  if (action === "ebay-send-reply") {
    const textarea = document.querySelector(`[data-role="ebay-reply-text"][data-index="${el.dataset.index}"]`);
    const text = textarea?.value.trim();
    if (!text) {
      toast("Escribe una respuesta antes de enviarla");
      return;
    }
    el.disabled = true;
    try {
      await sendEbayReply({ itemId: el.dataset.itemId, recipientId: el.dataset.recipient, text });
      toast("Respuesta enviada a eBay ✔");
      loadEbayMessages();
    } catch (err) {
      toast("No se pudo enviar: " + err.message, 4500);
      el.disabled = false;
    }
    return;
  }

  if (action === "sign-out") {
    signOut();
    return;
  }

  if (action === "copy-text") {
    try {
      await navigator.clipboard.writeText(el.dataset.copy || "");
      toast("Copiado al portapapeles");
    } catch {
      toast("No se pudo copiar automáticamente, selecciona el texto manualmente");
    }
    return;
  }

  if (action === "seed") {
    Store.seedIfEmpty(true);
    toast("Ejemplo cargado");
    render();
    return;
  }

  if (action === "trigger-photo-input") {
    document.getElementById("photo-input").click();
    return;
  }

  if (action === "remove-draft-photo") {
    draftPhotos.splice(Number(el.dataset.index), 1);
    renderPhotoPreview();
    return;
  }

  if (action === "delete-item") {
    if (confirm("¿Eliminar este artículo? Esta acción no se puede deshacer.")) {
      Store.deleteItem(el.dataset.id);
      toast("Artículo eliminado");
      navigate("#/catalogo");
    }
    return;
  }

  if (action === "gallery-select") {
    const item = Store.getItem(el.dataset.id);
    document.getElementById("gallery-main-img").src = item.photos[Number(el.dataset.index)];
    return;
  }

  if (action === "regenerate-ai") {
    const item = Store.getItem(el.dataset.id);
    const draft = generateDraft(item);
    Store.updateItem(item.id, { ...draft, status: "borrador" });
    toast("Borrador regenerado — revísalo antes de aprobar");
    render();
    return;
  }

  if (action === "save-draft") {
    const item = Store.getItem(el.dataset.id);
    const title = document.getElementById("edit-title").value.trim();
    const description = document.getElementById("edit-description").value.trim();
    const patch = { title, description };
    if (item.status === "aprobado") patch.status = "borrador";
    Store.updateItem(item.id, patch);
    toast("Cambios guardados" + (item.status === "aprobado" ? " — vuelve a aprobar antes de publicar" : ""));
    render();
    return;
  }

  if (action === "approve-draft") {
    Store.updateItem(el.dataset.id, { status: "aprobado" });
    toast("Borrador aprobado ✔");
    render();
    return;
  }

  if (action === "toggle-platform-select") {
    const item = Store.getItem(el.dataset.id);
    const platforms = { ...item.platforms, [el.dataset.platform]: { ...item.platforms[el.dataset.platform], selected: el.checked } };
    Store.updateItem(item.id, { platforms });
    render();
    return;
  }

  if (action === "toggle-platform-publish") {
    const item = Store.getItem(el.dataset.id);
    const key = el.dataset.platform;
    const platforms = { ...item.platforms, [key]: { ...item.platforms[key], published: el.checked, publishedAt: el.checked ? new Date().toISOString() : null } };
    Store.updateItem(item.id, { platforms });
    toast(el.checked ? "Marcado como publicado" : "Marcado como no publicado");
    render();
    return;
  }

  if (action === "copy-platform-text") {
    const item = Store.getItem(el.dataset.id);
    const adapted = adaptForPlatform(el.dataset.platform, item.title, item.description);
    const text = `${adapted.title}\n\n${adapted.description}`;
    try {
      await navigator.clipboard.writeText(text);
      toast("Texto copiado — pégalo en la plataforma");
    } catch {
      toast("No se pudo copiar automáticamente, selecciona el texto manualmente");
    }
    return;
  }

  if (action === "trigger-item-photo-input") {
    document.getElementById("item-photo-input").click();
    return;
  }

  if (action === "remove-item-photo") {
    const item = Store.getItem(el.dataset.id);
    const photos = item.photos.filter((_, i) => i !== Number(el.dataset.index));
    Store.updateItem(item.id, { photos });
    render();
    return;
  }

  if (action === "save-datos") {
    saveDatosTab(el.dataset.id);
    return;
  }

  if (action === "mark-sold") {
    if (confirm("¿Marcar este artículo como vendido? El stock se pondrá a 0.")) {
      Store.updateItem(el.dataset.id, { sold: true, soldAt: new Date().toISOString(), stock: 0 });
      toast("Artículo marcado como vendido");
      render();
    }
    return;
  }

  if (action === "confirm-offer") {
    const item = Store.getItem(el.dataset.id);
    const textarea = document.querySelector(`[data-role="offer-message"][data-offer="${el.dataset.offer}"]`);
    Store.updateOffer(item.id, el.dataset.offer, { finalAction: "confirmado", finalMessage: textarea.value, sentAt: new Date().toISOString() });
    toast("Respuesta marcada como enviada");
    render();
    return;
  }

  if (action === "discard-offer") {
    const item = Store.getItem(el.dataset.id);
    item.offers = item.offers.filter((o) => o.id !== el.dataset.offer);
    Store.persist();
    toast("Oferta descartada");
    render();
    return;
  }

  if (action === "fill-reply") {
    const textarea = document.getElementById(`reply-text-${el.dataset.id}`);
    if (textarea) textarea.value = el.textContent;
    return;
  }
});

function saveDatosTab(id) {
  const item = Store.getItem(id);
  const type = document.getElementById("d-type").value.trim();
  const brand = document.getElementById("d-brand").value.trim();
  const defect = document.getElementById("d-defect").value.trim();
  const price = Number(document.getElementById("d-price").value) || 0;
  const minPriceRaw = document.getElementById("d-minprice").value;
  const minPrice = minPriceRaw === "" ? null : Number(minPriceRaw);
  const stock = Number(document.getElementById("d-stock").value) || 0;
  const condition = document.querySelector('input[name="datos-condition"]:checked')?.value || item.condition;
  Store.updateItem(id, { type, brand, defect, price, minPrice, stock, condition });
  toast("Datos guardados");
  render();
}

// radio chip styling (delegated change)
document.addEventListener("change", async (e) => {
  const chipInput = e.target.closest('[data-radio-chip] input, input[name="datos-condition"]');
  if (chipInput) {
    const groupName = chipInput.name;
    document.querySelectorAll(`input[name="${groupName}"]`).forEach((r) => {
      r.closest(".radio-chip")?.classList.toggle("checked", r.checked);
    });
  }

  if (e.target.id === "item-photo-input") {
    const id = e.target.dataset.id;
    const item = Store.getItem(id);
    const files = Array.from(e.target.files || []);
    const newPhotos = [...item.photos];
    for (const file of files) {
      try {
        newPhotos.push(await Store.resizeImageToDataURL(file));
      } catch {
        toast("No se pudo cargar una de las fotos");
      }
    }
    Store.updateItem(id, { photos: newPhotos });
    render();
  }

  const stageSelect = e.target.closest('[data-action="change-stage"]');
  if (stageSelect) {
    Store.updateItem(stageSelect.dataset.id, { orderStage: stageSelect.value });
    toast("Fase del pedido actualizada");
    render();
  }

  if (e.target.id === "catalog-status-filter") {
    catalogFilters.status = e.target.value;
    updateCatalogGrid();
  }
});

document.addEventListener("input", (e) => {
  if (e.target.id === "catalog-search") {
    catalogFilters.search = e.target.value;
    updateCatalogGrid();
  }
});

// ---------- forms ----------
document.addEventListener("submit", (e) => {
  const formEl = e.target;

  if (formEl.dataset.form === "nuevo-item") {
    e.preventDefault();
    const fd = new FormData(formEl);
    const data = {
      photos: [...draftPhotos],
      type: fd.get("type")?.trim(),
      brand: fd.get("brand")?.trim(),
      condition: fd.get("condition"),
      defect: fd.get("defect")?.trim(),
      price: fd.get("price"),
      minPrice: fd.get("minPrice"),
      stock: fd.get("stock"),
    };
    const draft = generateDraft(data);
    const item = Store.addItem({ ...data, ...draft });
    draftPhotos = [];
    toast("Artículo creado con borrador de IA — revísalo antes de aprobar");
    navigate(`#/articulo/${item.id}/descripcion`);
    return;
  }

  if (formEl.dataset.form === "log-offer" || formEl.dataset.form === "log-offer-global") {
    e.preventDefault();
    const fd = new FormData(formEl);
    const itemId = formEl.dataset.id || fd.get("itemId");
    const item = Store.getItem(itemId);
    if (!item) {
      toast("Selecciona un artículo");
      return;
    }
    const buyerOffer = Number(fd.get("buyerOffer"));
    const platform = fd.get("platform");
    const suggestion = generateSuggestion(item, buyerOffer, platform);
    Store.addOffer(item.id, {
      id: Store.uid("offer"),
      date: new Date().toISOString(),
      platform,
      buyerOffer,
      suggestedAction: suggestion.action,
      suggestedMessage: suggestion.message,
      counterPrice: suggestion.counterPrice,
      priority: suggestion.priority,
      reason: suggestion.reason,
      finalAction: null,
      finalMessage: null,
      sentAt: null,
    });
    toast("Sugerencia generada — revisa y confirma el mensaje");
    render();
    return;
  }

  if (formEl.dataset.form === "log-message") {
    e.preventDefault();
    const fd = new FormData(formEl);
    Store.addMessage(formEl.dataset.id, {
      id: Store.uid("msg"),
      date: new Date().toISOString(),
      platform: fd.get("platform"),
      from: "comprador",
      text: fd.get("text").trim(),
    });
    toast("Mensaje guardado");
    render();
    return;
  }

  if (formEl.dataset.form === "send-message") {
    e.preventDefault();
    const fd = new FormData(formEl);
    const text = fd.get("text").trim();
    navigator.clipboard?.writeText(text).catch(() => {});
    Store.addMessage(formEl.dataset.id, {
      id: Store.uid("msg"),
      date: new Date().toISOString(),
      platform: fd.get("platform"),
      from: "yo",
      text,
      sentAt: new Date().toISOString(),
    });
    toast("Copiado al portapapeles — pégalo en el chat de la plataforma");
    render();
    return;
  }

  if (formEl.dataset.form === "save-connections") {
    e.preventDefault();
    formEl.querySelectorAll("[data-conn-field]").forEach((input) => {
      Store.updateConnection(input.dataset.platform, { [input.dataset.connField]: input.value.trim() });
    });
    toast("Conexiones guardadas");
    return;
  }
});

// ---------- top-level controls ----------
document.getElementById("btn-seed").addEventListener("click", () => {
  Store.seedIfEmpty(true);
  toast("Ejemplo cargado");
  render();
});

document.getElementById("btn-reset").addEventListener("click", () => {
  if (confirm("¿Vaciar todos los datos guardados en este navegador? No se puede deshacer.")) {
    Store.clearAll();
    toast("Datos borrados");
    navigate("#/catalogo");
    render();
  }
});

window.addEventListener("hashchange", render);
render();
