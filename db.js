const fs = require('fs');
const path = require('path');
const { MongoClient } = require('mongodb');
const bcrypt = require('bcryptjs');

const DATA_DIR = path.join(__dirname, 'data');
const DB_FILE = path.join(DATA_DIR, 'database.json');

const MONGO_URI = process.env.MONGO_URI || '';
const MONGO_DB = process.env.MONGO_DB || 'proyecto7';
let mongoClient = null;
let mongoDb = null;

const USUARIOS_SEED = [
  { _id: 'elias', nombre: 'Elías Reyes', password: process.env.SEED_ELIAS_PASSWORD || (process.env.NODE_ENV === 'production' ? '' : 'dev_elias_change_me'), rol: 'admin' },
  { _id: 'aurora', nombre: 'Aurora Quijano', password: process.env.SEED_AURORA_PASSWORD || (process.env.NODE_ENV === 'production' ? '' : 'dev_aurora_change_me'), rol: 'miembro' },
  { _id: 'rulo', nombre: 'Rulo Valadara', password: process.env.SEED_RULO_PASSWORD || (process.env.NODE_ENV === 'production' ? '' : 'dev_rulo_change_me'), rol: 'miembro' },
];

function load() {
  try { return JSON.parse(fs.readFileSync(DB_FILE, 'utf8')); }
  catch { return { cotizaciones: [], conversaciones: {}, usuarios: [], consultas: [], eventos: [], notificaciones: [] }; }
}

function save(db) { fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2)); }

async function siguienteId(col, db) {
  if (mongoDb) {
    const c = mongoDb.collection('contadores');
    const r = await c.findOneAndUpdate({ _id: col }, { $inc: { secuencia: 1 } }, { upsert: true, returnDocument: 'after' });
    return r.value.secuencia;
  }
  return (db[col] && db[col].length > 0 ? Math.max(...db[col].map(x => x.id)) + 1 : 1);
}

async function conectarMongo() {
  if (!MONGO_URI) return false;
  mongoClient = new MongoClient(MONGO_URI, { serverSelectionTimeoutMS: 10000 });
  await mongoClient.connect();
  mongoDb = mongoClient.db(MONGO_DB);
  await mongoDb.collection('cotizaciones').createIndex({ token_unico: 1 }, { unique: true });
  await mongoDb.collection('eventos').createIndex({ fecha: 1 });
  await mongoDb.collection('consultas').createIndex({ fecha_deseada: 1 });
  return true;
}

async function init() {
  if (process.env.NODE_ENV === 'production') {
    if (!MONGO_URI) throw new Error('MONGO_URI es obligatorio en producción para guardar datos y fotografías de forma persistente');
  }
  if (await conectarMongo()) {
    const count = await mongoDb.collection('usuarios').countDocuments();
    if (count === 0) {
      if (process.env.NODE_ENV === 'production' && USUARIOS_SEED.some(u=>!u.password || u.password.length<12)) {
        throw new Error('Configura SEED_ELIAS_PASSWORD, SEED_AURORA_PASSWORD y SEED_RULO_PASSWORD con al menos 12 caracteres antes del primer inicio');
      }
      for (const u of USUARIOS_SEED) {
        const hash = await bcrypt.hash(u.password, 10);
        await mongoDb.collection('usuarios').insertOne({ _id: u._id, nombre: u.nombre, password_hash: hash, rol: u.rol });
      }
    }
    console.log('Base de datos lista (MongoDB Atlas)');
    return;
  }
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  const db = load();
  if (!db.usuarios || db.usuarios.length === 0) {
    db.usuarios = [];
    for (const u of USUARIOS_SEED) {
      const hash = await bcrypt.hash(u.password, 10);
      db.usuarios.push({ _id: u._id, nombre: u.nombre, password_hash: hash, rol: u.rol });
    }
    db.consultas = db.consultas || [];
    db.eventos = db.eventos || [];
    db.notificaciones = db.notificaciones || [];
    save(db);
  }
  console.log('Base de datos lista (JSON local)');
}

// ---- Usuarios / Auth ----
async function getUsuario(id) {
  if (mongoDb) return await mongoDb.collection('usuarios').findOne({ _id: id }) || null;
  const db = load();
  return (db.usuarios || []).find(u => u._id === id) || null;
}

async function verificarPassword(usuario, password) {
  return bcrypt.compare(password, usuario.password_hash);
}

