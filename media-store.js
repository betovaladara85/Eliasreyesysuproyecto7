'use strict';
const crypto = require('crypto');
const {GridFSBucket, ObjectId} = require('mongodb');
const database = require('./db');

const MAX_BYTES = 5 * 1024 * 1024;
const LIMIT = 80;
const TYPES = {jpeg:'image/jpeg', png:'image/png', webp:'image/webp'};

function storage(){
  const mongo = database.getMongoDb();
  if(!mongo) { const err = new Error('La galería requiere MONGO_URI y almacenamiento persistente MongoDB Atlas'); err.status=503; throw err; }
  return {mongo,bucket:new GridFSBucket(mongo,{bucketName:'fotos_proyecto7'})};
}
function verify(input){
  if(typeof input !== 'string' || input.length > Math.ceil(MAX_BYTES*4/3)+100) throw Object.assign(new Error('Archivo demasiado grande'),{status:413});
  const m = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/]+={0,2})$/.exec(input);
  if(!m) throw Object.assign(new Error('Formato no permitido: usa JPEG, PNG o WebP'),{status:415});
  const data = Buffer.from(m[2],'base64');
  if(data.length < 100 || data.length > MAX_BYTES) throw Object.assign(new Error('La foto debe ocupar entre 100 bytes y 5 MB'),{status:413});
  const isJpeg = data[0]===0xff && data[1]===0xd8 && data[2]===0xff;
  const isPng = data.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]));
  const isWebp = data.toString('ascii',0,4)==='RIFF' && data.toString('ascii',8,12)==='WEBP';
  if(!(m[1]==='image/jpeg'&&isJpeg || m[1]==='image/png'&&isPng || m[1]==='image/webp'&&isWebp)){
    throw Object.assign(new Error('El contenido del archivo no coincide con su formato'),{status:415});
  }
  return {data,mime:m[1]};
}
function idOr404(s){
  if(!ObjectId.isValid(s) || String(new ObjectId(s))!==String(s).toLowerCase()) throw Object.assign(new Error('ID de foto inválido'),{status:404});
  return new ObjectId(s);
}
function clean(text,max=120){return String(text||'').trim().slice(0,max);}
function safeDoc(x){return {id:String(x._id),title:x.title,alt:x.alt,category:x.category,featured:!!x.featured,published:!!x.published,position:x.position||0,mime:x.mime,created_at:x.created_at,url:'/api/galeria/'+x._id+'/archivo'};}
async function list(publishedOnly){
  const {mongo}=storage();
  const docs=await mongo.collection('fotos_p7').find(publishedOnly?{published:true}:{}).sort({position:1,created_at:-1}).limit(LIMIT).toArray();
  return docs.map(safeDoc);
}
async function add(body,user){
  const {mongo,bucket}=storage();
  if(await mongo.collection('fotos_p7').countDocuments()>=LIMIT) throw Object.assign(new Error('Límite de 80 fotografías alcanzado'),{status:409});
  const {data,mime}=verify(body.data_url);
  const filename = crypto.randomUUID();
  const upload = bucket.openUploadStream(filename,{contentType:mime,metadata:{owner:user.id}});
  try{
    await new Promise((resolve,reject)=>{upload.on('error',reject);upload.on('finish',resolve);upload.end(data);});
    const info={_id:upload.id,title:clean(body.title)||'Foto de Proyecto 7',alt:clean(body.alt)||'Elías Reyes y su Proyecto 7',category:['portada','integrantes','eventos','promocionales','galeria'].includes(body.category)?body.category:'galeria',published:false,featured:false,position:Date.now(),mime,created_at:new Date(),created_by:user.id};
    await mongo.collection('fotos_p7').insertOne(info);
    return safeDoc(info);
  }catch(e){try{if(upload.id) await bucket.delete(upload.id);}catch(_){} throw e;}
}
async function update(id,body){
  const {mongo}=storage();
  const _id=idOr404(id);
  const update={};
  if('title' in body) update.title=clean(body.title)||'Foto de Proyecto 7';
  if('alt' in body) update.alt=clean(body.alt)||'Elías Reyes y su Proyecto 7';
  if('category' in body){
    if(!['portada','integrantes','eventos','promocionales','galeria'].includes(body.category)) throw Object.assign(new Error('Categoría inválida'),{status:400});
    update.category=body.category;
  }
  if('published' in body){if(typeof body.published!=='boolean') throw Object.assign(new Error('Estado inválido'),{status:400});update.published=body.published;}
  if('position' in body){if(!Number.isSafeInteger(body.position)||body.position<0) throw Object.assign(new Error('Orden inválido'),{status:400});update.position=body.position;}
  if('featured' in body){if(typeof body.featured!=='boolean') throw Object.assign(new Error('Destacado inválido'),{status:400});update.featured=body.featured;}
  if(!Object.keys(update).length) throw Object.assign(new Error('Sin cambios'),{status:400});
  const result=await mongo.collection('fotos_p7').updateOne({_id},{$set:update});
  if(!result.matchedCount) throw Object.assign(new Error('Foto no encontrada'),{status:404});
  return safeDoc(await mongo.collection('fotos_p7').findOne({_id}));
}
async function remove(id){
  const {mongo,bucket}=storage(); const _id=idOr404(id);
  const result=await mongo.collection('fotos_p7').deleteOne({_id});
  if(!result.deletedCount) throw Object.assign(new Error('Foto no encontrada'),{status:404});
  await bucket.delete(_id);
}
async function stream(id,privateAccess,res){
  const {mongo,bucket}=storage();
  const doc=await mongo.collection('fotos_p7').findOne({_id:idOr404(id)});
  if(!doc || (!doc.published && !privateAccess)) throw Object.assign(new Error('Foto no encontrada'),{status:404});
  res.set('Content-Type',doc.mime);
  res.set('Content-Disposition','inline');
  res.set('X-Content-Type-Options','nosniff');
  res.set('Cache-Control',doc.published?'public, max-age=300':'no-store');
  return new Promise((resolve,reject)=>{
    const source=bucket.openDownloadStream(doc._id);
    source.on('error',reject);source.on('end',resolve);
    source.pipe(res);
  });
}
module.exports={list,add,update,remove,stream};
