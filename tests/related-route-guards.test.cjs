'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const {checkRestaurantWriteAccess} = require('../restaurant-access');
const src = fs.readFileSync(require('node:path').join(__dirname,'../server.js'),'utf8');
function setup(method,path,opts={}) {
 const writes=[],uploads=[],calls=[];
 const restaurants=[{_id:'r1',owner:'a',slug:'own',reservationSettings:{bookedSeats:2,totalSeats:10},customUI:{}},{_id:'r2',owner:'b',slug:'foreign',reservationSettings:{bookedSeats:3,totalSeats:12},customUI:{}}];
 const products=[{_id:'p1',restaurant:'r1'},{_id:'p2',restaurant:'r2'}];
 const db={from(table){const filters={};let ids,write;const chain={
 select(){return chain;},eq(k,v){filters[k]=v;return chain;},in(k,v){ids=v;return chain;},
 update(v){write=v;writes.push({table,value:v});return chain;},
 insert(v){write=v[0];writes.push({table,value:write});return chain;},
 upsert(v){writes.push({table,value:v});return Promise.resolve({error:null});},
 single(){calls.push({table,filters});if(opts.dbError)return Promise.resolve({data:null,error:{message:'database unavailable'}});const rows=table==='restaurants'?restaurants:products;return Promise.resolve({data:write?{...rows.find(r=>r._id===filters._id),...write}:rows.find(r=>Object.entries(filters).every(([k,v])=>r[k]===v)),error:null});},
 then(resolve,reject){calls.push({table,filters,ids});return Promise.resolve(opts.dbError?{data:null,error:{message:'database unavailable'}}:{data:(table==='products'?products:restaurants).filter(r=>(!ids||ids.includes(r._id))&&Object.entries(filters).every(([k,v])=>r[k]===v)),count:0,error:null}).then(resolve,reject);}
 };return chain;}};
 let route;
 const app={[method](_p,...m){route=m;}};
 const roleStart=src.indexOf('const restrictTo =');
 const roleEnd=src.indexOf('\n};',roleStart)+3;
 const restrictTo=new Function(src.slice(roleStart,roleEnd)+';return restrictTo;')();
 const protect=(req,res,next)=>req.user?next():res.status(401).json({message:'login required'});
 const upload={single:()=>{return(req,res,next)=>{calls.push('multipart');return next();};}};
 const cloudinary={uploader:{upload_stream:(_o,cb)=>({end(buffer){uploads.push(buffer);if(opts.uploadError)return cb(new Error('upload failed'));cb(null,{secure_url:'https://example.invalid/test.png'});}})}};
 const start=src.indexOf(`app.${method}("${path}"`),end=src.indexOf('\n});',start)+4;assert.ok(start>=0);
 new Function('app','protect','restrictTo','supabase','productUpload','upload','cloudinary','checkRestaurantWriteAccess',src.slice(start,end))(app,protect,restrictTo,db,upload,upload,cloudinary,checkRestaurantWriteAccess);
 async function run(user,body={},file){const out={};const res={status(n){out.status=n;return this;},json(j){out.body=j;return this;}};const req={user,body,file,params:{slug:'own'},io:{to:()=>({emit(){}}),emit(){}}};let i=0;const pending=[];function next(){if(route[i]){const result=route[i++](req,res,next);if(result&&result.then)pending.push(result);return result;}}next();for(let n=0;n<pending.length;n++)await pending[n];return {out,writes,uploads,calls};}
 return {run,restaurants,writes,uploads};
}
const owner={_id:'a',role:'owner',productLimit:-1},admin={_id:'root',role:'admin',productLimit:-1};
for(const [method,path,body] of [
 ['post','/api/v1/products',{restaurantId:'r1',name:'Test',price:10}],
 ['patch','/api/v1/products/reorder',{order:[{id:'p1',sortOrder:1}]}],
 ['patch','/api/v1/reservations/settings',{restaurantId:'r1',totalSeats:15}],
 ['patch','/api/v1/restaurants/update-qr/:slug',{qrImage:'image',qrName:'name'}]
]) {
 test(`${path}: no login or staff cannot write`,async()=>{for(const user of [null,...['cashier','kitchen','waiter','sales'].map(role=>({_id:'x',role}))]){const r=await setup(method,path).run(user,body);assert.equal(r.out.status,user?403:401);assert.equal(r.writes.length,0);assert.equal(r.uploads.length,0);}});
}
test('product create: owner only own, admin any; denied upload never reaches cloud',async()=>{
 for(const [user,id,status] of [[owner,'r1',201],[owner,'r2',403],[owner,'missing',403],[admin,'r2',201]]){const r=await setup('post','/api/v1/products').run(user,{restaurantId:id,name:'Test',price:10},{buffer:Buffer.from('fake')});assert.equal(r.out.status,status);assert.equal(r.writes.length,status===201?1:0);assert.equal(r.uploads.length,status===201?1:0);}
});
test('product create: lookup error fails closed and package limit still applies',async()=>{
 let r=await setup('post','/api/v1/products',{dbError:true}).run(owner,{restaurantId:'r1'}, {buffer:Buffer.from('x')});assert.equal(r.writes.length,0);assert.equal(r.uploads.length,0);
 r=await setup('post','/api/v1/products').run({...owner,productLimit:0},{restaurantId:'r1'});assert.equal(r.out.status,403);assert.equal(r.writes.length,0);
});
test('reorder: own succeeds, mixed foreign is atomic denial, missing product denied, admin allowed',async()=>{
 for(const [user,order,status] of [[owner,[{id:'p1',sortOrder:1}],200],[owner,[{id:'p1',sortOrder:1},{id:'p2',sortOrder:2}],403],[owner,[{id:'missing',sortOrder:1}],403],[admin,[{id:'p2',sortOrder:1}],200]]){const r=await setup('patch','/api/v1/products/reorder').run(user,{order});assert.equal(r.out.status,status);assert.equal(r.writes.length,status===200?1:0);}
});
test('reorder: invalid/duplicate IDs or positions, empty batch, database failure',async()=>{
 for(const order of [[null],[{sortOrder:0}],[{id:'p1',sortOrder:-1}],[{id:'p1',sortOrder:'1'}],[{id:'p1',sortOrder:1},{id:'p1',sortOrder:2}]]){const r=await setup('patch','/api/v1/products/reorder').run(owner,{order});assert.equal(r.out.status,400);assert.equal(r.writes.length,0);}
 let r=await setup('patch','/api/v1/products/reorder').run(owner,{order:[]});assert.equal(r.out.status,200);assert.equal(r.writes.length,0);
 r=await setup('patch','/api/v1/products/reorder',{dbError:true}).run(owner,{order:[{id:'p1',sortOrder:1}]});assert.equal(r.writes.length,0);assert.equal(r.out.status,400);
});
test('reservation settings: only one registered route, owner scoped, admin allowed, reset and timed rule intact',async()=>{
 assert.equal(src.split('app.patch("/api/v1/reservations/settings"').length-1,1);
 for(const [user,id,status] of [[owner,'r1',200],[owner,'r2',403],[owner,'missing',403],[admin,'r2',200]]){const r=await setup('patch','/api/v1/reservations/settings').run(user,{restaurantId:id,resetCounter:true});assert.equal(r.out.status,status);assert.equal(r.writes.length,status===200?1:0);if(status===200)assert.equal(r.writes[0].value.reservationSettings.bookedSeats,0);}
 const t=setup('patch','/api/v1/reservations/settings');t.restaurants[0].customUI={timedReservations:{enabled:true}};const r=await t.run(owner,{restaurantId:'r1',isEnabled:true});assert.equal(r.out.status,400);assert.equal(r.writes.length,0);
});
test('QR update: owner denied, admin succeeds',async()=>{
 let r=await setup('patch','/api/v1/restaurants/update-qr/:slug').run(owner,{qrImage:'x'});assert.equal(r.out.status,403);assert.equal(r.writes.length,0);
 r=await setup('patch','/api/v1/restaurants/update-qr/:slug').run(admin,{qrImage:'x',qrName:'test'});assert.equal(r.out.status,200);assert.equal(r.writes.length,1);
});

test('product upload failure creates no row; missing venue rejected even for admin',async()=>{
 let r=await setup('post','/api/v1/products',{uploadError:true}).run(owner,{restaurantId:'r1'},{buffer:Buffer.from('x')});assert.equal(r.out.status,400);assert.equal(r.writes.length,0);
 r=await setup('post','/api/v1/products').run(admin,{});assert.equal(r.out.status,400);assert.equal(r.writes.length,0);
});
