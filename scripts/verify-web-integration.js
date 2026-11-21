'use strict';
const fs=require('node:fs');
const vm=require('node:vm');
const assert=require('node:assert/strict');

const server=fs.readFileSync('server.js','utf8');
new vm.Script(server,{filename:'server.js'});
assert.match(server,/app\\.get\\('\\/api\\/web\\/publicaciones'/);
assert.match(server,/p7_web_agenda\\?select=title,place_public,date_public,time_public/);
assert.match(server,/p7_web_media\\?select=kind,storage_path,title,alt,category,sort_order/);
assert.match(server,/MANAGER_SUPABASE_PUBLIC_KEY/);
assert.doesNotMatch(server,/SUPABASE_SERVICE_ROLE_KEY/);
let count=0;
for (const filename of ['index.html','public/index.html']) {
 const html=fs.readFileSync(filename,'utf8');
 assert.match(html,/id="p7-web-multimedia"/,filename+' missing gallery');
 assert.match(html,/id="p7-web-fechas"/,filename+' missing agenda');
 assert.match(html,/\\/api\\/web\\/publicaciones/,filename+' missing API connection');
 let local=0;
 for(const match of html.matchAll(/<script>([\\s\\S]*?)<\\/script>/g)){
  new vm.Script(match[1],{filename:filename+' inline script '+(++local)});
 }
 assert.ok(local>0,filename+' missing browser script');
 count+=local;
}
console.log('Website and private-data-safe Manager integration checks passed ('+count+' scripts).');
