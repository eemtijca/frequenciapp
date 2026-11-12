// Testa a ordem das etapas e os pré-requisitos dos perfis opt-in do instalador.
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { after, describe, it } from "node:test";
import { principal } from "../../scripts/instalador/cli.mjs";
import { ORDEM_ETAPAS, ordemEtapasPara } from "../../scripts/instalador/executor.mjs";
import { executar as executarPreflight } from "../../scripts/instalador/passos/preflight.mjs";

const TEMPORARIOS = [];

function temporario() {
  const diretorio = fs.mkdtempSync(path.join(os.tmpdir(), "frequenciapp-perfil-"));
  TEMPORARIOS.push(diretorio);
  return diretorio;
}

after(() => {
  for (const diretorio of TEMPORARIOS) fs.rmSync(diretorio, { recursive: true, force: true });
});

function deteccaoFalsa() {
  return {
    distro: "ubuntu",
    versaoDistro: "26.04",
    codename: "resolute",
    idLike: ["debian"],
    familia: "debian",
    tier: 1,
    motivoTier: "",
    arquitetura: "amd64",
    gerenciador: "apt",
    iniciador: "systemd",
    iniciadorOrigem: "sistema",
    container: false,
    firewall: "ufw",
    selinux: "ausente",
    apparmor: "enforcing",
    docker: {
      presente: true,
      versao: "29.8.2",
      daemon: "ativo",
      composePresente: true,
      composeVersao: "2.39.1",
      composeSuficiente: true,
      usuarioNoGrupo: true,
    },
    instalacao: { existente: false },
    avisos: [],
  };
}

function auditoriaFalsa() {
  return {
    gerenciador: "apt",
    familia: "debian",
    pacotes: [],
    resumo: { total: 0, presentes: 0, faltantes: 0, desatualizados: 0 },
    avisos: [],
  };
}

function deps() {
  return {
    raiz: temporario(),
    uid: () => 0,
    usuarioServico: "frequenciapp",
    agora: () => "2026-11-12T12:00:00Z",
    esperar: () => {},
    lerDisco: () => ({ livreBytes: 50 * 1024 ** 3, livreGiB: 50, totalGiB: 100 }),
    memoriaTotal: () => 8 * 1024 ** 3,
    raizRepositorio: temporario(),
    detectar: deteccaoFalsa,
    detectarBasico: deteccaoFalsa,
    auditarPacotes: auditoriaFalsa,
    lerEstado: () => ({ presente: false, estado: null, avisos: [] }),
    gravarEstado: () => {},
    gravarArquivoAtomico: () => {},
    comandoExiste: () => true,
    executar: () => ({ status: 0, stdout: "", stderr: "", erro: null }),
  };
}

function simular(perfil, extras = []) {
  let stdout = "";
  let stderr = "";
  const codigo = principal(
    [
      "aplicar",
      "--simular",
      "--modo-teste",
      "--json",
      "--nao-interativo",
      "--perfil",
      perfil,
      "--canal",
      "release",
      "--tag",
      "v1.0.0",
      "--dominio",
      "frequencia.teste",
      "--email-acme",
      "admin@escola.teste",
      "--email-admin",
      "direcao@escola.teste",
      "--arquivo-senha-admin",
      path.join(temporario(), "senha-admin"),
      "--destinatario-gpg",
      "A".repeat(40),
      "--proxy",
      "caddy",
      "--tls",
      "acme",
      "--diretorio-fonte",
      "/opt/frequenciapp",
      ...extras,
    ],
    {
      stdout: { write: (texto) => (stdout += texto) },
      stderr: { write: (texto) => (stderr += texto) },
    },
    deps(),
  );
  return { codigo, json: stdout ? JSON.parse(stdout) : null, stderr };
}

function ids(documento) {
  return documento.etapas.map((etapa) => etapa.id);
}

