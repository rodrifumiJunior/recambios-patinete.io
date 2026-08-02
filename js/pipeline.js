// Fases del pedido para la vista de CRM. El cambio de fase siempre lo hace la
// persona vendedora a mano — nada se mueve solo de una fase a otra.

export const ORDER_STAGES = [
  { key: "disponible", label: "Disponible", badge: "badge-info" },
  { key: "negociando", label: "En conversación / negociando", badge: "badge-draft" },
  { key: "reservado", label: "Reservado", badge: "badge-draft" },
  { key: "vendido", label: "Vendido", badge: "badge-approved" },
  { key: "enviado", label: "Enviado", badge: "badge-approved" },
  { key: "completado", label: "Completado", badge: "badge-approved" },
  { key: "cancelado", label: "Cancelado", badge: "badge-sold" },
];

export function stageMeta(key) {
  return ORDER_STAGES.find((s) => s.key === key) || ORDER_STAGES[0];
}
