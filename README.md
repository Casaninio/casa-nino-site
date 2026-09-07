# Casa Niño — sitio completo (landing + registro + función Brevo)

Esta carpeta es el sitio listo para deploy en Netlify:

```
index.html          → landing (carrousel, áreas, credencial)
registro.html        → formulario de registro conectado a Brevo
credencial.html       → página para ver y descargar la credencial
agenda.html            → talleres del mes
contacto.html           → formulario de contacto
images/               → todas las fotos, como archivos separados (no van embebidas en el HTML)
netlify/functions/registro.js → función que conecta el form con Brevo
netlify/functions/credencial-imagen.js → sirve la imagen de cada credencial
netlify.toml           → configuración de deploy, CORS y cache de imágenes
package.json           → dependencias de la función
```

## Por qué las imágenes están separadas del HTML

Antes, las fotos iban embebidas directo en el HTML (formato base64), lo que hacía
que la landing pesara **8 MB** y que cada visita — incluso de la misma persona
volviendo al sitio — descargara todo ese peso de nuevo.

Ahora son archivos `.webp` (formato liviano, misma calidad visual) sueltos en
`/images`, y `netlify.toml` le indica al navegador que los guarde en caché por
un año. Resultado: el HTML principal pasó a pesar ~28 KB, el total de imágenes
bajó a ~2,2 MB, y en visitas repetidas el navegador ni siquiera vuelve a
pedirlas. Esto multiplica varias veces la cantidad de visitas que soporta el
plan gratuito de Netlify antes de consumir los créditos mensuales.

## 1. Deploy en Netlify

