// Backend en Cloudflare Worker para la mensajería real de eBay.
//
// Por qué existe este fichero: la Trading API de eBay (la única que ofrece
// mensajería comprador-vendedor) no admite llamadas directas desde el
// navegador y necesita una clave secreta (Cert ID) que nunca debe estar en
// código público. Este Worker guarda esa clave como "secret" de Cloudflare
// (nunca en este fichero) y hace de intermediario entre la app (GitHub Pages)
// y eBay.
//
// Variables de entorno que hay que configurar en Cloudflare (Settings > Variables):
//   EBAY_APP_ID     (App ID / Client ID del keyset de eBay)
//   EBAY_DEV_ID     (Dev ID del keyset de eBay)
//   EBAY_CERT_ID    (Cert ID / Client secret — marcar como "Secret", no texto plano)
//   EBAY_RUNAME     (el "RuName" del redirect configurado en eBay)
//   EBAY_VERIFICATION_TOKEN (cadena que tú inventas, 32-80 caracteres, para el
//                            endpoint de eliminación de cuentas — la misma que
//                            pongas en el formulario de eBay)
//   ALLOWED_ORIGIN  (https://rodrifumijunior.github.io)
// KV namespace que hay que enlazar con el nombre EBAY_TOKENS (Settings > Variables > KV Namespace Bindings).
//
// Endpoints:
//   GET/POST /ebay/account-deletion -> requisito obligatorio de eBay (notificación de borrado de cuentas)
//   GET  /auth/start     -> redirige a eBay para que autorices la app (hazlo tú, una vez)
//   GET  /auth/callback  -> eBay vuelve aquí con un código; lo canjeamos por tokens y los guardamos
//   GET  /api/messages   -> lista mensajes de compradores (GetMemberMessages)
//   POST /api/messages/reply -> responde un mensaje (AddMemberMessageAAQToPartner)
//   GET  /api/status     -> indica si ya hay una cuenta de eBay conectada
//   POST /api/photos     -> sube una foto (data URL) y devuelve una URL pública propia
//   GET  /photo/:id      -> sirve esa foto (la usa eBay para mostrarla en el anuncio)
//   POST /api/listings   -> crea un anuncio real en eBay (AddFixedPriceItem)
//   GET  /api/suggest-category?q=titulo -> solo lectura, para depurar la sugerencia de categoría
//   POST /api/sync/save  -> guarda el catálogo completo del usuario (requiere Authorization: Bearer <Google ID token>)
//   GET  /api/sync/load  -> recupera el catálogo guardado del usuario (mismo header)

const EBAY_OAUTH_AUTHORIZE_URL = "https://auth.ebay.com/oauth2/authorize";
const EBAY_OAUTH_TOKEN_URL = "https://api.ebay.com/identity/v1/oauth2/token";
const EBAY_TRADING_API_URL = "https://api.ebay.com/ws/api.dll";
// Client ID público de "Iniciar sesión con Google" de la app (no es secreto, solo identifica la app ante Google).
const GOOGLE_CLIENT_ID = "731313791471-s5h00hvciketaiemlov9o8lcivjbbs4m.apps.googleusercontent.com";
const GOOGLE_JWKS_URL = "https://www.googleapis.com/oauth2/v3/certs";
const EBAY_SITE_ID = "186"; // eBay España. Si no encaja, verificar en la lista oficial de SiteIDs de la Trading API.
const OAUTH_SCOPES = [
  "https://api.ebay.com/oauth/api_scope",
  "https://api.ebay.com/oauth/api_scope/sell.account",
  "https://api.ebay.com/oauth/api_scope/sell.fulfillment",
  "https://api.ebay.com/oauth/api_scope/sell.inventory",
].join(" ");

function corsHeaders(env) {
  return {
    "Access-Control-Allow-Origin": env.ALLOWED_ORIGIN || "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
  };
}

function json(data, env, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders(env) },
  });
}

