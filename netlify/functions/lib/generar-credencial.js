// netlify/functions/lib/generar-credencial.js
//
// Convierte el SVG de la credencial (credencial-template.js) en una imagen PNG
// usando @resvg/resvg-js (motor de render en Rust, corre bien en Netlify Functions).
//
// IMPORTANTE — fuentes: hay que descargar dos archivos de fuente y colocarlos en
// netlify/functions/assets/fonts/ antes de deployar (no se pueden generar acá
// porque este entorno de desarrollo no tiene acceso a internet):
//   - Fraunces-Bold.ttf     → https://fonts.google.com/specimen/Fraunces (peso 700)
//   - WorkSans-Regular.ttf  → https://fonts.google.com/specimen/Work+Sans (peso 400)
//   - WorkSans-Bold.ttf     → https://fonts.google.com/specimen/Work+Sans (peso 700)
// Sin estos archivos, la función va a tirar error al arrancar (no hay fallback
// silencioso a propósito: preferimos que falle claro a que la credencial salga
// con una tipografía que no es la del sitio).

const fs = require('fs');
const path = require('path');
const { Resvg } = require('@resvg/resvg-js');
const { buildCredencialSVG } = require('./credencial-template');

const FONTS_DIR = path.join(__dirname, '..', 'assets', 'fonts');
const FONT_FILES = ['Fraunces-Bold.ttf', 'WorkSans-Regular.ttf', 'WorkSans-Bold.ttf'];

function checkFontsExist() {
  const faltantes = FONT_FILES.filter((f) => !fs.existsSync(path.join(FONTS_DIR, f)));
  if (faltantes.length) {
    throw new Error(
      `Faltan archivos de fuente en netlify/functions/assets/fonts/: ${faltantes.join(', ')}. ` +
      `Ver instrucciones en la cabecera de este archivo.`
    );
  }
}

/**
 * Genera la imagen PNG final de la credencial.
 * @param {Object} data - { nombre, numeroCredencial, terminoEducador }
 * @returns {Buffer} PNG
 */
function generarCredencialPNG(data) {
  checkFontsExist();

  const svg = buildCredencialSVG(data);

  const resvg = new Resvg(svg, {
    font: {
      fontFiles: FONT_FILES.map((f) => path.join(FONTS_DIR, f)),
      loadSystemFonts: false,
      defaultFontFamily: 'Work Sans',
    },
    fitTo: { mode: 'width', value: 1024 },
  });

  const pngData = resvg.render();
  return pngData.asPng();
}

module.exports = { generarCredencialPNG };
