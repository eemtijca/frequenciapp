// Define a fronteira real finita, sem herdar o domínio Root simulado.
import fs from "node:fs";
import path from "node:path";
import { exigir, falha, hash, iguais, fixar, validarPedido } from "./atualizacao-integracao-receitas.mjs";
export { exigir, falha, hash, iguais, fixar };
export const VERSAO_API = "v1.47";
export const MAX = 32 * 1024 * 1024;
export const idDocker = (s) => typeof s === "string" && /^[a-f0-9]{64}$/.test(s);
export const digest = (s) => typeof s === "string" && /^[a-f0-9]{64}$/.test(s);
export const imageId = (s) => typeof s === "string" && /^sha256:[a-f0-9]{64}$/.test(s);
export function campos(o, nomes, causa = "CAMPOS") {
  exigir(o && Object.getPrototypeOf(o) === Object.prototype && iguais(Object.keys(o).sort(), [...nomes].sort()), causa);
}
export function arquivoProtegido(n, uid, max = MAX) {
  exigir(path.isAbsolute(n) && path.resolve(n) === n && fs.realpathSync(n) === n, "CAMINHO");
  const fd = fs.openSync(n, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW);
  try {
    const s = fs.fstatSync(fd);
    exigir(s.isFile() && s.uid === uid && s.nlink === 1 && (s.mode & 0o022) === 0 && s.size <= max, "OWNER");
    const b = fs.readFileSync(fd);
    exigir(b.length === s.size, "TAMANHO");
    return b;
  } finally { fs.closeSync(fd); }
}
export function diretorioProtegido(n, uid) {
  const s = fs.lstatSync(n);
  exigir(s.isDirectory() && !s.isSymbolicLink() && s.uid === uid && (s.mode & 0o077) === 0 && fs.realpathSync(n) === n, "OWNER");
}
export function manifestoReal(v) {
  campos(v, ["versao", "rodada", "diretorio", "fontes", "imagens"], "MANIFESTO");
  exigir(v.versao === 1 && /^[a-f0-9]{32}$/.test(v.rodada), "MANIFESTO");
  exigir(path.isAbsolute(v.diretorio) && path.resolve(v.diretorio) === v.diretorio && path.basename(v.diretorio) === `real-${v.rodada}` && !/[\s,'"%]/.test(v.diretorio), "MANIFESTO");
  exigir(v.fontes && Object.keys(v.fontes).length >= 25 && Object.keys(v.fontes).length <= 4096, "FONTES");
  for (const [n, d] of Object.entries(v.fontes)) {
    exigir(/^[a-zA-Z0-9_.@/+-]+$/.test(n) && !n.startsWith("/") && !n.split("/").some(x => ["..", ".git", ".env"].includes(x)), "FONTES");
    exigir(digest(d), "FONTES");
  }
  campos(v.imagens, ["tools", "postgres"], "IMAGENS");
  for (const im of Object.values(v.imagens)) {
    campos(im, ["id", "configSha256", "env", "labels"], "IMAGENS");
    exigir(imageId(im.id) && digest(im.configSha256) && Array.isArray(im.env) && im.labels && typeof im.labels === "object", "IMAGENS");
    ambienteExato(im.env, im.env);
  }
  exigir(v.imagens.tools.id !== v.imagens.postgres.id, "IMAGENS");
  return fixar(structuredClone(v));
}
export function lerManifesto(n) {
  exigir(process.getuid() === 1000, "HOST_UID");
  const s = fs.lstatSync(n);
  exigir((s.mode & 0o777) === 0o600, "MANIFESTO_MODO");
  const m = manifestoReal(JSON.parse(arquivoProtegido(n, 1000, 1024 * 1024)));
  diretorioProtegido(path.dirname(n), 1000);
  return m;
}
export function ambienteExato(actual, expected) {
  const mapa = a => {
    exigir(Array.isArray(a), "AMBIENTE");
    const o = {};
    for (const x of a) {
      exigir(typeof x === "string" && /^[A-Za-z_][A-Za-z0-9_]*=/.test(x), "AMBIENTE");
      const i = x.indexOf("="), k = x.slice(0, i);
      exigir(!Object.hasOwn(o, k), "AMBIENTE"); o[k] = x.slice(i + 1);
    }
    return o;
  };
  exigir(iguais(mapa(actual), mapa(expected)), "AMBIENTE");
}
export function mesclarEnv(base, extra) {
  const env = Object.fromEntries(base.map(x => [x.slice(0,x.indexOf("=")),x.slice(x.indexOf("=")+1)]));
  return Object.entries({...env,...extra}).map(([k,v]) => `${k}=${v}`);
}
export function conferirImagem(raw, pin, banco = false) {
  exigir(raw && raw.Id === pin.id && hash(JSON.stringify(raw.Config)) === pin.configSha256 && !raw.Config.OnBuild?.length && iguais(raw.Config.Volumes ?? {}, banco ? {"/var/lib/postgresql/data":{}} : {}), "OCI_PIN");
  ambienteExato(raw.Config.Env, pin.env);
  exigir(iguais(raw.Config.Labels ?? {}, pin.labels), "OCI_LABELS");
  return raw;
}
export const labels = (m, papel) => ({ "frequenciapp.real.rodada": m.rodada, "com.docker.compose.project": `real-${m.rodada}`, "com.docker.compose.service": papel });
export const volumeNome = (m, papel) => `real-${m.rodada}-${papel}`;
export const raizRoot = m => `/scratch/coeso-${m.rodada}`;
export function vinculo(m, cid, inputsSha256, fontesSha256) {
  exigir(idDocker(cid) && digest(inputsSha256) && digest(fontesSha256), "BINDING");
  return { versao: 1, rodada: m.rodada, rootId: cid, inputsSha256, fontesSha256 };
}
export function validarVinculo(actual, esperado) {
  campos(actual, ["versao", "rodada", "rootId", "inputsSha256", "fontesSha256"], "BINDING");
  exigir(iguais(actual, esperado), "BINDING");
}
export function validarProva(p, esperado, produto) {
  campos(p,["versao","vinculo","operacao","alvo","commit","contextoSha256","pinSha256","cifra","arquivos","lock"],"PIN");
  exigir(p.versao === 1, "PIN"); validarVinculo(p.vinculo, esperado);
  exigir(/^[a-f0-9-]{36}$/.test(p.operacao) && digest(p.alvo) && p.commit === produto.revisoes.B.commit && p.contextoSha256 === produto.revisoes.B.contextoSha256 && digest(p.pinSha256), "PIN");
  campos(p.lock,["dev","ino"],"PIN_LOCK");
  exigir(/^[0-9]+$/.test(p.lock.dev) && /^[1-9][0-9]*$/.test(p.lock.ino), "PIN_LOCK");
  exigir(Array.isArray(p.arquivos) && p.arquivos.length >= 4 && p.arquivos.length <= 7, "PIN");
  const nomes = new Set();
  for(const a of p.arquivos) {
    campos(a,["nome","sha256","bytes"],"PIN");
    exigir(/^[A-Za-z0-9_.-]+$/.test(a.nome) && !nomes.has(a.nome) && digest(a.sha256) && Number.isSafeInteger(a.bytes) && a.bytes > 0 && a.bytes <= MAX, "PIN"); nomes.add(a.nome);
  }
  campos(p.cifra,["nome","sha256","bytes","formato"],"PIN_CIFRA");
  exigir(p.cifra.formato === "age-encryption.org/v1" && /^frequenciapp-[0-9]{8}T[0-9]{6}Z-[a-f0-9]{8}\.dump\.age$/.test(p.cifra.nome) && p.arquivos.some(a => a.nome === p.cifra.nome && a.sha256 === p.cifra.sha256 && a.bytes === p.cifra.bytes) && nomes.has("ponteiro.json") && [...nomes].some(n=>n.endsWith(".confirmado.json")), "PIN_CIFRA");
  return fixar(structuredClone(p));
}
export function validarPedidoReal(produto, p, binding) {
  const extras = ["criar-recuperacao","recuperar","sentinela-recuperada"];
  const comPin = ["construir","subir",...extras].includes(p?.receita);
  campos(p,["receita","revisao","commit","contextoSha256","env","operacionalSha256","vinculo",...(comPin?["prova"]:[])],"CAMPOS");
  const { vinculo: v, prova: _prova, ...base } = p;
  validarVinculo(v,binding); validarPedido(produto,extras.includes(base.receita)?{...base,receita:"sentinela"}:base);
  if(comPin) { exigir(p.revisao === "B", "FASE"); validarProva(p.prova,binding,produto); }
  return base;
}
export function receitaContainer(m, papel, imagem, envBase, op = {}) {
  exigir(["db","app","caddy","leitor","root","inicializador"].includes(papel) && imageId(imagem), "RECEITA");
  const usuario = {db:"999:999",app:"1000:1000",caddy:"1000:1000",leitor:"65534:65534",root:"0:0",inicializador:"0:0"}[papel];
  const h = { NetworkMode:"none", ReadonlyRootfs:true, CapDrop:["ALL"], CapAdd:[], SecurityOpt:["no-new-privileges:true"], Privileged:false, AutoRemove:false, Init:true, PidsLimit:256, Memory:1073741824, NanoCpus:2000000000, RestartPolicy:{Name:"no",MaximumRetryCount:0}, IpcMode:"private", PidMode:"", PortBindings:{}, PublishAllPorts:false, Binds:[], GroupAdd:[], Devices:[], DeviceRequests:[], VolumesFrom:[], Links:[], Tmpfs:{"/tmp":"rw,nosuid,nodev,exec,size=128m,mode=1777"}, Mounts:op.mounts ?? [], LogConfig:{Type:"json-file",Config:{"max-size":"8m","max-file":"2"}} };
  return fixar({ Image:imagem, User:usuario, Env:mesclarEnv(envBase,op.env ?? {}), Labels:{...labels(m,papel),...(op.labels ?? {})}, Entrypoint:op.entrypoint ?? ["/usr/local/bin/node"], Cmd:op.cmd ?? [], WorkingDir:op.cwd ?? "/app", AttachStdin:papel === "root", AttachStdout:true, AttachStderr:true, OpenStdin:papel === "root", StdinOnce:false, Tty:false, Healthcheck:op.healthcheck ?? {Test:["NONE"]}, ExposedPorts:op.exposedPorts ?? {}, HostConfig:h });
}
export function conferirContainer(raw, id, spec, fase) {
  exigir(idDocker(id) && raw?.Id === id && raw.Image === spec.Image, "ID");
  const c=raw.Config,h=raw.HostConfig;
  exigir(c && h && c.User === spec.User, "OWNER");
  ambienteExato(c.Env,spec.Env);
  for(const k of ["Labels","Entrypoint","Cmd","WorkingDir","Healthcheck","Tty","OpenStdin","StdinOnce"]) exigir(iguais(c[k],spec[k]),"CONFIG");
  for(const k of ["NetworkMode","ReadonlyRootfs","CapDrop","SecurityOpt","Privileged","AutoRemove","Init","PidsLimit","Memory","NanoCpus","RestartPolicy","IpcMode","PidMode","PublishAllPorts","Tmpfs","LogConfig"]) exigir(iguais(h[k],spec.HostConfig[k]),"CONFINAMENTO");
  for(const k of ["CapAdd","PortBindings","Binds","GroupAdd","Devices","DeviceRequests","VolumesFrom","Links"]) exigir(!h[k] || Object.keys(h[k]).length === 0,"EXTRA");
  exigir(iguais(c.ExposedPorts ?? {},spec.ExposedPorts),"PORTAS");
  const mounts=raw.Mounts ?? [], expected=spec.HostConfig.Mounts;
  exigir(mounts.filter(x=>x.Type!=="tmpfs").length===expected.length && mounts.every(x=>["tmpfs","bind","volume"].includes(x.Type)),"MOUNTS");
  for(const x of expected) {
    const a=mounts.filter(y=>y.Destination===x.Target);exigir(a.length===1 && a[0].Type===x.Type && a[0].RW===!x.ReadOnly && (x.Type==="volume"?a[0].Name===x.Source:a[0].Source===x.Source),"MOUNTS");
  }
  const s=raw.State;
  exigir(s && !s.OOMKilled && !s.Dead && s.Error === "" && typeof s.Running === "boolean", "STATE");
  if(fase === "created") exigir(s.Status === "created" && !s.Running && s.Pid===0,"STATE");
  else if(fase === "running") exigir(s.Running && s.Status==="running" && s.Pid>0,"STATE");
  else if(fase === "exited") exigir(!s.Running && s.Status==="exited" && s.Pid===0 && Number.isInteger(s.ExitCode),"STATE");
  else exigir(fase === "observado", "FASE");
  return raw;
}
export function volumeMount(m,papel,target,ro=false) { return {Type:"volume",Source:volumeNome(m,papel),Target:target,ReadOnly:ro,VolumeOptions:{NoCopy:true}}; }
