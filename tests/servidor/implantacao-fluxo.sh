#!/usr/bin/env bash
# Exercita o adaptador de produção com clientes falsos e sem rede ou banco.
set -euo pipefail
cd "$(dirname "$0")/../.."
node --input-type=module <<'JS'
import assert from 'node:assert/strict';
import {orquestrar, executorVercel} from './scripts/github/orquestrar-implantacao.mjs';
const sha='b'.repeat(40), chamadas=[];
const ambiente={PATH:process.env.PATH,GITHUB_SHA:sha,DIRECT_URL_PROD:'CONEXAO_MIGRADOR_FICTICIA',VERCEL_TOKEN:'TOKEN_FICTICIO',APP_URL:'https://app.exemplo',GOOGLE_SECRET:'NAO_PROPAGAR'};
const comando=(cmd,args,opts)=>{
  chamadas.push({cmd,args,env:opts.env});
  if(cmd==='git') return sha+'\n';
  if(args.includes('deploy')) return 'https://ensaio.vercel.app\n';
  return '';
};
const atestado={sha,destino:'sintetico',backupVerificado:true,recuperacaoVerificada:true,migracoesExpansivas:true,autoDeployCoordenado:true};
await orquestrar({sha,destino:'sintetico',atestado,executar:executorVercel(ambiente,{comando,buscar:async()=>new Response(JSON.stringify({ok:true,commit:sha}))})});
assert.equal(chamadas.filter(c=>c.args.includes('docker/app/migrar.mjs')).length,1);
for(const chamada of chamadas){
  assert(!('GOOGLE_SECRET' in chamada.env));
  const migrar=chamada.args.includes('docker/app/migrar.mjs');
  assert.equal(chamada.env.DIRECT_URL,migrar?'CONEXAO_MIGRADOR_FICTICIA':undefined);
}
assert(chamadas.findIndex(c=>c.args.includes('build')) < chamadas.findIndex(c=>c.args.includes('docker/app/migrar.mjs')));
assert(chamadas.find(c=>c.args.includes('deploy')).args.includes('--skip-domain'));
assert(chamadas.at(-1).args.includes('promote'));
await assert.rejects(executorVercel(ambiente,{comando,buscar:async()=>new Response(JSON.stringify({ok:true,commit:'outro'}))})('saude'));
console.log('Adaptador Vercel sintético: revisão, ambiente, ordem e saúde conferidos; nenhum deploy real.');
JS
