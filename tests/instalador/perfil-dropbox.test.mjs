// Testa a etapa Dropbox com adoção privada, token, rclone.conf e ops.env sintéticos.
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { after, describe, it } from "node:test";
import * as dropbox from "../../scripts/instalador/passos/dropbox.mjs";

const DIRETORIOS = [];
const SEGREDO_TOKEN = "TOKEN_SINTETICO_NAO_REAL";
const DESTINO = "dropbox:frequenciapp/banco";
const NAMESPACE = "1234567890";
const OPS_EXISTENTE = [
  "BACKUP_DESTINO=/var/backups/frequenciapp",
  "BACKUP_PLANILHAS_HABILITADO=true",
  "BACKUP_PLANILHAS_HORARIO=3",
  "AGENDA_HORARIO=5",
  "",
].join("\n");

function temporario() {
  const diretorio = fs.mkdtempSync(path.join(os.tmpdir(), "frequenciapp-dropbox-"));
  fs.chmodSync(diretorio, 0o700);
  DIRETORIOS.push(diretorio);
  return diretorio;
}

function escrever(caminho, conteudo, modo = 0o600) {
  fs.mkdirSync(path.dirname(caminho), { recursive: true, mode: 0o700 });
  fs.writeFileSync(caminho, conteudo, { mode: modo });
  fs.chmodSync(caminho, modo);
}

function hashArquivo(caminho) {
  return crypto.createHash("sha256").update(fs.readFileSync(caminho)).digest("hex");
}

function preparar() {
  const raiz = temporario();
  const configDir = path.join(raiz, "etc", "frequenciapp");
  const privado = path.join(configDir, "dropbox");
  const appDir = path.join(raiz, "opt", "frequenciapp");
  const estadoDir = path.join(raiz, "var", "lib", "frequenciapp");
  const backupBancoDir = path.join(raiz, "var", "backups", "frequenciapp", "banco");
  for (const diretorio of [configDir, privado, appDir, estadoDir, backupBancoDir]) {
    fs.mkdirSync(diretorio, { recursive: true, mode: 0o700 });
    fs.chmodSync(diretorio, 0o700);
  }
  const token = path.join(privado, "token.json");
  const rclone = path.join(privado, "rclone.conf");
  const adocaoCaminho = path.join(privado, "adocao.json");
  const opsEnv = path.join(configDir, "ops.env");
  escrever(token, `${JSON.stringify({ access_token: SEGREDO_TOKEN })}\n`);
  escrever(
    rclone,
    [
      "[dropbox]",
      "type = dropbox",
      `root_namespace = ${NAMESPACE}`,
      "token = token-rclone-ficticio",
      "client_id = aplicativo-ficticio",
      "client_secret = segredo-ficticio",
      "",
    ].join("\n"),
  );
  escrever(opsEnv, OPS_EXISTENTE);
  const adocao = {
    versao: 1,
    adocao: "pasta-exclusiva-frequenciapp-v1",
    accountId: "dbid:CONTA_FICTICIA",
    namespaceId: NAMESPACE,
    folderId: "id:PASTA_FICTICIA",
    folderPath: "/frequenciapp/banco",
    destino: DESTINO,
    alvo: "ALVO_FICTICIO",
    banco: "frequencia",
    schema: "public",
    limiteBytes: 1073741824,
    timeoutMs: 30000,
    minimoAutorizado: 5,
    tokenFile: token,
    rcloneConfig: rclone,
    rcloneConfigSha256: hashArquivo(rclone),
  };
  gravarAdocao({ adocaoCaminho }, adocao);
  return {
    raiz,
    caminhos: {
      raiz,
      appDir,
      configDir,
      estadoDir,
      backupBancoDir,
      privado,
      token,
      rclone,
      adocao: adocaoCaminho,
      adocaoCaminho,
      opsEnv,
    },
    adocao,
  };
}

function gravarAdocao(caminhos, adocao) {
  escrever(caminhos.adocaoCaminho, `${JSON.stringify(adocao, null, 2)}\n`);
}

