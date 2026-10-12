// Local-only fixture proxy. Never forward writes or provider collection requests.
import http from 'node:http';
const upstream='http://localhost:5173';
const scenarios=new Set(['saved','fresh','empty','partial','failed','loading']);
const seeds=new Map();let confirmed=false;
async function seed(path,headers){if(!seeds.has(path)){const response=await fetch(upstream+path,{headers});if(!response.ok)throw new Error('Fixture seed unavailable');seeds.set(path,await response.json());}return structuredClone(seeds.get(path));}
const server=http.createServer(async(request,response)=>{
 try{
  const url=new URL(request.url,'http://127.0.0.1:5180');
  if(url.pathname.startsWith('/__fixture/')){const scenario=url.pathname.split('/').at(-1);if(!scenarios.has(scenario)){response.writeHead(400);response.end('Unknown fixture');return;}confirmed=false;response.writeHead(302,{'set-cookie':`photon-fixture=${scenario}; Path=/; SameSite=Lax`,'location':url.searchParams.get('return')||'/'});response.end();return;}
  const scenario=/photon-fixture=([^;]+)/.exec(request.headers.cookie||'')?.[1]||'saved';
  const headers={...request.headers};delete headers.host;delete headers.connection;delete headers['accept-encoding'];
  if(request.method!=='GET'&&request.method!=='HEAD'){
   const command=/^\/api\/devices\/tuya\/[^/]+\/command$/.test(url.pathname);
   response.writeHead(command?200:409,{'content-type':'application/json','cache-control':'no-store'});response.end(JSON.stringify(command?(confirmed=true,{status:'accepted'}):{error:'Local fixture preview does not write data or contact devices.'}));return;
  }
  if(url.pathname.startsWith('/api/')&&scenario==='loading'&&!url.pathname.startsWith('/api/mobile/'))await new Promise(resolve=>setTimeout(resolve,4000));
  if(url.pathname.startsWith('/api/')&&scenario==='failed'&&!url.pathname.startsWith('/api/mobile/')){response.writeHead(503,{'content-type':'application/json','cache-control':'no-store'});response.end(JSON.stringify({error:'Fixture: saved data could not be refreshed. Try again.'}));return;}
  if(['/api/devices','/api/tuya/devices','/api/solar/latest','/api/favorites'].includes(url.pathname)&&scenario!=='saved'){
   const data=await seed(url.pathname,headers),now=new Date().toISOString();
   if(data.devices){data.devices=scenario==='empty'?[]:data.devices.map((device,index)=>({...device,online:scenario==='fresh',stale:scenario!=='fresh',connectionStatus:scenario==='fresh'?'online':'stale',updatedAt:scenario==='fresh'?now:device.updatedAt,datapoints:device.datapoints.map(point=>({...point,updatedAt:scenario==='fresh'?now:point.updatedAt,...(confirmed&&point.code.startsWith('switch')?{raw:false,formatted:'Off'}:{}),...(scenario==='partial'&&index===0&&!point.code.startsWith('switch')?{raw:null,value:null,available:false,formatted:'Unavailable'}:{})}))}));}
   if(data.readings){data.updatedAt=scenario==='fresh'?now:data.updatedAt;data.readings=data.readings.map(reading=>({...reading,...(scenario==='fresh'&&reading.value!==null?{quality:'good',sourceTimestamp:now}:{}),...(scenario==='empty'||scenario==='partial'&&['home_power','grid_power'].includes(reading.metric)?{value:null,quality:'missing'}:{})}));if(scenario==='empty')data.series=[];}
   if(data.favorites&&scenario==='empty')data.favorites=[];
   response.writeHead(200,{'content-type':'application/json','cache-control':'no-store'});response.end(JSON.stringify(data));return;
  }
  const result=await fetch(upstream+request.url,{headers,redirect:'manual'});response.writeHead(result.status,Object.fromEntries([...result.headers].filter(([key])=>!['content-encoding','content-length','transfer-encoding'].includes(key))));response.end(Buffer.from(await result.arrayBuffer()));
 }catch{response.writeHead(502,{'content-type':'application/json'});response.end(JSON.stringify({error:'Local fixture preview is unavailable.'}));}
});
server.listen(5180,'127.0.0.1',()=>console.log('Read-only fixtures: http://127.0.0.1:5180/__fixture/fresh'));
