'use strict';
const fs=require('node:fs');
const vm=require('node:vm');
const assert=require('node:assert/strict');

const server=fs.readFileSync('server.js','utf8');
const html=fs.readFileSync('public/index.html','utf8');
new vm.Script(server,{filename:'server.js'});
assert.match(server,/app\.get\('\/api\/web\/publicaciones'/);
assert.match(server,/p7_web_agenda\?select=title,place_public,date_public,time_public/);
assert.match(server,/p7_web_media\?select=kind,storage_path,title,alt,category,sort_order/);
assert.match(server,/MANAGER_SUPABASE_PUBLIC_KEY/);
assert.doesNotMatch(server,/SUPABASE_SERVICE_ROLE_KEY/);
assert.match(html,/id="p7-web-multimedia"/);
assert.match(html,/id="p7-web-fechas"/);
assert.match(html,/\/api\/web\/publicaciones/);
let count=0;
for(const match of html.matchAll(/<script>([\s\S]*?)<\/script>/g)){
 new vm.Script(match[1],{filename:'public/index.html inline script '+(++count)});
}
assert.ok(count>0,'Missing main browser script');
console.log('Website and private-data-safe Manager integration checks passed ('+count+' scripts).');
