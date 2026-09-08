// netlify/functions/contacto.js
//
// Recibe el formulario de contacto de Casa Niño:
// 1. Guarda/actualiza el contacto en Brevo, en una lista separada
//    ("Casa Niño - Contacto") para no disparar la Automation de bienvenida,
//    que es solo para quienes se registran en registro.html.
// 2. Envía una notificación por mail a la casilla de Casa Niño con el
//    mensaje, usando la API transaccional de Brevo. Esto se hace siempre,
//    incluso si la misma persona ya había escrito antes — a diferencia de
//    una Automation (que solo se dispara la primera vez que alguien entra
//    a una lista), este envío es directo y no depende del historial previo
//    del contacto.

const axios = require('axios');

const LIST_ID_CONTACTO = process.env.BREVO_LIST_ID_CONTACTO; // ID de la lista "Casa Niño - Contacto"
const NOTIFY_TO = 'casa@ninioeditor.com';
const SENDER = { name: 'Casa Niño', email: 'info@ninioeditor.com' };

function splitName(fullName) {
  const parts = (fullName || '').trim().split(/\s+/);
  const firstName = parts.shift() || '';
  const lastName = parts.join(' ');
  return { firstName, lastName };
}

// Escapa texto para insertarlo de forma segura dentro del HTML del mail.
function escapeHTML(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

exports.handler = async function (event) {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  let data;
  try {
    data = JSON.parse(event.body);
  } catch (e) {
    return { statusCode: 400, body: JSON.stringify({ ok: false, error: 'invalid_json' }) };
  }

  const nombre = (data.nombre || '').trim();
  const email = (data.email || '').trim();
  const mensaje = (data.mensaje || '').trim();

  if (!nombre || !email || !mensaje) {
    return { statusCode: 400, body: JSON.stringify({ ok: false, error: 'missing_required_fields' }) };
  }

  const apiKey = process.env.BREVO_API_KEY;
  if (!apiKey) {
    console.error('Falta la variable de entorno BREVO_API_KEY');
    return { statusCode: 500, body: JSON.stringify({ ok: false, error: 'server_misconfigured' }) };
  }

  const { firstName, lastName } = splitName(nombre);

  // ── 1. Guardar/actualizar el contacto en Brevo ──
  // Si esto falla, no cortamos el flujo — igual intentamos mandar la
  // notificación por mail, que es lo más urgente (que Casa Niño se entere
  // del mensaje). El error queda registrado en los logs de Netlify.
  try {
    const contactPayload = {
      email,
      attributes: {
        NOMBRE: firstName,
        APELLIDOS: lastName,
        MENSAJE_CONTACTO: mensaje,
      },
      updateEnabled: true,
    };
    if (LIST_ID_CONTACTO) {
      contactPayload.listIds = [Number(LIST_ID_CONTACTO)];
    }
    await axios.post('https://api.brevo.com/v3/contacts', contactPayload, {
      headers: { 'api-key': apiKey, 'Content-Type': 'application/json', Accept: 'application/json' },
    });
  } catch (err) {
    console.error('Error al guardar el contacto en Brevo:', err.response?.data || err.message);
  }

  // ── 2. Enviar notificación por mail a Casa Niño ──
  try {
    await axios.post(
      'https://api.brevo.com/v3/smtp/email',
      {
        sender: SENDER,
        to: [{ email: NOTIFY_TO }],
        replyTo: { email, name: nombre },
        subject: `Nuevo mensaje de contacto de ${nombre}`,
        htmlContent: `
          <div style="font-family: Arial, sans-serif; font-size: 15px; line-height:1.6; color:#39250C;">
            <p><strong>Nombre:</strong> ${escapeHTML(nombre)}</p>
            <p><strong>Email:</strong> ${escapeHTML(email)}</p>
            <p><strong>Mensaje:</strong></p>
            <p>${escapeHTML(mensaje).replace(/\n/g, '<br>')}</p>
          </div>
        `,
      },
      { headers: { 'api-key': apiKey, 'Content-Type': 'application/json', Accept: 'application/json' } }
    );
  } catch (err) {
    console.error('Error al enviar la notificación por mail:', err.response?.data || err.message);
    return { statusCode: 502, body: JSON.stringify({ ok: false, error: 'notification_failed' }) };
  }

  return { statusCode: 200, body: JSON.stringify({ ok: true }) };
};
