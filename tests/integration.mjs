// Tests the built Next.js server against a disposable in-memory Supabase HTTP mock.
// Never points at a real Supabase account. Does not replace live deployment verification.
import http from 'node:http';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
const db={projects:[],albums:[]};
const mock=http.createServer(async(req,res)=>{
 let raw='';for await(const chunk of req)raw+=chunk;
 const body=raw?JSON.parse(raw):null,u=new URL(req.url,'http://localhost');
 const send=(value,status=200)=>{res.writeHead(status,{'Content-Type':'application/json'});res.end(JSON.stringify(value));};
 if(u.pathname==='/auth/v1/token')return send(body?.email==='manager@example.test'&&body?.password==='manager-test-password'||body?.refresh_token==='refresh'?{access_token:'access',refresh_token:'refresh',expires_in:3600,user:{email:'manager@example.test'}}:{error:'Invalid credentials'},body?.email==='manager@example.test'&&body?.password==='manager-test-password'||body?.refresh_token==='refresh'?200:400);
 if(u.pathname==='/auth/v1/user')return send(req.headers.authorization==='Bearer access'?{email:'manager@example.test'}:{error:'Unauthorized'},req.headers.authorization==='Bearer access'?200:401);
 if(u.pathname==='/auth/v1/logout')return send({});
 if(req.headers.apikey!=='test-service-key')return send({error:'Forbidden'},403);
 if(u.pathname==='/rest/v1/rpc/consume_login_attempt')return send(true);
 const table=u.pathname.split('/').at(-1);if(!db[table])return send({},404);
 const matches=row=>[...u.searchParams].filter(([key])=>!['select','order','limit'].includes(key)).every(([key,val])=>String(row[key])===val.replace(/^eq\./,''));
 if(req.method==='GET'){let rows=db[table].filter(matches);if(u.searchParams.get('order')==='sort.desc')rows.sort((a,b)=>b.sort-a.sort);if(u.searchParams.has('limit'))rows=rows.slice(0,Number(u.searchParams.get('limit')));return send(rows);}
 if(req.method==='POST'){const rows=(Array.isArray(body)?body:[body]).map(r=>({...table==='albums'?{complete:0,reviewer:'',updated:null,version:0}:{created:new Date().toISOString()},...r}));db[table].push(...rows);return send(rows,201);}
 if(req.method==='PATCH'){const rows=db[table].filter(matches);rows.forEach(r=>Object.assign(r,body));return send(rows);}
 send({},400);
});
mock.listen(4555,'127.0.0.1');await once(mock,'listening');
let logs='';
const next=spawn(process.execPath,['node_modules/next/dist/bin/next','start','--hostname','127.0.0.1','--port','4556'],{env:{...process.env,SUPABASE_URL:'http://127.0.0.1:4555',SUPABASE_ANON_KEY:'test-anon-key',SUPABASE_SERVICE_ROLE_KEY:'test-service-key',ADMIN_EMAIL:'manager@example.test',SESSION_SECRET:'test-only-session-secret-for-integration-123456',NEXT_TELEMETRY_DISABLED:'1'},stdio:['ignore','pipe','pipe']});
next.stdout.on('data',d=>logs+=d);next.stderr.on('data',d=>logs+=d);
const origin='http://127.0.0.1:4556';
function client(){const jar=new Map();return async(path,body)=>{const r=await fetch(origin+path,{method:body?'POST':'GET',headers:{Origin:origin,'Content-Type':'application/json',Cookie:[...jar].map(([k,v])=>k+'='+v).join('; ')},body:body?JSON.stringify(body):undefined});for(const c of r.headers.getSetCookie()){const [kv]=c.split(';'),i=kv.indexOf('=');jar.set(kv.slice(0,i),kv.slice(i+1));}return {status:r.status,body:await r.json()};};}
const manager=client(),reviewer=client(),anonymous=client();
try{
 let ready=false;for(let i=0;i<80;i++){try{await fetch(origin);ready=true;break;}catch{await new Promise(r=>setTimeout(r,250));}}assert.ok(ready,logs);
 assert.equal((await anonymous('/api/hub')).status,401);
 assert.equal((await manager('/api/auth',{action:'login',email:'manager@example.test',password:'wrong'})).status,401);
 assert.equal((await manager('/api/auth',{action:'login',email:'manager@example.test',password:'manager-test-password'})).status,200);
 const created=await manager('/api/hub',{action:'project',name:'Private test',password:'Project password 123'});assert.equal(created.status,200,JSON.stringify(created));const id=created.body.id;
 const second=await manager('/api/hub',{action:'project',name:'Other project',password:'Different password'});const other=second.body.id;
 assert.equal((await anonymous('/api/hub?review='+id)).status,401);
 assert.equal((await reviewer('/api/auth',{action:'unlock',project_id:id,password:'wrong'})).status,401);
 assert.equal((await reviewer('/api/auth',{action:'unlock',project_id:id,password:'Project password 123'})).status,200);
 await manager('/api/hub',{action:'album',project_id:id,section:'Act 1',number:'1.1',title:'Test album',url:'https://lightroom.adobe.com/shares/test'});
 const view=await reviewer('/api/hub?review='+id);assert.equal(view.status,200);assert.equal(view.body.projects.length,1);assert.ok(!JSON.stringify(view.body).includes('password_hash'));const album=view.body.albums[0];
 assert.equal((await reviewer('/api/hub?review='+other)).status,401);
 assert.equal((await reviewer('/api/hub',{action:'project',id,name:'Unauthorized edit'})).status,401);
 assert.equal((await reviewer('/api/hub',{action:'complete',token:id,id:album.id,version:0,complete:true,reviewer:'Test teacher'})).status,200);
 assert.equal((await reviewer('/api/hub',{action:'complete',token:id,id:album.id,version:0,complete:false,reviewer:'Test teacher'})).status,409);
 assert.equal((await reviewer('/api/hub?review='+id)).body.albums[0].complete,1);
 await manager('/api/hub',{action:'project',id,name:'Private test',password:'New project password'});
 assert.equal((await reviewer('/api/hub?review='+id)).status,401);
 assert.equal((await reviewer('/api/auth',{action:'unlock',project_id:id,password:'Project password 123'})).status,401);
 assert.equal((await reviewer('/api/auth',{action:'unlock',project_id:id,password:'New project password'})).status,200);
 assert.equal((await reviewer('/api/hub?review='+id)).body.albums[0].complete,1);
 await manager('/api/hub',{action:'album',id:album.id,section:'Act 1',title:'Test album',url:'https://lightroom.adobe.com/shares/replaced'});
 assert.equal((await reviewer('/api/hub?review='+id)).body.albums[0].complete,0);
 await reviewer('/api/auth',{action:'logout',project_id:id});assert.equal((await reviewer('/api/hub?review='+id)).status,401);
 const cross=await fetch(origin+'/api/auth',{method:'POST',headers:{Origin:'https://wrong.example','Content-Type':'application/json'},body:JSON.stringify({action:'login'})});assert.equal(cross.status,403);
 console.log('PASS: manager login, protected API, password gates, project isolation, reviewer restrictions, persistent completion, stale-update conflict, password rotation revocation, link-change reopening, logout and cross-origin rejection.');
}catch(e){console.error(logs);throw e;}finally{next.kill('SIGTERM');mock.close();}
