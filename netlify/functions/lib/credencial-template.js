// netlify/functions/lib/credencial-template.js
//
// Arma el SVG de la credencial de Casa Niño con los datos de cada persona.
// El SVG se rasteriza a PNG en generar-credencial.js usando @resvg/resvg-js.

const fs = require('fs');
const path = require('path');

function fileToDataURI(filePath, mime) {
  const data = fs.readFileSync(filePath);
  return `data:${mime};base64,${data.toString('base64')}`;
}

const LOGO_URI = fileToDataURI(path.join(__dirname, '..', 'assets', 'logo.png'), 'image/png');
const ILUSTRACION_URI = fileToDataURI(path.join(__dirname, '..', 'assets', 'credencial-ilustracion.png'), 'image/png');

// Escapa texto para que sea seguro insertarlo dentro de un SVG (XML).
function escapeXML(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * @param {Object} data
 * @param {string} data.nombre - Nombre completo de la persona.
 * @param {string} data.numeroCredencial - Ej: "CN-000123" (se muestra como "N° 000123").
 * @param {string|null} data.terminoEducador - "Educador" | "Educadora" | null si no es educador.
 * @returns {string} SVG completo, listo para rasterizar.
 */
function buildCredencialSVG({ nombre, numeroCredencial, terminoEducador }) {
  const nombreSafe = escapeXML(nombre);
  const numeroLimpio = String(numeroCredencial || '').replace(/^CN-0*/, ''); // "CN-000123" -> "123"
  const numeroSafe = escapeXML(numeroLimpio.padStart(6, '0'));

  const rolBlock = terminoEducador
    ? `<text x="85" y="723" font-family="Work Sans" font-weight="700" font-size="24" letter-spacing="1.5" fill="#C57913">${escapeXML(terminoEducador.toUpperCase())}</text>`
    : '';
  // Si hay rol, el número baja un poco para no pisarlo.
  const numeroY = terminoEducador ? 800 : 760;

  return `<svg width="1024" height="1536" viewBox="0 0 1024 1536" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink">
  <rect width="1024" height="1536" fill="#FFE573"/>

  <!-- logo -->
  <image href="${LOGO_URI}" xlink:href="${LOGO_URI}" x="362" y="55" width="300" height="186" preserveAspectRatio="xMidYMid meet"/>

  <!-- áreas -->
  <text x="512" y="360" text-anchor="middle" font-family="Work Sans" font-weight="700" font-size="21" letter-spacing="2" fill="#C57913">EDITORIAL&#160;&#160;&#160;|&#160;&#160;&#160;LIBRERÍA&#160;&#160;&#160;|&#160;&#160;&#160;PROYECTOS&#160;&#160;&#160;|&#160;&#160;&#160;EDUCACIÓN</text>

  <!-- ilustración decorativa (marca de agua, detrás del texto inferior) -->
  <image href="${ILUSTRACION_URI}" xlink:href="${ILUSTRACION_URI}" x="47" y="769" width="977" height="480" opacity="0.17" preserveAspectRatio="xMidYMid meet"/>

  <!-- nombre -->
  <text x="85" y="632" font-family="Fraunces" font-weight="700" font-size="64" fill="#39250C">${nombreSafe}</text>

  <!-- línea corta -->
  <line x1="85" y1="665" x2="160" y2="665" stroke="#39250C" stroke-width="4"/>

  <!-- rol (solo educadores) -->
  ${rolBlock}

  <!-- número de credencial -->
  <text x="85" y="${numeroY}" font-family="Fraunces" font-weight="700" font-size="42" fill="#C57913">N° ${numeroSafe}</text>

  <!-- párrafo fijo -->
  <text x="85" y="${numeroY + 85}" font-family="Work Sans" font-size="25" fill="#39250C">No te pierdas ningún beneficio. Tené siempre tu</text>
  <text x="85" y="${numeroY + 120}" font-family="Work Sans" font-size="25" fill="#39250C">credencial digital a mano, en el teléfono.</text>

  <!-- línea separadora -->
  <line x1="85" y1="1290" x2="940" y2="1290" stroke="#39250C" stroke-width="2"/>

  <!-- dirección -->
  <g transform="translate(85,1318)">
    <path d="M9 0C4 0 0 4 0 9c0 7 9 17 9 17s9-10 9-17c0-5-4-9-9-9z" fill="#39250C"/>
    <circle cx="9" cy="9" r="3.4" fill="#FFE573"/>
  </g>
  <text x="120" y="1332" font-family="Work Sans" font-size="24" fill="#39250C">Donado 1652.</text>
  <text x="120" y="1364" font-family="Work Sans" font-size="24" fill="#39250C">Villa Ortúzar. CABA.</text>

  <!-- whatsapp -->
  <g transform="translate(85,1400)">
    <path d="M9 0a9 9 0 0 0-7.8 13.5L0 22l8.7-1.1A9 9 0 1 0 9 0z" fill="none" stroke="#C57913" stroke-width="1.6"/>
  </g>
  <text x="120" y="1416" font-family="Work Sans" font-weight="600" font-size="24" fill="#C57913">+54 9 11 5638 6986</text>
</svg>`;
}

module.exports = { buildCredencialSVG };
