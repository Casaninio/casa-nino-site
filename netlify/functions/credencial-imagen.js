// netlify/functions/credencial-imagen.js
//
// Sirve la imagen PNG de una credencial ya generada, guardada en Netlify Blobs.
// URL pública: https://<tu-sitio>.netlify.app/.netlify/functions/credencial-imagen?id=CN-000123
// Esta es la URL que se usa como <img src="..."> embebida en el mail de bienvenida de Perfit.

const { getStore } = require('@netlify/blobs');

exports.handler = async function (event) {
  const id = event.queryStringParameters && event.queryStringParameters.id;

  if (!id) {
    return { statusCode: 400, body: 'Falta el parámetro id' };
  }

  const store = getStore('casa-nino-credenciales-imagenes');

  try {
    const arrayBuffer = await store.get(id, { type: 'arrayBuffer' });
    if (!arrayBuffer) {
      return { statusCode: 404, body: 'Credencial no encontrada' };
    }

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'image/png',
        // se cachea fuerte porque cada credencial es un archivo fijo una vez generado
        'Cache-Control': 'public, max-age=31536000, immutable',
      },
      body: Buffer.from(arrayBuffer).toString('base64'),
      isBase64Encoded: true,
    };
  } catch (err) {
    console.error('Error sirviendo credencial:', err.message);
    return { statusCode: 404, body: 'Credencial no encontrada' };
  }
};