1. Subí esta carpeta a un repositorio de GitHub (o arrastrala directo en
   [app.netlify.com/drop](https://app.netlify.com/drop) para un deploy manual rápido).
2. En Netlify: **Add new site → Import an existing project**, elegí el repo.
   Netlify va a detectar `netlify.toml` solo.
3. Deploy. Vas a obtener una URL tipo `https://tu-sitio.netlify.app`.
   La función queda disponible en:
   `https://tu-sitio.netlify.app/.netlify/functions/registro`

## 2. Variables de entorno

En Netlify: **Site configuration → Environment variables**, agregá:

| Variable | Valor |
|---|---|
| `BREVO_API_KEY` | La API key de tu cuenta Brevo (Configuración → SMTP y API → API Keys → "Generar una nueva API key") |
| `BREVO_LIST_ID_GENERAL` | ID de la lista donde entran los contactos generales (Contactos → Listas, el ID aparece al lado del nombre de la lista) |
| `BREVO_LIST_ID_EDUCADORES` | ID de la lista donde entran los educadores (puede ser la misma que la general si no querés separarlas) |

## 3. Crear los atributos en Brevo

A diferencia de otras plataformas, en Brevo los atributos del contacto se
identifican por **nombre** (no por ID numérico) — más simple de configurar.
Andá a **Contactos → Configuración → Atributos de contacto** y creá estos
atributos (tipo "Texto" salvo que se indique otra cosa), todos en MAYÚSCULAS:

- `CIUDAD`
- `PROVINCIA`
- `WHATSAPP`
- `TRABAJA_EDUCACION`
- `ROL`
- `TIPO_INSTITUCION`
- `NOMBRE_INSTITUCION`
- `INTERESES` — tipo **"Multiple choice"** (para que pueda guardar varios intereses a la vez)
- `NUMERO_CREDENCIAL`
- `TERMINO_EDUCADOR`
- `CREDENCIAL_IMAGEN_URL`
- `CREDENCIAL_PAGINA_URL`

Si preferís usar otros nombres, el único lugar que hay que ajustar es el
objeto `ATTR` al principio de `netlify/functions/registro.js`.

## 4. Conectar el formulario

Si `registro.html` se aloja en el **mismo sitio de Netlify** que la
función, no hay que tocar nada — la llamada a `/.netlify/functions/registro`
ya funciona relativa al dominio.

Si el HTML vive en **otro dominio** (por ejemplo, si la landing de Casa Niño
termina alojada en otro hosting), hay que reemplazar en el HTML:

```js
const FUNCTION_URL = '/.netlify/functions/registro';
```

por la URL completa de la función:

```js
const FUNCTION_URL = 'https://tu-sitio.netlify.app/.netlify/functions/registro';
```

El `netlify.toml` ya incluye los headers CORS necesarios para que esto
funcione desde cualquier origen.

## 5. Automatizar el mail de bienvenida con la credencial

Configurá una **Automation** en Brevo (Automatizaciones → Crear una automatización)
que se dispare cuando un contacto entra a la lista general o a la de
educadores, y que le envíe el mail de bienvenida.

Para personalizar ese mail con los datos de cada persona, insertá los
atributos como variables de personalización dentro del editor de mails de
Brevo (el editor te los sugiere solos al escribir `{{` — la sintaxis es
`{{ contact.NOMBRE_DEL_ATRIBUTO }}`):

- Nombre → `{{ contact.FNAME }}`
- Número de credencial → `{{ contact.NUMERO_CREDENCIAL }}`
- "Educador" / "Educadora" → `{{ contact.TERMINO_EDUCADOR }}`. Como ese atributo
  queda vacío para quienes no son educadores, usá el bloque condicional del
  editor de Brevo (`{% if contact.TERMINO_EDUCADOR %}...{% endif %}`) para
  mostrar esa frase solo cuando corresponde.
- La imagen de la credencial → insertá una imagen en el mail y, en vez de
  subir un archivo, pegá como URL: `{{ contact.CREDENCIAL_IMAGEN_URL }}`.
- Botón "Ver y guardar mi credencial" → linkealo a `{{ contact.CREDENCIAL_PAGINA_URL }}`.

## 6. Generación automática de la credencial (imagen personalizada)

Cada registro genera automáticamente una imagen PNG de la credencial (nombre,
número correlativo y "Educador/a" cuando corresponde), usando el diseño real
que definiste. Así funciona la cadena completa:

1. `netlify/functions/lib/credencial-template.js` arma el SVG de la credencial
   con los datos de la persona.
2. `netlify/functions/lib/generar-credencial.js` rasteriza ese SVG a PNG
   (usando `@resvg/resvg-js`).
3. `registro.js` guarda esa imagen en Netlify Blobs, y le pasa a Brevo dos
   atributos nuevos: `CREDENCIAL_IMAGEN_URL` (para embeber la imagen directo en
   el mail) y `CREDENCIAL_PAGINA_URL` (una página donde la persona puede ver la
   credencial grande y guardarla en su celular).
4. `netlify/functions/credencial-imagen.js` sirve esa imagen públicamente.
5. `credencial.html` es la página de "ver y guardar" mi credencial.

### Paso obligatorio antes de deployar: agregar las fuentes

Este entorno de desarrollo no tiene acceso a internet, así que no pude
descargar los archivos de fuente por vos. Antes de deployar, descargá estos
tres archivos y colocalos en `netlify/functions/assets/fonts/`:

- `Fraunces-Bold.ttf` → desde [Google Fonts: Fraunces](https://fonts.google.com/specimen/Fraunces) (peso 700)
- `WorkSans-Regular.ttf` → desde [Google Fonts: Work Sans](https://fonts.google.com/specimen/Work+Sans) (peso 400)
- `WorkSans-Bold.ttf` → desde [Google Fonts: Work Sans](https://fonts.google.com/specimen/Work+Sans) (peso 700)

Sin estos archivos, la función tira error al generar la credencial (a propósito
— preferimos que falle claro a que salga con una tipografía distinta a la del
sitio).

### Sobre Apple Wallet / Google Wallet

`credencial.html` ya tiene el botón para esto, pero deshabilitado — la persona
puede descargar la imagen a su galería hoy mismo, pero agregarla como pase real
de Wallet es una integración aparte (cuenta de Apple Developer con certificado
de firma + cuenta de Google Wallet Issuer), pendiente para una próxima etapa.
