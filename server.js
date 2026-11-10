require('dotenv').config();
const express = require('express');
const fs = require('fs');
const path = require('path');
const jwt = require('jsonwebtoken');
const db = require('./db');
const media = require('./media-store');

const app = express();
const PORT = process.env.PORT || 3001;
const WHATSAPP_NUM = process.env.WHATSAPP_NUM || '529990000000';
const JWT_SECRET = process.env.JWT_SECRET || (process.env.NODE_ENV === 'production' ? '' : 'dev_only_change_me_before_production');
if (!JWT_SECRET) throw new Error('Configura JWT_SECRET seguro para iniciar el servidor en producción');

function archivoPublico(nombre) {
  const enPublic = path.join(__dirname, 'public', nombre);
  return fs.existsSync(enPublic) ? enPublic : path.join(__dirname, nombre);
}

function vistaCotizacion() {
  const enViews = path.join(__dirname, 'views', 'cotizacion.ejs');
  return fs.existsSync(enViews) ? enViews : path.join(__dirname, 'cotizacion.ejs');
}

const ADMIN_USER = process.env.ADMIN_USER || 'admin';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || Math.random().toString(36).slice(2, 14);

function authAdmin(req, res, next) {
  const cab = req.headers.authorization || '';
  const cred = Buffer.from(cab.replace(/^Basic\s+/i, ''), 'base64').toString();
  const [user, pass] = cred.split(':');
  if (user === ADMIN_USER && pass === ADMIN_PASSWORD) return next();
  res.set('WWW-Authenticate', 'Basic realm="Panel Proyecto 7"');
  res.status(401).send('Acceso restringido');
}

function authMiembro(req, res, next) {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'Sesión no válida' });
  try {
    req.usuario = jwt.verify(token, JWT_SECRET);
    next();
  } catch { res.status(401).json({ error: 'Sesión expirada' }); }
}

function authAdminJWT(req, res, next) {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'Sesión no válida' });
  try {
    req.usuario = jwt.verify(token, JWT_SECRET);
    if (req.usuario.rol !== 'admin') return res.status(403).json({ error: 'Solo administrador' });
    next();
  } catch { res.status(401).json({ error: 'Sesión expirada' }); }
}

app.use(express.json({limit:'7mb'}));
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// ========== PÁGINAS ==========
app.get('/', (req, res) => res.sendFile(archivoPublico('index.html')));
app.get('/login', (req, res) => res.sendFile(archivoPublico('login.html')));
app.get('/mi-agenda', (req, res) => res.sendFile(archivoPublico('mi-agenda.html')));

app.get('/api/config', (req, res) => res.json({ whatsapp: WHATSAPP_NUM }));

// ========== AUTH ==========
app.post('/api/auth/login', async (req, res) => {
  try {
    const { usuario, password } = req.body;
    if (!usuario || !password) return res.status(400).json({ error: 'Faltan campos' });
    const id = usuario.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, '').replace(/[^a-z]/g, '');
    const user = await db.getUsuario(id);
    if (!user) return res.status(401).json({ error: 'Usuario no encontrado' });
    const ok = await db.verificarPassword(user, password);
    if (!ok) return res.status(401).json({ error: 'Contraseña incorrecta' });
    const token = jwt.sign({ id: user._id, nombre: user.nombre, rol: user.rol }, JWT_SECRET, { expiresIn: '30d' });
    res.json({ token, nombre: user.nombre, rol: user.rol });
  } catch (err) {
    console.error('Error login:', err);
    res.status(500).json({ error: 'Error al iniciar sesión' });
  }
});

app.get('/api/auth/yo', authMiembro, (req, res) => {
  res.json({ id: req.usuario.id, nombre: req.usuario.nombre, rol: req.usuario.rol });
});

// ========== COTIZACIONES ==========
app.post('/api/cotizar', async (req, res) => {
  try {
    const { cliente_nombre, cliente_telefono, cliente_email, tipo_servicio, detalles, precio_total, moneda, mensaje } = req.body;
    if (!cliente_nombre || !tipo_servicio) return res.status(400).json({ error: 'Faltan campos requeridos' });
    const token_unico = Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
    const cot = await db.createCotizacion({
      cliente_nombre, cliente_telefono, cliente_email,
      tipo_servicio, detalles: detalles || {}, precio_total: precio_total || 0,
      moneda: moneda || 'MXN', mensaje: mensaje || '', token_unico
    });
    cot.enlace = `${req.protocol}://${req.get('host')}/cotizacion/${token_unico}`;
    res.json(cot);
  } catch (err) { console.error('Error cotización:', err); res.status(500).json({ error: 'Error al procesar' }); }
});

