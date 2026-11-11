// Proxy sintético estável: encaminha somente a saúde entre sockets Unix próprios.
import http from "node:http";
import fs from "node:fs";
import { pathToFileURL } from "node:url";
import { consultarUnix, limparSocketProprio } from "./atualizacao-integracao-real-app.mjs";
export async function iniciarProxy() {
  if(process.getuid()!==1000)throw new Error("PROXY_UID");
  const socket="/http/proxy.sock";limparSocketProprio(socket);
  const server=http.createServer(async(req,res)=>{
    if(req.method!=="GET"||req.url!=="/api/saude"){res.writeHead(404);res.end();return;}
    try{const b=await consultarUnix();res.writeHead(200,{"Content-Type":"text/plain","Content-Length":String(b.length),"Cache-Control":"no-store"});res.end(b);}catch{res.writeHead(503);res.end();}
  });
  await new Promise((resolve,reject)=>{server.once("error",reject);server.listen(socket,resolve);});fs.chmodSync(socket,0o666);
  const parar=()=>server.close(()=>process.exit(0));process.once("SIGTERM",parar);process.once("SIGINT",parar);return server;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  try{if(process.argv.length===3&&["--observar","--saude"].includes(process.argv[2]))process.stdout.write(await consultarUnix("/http/proxy.sock"));else if(process.argv.length===2)await iniciarProxy();else throw new Error("ARGUMENTOS");}catch(e){process.stderr.write((e.code??e.message)+"\n");process.exitCode=1;}
}
