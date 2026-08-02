// Asistente de ofertas: SOLO sugiere. Nunca acepta, rechaza ni envía nada por su cuenta.
// La decisión y el envío del mensaje final los confirma siempre la persona vendedora.

function round1(n) {
  return Math.round(n * 10) / 10;
}

/**
 * @param {{price:number, minPrice:number|null, offers:Array}} item
 * @param {number} buyerOffer
 * @param {string} platform
 * @returns {{action:'aceptar'|'contraofertar'|'rechazar', message:string, counterPrice:number|null, priority:boolean, reason:string}}
 */
export function generateSuggestion(item, buyerOffer, platform) {
  const price = Number(item.price) || 0;
  const minPrice = item.minPrice !== null && item.minPrice !== undefined ? Number(item.minPrice) : round1(price * 0.8);
  const priorOffersCount = (item.offers || []).length;

  let action;
  let message;
  let counterPrice = null;

  if (buyerOffer >= price) {
    action = "aceptar";
    message = `¡Hola! Sin problema, acepto los ${buyerOffer}€. Cuando quieras coordinamos la entrega/envío.`;
  } else if (buyerOffer >= minPrice) {
    action = "aceptar";
    message = `¡Hola! Te lo dejo en ${buyerOffer}€, trato hecho. Dime cómo prefieres quedar para la entrega/envío.`;
  } else if (buyerOffer >= minPrice * 0.85) {
    counterPrice = Math.max(buyerOffer + 1, round1((buyerOffer + minPrice) / 2));
    action = "contraofertar";
    message = `Gracias por el interés. No puedo bajar hasta ${buyerOffer}€, pero te lo puedo dejar en ${counterPrice}€. ¿Te encaja?`;
  } else {
    action = "rechazar";
    message = `Gracias por la oferta, pero ${buyerOffer}€ se queda muy por debajo de lo que puedo aceptar por este artículo. Si cambias de idea, aquí estoy.`;
  }

  const veryLow = buyerOffer < minPrice * 0.5;
  const highValue = price >= 100;
  const insistentBuyer = priorOffersCount >= 2;
  const priority = veryLow || highValue || insistentBuyer;

  const reasons = [];
  if (veryLow) reasons.push("oferta muy por debajo del mínimo");
  if (highValue) reasons.push("artículo de alto valor");
  if (insistentBuyer) reasons.push("ya hay varias ofertas en este artículo");

  return {
    action,
    message,
    counterPrice,
    priority,
    reason: reasons.join(" · "),
    price,
    minPrice,
  };
}

export const OFFER_ACTION_LABELS = {
  aceptar: "Aceptar",
  contraofertar: "Contraofertar",
  rechazar: "Rechazar",
};