app.get('/api/cotizar/:token', async (req, res) => {
  const cot = await db.getCotizacion(req.params.token);
  if (!cot) return res.status(404).json({ error: 'No encontrada' });
  res.json(cot);
});

app.get('/cotizacion/:token', async (req, res) => {
  const cot = await db.getCotizacion(req.params.token);
  if (!cot) return res.status(404).send('No encontrada');
  res.render(vistaCotizacion(), { cot, WHATSAPP_NUM });
});

// ========== CONSULTAS (clientes interesados) ==========
app.post('/api/consultas', async (req, res) => {
  try {
    const { cliente_nombre, cliente_telefono, cliente_email, fecha_deseada, hora_deseada, lugar, tipo_servicio, mensaje } = req.body;
    if (!cliente_nombre || !cliente_telefono) return res.status(400).json({ error: 'Nombre y teléfono son requeridos' });
    const consulta = await db.createConsulta({
      cliente_nombre, cliente_telefono, cliente_email: cliente_email || '',
      fecha_deseada: fecha_deseada || '', hora_deseada: hora_deseada || '',
      lugar: lugar || '', tipo_servicio: tipo_servicio || 'evento',
      mensaje: mensaje || ''
    });
    res.json({ success: true, id: consulta.id });
  } catch (err) { console.error('Error consulta:', err); res.status(500).json({ error: 'Error al procesar' }); }
});

// ========== EVENTOS ==========
app.get('/api/eventos', authMiembro, async (req, res) => {
  try {
    const eventos = await db.getEventos({ desde: req.query.desde, hasta: req.query.hasta, estado: req.query.estado });
    res.json(eventos);
  } catch (err) { console.error(err); res.status(500).json({ error: 'Error' }); }
});

app.get('/api/eventos/:id', authMiembro, async (req, res) => {
  const evento = await db.getEvento(req.params.id);
  if (!evento) return res.status(404).json({ error: 'No encontrado' });
  res.json(evento);
});

app.post('/api/eventos', authAdminJWT, async (req, res) => {
  try {
    const { cliente_nombre, cliente_telefono, cliente_email, fecha, hora_evento, hora_encuentro, lugar, tipo_servicio, horas_contratadas, canciones_especiales, notas, uniforme, consulta_id } = req.body;
    if (!cliente_nombre || !fecha) return res.status(400).json({ error: 'Nombre y fecha son requeridos' });
    const evento = await db.createEvento({
      cliente_nombre, cliente_telefono: cliente_telefono || '', cliente_email: cliente_email || '',
      fecha, hora_evento: hora_evento || '', hora_encuentro: hora_encuentro || '',
      lugar: lugar || '', tipo_servicio: tipo_servicio || 'evento',
      horas_contratadas: horas_contratadas || null,
      canciones_especiales: canciones_especiales || '', notas: notas || '',
      uniforme: uniforme || '', estado: 'confirmado', consulta_id: consulta_id || null,
      creado_por: req.usuario.nombre
    });
    res.json(evento);
  } catch (err) { console.error(err); res.status(500).json({ error: 'Error al crear evento' }); }
});

