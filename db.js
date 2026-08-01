const fs = require('fs');
const path = require('path');
const { MongoClient } = require('mongodb');

const DATA_DIR = path.join(__dirname, 'data');
const DB_FILE = path.join(DATA_DIR, 'database.json');

const MONGO_URI = process.env.MONGO_URI || '';
const MONGO_DB = process.env.MONGO_DB || 'proyecto7';
let mongoClient = null;
let mongoDb = null;

function load() {
  try { return JSON.parse(fs.readFileSync(DB_FILE, 'utf8')); }
  catch { return { cotizaciones: [], conversaciones: {} }; }
}

function save(db) { fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2)); }

async function conectarMongo() {
  if (!MONGO_URI) return false;
  mongoClient = new MongoClient(MONGO_URI, { serverSelectionTimeoutMS: 10000 });
  await mongoClient.connect();
  mongoDb = mongoClient.db(MONGO_DB);
  await mongoDb.collection('cotizaciones').createIndex({ token_unico: 1 }, { unique: true });
  return true;
}

async function init() {
  if (await conectarMongo()) {
    console.log('Base de datos lista (MongoDB Atlas)');
    return;
  }
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(DB_FILE)) save(load());
  console.log('Base de datos lista (JSON local)');
}

// ---- Cotizaciones ----
async function createCotizacion(data) {
  if (mongoDb) {
    const col = mongoDb.collection('cotizaciones');
    const contador = mongoDb.collection('contadores');
    const res = await contador.findOneAndUpdate(
      { _id: 'cotizacion' },
      { $inc: { secuencia: 1 } },
      { upsert: true, returnDocument: 'after' }
    );
    const id = res.value.secuencia;
    const doc = { id, ...data, leido: false, creada: new Date().toISOString() };
    await col.insertOne({ _id: id, ...doc });
    return doc;
  }
  const db = load();
  const id = db.cotizaciones.length > 0 ? Math.max(...db.cotizaciones.map(c => c.id)) + 1 : 1;
  const cot = { id, ...data, leido: false, creada: new Date().toISOString() };
  db.cotizaciones.push(cot);
  save(db);
  return cot;
}

async function getCotizacion(token) {
  if (mongoDb) {
    const doc = await mongoDb.collection('cotizaciones').findOne({ token_unico: token });
    return doc || null;
  }
  const db = load();
  return db.cotizaciones.find(c => c.token_unico === token) || null;
}

async function getCotizaciones() {
  if (mongoDb) {
    return await mongoDb.collection('cotizaciones').find().sort({ _id: -1 }).toArray();
  }
  return load().cotizaciones.reverse();
}

async function marcarCotizacionLeida(id) {
  if (mongoDb) {
    await mongoDb.collection('cotizaciones').updateOne({ _id: Number(id) }, { $set: { leido: true } });
    return;
  }
  const db = load();
  const c = db.cotizaciones.find(x => x.id == id);
  if (c) { c.leido = true; save(db); }
}

// ---- Conversaciones (chat) ----
async function guardarConversacion(sessionId, mensajes, metadata) {
  const actualizada = new Date().toISOString();
  if (mongoDb) {
    await mongoDb.collection('conversaciones').updateOne(
      { _id: sessionId },
      { $set: { mensajes, metadata: metadata || {}, actualizada } },
      { upsert: true }
    );
    return { mensajes, metadata: metadata || {}, actualizada };
  }
  const db = load();
  db.conversaciones[sessionId] = { mensajes, metadata: metadata || {}, actualizada };
  save(db);
  return db.conversaciones[sessionId];
}

async function obtenerConversacion(sessionId) {
  if (mongoDb) {
    return await mongoDb.collection('conversaciones').findOne({ _id: sessionId });
  }
  const db = load();
  return db.conversaciones[sessionId] || null;
}

async function listarConversaciones() {
  if (mongoDb) {
    const docs = await mongoDb.collection('conversaciones').find().sort({ actualizada: -1 }).toArray();
    return docs.map(d => ({ session_id: d._id, metadata: d.metadata, actualizada: d.actualizada }));
  }
  const db = load();
  return Object.entries(db.conversaciones || {})
    .map(([k, v]) => ({ session_id: k, metadata: v.metadata, actualizada: v.actualizada }))
    .sort((a, b) => new Date(b.actualizada) - new Date(a.actualizada));
}

module.exports = { init, createCotizacion, getCotizacion, getCotizaciones, marcarCotizacionLeida, guardarConversacion, obtenerConversacion, listarConversaciones };