async function getStoredTokens(env) {
  const raw = await env.EBAY_TOKENS.get("seller");
  return raw ? JSON.parse(raw) : null;
}

async function storeTokens(env, tokens) {
  await env.EBAY_TOKENS.put("seller", JSON.stringify(tokens));
}

function basicAuthHeader(env) {
  return "Basic " + btoa(`${env.EBAY_APP_ID}:${env.EBAY_CERT_ID}`);
}

async function exchangeCodeForTokens(env, code) {
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    redirect_uri: env.EBAY_RUNAME,
  });
  const resp = await fetch(EBAY_OAUTH_TOKEN_URL, {
    method: "POST",
    headers: {
      Authorization: basicAuthHeader(env),
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: body.toString(),
  });
  const data = await resp.json();
  if (!resp.ok) throw new Error("eBay token exchange failed: " + JSON.stringify(data));
  return {
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    expires_at: Date.now() + (data.expires_in - 60) * 1000,
    refresh_expires_at: Date.now() + (data.refresh_token_expires_in - 60) * 1000,
  };
}

async function refreshAccessToken(env, tokens) {
  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: tokens.refresh_token,
    scope: OAUTH_SCOPES,
  });
  const resp = await fetch(EBAY_OAUTH_TOKEN_URL, {
    method: "POST",
    headers: {
      Authorization: basicAuthHeader(env),
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: body.toString(),
  });
  const data = await resp.json();
  if (!resp.ok) throw new Error("eBay token refresh failed: " + JSON.stringify(data));
  const updated = {
    ...tokens,
    access_token: data.access_token,
    expires_at: Date.now() + (data.expires_in - 60) * 1000,
  };
  await storeTokens(env, updated);
  return updated;
}

async function getValidAccessToken(env) {
  let tokens = await getStoredTokens(env);
  if (!tokens) return null;
  if (Date.now() >= tokens.expires_at) {
    tokens = await refreshAccessToken(env, tokens);
  }
  return tokens.access_token;
}

function tradingApiHeaders(env, callName, accessToken) {
  return {
    "Content-Type": "text/xml",
    "X-EBAY-API-COMPATIBILITY-LEVEL": "1189",
    "X-EBAY-API-SITEID": EBAY_SITE_ID,
    "X-EBAY-API-CALL-NAME": callName,
    "X-EBAY-API-DEV-NAME": env.EBAY_DEV_ID,
    "X-EBAY-API-APP-NAME": env.EBAY_APP_ID,
    "X-EBAY-API-CERT-NAME": env.EBAY_CERT_ID,
    "X-EBAY-API-IAF-TOKEN": accessToken,
  };
}

async function sha256Hex(input) {
  const data = new TextEncoder().encode(input);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hashBuffer)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

// --- Verificación del ID token de Google (firma RS256 contra las claves públicas de Google) ---

function base64UrlToString(str) {
  str = str.replace(/-/g, "+").replace(/_/g, "/");
  while (str.length % 4) str += "=";
  return atob(str);
}

function base64UrlToBytes(str) {
  const binStr = base64UrlToString(str);
  const bytes = new Uint8Array(binStr.length);
  for (let i = 0; i < binStr.length; i++) bytes[i] = binStr.charCodeAt(i);
  return bytes;
}

let cachedJwks = null;
let cachedJwksAt = 0;

async function getGoogleJwks() {
  if (cachedJwks && Date.now() - cachedJwksAt < 3600000) return cachedJwks;
  const resp = await fetch(GOOGLE_JWKS_URL);
  const data = await resp.json();
  cachedJwks = data.keys;
  cachedJwksAt = Date.now();
  return cachedJwks;
}

