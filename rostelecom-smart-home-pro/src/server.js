import http from 'node:http';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {SmartHome,initialState} from './domain.js';
const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const DATA=path.join(ROOT,'data','state.json');
const MIME={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.json':'application/json; charset=utf-8','.svg':'image/svg+xml'};
await mkdir(path.dirname(DATA),{recursive:true});
let state=initialState(); if(existsSync(DATA)){try{state=JSON.parse(await readFile(DATA,'utf8'));}catch{console.error('State file is invalid; starting with clean demo data.');}}
let saveQueue=Promise.resolve(); const persist=()=>{const snapshot=JSON.stringify(home.snapshot(),null,2);saveQueue=saveQueue.then(()=>writeFile(DATA,snapshot));};
const home=new SmartHome(state,persist); const clients=new Set();
function broadcast(){const payload=`data: ${JSON.stringify({type:'state',state:home.snapshot()})}\n\n`;for(const res of clients){try{res.write(payload);}catch{clients.delete(res);}}}
const originalPersist=persist; // state mutations are broadcast after each API command below.
function json(res,status,obj){res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify(obj));}
async function body(req){let raw='';for await(const chunk of req){raw+=chunk;if(raw.length>16_384)throw Object.assign(new Error('Request body too large'),{status:413});}try{return raw?JSON.parse(raw):{};}catch{throw Object.assign(new Error('Некорректный JSON'),{status:400});}}
const server=http.createServer(async(req,res)=>{
  const url=new URL(req.url,'http://localhost'); const pathname=decodeURIComponent(url.pathname);
  if(req.method==='GET'&&pathname==='/api/health')return json(res,200,{ok:true,service:'smart-home-pro',mode:'sim',version:'1.0.0'});
  if(req.method==='GET'&&pathname==='/api/events/stream') {res.writeHead(200,{'Content-Type':'text/event-stream','Cache-Control':'no-cache','Connection':'keep-alive'});res.write(`data: ${JSON.stringify({type:'state',state:home.snapshot()})}\n\n`);clients.add(res);req.on('close',()=>clients.delete(res));return;}
  try{
    if(req.method==='GET'&&pathname==='/api/state')return json(res,200,home.snapshot());
    if(req.method==='GET'&&pathname==='/api/devices')return json(res,200,home.snapshot().devices);
    if(req.method==='GET'&&pathname==='/api/events')return json(res,200,home.snapshot().events);
    if(req.method==='PATCH'&&pathname.startsWith('/api/devices/')){const input=await body(req);const d=home.updateDevice(pathname.split('/').at(-1),input);persist();broadcast();return json(res,200,d);}
    if(req.method==='POST'&&pathname==='/api/simulate'){const input=await body(req);const result=home.simulate(input.kind);persist();broadcast();return json(res,200,result);}
    if(req.method==='PATCH'&&pathname.startsWith('/api/rules/')){const input=await body(req);const r=home.setRule(pathname.split('/').at(-1),input.enabled);persist();broadcast();return json(res,200,r);}
    if(req.method==='DELETE'&&pathname==='/api/events'){home.clearEvents();persist();broadcast();return json(res,200,{ok:true});}
    if(req.method==='GET'&&pathname.startsWith('/api/'))return json(res,404,{error:'API route not found'});
    if(req.method!=='GET'&&req.method!=='HEAD')return json(res,405,{error:'Method not allowed'});
    const relative=pathname==='/'?'index.html':pathname.replace(/^\//,'');const file=path.resolve(ROOT,'public',relative);
    if(!file.startsWith(path.join(ROOT,'public')+path.sep))return json(res,403,{error:'Forbidden'});
    try{const content=await readFile(file);res.writeHead(200,{'Content-Type':MIME[path.extname(file)]||'application/octet-stream','Cache-Control':'no-cache'});return res.end(req.method==='HEAD'?undefined:content);}catch{return json(res,404,{error:'Not found'});}
  }catch(err){return json(res,err.status||500,{error:err.message||'Internal server error'});}
});
const port=Number(process.env.PORT||4173);server.listen(port,'0.0.0.0',()=>console.log(`Smart Home PRO running at http://localhost:${port}`));
