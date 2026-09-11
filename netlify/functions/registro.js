// netlify/functions/registro.js
//
// Recibe los datos del formulario de registro de Casa Niño y crea/actualiza
// el contacto en Brevo (API v3), asignando la lista y guardando los intereses
// y demás datos como atributos del contacto.
//
// Documentación usada como referencia:
// https://developers.brevo.com/reference/create-contact
// https://developers.brevo.com/docs/synchronise-contact-lists

const axios = require('axios');
const { getStore } = require('@netlify/blobs');
const { generarCredencialPNG } = require('./lib/generar-credencial');

// ─────────────────────────────────────────────────────────────
// Netlify Blobs a veces falla con "MissingBlobsEnvironmentError" incluso
// con todo bien configurado (bug conocido de la plataforma). Para evitarlo,
// le pasamos siteID y token de forma explícita en vez de depender de la
// detección automática. Necesita 2 variables de entorno adicionales:
// NETLIFY_BLOBS_SITE_ID y NETLIFY_BLOBS_TOKEN (ver README).
// ─────────────────────────────────────────────────────────────
function getBlobStore(name) {
  const siteID = process.env.NETLIFY_BLOBS_SITE_ID;
  const token = process.env.NETLIFY_BLOBS_TOKEN;
  if (siteID && token) {
    return getStore({ name, siteID, token });
  }
  return getStore(name); // fallback a la detección automática
}

// ─────────────────────────────────────────────────────────────
// Número de credencial — contador persistente usando Netlify Blobs
// (incluido en el plan free de Netlify, no requiere ningún servicio externo).
// Formato final: CN-000123
// ─────────────────────────────────────────────────────────────
async function getNextCredentialNumber() {
  const store = getBlobStore('casa-nino-credenciales');
  const current = await store.get('contador', { type: 'text' });
  const next = (current ? parseInt(current, 10) : 0) + 1;
  await store.set('contador', String(next));
  return `CN-${String(next).padStart(6, '0')}`;
}

// ─────────────────────────────────────────────────────────────
// CONFIGURACIÓN — completar con los IDs reales de tus listas de Brevo
// (Contactos → Listas, cada una muestra su ID numérico al lado del nombre).
// ─────────────────────────────────────────────────────────────
const LIST_ID_GENERAL = process.env.BREVO_LIST_ID_GENERAL;       // ej: 3
const LIST_ID_EDUCADORES = process.env.BREVO_LIST_ID_EDUCADORES; // ej: 4

// ─────────────────────────────────────────────────────────────
// A diferencia de Perfit, en Brevo los "atributos" del contacto se identifican
// por NOMBRE (no por ID numérico), y hay que crearlos una sola vez en el panel:
// Contactos → Configuración → Atributos de contacto. Los nombres van en
// MAYÚSCULAS por convención de Brevo. Si el nombre de tu atributo en Brevo es
// distinto al de acá, solo hay que cambiar el string de la derecha.
//
// IMPORTANTE sobre "telefono": este es un atributo de texto libre CREADO POR
// NOSOTROS (Contactos → Configuración → Atributos → tipo "Texto"), NO el
// campo nativo "WHATSAPP" de Brevo. El campo nativo WHATSAPP habilita el
// canal de envío de WhatsApp marketing y por eso Brevo le exige un formato
// de teléfono válido y estricto (con código de país, etc.), rechazando el
// contacto ENTERO si no lo cumple — eso fue justamente lo que causó que se
// perdieran registros el 11/9. Usando un atributo de texto propio en su
// lugar, Brevo no valida el formato en absoluto: acepta cualquier cosa que
// la persona haya escrito, sin excepciones ni rechazos.
//
// Contrapartida a tener en cuenta: como no se usa el campo nativo, estos
// contactos NO quedan habilitados automáticamente para el canal de WhatsApp
// marketing de Brevo. Si en el futuro se quiere usar ese canal, hay que
// migrar/validar los números por separado en ese momento.
// ─────────────────────────────────────────────────────────────
const ATTR = {
  ciudad: 'CIUDAD',
  provincia: 'PROVINCIA',
  telefono: 'TELEFONO',
  trabajaEducacion: 'TRABAJA_EDUCACION',
  rol: 'ROL',
  tipoInstitucion: 'TIPO_INSTITUCION',
  nombreInstitucion: 'NOMBRE_INSTITUCION',
  intereses: 'INTERESES',              // atributo tipo "multiple-choice" (acepta lista de strings)
  numeroCredencial: 'NUMERO_CREDENCIAL',
  terminoEducador: 'TERMINO_EDUCADOR',
  credencialImagenUrl: 'CREDENCIAL_IMAGEN_URL',
  credencialPaginaUrl: 'CREDENCIAL_PAGINA_URL',
};

