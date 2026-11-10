// Verifica catálogo, hashes e exclusão exata de conjuntos sem transporte externo.
import { execFileSync } from "node:child_process";
import { expect, it } from "vitest";

it("retém só conjuntos confirmados e nunca seleciona arquivo por prefixo", () => {
  const saida = execFileSync(
    process.execPath,
    [
      "--input-type=module",
      "-e",
      `
    import assert from 'node:assert/strict'; import {createHash} from 'node:crypto';
    import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
    const { criarRecibo, validarRecibo, planejarRetencao, conferirArtefatos } = await import('./scripts/servidor/recibos.mjs');
    const dir=fs.mkdtempSync(path.join(os.tmpdir(),'recibos-'));
    try {
      const recibos=[]; const escopo={alvo:'sintetico',banco:'frequencia',schema:'public',destino:'sintetico:copias'};
      for(let i=1;i<=7;i++) {
        const base='frequenciapp-2020010'+i+'T000000Z-abcdef01';
        const ext=i%2?'age':'gpg';
        for(const sufixo of ['.dump.'+ext, '-ambiente.env.'+ext]) {
          fs.writeFileSync(path.join(dir,base+sufixo),'conteudo sintetico '+i+sufixo);
          fs.writeFileSync(path.join(dir,base+sufixo+'.sha256'),createHash('sha256').update(fs.readFileSync(path.join(dir,base+sufixo))).digest('hex')+'  '+base+sufixo+'\\n');
        }
        const recibo=criarRecibo(dir,{base,criptografia:ext,schema:'public',banco:'frequencia',alvo:'sintetico',remoto:'sintetico:copias',verificadoRemoto:true,destinatario:'pin-publico',em:'2020-01-0'+i+'T00:00:00Z'});
        validarRecibo(recibo); conferirArtefatos(dir,recibo);
        recibos.push(recibo);
      }
      fs.writeFileSync(path.join(dir,'frequenciapp-incompleto.dump.gpg'),'incompleto');
      const plano=planejarRetencao(recibos,{...escopo,minimo:5,dias:1,agora:Date.parse('2021-01-01'),remoto:false});
      assert.equal(plano.length,2);
      assert.deepEqual(planejarRetencao(recibos,{...escopo,minimo:0,dias:1,agora:Date.parse('2021-01-01'),remoto:false,alvo:'outro'}),[]);
      assert.equal(plano[0].base,recibos[1].base);
      assert.deepEqual(plano[0].artefatos,recibos[1].artefatos.map(a=>a.nome).concat(recibos[1].base+'.confirmado.json'));
      for(const mal of ['../fora','/absoluto',recibos[0].base+'-outro.dump.gpg','$(touch alheio)']) {
        const invalido=structuredClone(recibos[0]);invalido.artefatos[0].nome=mal;
        assert.throws(()=>validarRecibo(invalido));
      }
      const falso=structuredClone(recibos[0]);falso.etapas.local='true'; assert.throws(()=>validarRecibo(falso));
      const semRemoto=recibos.map(r=>({...r,etapas:{...r.etapas,remotoVerificado:false}}));
      assert.deepEqual(planejarRetencao(semRemoto,{...escopo,minimo:5,dias:1,agora:Date.parse('2021-01-01'),remoto:true,destino:'sintetico:copias'}),[]);
      fs.writeFileSync(path.join(dir,recibos[0].artefatos[0].nome),'divergente');
      assert.throws(()=>conferirArtefatos(dir,recibos[0]));
      assert.deepEqual(planejarRetencao(recibos,{...escopo,minimo:5,dias:1,agora:Date.parse('2021-01-01'),remoto:true,destino:'outro:copias'}),[]);
      for(const recibo of recibos) assert.equal(recibo.etapas.recuperacaoExercitada,false);
      console.log('recibos e retencao verificados');
    } finally {fs.rmSync(dir,{recursive:true,force:true});}
  `,
    ],
    { encoding: "utf8" },
  );
  expect(saida).toContain("recibos e retencao verificados");
});