// ---- Cotizaciones ----
async function createCotizacion(data) {
  if (mongoDb) {
    const id = await siguienteId('cotizacion');
    const doc = { id, ...data, leido: false, creada: new Date().toISOString() };
    await mongoDb.collection('cotizaciones').insertOne({ _id: id, ...doc });
    return doc;
  }
  const db = load();
  const id = await siguienteId('cotizaciones', db);
  const cot = { id, ...data, leido: false, creada: new Date().toISOString() };
  db.cotizaciones.push(cot);
  save(db);
  return cot;
}

async function getCotizacion(token) {
  if (mongoDb) return await mongoDb.collection('cotizaciones').findOne({ token_unico: token }) || null;
  const db = load();
  return (db.cotizaciones || []).find(c => c.token_unico === token) || null;
}

async function getCotizaciones() {
  if (mongoDb) return await mongoDb.collection('cotizaciones').find().sort({ _id: -1 }).toArray();
  return (load().cotizaciones || []).reverse();
}

async function marcarCotizacionLeida(id) {
  if (mongoDb) { await mongoDb.collection('cotizaciones').updateOne({ _id: Number(id) }, { $set: { leido: true } }); return; }
  const db = load();
  const c = (db.cotizaciones || []).find(x => x.id == id);
  if (c) { c.leido = true; save(db); }
}

// ---- Conversaciones (chat) ----
async function guardarConversacion(sessionId, mensajes, metadata) {
  const actualizada = new Date().toISOString();
  if (mongoDb) {
    await mongoDb.collection('conversaciones').updateOne({ _id: sessionId }, { $set: { mensajes, metadata: metadata || {}, actualizada } }, { upsert: true });
    return { mensajes, metadata: metadata || {}, actualizada };
  }
  const db = load();
  db.conversaciones = db.conversaciones || {};
  db.conversaciones[sessionId] = { mensajes, metadata: metadata || {}, actualizada };
  save(db);
  return db.conversaciones[sessionId];
}

async function obtenerConversacion(sessionId) {
  if (mongoDb) return await mongoDb.collection('conversaciones').findOne({ _id: sessionId });
  return (load().conversaciones || {})[sessionId] || null;
}

async function listarConversaciones() {
  if (mongoDb) {
    const docs = await mongoDb.collection('conversaciones').find().sort({ actualizada: -1 }).toArray();
    return docs.map(d => ({ session_id: d._id, metadata: d.metadata, actualizada: d.actualizada }));
  }
  return Object.entries(load().conversaciones || {})
    .map(([k, v]) => ({ session_id: k, metadata: v.metadata, actualizada: v.actualizada }))
    .sort((a, b) => new Date(b.actualizada) - new Date(a.actualizada));
}

// ---- Consultas (interés de clientes) ----
async function createConsulta(data) {
  if (mongoDb) {
    const id = await siguienteId('consulta');
    const doc = { id, ...data, estado: 'pendiente', creada: new Date().toISOString() };
    await mongoDb.collection('consultas').insertOne({ _id: id, ...doc });
    await crearNotificacion('nueva_consulta', `Nueva consulta de ${data.cliente_nombre}`, doc);
    return doc;
  }
  const db = load();
  const id = await siguienteId('consultas', db);
  const doc = { id, ...data, estado: 'pendiente', creada: new Date().toISOString() };
  db.consultas.push(doc);
  await crearNotificacion('nueva_consulta', `Nueva consulta de ${data.cliente_nombre}`, doc, db);
  save(db);
  return doc;
}

async function getConsultas(estado) {
  if (mongoDb) {
    const filtro = estado ? { estado } : {};
    return await mongoDb.collection('consultas').find(filtro).sort({ _id: -1 }).toArray();
  }
  const db = load();
  let lista = db.consultas || [];
  if (estado) lista = lista.filter(c => c.estado === estado);
  return lista.reverse();
}

async function updateConsulta(id, cambios) {
  if (mongoDb) { await mongoDb.collection('consultas').updateOne({ _id: Number(id) }, { $set: cambios }); return; }
  const db = load();
  const c = (db.consultas || []).find(x => x.id == id);
  if (c) Object.assign(c, cambios);
  save(db);
}

// ---- Eventos ----
async function createEvento(data) {
  if (mongoDb) {
    const id = await siguienteId('evento');
    const doc = { id, ...data, leido_por: [], creada: new Date().toISOString(), actualizada: new Date().toISOString() };
    await mongoDb.collection('eventos').insertOne({ _id: id, ...doc });
    await crearNotificacion('nuevo_evento', `Nuevo evento: ${data.tipo_servicio} — ${data.fecha}`, doc);
    return doc;
  }
  const db = load();
  const id = await siguienteId('eventos', db);
  const doc = { id, ...data, leido_por: [], creada: new Date().toISOString(), actualizada: new Date().toISOString() };
  db.eventos.push(doc);
  await crearNotificacion('nuevo_evento', `Nuevo evento: ${data.tipo_servicio} — ${data.fecha}`, doc, db);
  save(db);
  return doc;
}