/** Verifica firma, emisor, audiencia y caducidad. Lanza si algo no cuadra. Devuelve el payload (sub, email, name, picture...). */
async function verifyGoogleIdToken(idToken) {
  const parts = idToken.split(".");
  if (parts.length !== 3) throw new Error("Token con formato inválido");
  const [headerB64, payloadB64, signatureB64] = parts;

  const header = JSON.parse(base64UrlToString(headerB64));
  const payload = JSON.parse(base64UrlToString(payloadB64));

  const jwks = await getGoogleJwks();
  const jwk = jwks.find((k) => k.kid === header.kid);
  if (!jwk) throw new Error("No se encontró la clave pública de Google para este token");

  const cryptoKey = await crypto.subtle.importKey(
    "jwk",
    jwk,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["verify"]
  );
  const data = new TextEncoder().encode(`${headerB64}.${payloadB64}`);
  const signature = base64UrlToBytes(signatureB64);
  const valid = await crypto.subtle.verify("RSASSA-PKCS1-v1_5", cryptoKey, signature, data);
  if (!valid) throw new Error("Firma del token no válida");

  if (payload.aud !== GOOGLE_CLIENT_ID) throw new Error("El token no fue emitido para esta aplicación");
  if (payload.iss !== "accounts.google.com" && payload.iss !== "https://accounts.google.com") {
    throw new Error("Emisor del token no reconocido");
  }
  if (!payload.exp || payload.exp * 1000 < Date.now()) throw new Error("El token ha caducado, vuelve a iniciar sesión");

  return payload;
}

async function requireGoogleUser(request) {
  const auth = request.headers.get("Authorization") || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : null;
  if (!token) throw new Error("Falta la sesión de Google (Authorization header)");
  return verifyGoogleIdToken(token);
}

