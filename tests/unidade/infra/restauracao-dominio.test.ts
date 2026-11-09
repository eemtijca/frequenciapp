// Confere catálogo e metadados com dados locais; não executa clientes de banco.
import { execFileSync } from "node:child_process";
import { expect, it } from "vitest";

it("classifica estados por OIDs e recusa nomes ocupados, OIDs ausentes e duplicações", () => {
  const saida = execFileSync(
    process.execPath,
    [
      "--input-type=module",
      "-e",
      `
    import assert from 'node:assert/strict';
    import { reconciliar } from './scripts/servidor/restauracao.mjs';
    const o={versao:1,alvo:'sintetico',ativo:'ativo',temporario:'temp',anterior:'anterior',falha:'falha',originalOid:45231,substitutoOid:92611};
    const c=(original,substituto)=>[{oid:o.originalOid,nome:original},{oid:o.substitutoOid,nome:substituto}];
    for (const [original,substituto,fase] of [['ativo','temp','validado'],['anterior','temp','original-renomeado'],['anterior','ativo','substituto-promovido'],['anterior','falha','substituto-isolado'],['ativo','falha','recuperacao-concluida']]) assert.equal(reconciliar(o,c(original,substituto)),fase);
    for (const invalido of [[],null,{},[...c('anterior','temp'),{oid:12345,nome:'ativo'}],c('desconhecido','temp'),[{oid:o.originalOid,nome:'ativo'},{oid:o.originalOid,nome:'temp'}],[{oid:12345,nome:'ativo'},{oid:o.substitutoOid,nome:'temp'}]]) assert.throws(()=>reconciliar(o,invalido));
    console.log('estados conferidos');
  `,
    ],
    { encoding: "utf8" },
  );
  expect(saida).toContain("estados conferidos");
});

it("confere recibo de escopo e hashes sem aceitar metadados corrompidos como legado", () => {
  const saida = execFileSync(
    process.execPath,
    [
      "--input-type=module",
      "-e",
      `
    import assert from 'node:assert/strict';
    import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path'; import { createHash } from 'node:crypto';
    import { criarRecibo } from './scripts/servidor/recibos.mjs';
    import { validarEscopoEntrada, validarInventario } from './scripts/servidor/restauracao-escopo.mjs';
    const p=fs.mkdtempSync(path.join(os.tmpdir(),'recibo-restauracao-'));
    try {
      const base='frequenciapp-20260101T000000Z-1234abcd', nome=base+'.dump.age', arquivo=path.join(p,nome);
      const bytes='conteudo falso, nao cifra nem PostgreSQL'; fs.writeFileSync(arquivo,bytes);
      const hash=createHash('sha256').update(bytes).digest('hex');
      fs.writeFileSync(arquivo+'.sha256',hash+'  '+nome+'\\n');
      const r=criarRecibo(p,{base,alvo:'origem-sintetica',schema:'escola',criptografia:'age',destinatario:'sintetico',remoto:'',verificadoRemoto:false});
      const recibo=path.join(p,base+'.confirmado.json'); fs.writeFileSync(recibo,JSON.stringify(r));
      validarEscopoEntrada(arquivo,'escola','');
      assert.throws(()=>validarEscopoEntrada(arquivo,'public','public'));
      fs.writeFileSync(recibo,'{invalido'); assert.throws(()=>validarEscopoEntrada(arquivo,'escola','escola'));
      fs.writeFileSync(recibo,JSON.stringify(r)); fs.appendFileSync(arquivo,'alterado'); assert.throws(()=>validarEscopoEntrada(arquivo,'escola','escola'));
      assert.throws(()=>validarEscopoEntrada('','escola','public')); validarEscopoEntrada('','escola','escola');
      const i={versao:1,schemas:['public','escola','legado'],objetos:[{schema:'escola',tipo:'table'},{schema:'legado',tipo:'table'}],extensoes:['plpgsql'],largeObjects:0,dependenciasExternas:0,globais:0};
      validarInventario(i,'escola','limitado'); assert.throws(()=>validarInventario(i,'escola','integral'));
      assert.throws(()=>validarInventario({...i,dependenciasExternas:1},'escola','limitado'));
      console.log('metadados conferidos');
    } finally { fs.rmSync(p,{recursive:true,force:true}); }
  `,
    ],
    { encoding: "utf8" },
  );
  expect(saida).toContain("metadados conferidos");
});