app.put('/api/eventos/:id', authAdminJWT, async (req, res) => {
  try {
    await db.updateEvento(req.params.id, req.body);
    res.json({ success: true });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Error' }); }
});

app.delete('/api/eventos/:id', authAdminJWT, async (req, res) => {
  try {
    await db.deleteEvento(req.params.id);
    res.json({ success: true });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Error' }); }
});

app.put('/api/eventos/:id/leer', authMiembro, async (req, res) => {
  try {
    await db.marcarEventoLeido(req.params.id, req.usuario.nombre);
    res.json({ success: true });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Error' }); }
});

// ========== NOTIFICACIONES ==========
app.get('/api/notificaciones', authMiembro, async (req, res) => {
  try {
    const notifs = await db.getNotificaciones(req.usuario.nombre);
    res.json(notifs);
  } catch (err) { console.error(err); res.status(500).json({ error: 'Error' }); }
});

app.put('/api/notificaciones/:id/leer', authMiembro, async (req, res) => {
  try {
    await db.marcarNotificacionLeida(req.params.id, req.usuario.nombre);
    res.json({ success: true });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Error' }); }
});

// ========== CHATBOT ==========
const CHAT_INTENTS = [
  { id: 'saludo', patrones: [/hola/i, /buenas/i, /buen[oa]s/i, /hey/i, /qué tal/i, /que tal/i, /saludos/i, /buen día/i, /buenas tardes/i, /buenas noches/i], respuesta: '¡Hola! Soy el asistente virtual de *Elías Reyes y su Proyecto 7* 🎵\n\nPregúntame lo que quieras:\n• 🎤 Tipos de eventos que cubrimos\n• 💰 Precios de serenatas, horas o eventos\n• 📅 Disponibilidad\n• 🎸 Repertorio y géneros\n• 📞 Contacto directo\n\n¿En qué puedo ayudarte?' },
  { id: 'gracias', patrones: [/gracias/i, /thanks/i, /thank/i, /agradecid[ao]/i, /muchas gracias/i], respuesta: '¡De nada! 🙌 Estoy aquí para ayudarte.\n\nSi quieres contratarnos, solo dime y te guío con el proceso. 🎵' },
  { id: 'precio_serenata', patrones: [/serenata/i, /precio.*serenata/i, /cu[áa]nto.*serenata/i, /costo.*serenata/i, /tarifa.*serenata/i], respuesta: '🎵 *Serenata* — $1,800 MXN base\n\nIncluye:\n• 4 canciones con guitarra y 3 voces\n• Ideal para sorprender a alguien especial\n\n*Extras:*\n• Canción adicional: +$300 c/u\n• Fuera de Mérida: +$800\n\n¿Quieres una cotización personalizada?' },
  { id: 'precio_horas', patrones: [/por hora/i, /hora(s)?\b/i, /precio.*hora/i, /cu[áa]nto.*hora/i, /costo.*hora/i, /tarifa.*hora/i], respuesta: '⏱ *Por hora* — $3,000 MXN/hr\n\n• Música en vivo de primer nivel\n• Incluye montaje y sonido\n• Ideal para bares, restaurantes y eventos exclusivos\n\n¿Cuántas horas necesitas?' },
  { id: 'precio_evento', patrones: [/evento/i, /boda/i, /casamiento/i, /matrimonio/i, /privado/i, /fiesta/i, /precio.*evento/i, /costo.*evento/i], respuesta: '🎉 *Eventos* — Precio a convenir\n\nCada evento es único, por eso manejamos cotizaciones personalizadas:\n\n• 💒 Bodas\n• 🏡 Eventos privados\n• 🍺 Bares / Restaurantes\n• 🏛 Eventos institucionales\n\nCuéntanos qué tienes en mente y te armamos una propuesta a la medida. ¿Me dices más detalles?' },
  { id: 'repertorio', patrones: [/repertorio/i, /tocan/i, /qué tocan/i, /que tocan/i, /música/i, /canciones/i, /géneros/i, /estilo/i], respuesta: '🎸 *Nuestro repertorio* incluye:\n\n• 💕 *Boleros & trova* — Clásico de trío, ideal para bodas y serenatas\n• 🎉 *Regional & popular* — Cumbias, rancheras y éxitos\n• 🎤 *Covers contemporáneos* — Pop actual en versión acústica\n\nTenemos +5 géneros y más de 30 canciones en nuestro setlist. ¿Algo en especial que quieras escuchar?' },
  { id: 'disponibilidad', patrones: [/disponible/i, /disponibilidad/i, /fecha/i, /agenda/i, /calendario/i, /cu[áa]ndo/i, /libre/i, /apartar/i, /reservar/i], respuesta: '📅 Actualmente tenemos disponibilidad, pero las fechas se reservan rápido.\n\nPara saber disponibilidad exacta para tu fecha, ¿podrías decirme:\n1. ¿Qué fecha tienes en mente?\n2. ¿Tipo de evento?\n3. ¿Cuántas horas?\n\nY te confirmamos al instante.' },
  { id: 'ubicacion', patrones: [/dónde/i, /donde/i, /ubicad[oa]/i, /ubicaci[óo]n/i, /mérida/i, /yucat[áa]n/i, /península/i, /zona/i, /cubren/i, /área/i], respuesta: '📍 Estamos basados en *Mérida, Yucatán* y cubrimos toda la península:\n\n• Mérida y su zona metropolitana ✅\n• Progreso y puertos ✅\n• Interior del estado ✅\n• Cancún y Riviera Maya (con costo adicional) ✅\n\n¿Dónde sería tu evento?' },
  { id: 'contacto', patrones: [/contacto/i, /tel[eé]fono/i, /whatsapp/i, /correo/i, /email/i, /c[óo]mo.*contact/i, /comunicar/i, /hablar/i, /persona/i], respuesta: `📞 *Contáctanos directamente:*\n\n• WhatsApp: ${WHATSAPP_NUM}\n• Email: contacto@eliasreyes.com\n• Facebook: /EliasReyesProyecto7\n• Instagram: @eliasreyes_proyecto7\n\nO si quieres, puedo tomar tus datos y alguien te escribe en menos de 24 horas. 🎵` },
  { id: 'contratar', patrones: [/contratar/i, /quiero.*contrat/i, /cotizaci[óo]n/i, /reservar/i, /apartar/i, /quiero.*música/i, /llamar/i, /escrib[ae]me/i, /presupuesto/i], respuesta: '¡Excelente! 🎉 Te voy a tomar tus datos rápidamente para que alguien del trío te contacte.\n\nPrimero, ¿me dices tu *nombre*?' },
  { id: 'cuantos_son', patrones: [/cu[áa]ntos son/i, /cu[áa]ntos miembros/i, /qui[eé]nes son/i, /qui[eé]nes integran/i, /tr[ií]o/i, /integrantes/i, /formaci[óo]n/i, /banda/i], respuesta: '🎤 *Elías Reyes y su Proyecto 7* es un trío musical:\n\n• 3 voces en armonía\n• 1 guitarra acústica\n• Repertorio versátil\n\nSomos un trío clásico con un sonido fresco y moderno. Perfectos para cualquier evento. 🎸' },
  { id: 'duracion', patrones: [/cu[áa]nto.*dura/i, /duraci[óo]n/i, /tiempo.*tocan/i, /hora.*evento/i, /larg[oa].*evento/i, /minutos/i], respuesta: '⏳ La duración depende del servicio:\n\n• *Serenata:* ~15-20 min (4 canciones)\n• *Por hora:* Tú decides\n• *Evento:* Acordamos la duración al cotizar\n\n¿Qué tipo de evento tienes?' },
  { id: 'pago', patrones: [/pago/i, /forma.*pago/i, /m[eé]todo.*pago/i, /transferencia/i, /efectivo/i, /tarjeta/i, /dep[ií]sito/i, /anticipo/i, /se[aá]a/i, /enganche/i], respuesta: '💳 *Formas de pago:*\n\n• Efectivo\n• Transferencia bancaria\n• Depósito\n\nSe solicita *50% de anticipo* para apartar la fecha y el resto el día del evento.\n\n¿Te gustaría apartar tu fecha?' },
  { id: 'cancelacion', patrones: [/cancel/i, /reembolso/i, /devoluci[óo]n/i, /cambiar.*fecha/i, /rep[r]?ogramar/i, /suspender/i], respuesta: '🔄 *Política de cancelación:*\n\n• Con +15 días de anticipación: reembolso del 100%\n• Entre 7-14 días: 50% de reembolso\n• Menos de 7 días: no aplica reembolso\n\n¿Necesitas cambiar algo? Avísanos con tiempo.' }
];

function procesarCapturaDatos(mensaje, metadata) {
  const paso = metadata.paso_captura || 0;
  if (paso === 0) return { respuesta: '¿Cuál es tu *nombre*?', paso: 1 };
  if (paso === 1) { metadata.nombre = mensaje.trim(); return { respuesta: `Mucho gusto, *${metadata.nombre}* 🎵\n\n¿Cuál es tu *teléfono o WhatsApp* para contactarte?`, paso: 2 }; }
  if (paso === 2) { metadata.telefono = mensaje.trim(); return { respuesta: 'Perfecto. ¿Quieres agregar un *correo electrónico*? (o escribe "no")', paso: 3 }; }
  if (paso === 3) {
    if (mensaje.toLowerCase() !== 'no') metadata.email = mensaje.trim();
    return {
      respuesta: `¡Listo, *${metadata.nombre}*! ✅\n\nHemos guardado tus datos. En menos de 24 horas alguien del trío te contactará al ${metadata.telefono}${metadata.email ? ' o al ' + metadata.email : ''}.\n\n¿Hay algo más en lo que pueda ayudarte?`,
      paso: -1, captura_completa: true, metadata
    };
  }
  return null;
}

app.post('/api/chat', async (req, res) => {
  try {
    const { mensaje, session_id, metadata } = req.body;
    if (!mensaje || !session_id) return res.status(400).json({ error: 'Faltan campos' });
    const msgLimpio = mensaje.trim();
    let meta = metadata || {};
    const prev = await db.obtenerConversacion(session_id);
    if (prev && prev.metadata) meta = { ...prev.metadata, ...meta };
    let historial = prev && prev.mensajes ? prev.mensajes : [];

    if (meta.paso_captura && meta.paso_captura > 0 && meta.paso_captura !== -1) {
      const resultado = procesarCapturaDatos(msgLimpio, meta);
      if (resultado) {
        meta.paso_captura = resultado.paso;
        if (resultado.captura_completa) {
          meta = resultado.metadata || meta;
          try {
            await db.createCotizacion({ cliente_nombre: meta.nombre || 'Lead chat', cliente_telefono: meta.telefono || '', cliente_email: meta.email || '', tipo_servicio: 'chat', detalles: { origen: 'chat', conversacion: session_id }, precio_total: 0, moneda: 'MXN', mensaje: `Lead: ${meta.nombre}, Tel: ${meta.telefono}`, token_unico: 'chat_' + session_id });
          } catch (e) {}
        }
        historial.push({ rol: 'usuario', texto: msgLimpio, hora: new Date().toISOString() });
        historial.push({ rol: 'asistente', texto: resultado.respuesta, hora: new Date().toISOString() });
        await db.guardarConversacion(session_id, historial, meta);
        return res.json({ respuesta: resultado.respuesta, metadata: meta });
      }
    }

    let mejorIntento = null, mejorScore = 0;
    for (const intento of CHAT_INTENTS) {
      for (const patron of intento.patrones) {
        const match = msgLimpio.match(patron);
        if (match) { const score = match[0].length / msgLimpio.length; if (score > mejorScore) { mejorScore = score; mejorIntento = intento; } }
      }
    }

    let respuesta = '';
    if (mejorIntento) { respuesta = mejorIntento.respuesta; if (mejorIntento.id === 'contratar') meta.paso_captura = 1; }
    else { respuesta = 'Gracias por tu mensaje 🤔\n\nNo estoy seguro de haber entendido bien. ¿Podrías ser más específico?\n\nPuedo ayudarte con:\n• 💰 *Precios* (serenatas, horas, eventos)\n• 🎸 *Repertorio* y géneros\n• 📅 *Disponibilidad*\n• 📞 *Contacto* directo'; }

    historial.push({ rol: 'usuario', texto: msgLimpio, hora: new Date().toISOString() });
    historial.push({ rol: 'asistente', texto: respuesta, hora: new Date().toISOString() });
    await db.guardarConversacion(session_id, historial, meta);
    res.json({ respuesta, metadata: meta });
  } catch (err) { console.error('Error chat:', err); res.status(500).json({ error: 'Error al procesar' }); }
});

app.get('/api/chat', async (req, res) => {
  try {
    const { historial } = req.query;
    if (!historial) return res.status(400).json({ error: 'Falta session_id' });
    const conv = await db.obtenerConversacion(historial);
    if (!conv) return res.status(404).json({ error: 'No encontrada' });
    res.json(conv);
  } catch (err) { res.status(500).json({ error: 'Error' }); }
});

// ========== GALERÍA (MongoDB GridFS; edición solo admin) ==========
app.use('/api/galeria', express.json({limit:'7mb'}));
function mediaError(res,e){
  if(!res.headersSent) res.status(e.status||500).json({error:e.status?e.message:'No se pudo procesar la fotografía'});
  else res.destroy(e);
  if(!e.status) console.error('Galería:',e);
}
app.get('/admin/fotos', (req,res) => res.sendFile(archivoPublico('fotos-admin.html')));
app.get('/api/galeria', async(req,res)=>{
  res.set('Access-Control-Allow-Origin','*');
  try{res.json(await media.list(true));}catch(e){mediaError(res,e);}
});
app.get('/api/galeria/admin',authAdminJWT,async(req,res)=>{
  res.set('Cache-Control','no-store');
  try{res.json(await media.list(false));}catch(e){mediaError(res,e);}
});
app.get('/api/galeria/:id/archivo',async(req,res)=>{
  res.set('Access-Control-Allow-Origin','*');
  try{await media.stream(req.params.id,false,res);}catch(e){mediaError(res,e);}
});
app.get('/api/galeria/:id/privado',authAdminJWT,async(req,res)=>{
  res.set('Cache-Control','no-store');
  try{await media.stream(req.params.id,true,res);}catch(e){mediaError(res,e);}
});
app.post('/api/galeria',authAdminJWT,async(req,res)=>{
  res.set('Cache-Control','no-store');
  try{res.status(201).json(await media.add(req.body,req.usuario));}catch(e){mediaError(res,e);}
});
app.patch('/api/galeria/:id',authAdminJWT,async(req,res)=>{
  res.set('Cache-Control','no-store');
  try{res.json(await media.update(req.params.id,req.body));}catch(e){mediaError(res,e);}
});
app.delete('/api/galeria/:id',authAdminJWT,async(req,res)=>{
  res.set('Cache-Control','no-store');
  try{await media.remove(req.params.id);res.json({success:true});}catch(e){mediaError(res,e);}
});

// ========== ADMIN PANEL ==========
app.use(['/admin/leads', '/api/admin'], authAdmin);
app.get('/admin/leads', (req, res) => res.sendFile(archivoPublico('admin.html')));
app.get('/api/admin/cotizaciones', async (req, res) => res.json(await db.getCotizaciones()));
app.put('/api/admin/cotizaciones/:id/leer', async (req, res) => { await db.marcarCotizacionLeida(req.params.id); res.json({ success: true }); });
app.get('/api/admin/conversaciones', async (req, res) => res.json(await db.listarConversaciones()));
app.get('/api/admin/consultas', async (req, res) => res.json(await db.getConsultas()));
app.put('/api/admin/consultas/:id', async (req, res) => { await db.updateConsulta(req.params.id, req.body); res.json({ success: true }); });
app.get('/api/admin/eventos', async (req, res) => res.json(await db.getEventos()));
app.post('/api/admin/eventos', async (req, res) => {
  try {
    const { cliente_nombre, cliente_telefono, cliente_email, fecha, hora_evento, hora_encuentro, lugar, tipo_servicio, horas_contratadas, canciones_especiales, notas, uniforme, consulta_id } = req.body;
    if (!cliente_nombre || !fecha) return res.status(400).json({ error: 'Nombre y fecha requeridos' });
    const evento = await db.createEvento({ cliente_nombre, cliente_telefono: cliente_telefono || '', cliente_email: cliente_email || '', fecha, hora_evento: hora_evento || '', hora_encuentro: hora_encuentro || '', lugar: lugar || '', tipo_servicio: tipo_servicio || 'evento', horas_contratadas: horas_contratadas || null, canciones_especiales: canciones_especiales || '', notas: notas || '', uniforme: uniforme || '', estado: 'confirmado', consulta_id: consulta_id || null, creado_por: 'Admin (panel)' });
    res.json(evento);
  } catch (err) { console.error(err); res.status(500).json({ error: 'Error al crear evento' }); }
});
app.put('/api/admin/eventos/:id', async (req, res) => { await db.updateEvento(req.params.id, req.body); res.json({ success: true }); });
app.delete('/api/admin/eventos/:id', async (req, res) => { await db.deleteEvento(req.params.id); res.json({ success: true }); });

// ========== START ==========
db.init().then(() => {
  app.listen(PORT, () => {
    console.log(`Proyecto 7 corriendo en http://localhost:${PORT}`);
    if (!process.env.ADMIN_PASSWORD) console.log(`⚠ Admin: "${ADMIN_USER}" / "${ADMIN_PASSWORD}" (configura ADMIN_PASSWORD)`);
    console.log('Miembros del equipo configurados; usa contraseñas privadas y únicas.');
  });
}).catch(err => { console.error('Error al iniciar:', err); process.exit(1); });