describe("ordem dinâmica dos perfis", () => {
  it("mantém o perfil simples sem etapas opt-in", () => {
    const ordem = ordemEtapasPara("simples");
    assert.equal(ordem.length, 16);
    assert.equal(ordem.includes("dropbox"), false);
    assert.equal(ordem.includes("controlador"), false);
    assert.equal(ordem.at(-1), "firewall");
  });

  it("coloca o Dropbox antes do backup inicial", () => {
    const ordem = ordemEtapasPara("dropbox");
    assert.equal(ordem.indexOf("dropbox"), ordem.indexOf("backup-inicial") - 1);
    assert.equal(ordem.includes("controlador"), false);
  });

  it("coloca o controlador depois do firewall", () => {
    const ordem = ordemEtapasPara("controlador");
    assert.equal(ordem.at(-1), "controlador");
    assert.equal(ordem.indexOf("controlador"), ordem.indexOf("firewall") + 1);
    assert.equal(ordem.includes("dropbox"), false);
  });

  it("combina as duas etapas no perfil completo", () => {
    const ordem = ordemEtapasPara("completo");
    assert.equal(ordem.indexOf("dropbox"), ordem.indexOf("backup-inicial") - 1);
    assert.equal(ordem.at(-1), "controlador");
    assert.equal(ordem.length, 18);
  });

  it("mantém a ordem global compatível com todos os perfis", () => {
    for (const etapa of [
      "preflight",
      "dropbox",
      "backup-inicial",
      "agendador",
      "firewall",
      "controlador",
    ]) {
      assert.ok(ORDEM_ETAPAS.includes(etapa), etapa);
    }
    assert.equal(ORDEM_ETAPAS.indexOf("agendador"), ORDEM_ETAPAS.indexOf("backup-inicial") + 1);
    assert.equal(ORDEM_ETAPAS.indexOf("agendador"), ORDEM_ETAPAS.indexOf("firewall") - 1);
  });
});

describe("simulação do aplicar", () => {
  it("mostra somente as etapas do perfil simples", () => {
    const resultado = simular("simples");
    assert.equal(resultado.codigo, 0, resultado.stderr);
    assert.deepEqual(ids(resultado.json), ordemEtapasPara("simples"));
    assert.equal(resultado.json.dry_run, true);
  });

  it("mostra Dropbox e controlador no perfil completo", () => {
    const resultado = simular("completo", [
      "--operador-controlador",
      "operador",
      "--config-dropbox",
      "/etc/frequenciapp/dropbox/adocao.json",
      "--arquivo-token-dropbox",
      "/etc/frequenciapp/dropbox/token.json",
      "--config-rclone",
      "/etc/frequenciapp/dropbox/rclone.conf",
      "--destino",
      "dropbox:frequenciapp/banco",
    ]);
    assert.equal(resultado.codigo, 0, resultado.stderr);
    assert.deepEqual(ids(resultado.json), ordemEtapasPara("completo"));
    assert.ok(ids(resultado.json).includes("dropbox"));
    assert.ok(ids(resultado.json).includes("controlador"));
  });
});

describe("pré-requisitos dos perfis", () => {
  function contexto(configuracao) {
    return {
      configuracao: { perfil: "simples", ...configuracao },
      modoTeste: false,
      sim: true,
      uid: 0,
      estadoResultado: { presente: false, estado: null, avisos: [] },
      deteccao: deteccaoFalsa(),
      ordemEtapas: ordemEtapasPara(configuracao.perfil),
      etapasConhecidas: new Set(ORDEM_ETAPAS),
      desdeEtapa: null,
      estadoInvalido: false,
      forcar: false,
      permitirInstavel: false,
      permitirFusoDivergente: false,
      lerDisco: () => ({ livreBytes: 50 * 1024 ** 3, livreGiB: 50 }),
      memoriaTotal: () => 8 * 1024 ** 3,
      comandoExiste: () => false,
      executar: () => ({ status: 0, stdout: "", stderr: "" }),
    };
  }

  it("recusa o perfil com controlador sem operador", () => {
    assert.throws(
      () => executarPreflight(contexto({ perfil: "controlador" })),
      /conta de operação/,
    );
  });

  it("recusa o perfil Dropbox sem a configuração completa", () => {
    assert.throws(
      () => executarPreflight(contexto({ perfil: "dropbox" })),
      /configuração completa/,
    );
  });
});
