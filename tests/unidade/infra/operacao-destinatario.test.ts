// Confere pin da chave primária e escolha exata da chave de cifra.
import { execFileSync } from "node:child_process";
import { expect, it } from "vitest";

it("recusa chave diferente, ambiguidade, revogação e expiração", () => {
  const saida = execFileSync(
    process.execPath,
    [
      "--input-type=module",
      "-e",
      `
    import assert from 'node:assert/strict';
    const { destinatarioGpg } = await import('./scripts/servidor/destinatario.mjs');
    const p='A'.repeat(40), s='B'.repeat(40), outra='C'.repeat(40);
    const linha=(tipo,validade,expira,cap)=>[tipo,validade,'2048','1','id','100',expira,'','','','',cap].join(':')+':';
    const fpr=f=>['fpr','','','','','','','','',f].join(':')+':';
    const chave=[linha('pub','-',0,'scESC'),fpr(p),linha('sub','-',0,'e'),fpr(s)].join('\\n');
    assert.equal(destinatarioGpg(chave,p,p,1000),s);
    assert.equal(destinatarioGpg(chave,p,s,1000),s);
    assert.throws(()=>destinatarioGpg(chave,outra,p,1000));
    assert.throws(()=>destinatarioGpg(chave,p,'email@exemplo.invalid',1000));
    assert.throws(()=>destinatarioGpg(chave.replace('sub:-','sub:r'),p,p,1000));
    assert.throws(()=>destinatarioGpg(chave.replace(linha('sub','-',0,'e'),linha('sub','-',999,'e')),p,p,1000));
    assert.throws(()=>destinatarioGpg(chave+'\\n'+linha('sub','-',0,'e')+'\\n'+fpr(outra),p,p,1000));
    assert.throws(()=>destinatarioGpg(chave+'\\n'+linha('pub','-',0,'e')+'\\n'+fpr(outra),p,p,1000));
    console.log('pins negativos conferidos');
  `,
    ],
    { encoding: "utf8" },
  );
  expect(saida).toContain("pins negativos conferidos");
});
