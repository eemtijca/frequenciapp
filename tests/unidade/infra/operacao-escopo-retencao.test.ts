// Confere segregação de conteúdo recuperável sem executar dump ou banco.
import { it, expect } from "vitest";
import { execFileSync } from "node:child_process";

it.each(["banco", "schema", "remoto", "legado"])("mínimo não cruza %s", (variante) => {
  const saida = execFileSync(process.execPath, ["--input-type=module", "-e", `
    import assert from 'node:assert/strict';
    import {planejarRetencao} from './scripts/servidor/recibos.mjs';
    const escopo={tipo:'schema',alvo:'daemon-mounts',banco:'escola',schema:'public'};
    const recibos=[1,2,3].map(i=>({versao:1,base:'frequenciapp-2020010'+i+'T000000Z-abcdef01',em:'2020-01-0'+i+'T00:00:00Z',escopo:{...escopo},criptografia:'age',destinatario:'pin',remoto:'local:copias',etapas:{local:true,remotoVerificado:true,recuperacaoExercitada:false},artefatos:[{nome:'frequenciapp-2020010'+i+'T000000Z-abcdef01.dump.age',sha256:'a'.repeat(64)},{nome:'frequenciapp-2020010'+i+'T000000Z-abcdef01.dump.age.sha256',sha256:'b'.repeat(64)}]}));
    const variante=${JSON.stringify(variante)};
    if(variante==='legado') delete recibos[2].escopo.banco;
    else if(variante==='remoto') recibos[2].remoto='outro:copias';
    else recibos[2].escopo[variante]='outro';
    assert.deepEqual(planejarRetencao(recibos,{minimo:2,dias:1,agora:Date.parse('2021-01-01'),remoto:false,alvo:escopo.alvo,banco:escopo.banco,schema:escopo.schema,destino:'local:copias'}),[]);
    console.log('escopo separado');
  `], {encoding:"utf8"});
  expect(saida).toContain("escopo separado");
});
it("ponteiro de outro banco é recusado pela CLI real", () => {
  const saida=execFileSync(process.execPath,["--input-type=module","-e",`
    import assert from 'node:assert/strict'; import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path'; import {createHash} from 'node:crypto'; import {spawnSync} from 'node:child_process'; import {criarRecibo} from './scripts/servidor/recibos.mjs';
    const dir=fs.mkdtempSync(path.join(os.tmpdir(),'ponteiro-escopo-'));
    try {
      const base='frequenciapp-20200101T000000Z-abcdef01', nome=base+'.dump.age', bytes='sintetico';
      const sha=createHash('sha256').update(bytes).digest('hex'); fs.writeFileSync(path.join(dir,nome),bytes); fs.writeFileSync(path.join(dir,nome+'.sha256'),sha+'  '+nome+'\\n');
      const r=criarRecibo(dir,{base,criptografia:'age',schema:'public',alvo:'alvo',banco:'outro',remoto:'',verificadoRemoto:false,destinatario:'pin'});
      fs.writeFileSync(path.join(dir,base+'.confirmado.json'),JSON.stringify(r)); const estado=path.join(dir,'estado.json'); fs.writeFileSync(estado,JSON.stringify({recibo:base+'.confirmado.json',arquivo:nome,sha256:sha}));
      const p=spawnSync(process.execPath,['scripts/servidor/recibos.mjs','conferir-estado',dir,estado],{encoding:'utf8',env:{PATH:process.env.PATH,BACKUP_MODO:'compose',SERVIDOR_ALVO_CHAVE:'alvo',BACKUP_BANCO_VERIFICADO:'escola',DATABASE_SCHEMA:'public',BACKUP_REMOTO:''}});
      assert.notEqual(p.status,0,'ponteiro de outro banco aceito'); console.log('ponteiro recusado');
    } finally {fs.rmSync(dir,{recursive:true,force:true});}
  `],{encoding:"utf8"});
  expect(saida).toContain("ponteiro recusado");
});