function criarCtx(caminhos, extras = {}) {
  const gravacoes = [];
  const logs = [];
  const ctx = {
    raiz: caminhos.raiz,
    configuracao: {
      configDropbox: caminhos.adocao,
      arquivoTokenDropbox: caminhos.token,
      configRclone: caminhos.rclone,
      destino: DESTINO,
      retencaoDias: 30,
      retencaoMinimo: 5,
      ...extras.configuracao,
    },
    caminhos: {
      appDir: caminhos.appDir,
      configDir: caminhos.configDir,
      estadoDir: caminhos.estadoDir,
      backupBancoDir: caminhos.backupBancoDir,
      opsEnv: caminhos.opsEnv,
    },
    naoIniciar: Boolean(extras.naoIniciar),
    modoTeste: true,
    gravarArquivoAtomico: (caminho, conteudo, opcoes = {}) => {
      gravacoes.push(caminho);
      const temporarioCaminho = `${caminho}.${process.pid}.${gravacoes.length}.tmp`;
      fs.writeFileSync(temporarioCaminho, conteudo, { mode: opcoes.modo ?? 0o600 });
      fs.renameSync(temporarioCaminho, caminho);
      fs.chmodSync(caminho, opcoes.modo ?? 0o600);
      return caminho;
    },
    registrarLog: (linha) => logs.push(linha),
  };
  return { ctx, gravacoes, logs };
}

function valorEnv(texto, chave) {
  const combinacao = new RegExp(`^${chave}=(.*)$`, "m").exec(texto);
  return combinacao ? combinacao[1] : "";
}

after(() => {
  for (const diretorio of DIRETORIOS) fs.rmSync(diretorio, { recursive: true, force: true });
});

