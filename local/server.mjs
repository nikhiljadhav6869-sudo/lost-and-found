import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import {Readable} from 'node:stream';
import {clientIp} from './client-ip.mjs';
import {drainAuthEmails} from '../lib/auth-email.ts';
import * as api from '../app/api/[...path]/route.ts';
import * as auth from '../app/api/auth/[...all]/route.ts';
const port=Number(process.env.PORT||3000),host=process.env.HOST||'127.0.0.1';
const publicOrigin=process.env.APP_ORIGIN||`http://${host}:${port}`;
const root=path.resolve('dist/local');
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg','.webp':'image/webp','.ico':'image/x-icon','.webmanifest':'application/manifest+json; charset=utf-8'};
export const server=http.createServer(async(req,res)=>{
 try{
  const url=new URL(req.url,publicOrigin);
  if(url.pathname.startsWith('/api/')){
   const handler=(url.pathname.startsWith('/api/auth/')?auth:api)[req.method];
   if(!handler){res.writeHead(405);res.end();return;}
   const headers=new Headers();for(const [k,v] of Object.entries(req.headers)){if(v&&k!=='cf-connecting-ip')headers.set(k,Array.isArray(v)?v.join(','):v);}headers.set('cf-connecting-ip',clientIp(req));
   const request=new Request(url,{method:req.method,headers,...(!['GET','HEAD'].includes(req.method)?{body:Readable.toWeb(req),duplex:'half'}:{})});
   const response=await handler(request);res.statusCode=response.status;response.headers.forEach((v,k)=>{if(k!=='set-cookie')res.setHeader(k,v);});const cookies=response.headers.getSetCookie();if(cookies.length)res.setHeader('Set-Cookie',cookies);
   res.setHeader('X-Frame-Options','SAMEORIGIN');res.setHeader('Referrer-Policy','same-origin');if(response.body)Readable.fromWeb(response.body).pipe(res);else res.end();return;
  }
  let file=path.resolve(root,'.'+decodeURIComponent(url.pathname));if(!file.startsWith(root+path.sep)&&file!==root){res.writeHead(403);res.end();return;}
  if(!fs.existsSync(file)||fs.statSync(file).isDirectory()){
   if(url.pathname==='/sw.js'||url.pathname==='/manifest.webmanifest'||url.pathname==='/offline.html'||url.pathname.startsWith('/icons/')){res.writeHead(404,{'Content-Type':'text/plain; charset=utf-8'});res.end('Not found');return;}
   file=path.join(root,'index.html');
  }
  const headers={'Content-Type':mime[path.extname(file)]||'application/octet-stream','X-Content-Type-Options':'nosniff','Referrer-Policy':'same-origin'};
  if(url.pathname==='/sw.js'||url.pathname==='/manifest.webmanifest'||path.extname(file)==='.html')headers['Cache-Control']='no-cache';
  res.writeHead(200,headers);fs.createReadStream(file).pipe(res);
 }catch(error){console.error('Request failed:',error.message);if(!res.headersSent)res.writeHead(500,{'Content-Type':'application/json'});res.end(JSON.stringify({error:'The server could not complete the request.'}));}
});
server.listen(port,host,()=>console.log(`Lost & Found running at ${publicOrigin}`));
const shutdown=()=>server.close(async()=>{await drainAuthEmails();process.exit(0);});
process.on('SIGTERM',shutdown);process.on('SIGINT',shutdown);