function escapeXml(str) {
  return String(str || "").replace(/[<>&'"]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", "'": "&apos;", '"': "&quot;" }[c]));
}

function textBetween(xml, tag) {
  const m = xml.match(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`));
  return m ? m[1] : "";
}

// --- Sincronización de catálogo entre dispositivos (misma cuenta de Google) ---

async function handleSyncSave(env, request) {
  let user;
  try {
    user = await requireGoogleUser(request);
  } catch (err) {
    return json({ error: err.message }, env, 401);
  }
  const body = await request.text();
  if (body.length > 24 * 1024 * 1024) {
    return json({ error: "El catálogo pesa demasiado para guardarlo en la nube (límite ~25 MB). Reduce el número de fotos o su tamaño." }, env, 413);
  }
  const record = { updatedAt: Date.now(), data: body };
  await env.EBAY_TOKENS.put(`syncdata:${user.sub}`, JSON.stringify(record));
  return json({ saved: true, updatedAt: record.updatedAt }, env);
}

async function handleSyncLoad(env, request) {
  let user;
  try {
    user = await requireGoogleUser(request);
  } catch (err) {
    return json({ error: err.message }, env, 401);
  }
  const raw = await env.EBAY_TOKENS.get(`syncdata:${user.sub}`);
  if (!raw) return json({ found: false }, env);
  const record = JSON.parse(raw);
  return json({ found: true, updatedAt: record.updatedAt, data: record.data }, env);
}

async function handleGetMessages(env) {
  const accessToken = await getValidAccessToken(env);
  if (!accessToken) return json({ connected: false, messages: [] }, env);

  const requestXml = `<?xml version="1.0" encoding="utf-8"?>
<GetMemberMessagesRequest xmlns="urn:ebay:apis:eBLBaseComponents">
  <ErrorLanguage>es_ES</ErrorLanguage>
  <WarningLevel>High</WarningLevel>
  <MailMessageType>All</MailMessageType>
  <DetailLevel>ReturnMessages</DetailLevel>
</GetMemberMessagesRequest>`;

  const resp = await fetch(EBAY_TRADING_API_URL, {
    method: "POST",
    headers: tradingApiHeaders(env, "GetMemberMessages", accessToken),
    body: requestXml,
  });
  const xml = await resp.text();

  if (!resp.ok || xml.includes("<Ack>Failure</Ack>")) {
    return json({ connected: true, error: true, raw: xml.slice(0, 2000) }, env, 502);
  }

  const messages = [];
  const blocks = xml.split("<MemberMessage>").slice(1);
  for (const block of blocks) {
    messages.push({
      sender: textBetween(block, "Sender"),
      text: textBetween(block, "Text"),
      itemId: textBetween(block, "ItemID"),
      creationDate: textBetween(block, "CreationDate"),
      questionType: textBetween(block, "QuestionType"),
      messageId: textBetween(block, "MessageID"),
    });
  }
  return json({ connected: true, messages }, env);
}

function base64ToBytes(base64) {
  const binStr = atob(base64);
  const bytes = new Uint8Array(binStr.length);
  for (let i = 0; i < binStr.length; i++) bytes[i] = binStr.charCodeAt(i);
  return bytes;
}

async function handleUploadPhoto(env, request) {
  const { dataUrl } = await request.json();
  const match = /^data:(image\/[a-zA-Z]+);base64,(.+)$/.exec(dataUrl || "");
  if (!match) return json({ error: "Formato de imagen no válido (se esperaba un data URL image/*)." }, env, 400);
  const [, contentType, base64] = match;
  const bytes = base64ToBytes(base64);
  const id = crypto.randomUUID();
  await env.EBAY_TOKENS.put(`photo:${id}`, bytes.buffer);
  await env.EBAY_TOKENS.put(`photo:${id}:type`, contentType);
  const url = new URL(request.url);
  return json({ url: `${url.origin}/photo/${id}` }, env);
}

async function handlePhoto(env, id) {
  const bytes = await env.EBAY_TOKENS.get(`photo:${id}`, "arrayBuffer");
  if (!bytes) return new Response("Not found", { status: 404 });
  const contentType = (await env.EBAY_TOKENS.get(`photo:${id}:type`)) || "image/jpeg";
  return new Response(bytes, {
    headers: { "Content-Type": contentType, "Cache-Control": "public, max-age=31536000, immutable" },
  });
}

// GetSuggestedCategories (Trading API) fue retirada por eBay (HTTP 410 Gone).
// La sustituye la Commerce Taxonomy API (REST), que usa un token de aplicación
// (client_credentials), no el token de usuario que usamos para el resto de llamadas.

async function getAppAccessToken(env) {
  const body = new URLSearchParams({
    grant_type: "client_credentials",
    scope: "https://api.ebay.com/oauth/api_scope",
  });
  const resp = await fetch(EBAY_OAUTH_TOKEN_URL, {
    method: "POST",
    headers: { Authorization: basicAuthHeader(env), "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });
  const data = await resp.json();
  if (!resp.ok) throw new Error("No se pudo obtener el token de aplicación de eBay: " + JSON.stringify(data));
  return data.access_token;
}

async function getCategoryTreeId(appToken) {
  const resp = await fetch("https://api.ebay.com/commerce/taxonomy/v1/get_default_category_tree_id?marketplace_id=EBAY_ES", {
    headers: { Authorization: `Bearer ${appToken}` },
  });
  const data = await resp.json();
  if (!resp.ok) throw new Error("No se pudo obtener el árbol de categorías de eBay: " + JSON.stringify(data));
  return data.categoryTreeId;
}

async function getSuggestedCategoriesRaw(env, query) {
  const appToken = await getAppAccessToken(env);
  const treeId = await getCategoryTreeId(appToken);
  const resp = await fetch(
    `https://api.ebay.com/commerce/taxonomy/v1/category_tree/${treeId}/get_category_suggestions?q=${encodeURIComponent(query)}`,
    { headers: { Authorization: `Bearer ${appToken}` } }
  );
  const data = await resp.json().catch(() => null);
  return { ok: resp.ok, status: resp.status, data };
}

function parseSuggestedCategories(data) {
  if (!data?.categorySuggestions) return [];
  return data.categorySuggestions
    .map((s) => ({ id: s.category?.categoryId, name: s.category?.categoryName }))
    .filter((s) => s.id);
}

async function suggestCategoryId(env, query) {
  const { ok, data } = await getSuggestedCategoriesRaw(env, query);
  if (!ok) return null;
  return parseSuggestedCategories(data)[0]?.id || null;
}

async function handleSuggestCategoryDebug(env, request) {
  const url = new URL(request.url);
  const query = url.searchParams.get("q");
  if (!query) return json({ error: "Falta el parámetro ?q=titulo" }, env, 400);
  try {
    const { ok, status, data } = await getSuggestedCategoriesRaw(env, query);
    return json({ ok, status, query, suggestions: parseSuggestedCategories(data), raw: data }, env);
  } catch (err) {
    return json({ error: err.message }, env, 500);
  }
}

async function handleShippingServicesDebug(env) {
  const accessToken = await getValidAccessToken(env);
  if (!accessToken) return json({ error: "No hay una cuenta de eBay conectada." }, env, 400);
  const requestXml = `<?xml version="1.0" encoding="utf-8"?>
<GeteBayDetailsRequest xmlns="urn:ebay:apis:eBLBaseComponents">
  <DetailName>ShippingServiceDetails</DetailName>
</GeteBayDetailsRequest>`;
  const resp = await fetch(EBAY_TRADING_API_URL, {
    method: "POST",
    headers: tradingApiHeaders(env, "GeteBayDetails", accessToken),
    body: requestXml,
  });
  const xml = await resp.text();
  const services = [];
  const blocks = xml.split("<ShippingServiceDetails>").slice(1);
  for (const block of blocks) {
    const validForSelling = textBetween(block, "ValidForSellingFlow");
    const isDomestic = textBetween(block, "InternationalService") !== "true";
    if (validForSelling === "true" && isDomestic) {
      services.push({
        code: textBetween(block, "ShippingService"),
        description: textBetween(block, "Description"),
      });
    }
  }
  return json({ ok: resp.ok && !xml.includes("<Ack>Failure</Ack>"), count: services.length, services: services.slice(0, 40), raw: xml.slice(0, 500) }, env);
}

async function handleCreateListing(env, request) {
  const accessToken = await getValidAccessToken(env);
  if (!accessToken) return json({ error: "No hay una cuenta de eBay conectada todavía." }, env, 400);

  const body = await request.json();
  const { title, description, price, quantity, conditionId, minOfferPrice, autoAcceptPrice, pictureUrls, categoryId: providedCategoryId, location, postalCode } = body;
  if (!title || !description || !price || !pictureUrls?.length) {
    return json({ error: "Faltan datos obligatorios: título, descripción, precio o fotos." }, env, 400);
  }
  if (!location || !postalCode) {
    return json({ error: "Falta la ciudad o el código postal del vendedor." }, env, 400);
  }

  let categoryId = providedCategoryId;
  let categoryDebugInfo = null;
  if (!categoryId) {
    const { ok, data } = await getSuggestedCategoriesRaw(env, title);
    categoryDebugInfo = data;
    if (ok) categoryId = parseSuggestedCategories(data)[0]?.id || null;
  }
  if (!categoryId) {
    return json(
      {
        error:
          "No se pudo sugerir una categoría de eBay automáticamente para ese título. Indica una categoría manualmente.",
        raw: JSON.stringify(categoryDebugInfo).slice(0, 2000),
      },
      env,
      400
    );
  }

  const shippingCost = Number(body.shippingCost ?? 3.95);
  const shippingService = body.shippingService || "ES_CorreosPaq72";

  const picturesXml = pictureUrls.map((u) => `<PictureURL>${escapeXml(u)}</PictureURL>`).join("");

  let bestOfferXml = "";
  if (minOfferPrice) {
    bestOfferXml = `
    <BestOfferDetails>
      <BestOfferEnabled>true</BestOfferEnabled>
    </BestOfferDetails>
    <ListingDetails>
      ${autoAcceptPrice ? `<BestOfferAutoAcceptPrice currencyID="EUR">${Number(autoAcceptPrice).toFixed(2)}</BestOfferAutoAcceptPrice>` : ""}
      <MinimumBestOfferPrice currencyID="EUR">${Number(minOfferPrice).toFixed(2)}</MinimumBestOfferPrice>
    </ListingDetails>`;
  }

  const requestXml = `<?xml version="1.0" encoding="utf-8"?>
<AddFixedPriceItemRequest xmlns="urn:ebay:apis:eBLBaseComponents">
  <ErrorLanguage>es_ES</ErrorLanguage>
  <WarningLevel>High</WarningLevel>
  <Item>
    <Title>${escapeXml(title.slice(0, 80))}</Title>
    <Description>${escapeXml(description)}</Description>
    <PrimaryCategory><CategoryID>${escapeXml(categoryId)}</CategoryID></PrimaryCategory>
    <StartPrice currencyID="EUR">${Number(price).toFixed(2)}</StartPrice>
    <ConditionID>${escapeXml(String(conditionId || 3000))}</ConditionID>
    <Country>ES</Country>
    <Currency>EUR</Currency>
    <Location>${escapeXml(location)}</Location>
    <PostalCode>${escapeXml(postalCode)}</PostalCode>
    <DispatchTimeMax>3</DispatchTimeMax>
    <ListingDuration>GTC</ListingDuration>
    <ListingType>FixedPriceItem</ListingType>
    <Quantity>${Number(quantity) || 1}</Quantity>
    <PictureDetails>${picturesXml}</PictureDetails>
    <ShippingDetails>
      <ShippingType>Flat</ShippingType>
      <ShippingServiceOptions>
        <ShippingServicePriority>1</ShippingServicePriority>
        <ShippingService>${escapeXml(shippingService)}</ShippingService>
        <ShippingServiceCost currencyID="EUR">${shippingCost.toFixed(2)}</ShippingServiceCost>
      </ShippingServiceOptions>
    </ShippingDetails>
    <ReturnPolicy>
      <ReturnsAcceptedOption>ReturnsNotAccepted</ReturnsAcceptedOption>
    </ReturnPolicy>${bestOfferXml}
  </Item>
</AddFixedPriceItemRequest>`;

  const resp = await fetch(EBAY_TRADING_API_URL, {
    method: "POST",
    headers: tradingApiHeaders(env, "AddFixedPriceItem", accessToken),
    body: requestXml,
  });
  const xml = await resp.text();
  if (!resp.ok || xml.includes("<Ack>Failure</Ack>")) {
    return json({ published: false, raw: xml.slice(0, 3000) }, env, 502);
  }
  const itemId = textBetween(xml, "ItemID");
  return json({ published: true, itemId, viewUrl: itemId ? `https://www.ebay.es/itm/${itemId}` : null }, env);
}

async function handleReply(env, request) {
  const accessToken = await getValidAccessToken(env);
  if (!accessToken) return json({ error: "No hay una cuenta de eBay conectada todavía." }, env, 400);

  const { itemId, recipientId, text } = await request.json();
  if (!itemId || !recipientId || !text) {
    return json({ error: "Faltan itemId, recipientId o text." }, env, 400);
  }

  const requestXml = `<?xml version="1.0" encoding="utf-8"?>
<AddMemberMessageAAQToPartnerRequest xmlns="urn:ebay:apis:eBLBaseComponents">
  <ErrorLanguage>es_ES</ErrorLanguage>
  <WarningLevel>High</WarningLevel>
  <ItemID>${escapeXml(itemId)}</ItemID>
  <MemberMessage>
    <QuestionType>General</QuestionType>
    <RecipientID>${escapeXml(recipientId)}</RecipientID>
    <Body>${escapeXml(text)}</Body>
  </MemberMessage>
</AddMemberMessageAAQToPartnerRequest>`;

  const resp = await fetch(EBAY_TRADING_API_URL, {
    method: "POST",
    headers: tradingApiHeaders(env, "AddMemberMessageAAQToPartner", accessToken),
    body: requestXml,
  });
  const xml = await resp.text();

  if (!resp.ok || xml.includes("<Ack>Failure</Ack>")) {
    return json({ sent: false, raw: xml.slice(0, 2000) }, env, 502);
  }
  return json({ sent: true }, env);
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders(env) });
    }

    if (url.pathname === "/ebay/account-deletion") {
      // Requisito obligatorio del programa de desarrolladores de eBay: notificación
      // de eliminación de cuentas de Marketplace. Verificación por "challenge_code"
      // y confirmación de recepción de notificaciones reales.
      if (request.method === "GET") {
        const challengeCode = url.searchParams.get("challenge_code");
        if (!challengeCode) return new Response("Falta challenge_code", { status: 400 });
        const endpoint = `${url.origin}${url.pathname}`;
        const hash = await sha256Hex(challengeCode + env.EBAY_VERIFICATION_TOKEN + endpoint);
        return new Response(JSON.stringify({ challengeResponse: hash }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      if (request.method === "POST") {
        return new Response(null, { status: 200 });
      }
    }

    if (url.pathname === "/auth/start") {
      const authUrl = new URL(EBAY_OAUTH_AUTHORIZE_URL);
      authUrl.searchParams.set("client_id", env.EBAY_APP_ID);
      authUrl.searchParams.set("redirect_uri", env.EBAY_RUNAME);
      authUrl.searchParams.set("response_type", "code");
      authUrl.searchParams.set("scope", OAUTH_SCOPES);
      return Response.redirect(authUrl.toString(), 302);
    }

    if (url.pathname === "/auth/callback") {
      const code = url.searchParams.get("code");
      if (!code) return new Response("Falta el parámetro 'code' en la respuesta de eBay.", { status: 400 });
      try {
        const tokens = await exchangeCodeForTokens(env, code);
        await storeTokens(env, tokens);
        return new Response("Cuenta de eBay conectada correctamente. Ya puedes cerrar esta pestaña y volver a la app.", {
          headers: { "Content-Type": "text/plain; charset=utf-8" },
        });
      } catch (err) {
        return new Response("Error conectando con eBay: " + err.message, { status: 500 });
      }
    }

    if (url.pathname === "/api/status") {
      const tokens = await getStoredTokens(env);
      return json({ connected: !!tokens }, env);
    }

    if (url.pathname === "/api/sync/save" && request.method === "POST") {
      try {
        return await handleSyncSave(env, request);
      } catch (err) {
        return json({ error: err.message }, env, 500);
      }
    }

    if (url.pathname === "/api/sync/load" && request.method === "GET") {
      try {
        return await handleSyncLoad(env, request);
      } catch (err) {
        return json({ error: err.message }, env, 500);
      }
    }

    if (url.pathname === "/api/messages" && request.method === "GET") {
      try {
        return await handleGetMessages(env);
      } catch (err) {
        return json({ error: err.message }, env, 500);
      }
    }

    if (url.pathname === "/api/messages/reply" && request.method === "POST") {
      try {
        return await handleReply(env, request);
      } catch (err) {
        return json({ error: err.message }, env, 500);
      }
    }

    if (url.pathname === "/api/photos" && request.method === "POST") {
      try {
        return await handleUploadPhoto(env, request);
      } catch (err) {
        return json({ error: err.message }, env, 500);
      }
    }

    if (url.pathname.startsWith("/photo/") && request.method === "GET") {
      return await handlePhoto(env, url.pathname.slice("/photo/".length));
    }

    if (url.pathname === "/api/suggest-category" && request.method === "GET") {
      try {
        return await handleSuggestCategoryDebug(env, request);
      } catch (err) {
        return json({ error: err.message }, env, 500);
      }
    }

    if (url.pathname === "/api/shipping-services" && request.method === "GET") {
      try {
        return await handleShippingServicesDebug(env);
      } catch (err) {
        return json({ error: err.message }, env, 500);
      }
    }

    if (url.pathname === "/api/listings" && request.method === "POST") {
      try {
        return await handleCreateListing(env, request);
      } catch (err) {
        return json({ error: err.message }, env, 500);
      }
    }

    return new Response("Not found", { status: 404 });
  },
};
