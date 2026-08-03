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

const EBAY_OAUTH_AUTHORIZE_URL = "https://auth.ebay.com/oauth2/authorize";
const EBAY_OAUTH_TOKEN_URL = "https://api.ebay.com/identity/v1/oauth2/token";
const EBAY_TRADING_API_URL = "https://api.ebay.com/ws/api.dll";
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
    "Access-Control-Allow-Headers": "Content-Type",
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

function escapeXml(str) {
  return String(str || "").replace(/[<>&'"]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", "'": "&apos;", '"': "&quot;" }[c]));
}

function textBetween(xml, tag) {
  const m = xml.match(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`));
  return m ? m[1] : "";
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

async function getSellerProfiles(env, accessToken) {
  const requestXml = `<?xml version="1.0" encoding="utf-8"?>
<GetUserPreferencesRequest xmlns="urn:ebay:apis:eBLBaseComponents">
  <ShowSellerProfilePreferences>true</ShowSellerProfilePreferences>
</GetUserPreferencesRequest>`;
  const resp = await fetch(EBAY_TRADING_API_URL, {
    method: "POST",
    headers: tradingApiHeaders(env, "GetUserPreferences", accessToken),
    body: requestXml,
  });
  const xml = await resp.text();
  if (!resp.ok || xml.includes("<Ack>Failure</Ack>")) {
    throw new Error("No se pudieron obtener las políticas de negocio de eBay: " + xml.slice(0, 1500));
  }
  const profiles = { payment: null, shipping: null, return: null };
  const blocks = xml.split("<SupportedSellerProfile>").slice(1);
  for (const block of blocks) {
    const type = textBetween(block, "ProfileType");
    const id = textBetween(block, "ProfileID");
    if (type.includes("PAYMENT") && !profiles.payment) profiles.payment = id;
    if (type.includes("SHIPPING") && !profiles.shipping) profiles.shipping = id;
    if (type.includes("RETURN") && !profiles.return) profiles.return = id;
  }
  return profiles;
}

async function suggestCategoryId(env, accessToken, query) {
  const requestXml = `<?xml version="1.0" encoding="utf-8"?>
<GetSuggestedCategoriesRequest xmlns="urn:ebay:apis:eBLBaseComponents">
  <Query>${escapeXml(query)}</Query>
</GetSuggestedCategoriesRequest>`;
  const resp = await fetch(EBAY_TRADING_API_URL, {
    method: "POST",
    headers: tradingApiHeaders(env, "GetSuggestedCategories", accessToken),
    body: requestXml,
  });
  const xml = await resp.text();
  if (!resp.ok || xml.includes("<Ack>Failure</Ack>")) return null;
  return textBetween(xml, "CategoryID") || null;
}

async function handleCreateListing(env, request) {
  const accessToken = await getValidAccessToken(env);
  if (!accessToken) return json({ error: "No hay una cuenta de eBay conectada todavía." }, env, 400);

  const body = await request.json();
  const { title, description, price, quantity, conditionId, minOfferPrice, autoAcceptPrice, pictureUrls, categoryId: providedCategoryId } = body;
  if (!title || !description || !price || !pictureUrls?.length) {
    return json({ error: "Faltan datos obligatorios: título, descripción, precio o fotos." }, env, 400);
  }

  let categoryId = providedCategoryId;
  if (!categoryId) {
    categoryId = await suggestCategoryId(env, accessToken, title);
  }
  if (!categoryId) {
    return json({ error: "No se pudo sugerir una categoría de eBay automáticamente para ese título. Indica una categoría manualmente." }, env, 400);
  }

  let profiles;
  try {
    profiles = await getSellerProfiles(env, accessToken);
  } catch (err) {
    return json({ error: err.message }, env, 500);
  }
  if (!profiles.payment || !profiles.shipping || !profiles.return) {
    return json(
      {
        error:
          "Tu cuenta de eBay no tiene políticas de negocio (pago/envío/devolución) configuradas. Ve a eBay > Configuración de la cuenta > Políticas de negocio y créalas antes de publicar por API.",
      },
      env,
      400
    );
  }

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
    <DispatchTimeMax>3</DispatchTimeMax>
    <ListingDuration>GTC</ListingDuration>
    <ListingType>FixedPriceItem</ListingType>
    <Quantity>${Number(quantity) || 1}</Quantity>
    <PictureDetails>${picturesXml}</PictureDetails>
    <SellerProfiles>
      <SellerPaymentProfile><PaymentProfileID>${escapeXml(profiles.payment)}</PaymentProfileID></SellerPaymentProfile>
      <SellerReturnProfile><ReturnProfileID>${escapeXml(profiles.return)}</ReturnProfileID></SellerReturnProfile>
      <SellerShippingProfile><ShippingProfileID>${escapeXml(profiles.shipping)}</ShippingProfileID></SellerShippingProfile>
    </SellerProfiles>${bestOfferXml}
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
