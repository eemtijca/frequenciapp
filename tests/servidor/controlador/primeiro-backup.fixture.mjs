// Produz conjuntos com Bash, GPG e jq reais; somente Docker e I/O Dropbox são sintéticos.
import fs from "node:fs";
import { createHash } from "node:crypto";
import { fixture } from "./fixture.mjs";

export function primeiroBackup(t) {
  const f = fixture({ adotar: false });
  t.after(f.limpar);
  f.gravar(`${f.config}/app.env`, fs.readFileSync(`${f.config}/app.env`, "utf8").replace("export AGENDA_PLANILHAS", "AGENDA_PLANILHAS"));
  const estado = `${f.raiz}/legado`, backups = `${f.raiz}/backups`, remoto = `${f.raiz}/remoto`;
  for (const dir of [estado, backups, remoto, `${f.raiz}/locks`]) fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  const alvo = JSON.parse(fs.readFileSync(`${f.config}/identidade.json`)).trava;
  const targetLock = `${f.raiz}/locks/operacoes-${alvo}.lock`, authorityLock = `${f.raiz}/locks/dropbox.lock`;
  f.gravar(targetLock, ""); f.gravar(authorityLock, "");
  const gpgHome = fs.mkdtempSync("/tmp/chave-");
  t.after(() => { f.executar("gpgconf", ["--homedir", gpgHome, "--kill", "gpg-agent"]); fs.rmSync(gpgHome, { recursive: true, force: true }); });
  f.ok(f.executar("gpg", ["--homedir", gpgHome, "--batch", "--pinentry-mode", "loopback", "--passphrase", "", "--quick-generate-key", "Fixture <fixture@example.invalid>", "rsa2048", "encr", "1d"]));
  const fingerprint = f.ok(f.executar("gpg", ["--homedir", gpgHome, "--with-colons", "--list-keys"])).stdout.split("\n").find(l => l.startsWith("fpr:")).split(":")[9];
  f.gravar(`${f.config}/publica.gpg`, f.ok(f.executar("gpg", ["--homedir", gpgHome, "--export", fingerprint], { encoding: null })).stdout);
  const rclone = `${f.config}/rclone.conf`, adocao = `${f.config}/adocao.json`, token = `${f.config}/token.json`;
  f.gravar(rclone, "[falso]\ntype = dropbox\nroot_namespace = 42\ntoken = sintetico\n");
  f.gravar(token, JSON.stringify({ clientId: "fixture", clientSecret: "fixture", refreshToken: "fixture" }));
  const config = { versao: 1, adocao: "pasta-exclusiva-frequenciapp-v1", accountId: "dbid:synthetic", namespaceId: "42", folderId: "id:folder_synthetic", folderPath: "/copias", destino: "falso:copias", alvo, banco: "frequencia", schema: "public", tokenFile: token, rcloneConfig: rclone, rcloneConfigSha256: createHash("sha256").update(fs.readFileSync(rclone)).digest("hex"), authorityLock, targetLock, limiteBytes: 1024 * 1024, timeoutMs: 1000 };
  f.gravar(adocao, JSON.stringify(config));
  fs.appendFileSync(`${f.config}/ops.env`, `BACKUP_DIR=${backups}\nSERVIDOR_LOCK_DIR=${f.raiz}/locks\nSERVIDOR_USUARIO=root\nBACKUP_CRIPTOGRAFIA=gpg\nBACKUP_GPG_DESTINATARIO=${fingerprint}\nBACKUP_GPG_FINGERPRINT=${fingerprint}\nBACKUP_GPG_CHAVE_PUBLICA=${f.config}/publica.gpg\nBACKUP_REMOTO=falso:copias\nBACKUP_RCLONE_CONFIG=${rclone}\nBACKUP_DROPBOX_CONFIG=${adocao}\nBACKUP_RETER_REMOTO=true\nBACKUP_CATALOGO_PERSISTENTE=true\nBACKUP_RETER_MINIMO=5\nBACKUP_RETER_DIAS=30\n`);
  const docker = fs.readFileSync(`${f.bin}/docker`, "utf8").replace("exec) exit 0;;", `exec)
if [[ "$*" == *"SELECT current_database();"* ]]; then printf 'frequencia\\n';
elif [[ " $* " == *" pg_dump "* ]]; then printf 'DUMP SINTETICO, SEM POSTGRESQL\\n'; printf 'dump\\n' >>${f.raiz}/dumps;
elif [[ " $* " == *" pg_restore -l "* ]]; then cat >/dev/null;
else exit 95; fi;;`);
  f.gravar(`${f.bin}/docker`, docker, 0o700);
  // A consulta de capacidade é delegada ao rclone real. Upload/download usam uma pasta local.
  f.gravar(`${f.bin}/rclone`, `#!/bin/bash
set -Eeuo pipefail
if [ "$*" = 'config providers' ]; then exec /usr/local/bin/rclone "$@"; fi
exec ${process.execPath} ${f.raiz}/rclone-io.cjs "$@"
`, 0o700);
  f.gravar(`${f.raiz}/rclone-io.cjs`, `const fs=require('node:fs'),path=require('node:path');
const [cmd,src,dst,...args]=process.argv.slice(2), remote=${JSON.stringify(remoto)};
const resolve=p=>{if(!p.startsWith('falso:copias/'))throw Error('Destino não autorizado');const n=p.slice(13);if(!n||path.basename(n)!==n)throw Error('Nome não autorizado');return path.join(remote,n);};
if(cmd==='copy' && dst==='falso:copias' && args.includes('--immutable')){for(const n of fs.readdirSync(src)){const d=resolve(dst+'/'+n);if(fs.existsSync(d))throw Error('imutável');fs.copyFileSync(path.join(src,n),d);}}
else if(cmd==='copyto' && args.length===0){fs.copyFileSync(src.startsWith('falso:')?resolve(src):src,dst.startsWith('falso:')?resolve(dst):dst);}
else throw Error('Operação de transporte não autorizada');
`);
  // Interceptação exclusivamente na fixture: o cliente/validador nativo conserva as origens fixas.
  f.gravar(`${f.raiz}/https-io.mjs`, `import https from 'node:https';import fs from 'node:fs';import {Readable,Writable} from 'node:stream';import assert from 'node:assert/strict';import {createHash} from 'node:crypto';
const remote=${JSON.stringify(remoto)}, trace=${JSON.stringify(`${f.raiz}/https.jsonl`)};
if(process.argv[1]?.endsWith('/backup-recibos.mjs')&&fs.existsSync(${JSON.stringify(`${f.raiz}/relogio-futuro`)})){const now=Date.now;Date.now=()=>now()+32*86400000;}
https.request=(o,cb)=>{assert.equal(o.protocol,'https:');assert.equal(o.port,443);assert.equal(o.rejectUnauthorized,true);assert.equal(o.minVersion,'TLSv1.2');assert.ok(['api.dropbox.com','api.dropboxapi.com','content.dropboxapi.com'].includes(o.hostname));
let body='';const req=new Writable({write(c,e,next){body+=c;next();},final(next){setImmediate(()=>{try{const arg=o.headers['Dropbox-API-Arg']?JSON.parse(o.headers['Dropbox-API-Arg']):body.startsWith('{')?JSON.parse(body):null;fs.appendFileSync(trace,JSON.stringify({rota:o.path,arg})+'\\n');
const names=fs.readdirSync(remote),meta=n=>({'.tag':'file',name:n,id:'id:'+Buffer.from(n).toString('hex'),rev:createHash('sha256').update(fs.readFileSync(remote+'/'+n)).digest('hex'),path_lower:'/copias/'+n.toLowerCase(),size:fs.statSync(remote+'/'+n).size});
let data,headers={};switch(o.path){case '/oauth2/token':data={access_token:'fixture',token_type:'bearer',expires_in:3600};break;
case '/2/users/get_current_account':data={account_id:'dbid:synthetic',root_info:{root_namespace_id:'42'}};break;
case '/2/files/get_metadata':data={'.tag':'folder',id:'id:folder_synthetic',path_lower:fs.existsSync(${JSON.stringify(`${f.raiz}/pasta-divergente`)})?'/outra':'/copias'};break;
case '/2/files/list_folder':data={entries:names.map(meta),has_more:false,cursor:'fim'};break;
case '/2/files/download':{const n=names.find(n=>meta(n).id===arg.path&&meta(n).rev===arg.rev);assert.ok(n);data=fs.readFileSync(remote+'/'+n);headers['dropbox-api-result']=JSON.stringify(meta(n));break;}
case '/2/files/delete_v2':{const n=names.find(n=>meta(n).id===arg.path&&meta(n).rev===arg.parent_rev);assert.ok(n);data={metadata:meta(n)};fs.unlinkSync(remote+'/'+n);break;}
default:throw Error('Rota não autorizada');}
if(!Buffer.isBuffer(data))data=Buffer.from(JSON.stringify(data));const res=Readable.from([data]);res.headers={...headers,'content-length':String(data.length)};res.statusCode=200;cb(res);}catch(e){req.destroy(e);}});next();}});req.setTimeout=()=>req;return req;};
`);
  f.gravar(`${f.bin}/node`, `#!/bin/sh\nexec ${process.execPath} --import=${f.raiz}/https-io.mjs "$@"\n`, 0o700);
  const env = { PATH: `${f.bin}:/usr/local/bin:/usr/bin:/bin`, HOME: f.raiz, TMPDIR: f.raiz, APP_DIR: f.app, APP_ENV_FILE: `${f.config}/app.env`, OPS_ENV_FILE: `${f.config}/ops.env`, SERVIDOR_CONFIG_DIR: f.config };
  const backup = (args = []) => f.executar("/bin/bash", [`${f.app}/scripts/servidor/backup-banco.sh`, ...args], { env });
  const ler = p => JSON.parse(fs.readFileSync(p));
  return { ...f, estado, backups, remoto, targetLock, authorityLock, adocaoDropbox: adocao, configDropbox: config, backup, ler, gpgHome };
}
