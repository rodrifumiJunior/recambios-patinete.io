// Icono SVG en línea, trazo fino consistente — sustituye a los emoji sueltos
// para dar una identidad visual propia y uniforme en toda la app.

const PATHS = {
  home: '<path d="M4 11.5 12 4l8 7.5"/><path d="M6 10v9a1 1 0 0 0 1 1h4v-6h2v6h4a1 1 0 0 0 1-1v-9"/>',
  grid: '<rect x="4" y="4" width="7" height="7" rx="1.5"/><rect x="13" y="4" width="7" height="7" rx="1.5"/><rect x="4" y="13" width="7" height="7" rx="1.5"/><rect x="13" y="13" width="7" height="7" rx="1.5"/>',
  plus: '<circle cx="12" cy="12" r="8.5"/><path d="M12 8.5v7M8.5 12h7"/>',
  clipboard: '<rect x="6" y="4.5" width="12" height="16" rx="2"/><path d="M9 4.5V4a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v.5"/><path d="M9 11h6M9 15h6"/>',
  layers: '<path d="M12 3 3 8l9 5 9-5-9-5Z"/><path d="m3 12 9 5 9-5"/><path d="m3 16 9 5 9-5"/>',
  message: '<path d="M4 5.5h16v11H9l-4 3.5v-3.5H4Z"/>',
  wrench: '<path d="M14.7 6.3a4 4 0 0 0-5.4 4.9L4 16.5V20h3.5l5.3-5.3a4 4 0 0 0 4.9-5.4l-2.6 2.6-2-2 2.6-2.6Z"/>',
  trend: '<path d="M4 16 10 10l4 4 6-7"/><path d="M15 7h5v5"/>',
  plug: '<path d="M9 3v5M15 3v5"/><path d="M6 8h12v4a6 6 0 0 1-12 0V8Z"/><path d="M12 18v3"/>',
  download: '<path d="M12 4v11"/><path d="m7.5 11 4.5 4.5L16.5 11"/><path d="M5 19.5h14"/>',
  search: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="m20 20-4.6-4.6"/>',
  sparkles: '<path d="M11 3.5 12.4 8l4.6 1.4-4.6 1.4L11 15l-1.4-4.2L5 9.4 9.6 8 11 3.5Z"/><path d="M18 15.5 18.8 18 21.2 18.8 18.8 19.6 18 22 17.2 19.6 14.8 18.8 17.2 18 18 15.5Z"/>',
  camera: '<path d="M4 8h3l1.5-2h7L17 8h3v11H4Z"/><circle cx="12" cy="13.5" r="3.2"/>',
  trash: '<path d="M5 7h14"/><path d="M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/><path d="M7 7l1 13h8l1-13"/>',
  check: '<path d="M4.5 12.5 9.5 17.5 19.5 6.5"/>',
  x: '<path d="M6 6 18 18M18 6 6 18"/>',
  link: '<path d="M9.5 14.5 14.5 9.5"/><path d="M11 6.5 13 4.5a4 4 0 0 1 5.5 5.5l-2 2"/><path d="M13 17.5 11 19.5a4 4 0 0 1-5.5-5.5l2-2"/>',
  save: '<path d="M5 4h11l3 3v13H5Z"/><path d="M8 4v6h8V4"/><path d="M8 14h8v6H8Z"/>',
  send: '<path d="m4 12 16-8-6 16-3-6-7-2Z"/>',
  refresh: '<path d="M19 5v5h-5"/><path d="M5 19v-5h5"/><path d="M19 10a7 7 0 0 0-12.5-3.5L5 8"/><path d="M5 14a7 7 0 0 0 12.5 3.5L19 16"/>',
  rocket: '<path d="M13.5 3.5c3.5.5 6 3 6.5 6.5-2 2-4 3.5-6.5 4-1-2-2-3-4-4 .5-2.5 2-4.5 4-6.5Z"/><path d="M9.5 14 4.5 19.5"/><path d="M8.5 10.5 5 9.5l2-3.5 3 1"/><path d="M13.5 15.5l1 3.5-3.5 2-1-3"/>',
  bulb: '<path d="M9 18h6"/><path d="M10 21h4"/><path d="M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2.1h5c0-.9.4-1.6 1-2.1A6 6 0 0 0 12 3Z"/>',
  wifioff: '<path d="m3 3 18 18"/><path d="M9 9.5a6 6 0 0 1 8 1.8"/><path d="M5.5 6.5A11 11 0 0 1 12 4a11 11 0 0 1 8 3.2"/><circle cx="12" cy="18" r="1.2"/>',
  handshake: '<path d="M2.5 13 7 8.5l2.5 2 3-3 6 5-3 3.5-1.5-1"/><path d="M14 16.5 12 18.5 9.5 16"/><path d="M7 8.5 3.5 12"/>',
  lock: '<rect x="5.5" y="10.5" width="13" height="9" rx="2"/><path d="M8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5"/>',
  globe: '<circle cx="12" cy="12" r="8.5"/><path d="M3.7 12h16.6"/><path d="M12 3.5c2.3 2.3 3.5 5.3 3.5 8.5s-1.2 6.2-3.5 8.5c-2.3-2.3-3.5-5.3-3.5-8.5S9.7 5.8 12 3.5Z"/>',
  warn: '<path d="M12 4 21 20H3Z"/><path d="M12 10v4.5"/><circle cx="12" cy="17.3" r=".2" fill="currentColor"/>',
  power: '<path d="M12 4v7"/><path d="M7 6.5a7 7 0 1 0 10 0"/>',
  menu: '<path d="M4 6.5h16M4 12h16M4 17.5h16"/>',
  copy: '<rect x="8.5" y="8.5" width="11" height="11" rx="2"/><path d="M15.5 8.5V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v7.5a2 2 0 0 0 2 2h2.5"/>',
  scooter: '<circle cx="6.5" cy="18" r="2.2"/><circle cx="17" cy="18" r="2.2"/><path d="M6.5 18h6l2-8h4"/><path d="M12.5 10 11 5.5H8.5"/>',
  thumbsup: '<path d="M7 20V10.5"/><path d="M7 10.5 10.5 4a2 2 0 0 1 3.6 1.7L13 9h4.5a2 2 0 0 1 1.9 2.6l-1.8 6A2 2 0 0 1 15.7 20H9.5A2.5 2.5 0 0 1 7 17.5"/>',
  hand: '<path d="M8 12.5V6a1.5 1.5 0 0 1 3 0v5"/><path d="M11 11V4.5a1.5 1.5 0 0 1 3 0V11"/><path d="M14 11.2V6a1.5 1.5 0 0 1 3 0v8.5"/><path d="M8 12.5 6.3 11a1.6 1.6 0 0 0-2.3 2.2l4.3 5A5 5 0 0 0 12 20h1.5a5 5 0 0 0 5-5v-3.8"/>',
  edit: '<path d="M4 19.5h4l10-10-4-4-10 10v4Z"/><path d="m13 6.5 4 4"/>',
  clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
  tag: '<path d="M11.5 4H5.5a1.5 1.5 0 0 0-1.5 1.5v6l9.5 9.5a1.5 1.5 0 0 0 2.1 0l6-6a1.5 1.5 0 0 0 0-2.1L11.5 4Z"/><circle cx="8.5" cy="8.5" r="1.3" fill="currentColor" stroke="none"/>',
};

/** Devuelve el marcado SVG de un icono. `cls` se añade a la clase para tamaño/color vía CSS. */
export function icon(name, cls = "") {
  const body = PATHS[name] || PATHS.grid;
  return `<svg class="icon${cls ? " " + cls : ""}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;
}
