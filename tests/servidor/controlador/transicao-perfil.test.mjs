// Confere a continuidade das travas pela adoção pública do controlador.
import assert from "node:assert/strict";
import fs from "node:fs";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { test } from "node:test";
import { fixture } from "./fixture.mjs";

for (const campo of ["ESTADO_DIR", "BACKUP_DIR"]) {
  test(`D: adoção recusa ${campo} existente sem proteção administrativa`, (t) => {
    for (const tipo of ["link", "proprietario", "permissao"]) {
      const f = fixture({ adotar: false });
      t.after(f.limpar);
      const raiz = `${f.raiz}/armazenamento`,
        nome = tipo === "link" ? `${f.raiz}/atalho` : raiz;
      fs.mkdirSync(raiz, { mode: 0o700 });
      if (tipo === "link") fs.symlinkSync(raiz, nome);
      else if (tipo === "proprietario") fs.chownSync(raiz, 1, 1);
      else fs.chmodSync(raiz, 0o750);
      fs.appendFileSync(`${f.config}/ops.env`, `${campo}=${nome}\n`);
      try {
        const r = f.adocao();
        assert.equal(r.status, 78);
        assert.equal(fs.existsSync(f.prefixo), false);
        assert.match(r.stderr, /root|privados/);
      } finally {
        fs.chownSync(raiz, 0, 0);
        fs.chmodSync(raiz, 0o700);
      }
    }
  });
}

test("C: adoção conserva o caminho e o inode da trava em uso pelo produtor legado", async (t) => {
  const f = fixture({ adotar: false });
  t.after(f.limpar);
  fs.appendFileSync(`${f.config}/ops.env`, `SERVIDOR_LOCK_DIR=${f.raiz}/locks\n`);
  const alvo = JSON.parse(fs.readFileSync(`${f.config}/identidade.json`)).trava;
  const trava = `${f.raiz}/locks/operacoes-${alvo}.lock`;
  fs.mkdirSync(`${f.raiz}/locks`, { recursive: true, mode: 0o700 });
  fs.closeSync(fs.openSync(trava, "a", 0o600));
  const antes = fs.statSync(trava);
  const holder = spawn(
    process.execPath,
    [
      "-e",
      `
    const fs=require('node:fs'), cp=require('node:child_process');
    const fd=fs.openSync(process.argv[1],'r+');
    const r=cp.spawnSync('/usr/bin/flock',['-n','3'],{stdio:['ignore','ignore','inherit',fd]});
    if(r.status!==0)process.exit(90);
    process.stdout.write('trancado'); process.stdin.resume();
  `,
      trava,
    ],
    { stdio: ["pipe", "pipe", "pipe"] },
  );
  const fim = once(holder, "close");
  try {
    await once(holder.stdout, "data");
    f.ok(f.adocao());
    const p = JSON.parse(fs.readFileSync(f.perfil));
    assert.equal(`${p.locks}/operacoes-${alvo}.lock`, trava);
    assert.equal(fs.statSync(trava).ino, antes.ino);
    assert.equal(fs.statSync(trava).dev, antes.dev);
    const ocupado = f.executar(`${f.prefixo}/executar`, ["estado"]);
    assert.notEqual(ocupado.status, 0, "O controlador precisa disputar a trava antiga.");
    assert.match(ocupado.stderr, /Outra operação/);
  } finally {
    holder.stdin.destroy();
    holder.kill("SIGTERM");
    await fim;
  }
  f.ok(f.executar(`${f.prefixo}/executar`, ["estado"]));
  assert.equal(fs.statSync(trava).ino, antes.ino);
});

test("C: adoção recusa raiz legada de trava gravável por outro ator ou com link", (t) => {
  for (const tipo of ["proprietario", "link"]) {
    const f = fixture({ adotar: false });
    t.after(f.limpar);
    const locks = `${f.raiz}/locks-legados`;
    fs.mkdirSync(locks, { mode: 0o700 });
    let entrada = locks;
    if (tipo === "proprietario") fs.chownSync(locks, 1, 1);
    else {
      entrada = `${f.raiz}/atalho`;
      fs.symlinkSync(locks, entrada);
    }
    fs.appendFileSync(`${f.config}/ops.env`, `SERVIDOR_LOCK_DIR=${entrada}\n`);
    try {
      const r = f.adocao();
      assert.equal(r.status, 78);
      assert.match(r.stderr, /pertencer a root|links/);
      assert.equal(fs.existsSync(f.prefixo), false);
    } finally {
      fs.chownSync(locks, 0, 0);
    }
  }
});
