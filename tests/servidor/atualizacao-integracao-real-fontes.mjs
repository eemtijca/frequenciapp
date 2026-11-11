// Prepara apenas fontes próprias, Git sintético e o fechamento local do pg.
import fs from "node:fs";
import path from "node:path";

import { spawnSync } from "node:child_process";
import { PUBLICOS, AMBIENTE, gravar } from "./atualizacao-integracao-fontes.mjs";
import { exigir, hash, iguais, fixar, arquivoProtegido, diretorioProtegido, raizRoot, volumeNome } from "./atualizacao-integracao-real-contrato.mjs";
export const RUNTIME = Object.freeze(["real","real-contrato","real-engine","real-root","real-fontes","real-app","real-proxy","adaptador","receitas","fontes","shim"].map(x=>`tests/servidor/atualizacao-integracao-${x}.mjs`));
export const FONTES = Object.freeze([...new Set([...PUBLICOS,"src/infra/schema-postgres.mjs",...RUNTIME,"tests/servidor/atualizacao-integracao-real.Dockerfile"])]);
export { AMBIENTE, gravar };
export function inventarioReal(raiz, uid, incluirGit=false) {
  const out={};
  const visitar=rel=>{
    const n=path.join(raiz,rel),s=fs.lstatSync(n);
    exigir(!s.isSymbolicLink() && s.uid===uid && (s.mode&0o022)===0,"OWNER");
    if(s.isDirectory()) for(const k of fs.readdirSync(n).sort()) {if(k!==".git"||incluirGit)visitar(path.join(rel,k));}
    else {exigir(s.isFile() && s.nlink===1 && s.size<=32*1024*1024,"FONTE");out[rel]={tipo:"arquivo",sha256:hash(fs.readFileSync(n)),modo:s.mode&0o111?0o755:0o644};}
  };visitar("");return out;
}
export function conferirContexto(raiz, esperado, uid) {
  exigir(iguais(inventarioReal(raiz,uid),esperado),"CONTEXTO");
}
function git(n,args) {
  const r=spawnSync("/usr/bin/git",["-C",n,...args],{env:{...AMBIENTE,GIT_AUTHOR_NAME:"Ensaio",GIT_AUTHOR_EMAIL:"ensaio@example.invalid",GIT_COMMITTER_NAME:"Ensaio",GIT_COMMITTER_EMAIL:"ensaio@example.invalid",GIT_AUTHOR_DATE:"2026-01-01T00:00:00Z",GIT_COMMITTER_DATE:"2026-01-01T00:00:00Z"},maxBuffer:32*1024*1024});
  exigir(!r.error&&!r.signal&&r.status===0,"GIT");return r.stdout;
}
export function fechamentoPg(nodeModules) {
  const root=fs.realpathSync(nodeModules),pending=["pg"],done=new Map(),out={};

  while(pending.length) {
    const nome=pending.shift();if(done.has(nome))continue;
    exigir(/^(?:@[a-z0-9_-]+\/)?[a-z0-9_-]+$/.test(nome),"PG_PACOTE");
    const p=fs.realpathSync(path.join(root,nome,"package.json"));
    exigir(p.startsWith(root+"/"),"PG_ORIGEM");
    const pkg=JSON.parse(fs.readFileSync(p));exigir(pkg.name===nome,"PG_PACOTE");
    done.set(nome,p);
    for(const dep of Object.keys(pkg.dependencies??{}))pending.push(dep);
    for(const dep of Object.keys(pkg.optionalDependencies??{}))if(fs.existsSync(path.join(root,dep,"package.json")))pending.push(dep);
    const base=path.dirname(p);
    const visitar=rel=>{
      const full=path.join(base,rel),s=fs.lstatSync(full);
      exigir(!s.isSymbolicLink(),"PG_LINK");
      if(s.isDirectory()) { for(const n of fs.readdirSync(full).sort())if(n!=="node_modules" && n!==".git")visitar(path.join(rel,n)); }
      else { exigir(s.isFile() && s.size<=4*1024*1024,"PG_FONTE");const bytes=fs.readFileSync(full);out[`node_modules/${nome}/${rel}`]={origem:full,sha256:hash(bytes),bytes:bytes.length}; }
    };visitar("");
    exigir(done.size<=32,"PG_LIMITE");
  }
  return {pacotes:Object.fromEntries([...done].map(([n,p])=>[n,{origem:p,versao:JSON.parse(fs.readFileSync(p)).version}])),arquivos:out};
}
function copiarArvore(src,dst) {
  const s=fs.lstatSync(src);exigir(!s.isSymbolicLink(),"FONTE");
  if(s.isDirectory()){fs.mkdirSync(dst,{mode:0o700});for(const n of fs.readdirSync(src))copiarArvore(path.join(src,n),path.join(dst,n));}
  else gravar(dst,fs.readFileSync(src),s.mode&0o111?0o755:0o644);
}
export function composeOperacional(m, produto) {
  const imageA=`ensaio/real-${m.rodada}:proxy`;
  return JSON.stringify({name:produto.projeto,services:{app:{image:"${APP_IMAGEM}",volumes:[{type:"volume",source:"socket",target:"/pgsocket",read_only:true},{type:"volume",source:"http",target:"/http"}]},db:{image:m.imagens.postgres.id,volumes:[{type:"volume",source:"dados",target:"/var/lib/postgresql/data"},{type:"volume",source:"socket",target:"/pgsocket"}]},caddy:{image:imageA,volumes:[{type:"volume",source:"http",target:"/http"}]}},volumes:Object.fromEntries(["dados","socket","http"].map(n=>[n,{external:true,name:volumeNome(m,n)}]))})+"\n";
}
export function prepararRuntime(m, origem, nodeModules) {
  exigir(process.getuid()===1000 && !fs.existsSync(m.diretorio),"HOST_UID");
  exigir(iguais(Object.keys(m.fontes).filter(n=>!n.startsWith("node_modules/")).sort(),[...FONTES].sort()),"FONTES");
  for(const n of Object.keys(m.fontes))exigir(hash(arquivoProtegido(`${origem}/${n}`,1000))===m.fontes[n],"FONTES_HASH");
  fs.mkdirSync(m.diretorio,{mode:0o700});diretorioProtegido(m.diretorio,1000);
  const repo=`${m.diretorio}/repos/trabalho`;fs.mkdirSync(repo,{recursive:true,mode:0o700});
  const deps=fechamentoPg(nodeModules);
  exigir(iguais(Object.fromEntries(Object.entries(deps.arquivos).map(([n,d])=>[n,d.sha256])),Object.fromEntries(Object.entries(m.fontes).filter(([n])=>n.startsWith("node_modules/")))),"PG_HASH");
  for(const [n,d] of Object.entries(deps.arquivos))gravar(`${repo}/${n}`,arquivoProtegido(d.origem,1000),0o644);
  for(const n of ["docker/app/migrar.mjs","src/infra/schema-postgres.mjs"])gravar(`${repo}/${n}`,arquivoProtegido(`${origem}/${n}`,1000),0o644);
  for(const n of ["app","proxy"])gravar(`${repo}/tests/servidor/atualizacao-integracao-real-${n}.mjs`,arquivoProtegido(`${origem}/tests/servidor/atualizacao-integracao-real-${n}.mjs`,1000),0o644);
  gravar(`${repo}/Dockerfile`,arquivoProtegido(`${origem}/tests/servidor/atualizacao-integracao-real.Dockerfile`,1000),0o644);
  gravar(`${repo}/.dockerignore`,".git\n",0o644);
  gravar(`${repo}/prisma/migrations/0001/migration.sql`,"-- Migração sintética idêntica entre A e B.\nSELECT 1;\n",0o644);
  gravar(`${repo}/versao.txt`,"A\n",0o644);
  // O operacional é fixado fora dos commits e nunca escolhido pelo alvo B.
  gravar(`${repo}/compose.yml`,composeOperacional(m,{projeto:`real-${m.rodada}`}),0o644);
  git(repo,["init","-q","-b","main"]);git(repo,["add","."]);git(repo,["commit","-qm","fonte A"]);
  const A=git(repo,["rev-parse","HEAD"]).toString().trim(), invA=inventarioReal(repo,1000);
  fs.writeFileSync(`${repo}/versao.txt`,"B\n");git(repo,["add","."]);git(repo,["commit","-qm","fonte B"]);
  const B=git(repo,["rev-parse","HEAD"]).toString().trim(),invB=inventarioReal(repo,1000);
  const revisoes=Object.fromEntries([["A",A,invA],["B",B,invB]].map(([r,commit,inv])=>[r,{commit,contextoSha256:hash(JSON.stringify(inv)),imagem:`ensaio/real-${m.rodada}:main-${commit.slice(0,12)}`}]));
  const root=raizRoot(m),publico=Object.fromEntries(PUBLICOS.map(n=>[n,m.fontes[n]]));
  const produto={versao:1,rodada:`coeso-${m.rodada}`,projeto:`real-${m.rodada}`,revisoes,operacionalSha256:hash(JSON.stringify(publico)),migradorSha256:m.fontes["docker/app/migrar.mjs"],banco:"frequencia",usuario:"frequencia",schema:"public",vertical:{raiz:root,fonte:`${root}/fonte`,app:`${root}/app`,host:`${root}/host-inacessivel`,config:`${root}/config`,prefixo:`${root}/controlador`,bin:`${root}/bin`,socket:`${root}/canal/supervisor.sock`,inventarios:{A:invA,B:invB},publico,composeSha256:null}};
  const compose=composeOperacional(m,produto);
  // O repo sintético do produto contém exatamente o snapshot adotado em ambas as revisões.
  // Os hashes Git anteriores continuam referindo fontes; o snapshot vive fora dele.
  produto.vertical.composeSha256=hash(compose);
  for(const [rev,commit,inv] of [["A",A,invA],["B",B,invB]]){
    const dest=`${m.diretorio}/contextos/${rev}`;fs.mkdirSync(dest,{recursive:true,mode:0o700});
    for(const [n,d] of Object.entries(inv))gravar(`${dest}/${n}`,git(repo,["show",`${commit}:${n}`]),d.modo);
    conferirContexto(dest,inv,1000);
  }
  git(repo,["clone","--quiet","--bare","--no-hardlinks",repo,`${m.diretorio}/repos/remoto.git`]);
  git(repo,["remote","add","origin",`${root}/remoto.git`]);git(repo,["update-ref","refs/remotes/origin/main",B]);git(repo,["checkout","-q","--detach",A]);
  const bundle=`${m.diretorio}/bootstrap`;fs.mkdirSync(bundle,{mode:0o700});
  for(const n of Object.keys(m.fontes))gravar(`${bundle}/fonte/${n}`,arquivoProtegido(`${origem}/${n}`,1000),n.endsWith(".sh")?0o755:0o644);
  copiarArvore(`${m.diretorio}/repos/remoto.git`,`${bundle}/remoto.git`);copiarArvore(repo,`${bundle}/app`);
  gravar(`${bundle}/operacional/compose.yml`,compose,0o644);
  gravar(`${m.diretorio}/operacional/compose.yml`,compose,0o600);
  const inputsSha256=hash(JSON.stringify({m,produto,deps}));
  const runtime={versao:1,manifesto:m,produto,inputsSha256,bootstrapSha256:hash(JSON.stringify(inventarioReal(bundle,1000,true))),dependencias:deps};
  gravar(`${bundle}/runtime.json`,JSON.stringify(runtime)+"\n",0o644);
  gravar(`${m.diretorio}/runtime.json`,JSON.stringify(runtime)+"\n");
  const selar=n=>{const s=fs.lstatSync(n);if(s.isDirectory()){for(const filho of fs.readdirSync(n))selar(path.join(n,filho));fs.chmodSync(n,0o755);}else fs.chmodSync(n,s.mode&0o111?0o555:0o444);};selar(bundle);
  return fixar(runtime);
}
export function copiarBootstrap(runtime) {
  const m=runtime.manifesto,root=raizRoot(m);exigir(process.getuid()===0,"ROOT");
  diretorioProtegido(root,0);
  const observado=inventarioReal("/bootstrap",1000,true);delete observado["runtime.json"];
  exigir(hash(JSON.stringify(observado))===runtime.bootstrapSha256,"BOOTSTRAP_HASH");
  if(fs.existsSync(`${root}/runtime.json`)) {
    exigir(hash(arquivoProtegido(`${root}/runtime.json`,0))===hash(Buffer.from(JSON.stringify(runtime)+"\n")),"REABERTURA");return;
  }
  for(const n of ["fonte","remoto.git","app"])copiarArvore(`/bootstrap/${n}`,`${root}/${n}`);
  gravar(`${root}/operacional/compose.yml`,fs.readFileSync("/bootstrap/operacional/compose.yml"));
  gravar(`${root}/runtime.json`,JSON.stringify(runtime)+"\n");
  conferirContexto(`${root}/app`,runtime.produto.vertical.inventarios.A,0);
  for(const [n,h] of Object.entries(m.fontes))exigir(hash(arquivoProtegido(`${root}/fonte/${n}`,0))===h,"FONTES_HASH");
}