async function getEventos(filtros) {
  if (mongoDb) {
    const filtro = {};
    if (filtros && filtros.estado) filtro.estado = filtros.estado;
    if (filtros && filtros.desde) filtro.fecha = { $gte: filtros.desde };
    if (filtros && filtros.hasta) filtro.fecha = { ...filtro.fecha, $lte: filtros.hasta };
    return await mongoDb.collection('eventos').find(filtro).sort({ fecha: 1, hora_evento: 1 }).toArray();
  }
  const db = load();
  let lista = db.eventos || [];
  if (filtros) {
    if (filtros.estado) lista = lista.filter(e => e.estado === filtros.estado);
    if (filtros.desde) lista = lista.filter(e => e.fecha >= filtros.desde);
    if (filtros.hasta) lista = lista.filter(e => e.fecha <= filtros.hasta);
  }
  return lista.sort((a, b) => (a.fecha + a.hora_evento).localeCompare(b.fecha + b.hora_evento));
}

async function getEvento(id) {
  if (mongoDb) return await mongoDb.collection('eventos').findOne({ _id: Number(id) }) || null;
  return (load().eventos || []).find(e => e.id == id) || null;
}

async function updateEvento(id, cambios) {
  cambios.actualizada = new Date().toISOString();
  if (mongoDb) { await mongoDb.collection('eventos').updateOne({ _id: Number(id) }, { $set: cambios }); return; }
  const db = load();
  const e = (db.eventos || []).find(x => x.id == id);
  if (e) Object.assign(e, cambios);
  save(db);
}

async function deleteEvento(id) {
  if (mongoDb) { await mongoDb.collection('eventos').deleteOne({ _id: Number(id) }); return; }
  const db = load();
  db.eventos = (db.eventos || []).filter(e => e.id != id);
  save(db);
}

async function marcarEventoLeido(id, usuario) {
  if (mongoDb) {
    await mongoDb.collection('eventos').updateOne({ _id: Number(id) }, { $addToSet: { leido_por: usuario } });
    return;
  }
  const db = load();
  const e = (db.eventos || []).find(x => x.id == id);
  if (e && !e.leido_por.includes(usuario)) e.leido_por.push(usuario);
  save(db);
}

// ---- Notificaciones ----
async function crearNotificacion(tipo, texto, datos, dbLocal) {
  const notif = { tipo, texto, datos: datos || {}, leida_por: [], creada: new Date().toISOString() };
  if (mongoDb) {
    const id = await siguienteId('notif');
    notif.id = id;
    await mongoDb.collection('notificaciones').insertOne({ _id: id, ...notif });
    return notif;
  }
  const db = dbLocal || load();
  db.notificaciones = db.notificaciones || [];
  const id = (db.notificaciones.length > 0 ? Math.max(...db.notificaciones.map(n => n.id)) + 1 : 1);
  notif.id = id;
  db.notificaciones.push(notif);
  if (!dbLocal) save(db);
  return notif;
}

async function getNotificaciones(usuario) {
  if (mongoDb) {
    return await mongoDb.collection('notificaciones').find().sort({ _id: -1 }).limit(50).toArray();
  }
  return (load().notificaciones || []).reverse().slice(0, 50);
}

async function marcarNotificacionLeida(id, usuario) {
  if (mongoDb) {
    await mongoDb.collection('notificaciones').updateOne({ _id: Number(id) }, { $addToSet: { leida_por: usuario } });
    return;
  }
  const db = load();
  const n = (db.notificaciones || []).find(x => x.id == id);
  if (n && !n.leida_por.includes(usuario)) n.leida_por.push(usuario);
  save(db);
}

module.exports = {
  getMongoDb: () => mongoDb,
  init, getUsuario, verificarPassword,
  createCotizacion, getCotizacion, getCotizaciones, marcarCotizacionLeida,
  guardarConversacion, obtenerConversacion, listarConversaciones,
  createConsulta, getConsultas, updateConsulta,
  createEvento, getEventos, getEvento, updateEvento, deleteEvento, marcarEventoLeido,
  getNotificaciones, marcarNotificacionLeida
};