function buildAttributes(data, credentialNumber, credencialImagenUrl, credencialPaginaUrl, firstName, lastName) {
  const attrs = {
    NOMBRE: firstName,
    APELLIDOS: lastName,
    [ATTR.ciudad]: data.ciudad,
    [ATTR.provincia]: data.provincia,
    [ATTR.trabajaEducacion]: data.trabaja_educacion ? 'Sí' : 'No',
    [ATTR.numeroCredencial]: credentialNumber,
  };

  // Se guarda tal cual lo escribió la persona (recortando espacios de más al
  // principio/final), sin ninguna validación de formato — ver nota en ATTR
  // sobre por qué este campo es de texto libre y no el WHATSAPP nativo.
  if (data.whatsapp && String(data.whatsapp).trim()) {
    attrs[ATTR.telefono] = String(data.whatsapp).trim();
  }

  if (data.intereses && data.intereses.length) attrs[ATTR.intereses] = data.intereses;
  if (credencialImagenUrl) attrs[ATTR.credencialImagenUrl] = credencialImagenUrl;
  if (credencialPaginaUrl) attrs[ATTR.credencialPaginaUrl] = credencialPaginaUrl;

  // IMPORTANTE: si la persona indica que NO trabaja en educación, hay que
  // BORRAR explícitamente estos campos (mandando string vacío) en vez de
  // simplemente omitirlos. Si solo se omiten, Brevo conserva el valor viejo
  // de un registro anterior (por ejemplo, si la misma persona se había
  // registrado antes como educador y ahora corrige el dato) — eso causaba
  // que el mail de bienvenida siguiera mostrando el bloque de "Educador/a"
  // aunque la persona ya no lo fuera.
  if (data.trabaja_educacion) {
    attrs[ATTR.rol] = data.rol || '';
    attrs[ATTR.tipoInstitucion] = data.tipo_institucion || '';
    attrs[ATTR.nombreInstitucion] = data.nombre_institucion || '';
    attrs[ATTR.terminoEducador] = data.termino_educador || '';
  } else {
    attrs[ATTR.rol] = '';
    attrs[ATTR.tipoInstitucion] = '';
    attrs[ATTR.nombreInstitucion] = '';
    attrs[ATTR.terminoEducador] = '';
  }

  return attrs;
}

function splitName(fullName) {
  const parts = (fullName || '').trim().split(/\s+/);
  const firstName = parts.shift() || '';
  const lastName = parts.join(' ');
  return { firstName, lastName };
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

  // Validación mínima del lado servidor (además de la del navegador).
  if (!data.email || !data.nombre || !data.ciudad || !data.provincia) {
    return {
      statusCode: 400,
      body: JSON.stringify({ ok: false, error: 'missing_required_fields' }),
    };
  }

  const apiKey = process.env.BREVO_API_KEY;
  if (!apiKey) {
    console.error('Falta la variable de entorno BREVO_API_KEY');
    return { statusCode: 500, body: JSON.stringify({ ok: false, error: 'server_misconfigured' }) };
  }

  const listId = data.trabaja_educacion ? LIST_ID_EDUCADORES : LIST_ID_GENERAL;
  if (!listId) {
    console.error('Falta configurar BREVO_LIST_ID_GENERAL / BREVO_LIST_ID_EDUCADORES');
    return { statusCode: 500, body: JSON.stringify({ ok: false, error: 'server_misconfigured' }) };
  }

  const { firstName, lastName } = splitName(data.nombre);
  const credentialNumber = await getNextCredentialNumber();

  // ── Generar la imagen de la credencial y guardarla ──
  // (si falla, no cortamos el registro — la persona igual queda anotada en
  // Brevo, solo que sin la imagen; se ve el error en los logs de Netlify)
  let credencialImagenUrl = null;
  let credencialPaginaUrl = null;
  const siteUrl = process.env.URL || process.env.SITE_URL || '';
  try {
    const png = generarCredencialPNG({
      nombre: data.nombre,
      numeroCredencial: credentialNumber,
      terminoEducador: data.trabaja_educacion ? data.termino_educador : null,
    });
    const imagenesStore = getBlobStore('casa-nino-credenciales-imagenes');
    await imagenesStore.set(credentialNumber, png);
    if (siteUrl) {
      credencialImagenUrl = `${siteUrl}/.netlify/functions/credencial-imagen?id=${credentialNumber}`;
      credencialPaginaUrl = `${siteUrl}/credencial.html?id=${credentialNumber}`;
    }
  } catch (err) {
    console.error('Error generando la imagen de la credencial:', err.message);
  }

  const contactPayload = {
    email: data.email,
    attributes: buildAttributes(data, credentialNumber, credencialImagenUrl, credencialPaginaUrl, firstName, lastName),
    listIds: [Number(listId)],
    updateEnabled: true, // si el mail ya existe, actualiza en vez de fallar
  };

  try {
    const response = await axios.post(
      'https://api.brevo.com/v3/contacts',
      contactPayload,
      { headers: { 'api-key': apiKey, 'Content-Type': 'application/json', Accept: 'application/json' } }
    );

    return {
      statusCode: 200,
      body: JSON.stringify({
        ok: true,
        credentialNumber,
        credencialImagenUrl,
        credencialPaginaUrl,
        contact: response.data,
      }),
    };
  } catch (err) {
    console.error('Error al crear contacto en Brevo:', err.response?.data || err.message);
    return {
      statusCode: 502,
      body: JSON.stringify({ ok: false, error: 'brevo_request_failed' }),
    };
  }
};