describe("etapa Dropbox", () => {
  it("valida a adoção e grava o ops.env com modo 600 preservando as demais chaves", () => {
    const { caminhos, adocao } = preparar();
    const { ctx, gravacoes, logs } = criarCtx(caminhos);
    const resultado = dropbox.executar(ctx);
    assert.equal(resultado.estado, "concluida");
    assert.equal(resultado.detalhes.adotado, true);
    assert.equal(resultado.detalhes.destino, adocao.destino);
    assert.equal(resultado.detalhes.folderPath, adocao.folderPath);
    assert.equal(resultado.detalhes.rcloneConfig, caminhos.rclone);
    assert.equal(resultado.detalhes.semMudancas, false);
    assert.equal(resultado.detalhes.backupPendente, true);
    assert.equal(resultado.detalhes.identidade.validadaContraAmbiente, false);
    assert.match(resultado.detalhes.identidade.conferidaPor, /backup-banco\.sh/);
    assert.equal(gravacoes.length, 1);
    assert.equal(fs.statSync(caminhos.opsEnv).mode & 0o777, 0o600);

    const texto = fs.readFileSync(caminhos.opsEnv, "utf8");
    assert.equal(valorEnv(texto, "BACKUP_DROPBOX_CONFIG"), caminhos.adocao);
    assert.equal(valorEnv(texto, "BACKUP_RCLONE_CONFIG"), caminhos.rclone);
    assert.equal(valorEnv(texto, "BACKUP_REMOTO"), DESTINO);
    assert.equal(valorEnv(texto, "BACKUP_RETER_REMOTO"), "true");
    assert.equal(valorEnv(texto, "BACKUP_VERIFICAR_REMOTO"), "true");
    for (const linha of OPS_EXISTENTE.trim().split("\n")) {
      assert.ok(texto.includes(linha), linha);
    }
    assert.equal(texto.includes(SEGREDO_TOKEN), false);
    assert.equal(JSON.stringify(resultado).includes(SEGREDO_TOKEN), false);
    assert.equal(JSON.stringify(resultado).includes(caminhos.token), false);
    for (const linha of logs) assert.equal(linha.includes(SEGREDO_TOKEN), false);
  });

  it("recusa destino divergente sem alterar o ops.env", () => {
    const { caminhos, adocao } = preparar();
    const opsAntes = fs.readFileSync(caminhos.opsEnv, "utf8");
    adocao.destino = "dropbox:outra/pasta";
    gravarAdocao(caminhos, adocao);
    const { ctx } = criarCtx(caminhos);
    assert.throws(
      () => dropbox.executar(ctx),
      (erro) => erro.codigo === "E_DROPBOX" && erro.message.includes("destino"),
    );
    assert.equal(fs.readFileSync(caminhos.opsEnv, "utf8"), opsAntes);
  });

  it("recusa configuração sem token e arquivo de token ausente", () => {
    const primeiro = preparar();
    const semToken = criarCtx(primeiro.caminhos, {
      configuracao: { arquivoTokenDropbox: "" },
    });
    assert.throws(
      () => dropbox.executar(semToken.ctx),
      (erro) => erro.codigo === "E_DROPBOX" && erro.dica.includes("--arquivo-token-dropbox"),
    );

    const segundo = preparar();
    fs.rmSync(segundo.caminhos.token);
    const semArquivo = criarCtx(segundo.caminhos);
    assert.throws(
      () => dropbox.executar(semArquivo.ctx),
      (erro) =>
        erro.codigo === "E_DROPBOX" &&
        !erro.message.includes(segundo.caminhos.token) &&
        !erro.dica.includes(segundo.caminhos.token),
    );
  });

  it("recusa hash do rclone divergente", () => {
    const { caminhos, adocao } = preparar();
    adocao.rcloneConfigSha256 = "0".repeat(64);
    gravarAdocao(caminhos, adocao);
    const { ctx } = criarCtx(caminhos);
    assert.throws(
      () => dropbox.executar(ctx),
      (erro) => erro.codigo === "E_DROPBOX" && /hash/i.test(erro.message),
    );
  });

  it("recusa permissão incorreta no arquivo e no diretório da adoção", () => {
    const primeiro = preparar();
    fs.chmodSync(primeiro.caminhos.adocao, 0o644);
    const ctxArquivo = criarCtx(primeiro.caminhos);
    assert.throws(
      () => dropbox.executar(ctxArquivo.ctx),
      (erro) => erro.codigo === "E_DROPBOX" && /modo 600/.test(erro.message),
    );

    const segundo = preparar();
    fs.chmodSync(segundo.caminhos.privado, 0o755);
    const ctxDiretorio = criarCtx(segundo.caminhos);
    assert.throws(
      () => dropbox.executar(ctxDiretorio.ctx),
      (erro) => erro.codigo === "E_DROPBOX" && /modo 700/.test(erro.message),
    );
  });

  it("na segunda execução não reescreve o ops.env", () => {
    const { caminhos } = preparar();
    const { ctx, gravacoes } = criarCtx(caminhos);
    const primeira = dropbox.executar(ctx);
    assert.equal(primeira.detalhes.semMudancas, false);
    const texto = fs.readFileSync(caminhos.opsEnv, "utf8");
    const informacao = fs.statSync(caminhos.opsEnv);
    assert.equal(gravacoes.length, 1);

    const segunda = dropbox.executar(ctx);
    assert.equal(segunda.estado, "concluida");
    assert.equal(segunda.detalhes.semMudancas, true);
    assert.equal(fs.readFileSync(caminhos.opsEnv, "utf8"), texto);
    assert.equal(fs.statSync(caminhos.opsEnv).ino, informacao.ino);
    assert.equal(gravacoes.length, 1);
  });

  it("com --nao-iniciar retorna a etapa pulada sem ler a configuração", () => {
    const resultado = dropbox.executar({
      naoIniciar: true,
      configuracao: {},
      caminhos: {},
    });
    assert.equal(resultado.estado, "pulada");
    assert.equal(resultado.avisos[0].codigo, "A_NAO_INICIAR");
    assert.equal(resultado.detalhes.semMudancas, true);
    assert.equal(resultado.detalhes.adotado, false);
  });

  it("recusa remote do rclone com namespace divergente", () => {
    const { caminhos, adocao } = preparar();
    const texto = fs
      .readFileSync(caminhos.rclone, "utf8")
      .replace(`root_namespace = ${NAMESPACE}`, "root_namespace = 9999999999");
    escrever(caminhos.rclone, texto);
    adocao.rcloneConfigSha256 = hashArquivo(caminhos.rclone);
    gravarAdocao(caminhos, adocao);
    const { ctx } = criarCtx(caminhos);
    assert.throws(
      () => dropbox.executar(ctx),
      (erro) => erro.codigo === "E_DROPBOX" && /namespace/.test(erro.message),
    );
  });
});
