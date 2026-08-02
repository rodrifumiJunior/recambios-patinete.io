// Generador simulado de título y descripción a partir de los datos del artículo.
// Sustituye aquí la llamada a un modelo real con visión cuando se decida integrarlo;
// de momento no llama a ningún servicio externo ni necesita API key.

function pick(list) {
  return list[Math.floor(Math.random() * list.length)];
}

function conditionLabel(condition) {
  return condition === "nuevo" ? "nuevo" : "usado";
}

function buildTitle({ type, brand, condition }) {
  const cond = condition === "nuevo" ? "nuevo, a estrenar" : "usado, funcionando";
  const parts = [type?.trim(), brand?.trim()].filter(Boolean);
  const base = parts.join(" ");
  return base ? `${base} — ${cond}` : `Recambio de patinete — ${cond}`;
}

function buildDescription({ type, brand, condition, defect }) {
  const t = (type || "recambio de patinete eléctrico").trim();
  const b = brand?.trim();
  const condTxt = conditionLabel(condition);

  const openers = [
    `Se vende ${t}${b ? ` para ${b}` : ""}, estado ${condTxt}.`,
    `${t.charAt(0).toUpperCase() + t.slice(1)}${b ? ` compatible con ${b}` : ""}, en estado ${condTxt}.`,
    `A la venta: ${t}${b ? ` (${b})` : ""}. Estado: ${condTxt}.`,
  ];

  const bodyNew = [
    "A estrenar, nunca montado, se vende por sobrante de material.",
    "Pieza nueva sin usar, se entrega en su embalaje original si está disponible.",
  ];
  const bodyUsed = [
    "Retirado de un patinete en buen estado general, probado y funcionando correctamente antes de ponerlo a la venta.",
    "Procede de un desmontaje, revisado y comprobado su funcionamiento.",
  ];

  const defectTxt = defect?.trim()
    ? `Detalle a tener en cuenta: ${defect.trim()}.`
    : condition === "usado"
    ? "Sin desperfectos relevantes más allá del desgaste propio del uso."
    : "";

  const closers = [
    "Envío a coordinar con el comprador o entrega en mano. Cualquier duda sobre compatibilidad, pregunta antes de comprar.",
    "Se pueden enviar más fotos si las necesitas. Compatible con varios modelos: confirma el tuyo antes de comprar.",
    "Disponible para envío o recogida en mano. Pregunta cualquier duda técnica antes de la compra.",
  ];

  return [pick(openers), pick(condition === "nuevo" ? bodyNew : bodyUsed), defectTxt, pick(closers)]
    .filter(Boolean)
    .join(" ");
}

/** Genera un borrador de título + descripción. Determinista salvo por pequeñas
 *  variaciones de redacción (para simular "regenerar con IA"). */
export function generateDraft({ type, brand, condition, defect }) {
  return {
    title: buildTitle({ type, brand, condition }),
    description: buildDescription({ type, brand, condition, defect }),
  };
}

export function suggestCategory(type) {
  const t = (type || "").toLowerCase();
  if (t.includes("rueda") || t.includes("neumático") || t.includes("llanta")) return "Ruedas y neumáticos";
  if (t.includes("bater") || t.includes("celda")) return "Baterías";
  if (t.includes("placa") || t.includes("controlador")) return "Electrónica / controladoras";
  if (t.includes("cargador")) return "Cargadores";
  if (t.includes("freno")) return "Frenos";
  if (t.includes("pantalla") || t.includes("display")) return "Pantallas y displays";
  if (t.includes("luz") || t.includes("piloto") || t.includes("faro")) return "Iluminación";
  if (t.includes("manillar") || t.includes("mango")) return "Manillar y mangos";
  return "Recambios y piezas — patinete eléctrico";
}
