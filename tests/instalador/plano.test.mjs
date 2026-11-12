// Testa o plano determinístico e os relatórios somente leitura com dublês do host.
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { after, describe, it } from "node:test";
import { detectar } from "../../scripts/instalador/detectar.mjs";
import { PACOTES, auditarPacotes } from "../../scripts/instalador/pacotes.mjs";
import { lerEstado } from "../../scripts/instalador/estado.mjs";
import {
  lerBackup,
  lerDisco,
  montarDiagnostico,
  montarPlano,
  montarSituacao,
} from "../../scripts/instalador/plano.mjs";
import { ErroInstalador } from "../../scripts/instalador/json.mjs";

const RAIZ_FIXTURES = fileURLToPath(new URL("./fixtures", import.meta.url));
const DIRETORIOS = [];

function fixture(nome) {
  return path.join(RAIZ_FIXTURES, nome);
}

function resposta(status, stdout = "", stderr = "") {
  return { status, stdout, stderr, erro: null };
}

function criarExecutor({ comandos = [], respostas = {} } = {}) {
  const chamadas = [];
  const conjunto = new Set(comandos);
  const executar = (comando, argumentos = []) => {
    chamadas.push([comando, ...argumentos]);
    const encontrada =
      typeof respostas === "function"
        ? respostas(comando, argumentos)
        : respostas[[comando, ...argumentos].join(" ")];
    if (encontrada) return { status: 0, stdout: "", stderr: "", erro: null, ...encontrada };
    if (comando === "id") return resposta(0, "root docker");
    return resposta(127, "", `nao encontrado: ${comando}`);
  };
  return {
    executar,
    comandoExiste: (nome) => conjunto.has(nome),
    chamadas,
  };
}

const VERSOES_APT = {
  bash: "5.2.37-1ubuntu1",
  curl: "8.5.0-2ubuntu10",
  "ca-certificates": "20240203",
  git: "1:2.43.0-1ubuntu7",
  jq: "1.7.1-3",
  openssl: "3.0.13-0ubuntu3",
  gnupg: "2.2.40-1.1",
  age: "1.1.1-1",
  rclone: "1.60.1",
  tar: "1.35+dfsg-3",
  gzip: "1.12-1ubuntu1",
  "util-linux": "2.39.3-9ubuntu6",
  coreutils: "9.4-3ubuntu6",
  "docker-ce": "29.8.2",
  "docker-compose-plugin": "2.39.1",
};

const COMANDOS_APT = [
  "apt-get",
  "bash",
  "curl",
  "git",
  "jq",
  "openssl",
  "gpg",
  "age",
  "rclone",
  "tar",
  "gzip",
  "flock",
  "sha256sum",
  "docker",
  "ufw",
  "systemctl",
  "aa-status",
];

function ambientePlano() {
  return criarExecutor({
    comandos: COMANDOS_APT,
    respostas: (comando, argumentos) => {
      if (comando === "dpkg" && argumentos[0] === "-s") {
        const nome = argumentos[1];
        const versao = VERSOES_APT[nome];
        if (!versao) return resposta(1, "", `dpkg-query: package '${nome}' is not installed`);
        return resposta(0, `Package: ${nome}\nStatus: install ok installed\nVersion: ${versao}\n`);
      }
      if (comando === "docker" && argumentos[0] === "--version") {
        return resposta(0, "Docker version 29.8.2, build 123");
      }
      if (comando === "docker" && argumentos[0] === "info") {
        return resposta(0, "29.8.2");
      }
      if (comando === "docker" && argumentos[0] === "compose") {
        return resposta(0, "2.39.1");
      }
      if (comando === "systemctl" && argumentos[0] === "is-active") {
        return resposta(0, "active");
      }
      if (comando === "aa-status") {
        return resposta(
          0,
          "apparmor module is loaded.\n12 profiles are in enforce mode.\n0 profiles are in complain mode.",
        );
      }
      if (comando === "id") return resposta(0, "root docker");
      return null;
    },
  });
}

function detectarFixture(nome, ambiente, opcoes = {}) {
  return detectar({
    raiz: fixture(nome),
    arquitetura: opcoes.arquitetura ?? "amd64",
    uid: opcoes.uid ?? 0,
    executar: ambiente.executar,
    comandoExiste: ambiente.comandoExiste,
  });
}

function configuracaoPlano(extra = {}) {
  return {
    perfil: "simples",
    canal: "release",
    tag: "v1.0.0",
    commit: "0000000000000000000000000000000000000000",
    imagem: "ghcr.io/eemtijca/frequenciapp",
    digest: "",
    tls: "acme",
    dominio: "",
    emailAcme: "",
    fuso: "America/Fortaleza",
    ...extra,
  };
}

function temporario() {
  const diretorio = fs.mkdtempSync(path.join(os.tmpdir(), "frequenciapp-plano-"));
  DIRETORIOS.push(diretorio);
  return diretorio;
}

function copiarFixture(nome) {
  const destino = temporario();
  fs.cpSync(fixture(nome), destino, { recursive: true });
  return destino;
}

after(() => {
  for (const diretorio of DIRETORIOS) {
    fs.rmSync(diretorio, { recursive: true, force: true });
  }
});

describe("plano determinístico", () => {
  it("produz o mesmo documento com a mesma detecção, auditoria e relógio", () => {
    const ambiente = ambientePlano();
    const deteccao = detectarFixture("ubuntu-26.04", ambiente);
    const auditoria = auditarPacotes({
      familia: deteccao.familia,
      gerenciador: deteccao.gerenciador,
      executar: ambiente.executar,
      comandoExiste: ambiente.comandoExiste,
    });
    const estadoResultado = lerEstado({ raiz: fixture("ubuntu-26.04") });
    const opcoes = {
      configuracao: configuracaoPlano(),
      deteccao,
      auditoria,
      estadoResultado,
      agora: "2026-11-11T12:00:00Z",
    };
    const primeiro = montarPlano(opcoes);
    const segundo = montarPlano(opcoes);
    assert.deepEqual(primeiro, segundo);
    assert.equal(primeiro.schema, "frequenciapp.instalador/1");
    assert.equal(primeiro.comando, "planejar");
    assert.equal(primeiro.dry_run, true);
    assert.equal(primeiro.ok, true);
    assert.equal(primeiro.codigo, null);
    assert.deepEqual(
      primeiro.etapas.map((etapa) => etapa.id),
      ["preflight", "pacotes", "docker"],
    );
    for (const etapa of primeiro.etapas) {
      assert.ok(Array.isArray(etapa.acoes));
      assert.ok(Array.isArray(etapa.avisos));
      assert.equal(typeof etapa.detalhes, "object");
      for (const acao of etapa.acoes) {
        assert.equal(typeof acao.descricao, "string");
        assert.ok(acao.comando === null || typeof acao.comando === "string");
        assert.equal(typeof acao.altera, "boolean");
      }
    }
    assert.ok(primeiro.proximos.length > 0);
    assert.ok(primeiro.avisos.some((item) => item.codigo === "A_INSTALACAO_EXISTENTE"));
  });

  it("marca estado corrompido como E_VALIDACAO", () => {
    const ambiente = ambientePlano();
    const deteccao = detectarFixture("ubuntu-26.04", ambiente);
    const auditoria = auditarPacotes({
      familia: deteccao.familia,
      gerenciador: deteccao.gerenciador,
      executar: ambiente.executar,
      comandoExiste: ambiente.comandoExiste,
    });
    const erro = new ErroInstalador("E_VALIDACAO", "O estado da instalação está corrompido.", {
      dica: "Restaure o estado.",
      documentacao: "docs/instalador.md#estado-durável",
    });
    const documento = montarPlano({
      configuracao: configuracaoPlano(),
      deteccao,
      auditoria,
      estadoResultado: { presente: false, estado: null, avisos: [], erro },
      agora: "2026-11-11T12:00:00Z",
    });
    assert.equal(documento.ok, false);
    assert.equal(documento.codigo, "E_VALIDACAO");
    assert.equal(documento.etapas[0].codigo, "E_VALIDACAO");
  });

  it("recusa distro Tier 3 e canal main sem confirmação", () => {
    const ambiente = criarExecutor({ comandos: ["apt-get"] });
    const deteccao = detectar({
      raiz: fixture("desconhecida"),
      arquitetura: "amd64",
      uid: 1000,
      executar: ambiente.executar,
      comandoExiste: ambiente.comandoExiste,
    });
    const documento = montarPlano({
      configuracao: configuracaoPlano({ canal: "main" }),
      deteccao,
      auditoria: null,
      estadoResultado: { presente: false },
      agora: "2026-11-11T12:00:00Z",
    });
    assert.equal(documento.ok, false);
    assert.equal(documento.codigo, "E_DISTRO");
    assert.ok(documento.erros.some((item) => item.codigo === "E_CANAL"));
  });

  it("aceita o canal main com --permitir-instavel", () => {
    const ambiente = ambientePlano();
    const deteccao = detectarFixture("ubuntu-26.04", ambiente);
    const auditoria = auditarPacotes({
      familia: deteccao.familia,
      gerenciador: deteccao.gerenciador,
      executar: ambiente.executar,
      comandoExiste: ambiente.comandoExiste,
    });
    const documento = montarPlano({
      configuracao: configuracaoPlano({ canal: "main", tag: "" }),
      deteccao,
      auditoria,
      estadoResultado: { presente: false },
      agora: "2026-11-11T12:00:00Z",
      permitirInstavel: true,
    });
    assert.equal(documento.ok, true);
    assert.ok(documento.avisos.some((item) => item.codigo === "A_CANAL_MAIN"));
  });
});

function ambienteComContainers(extra = {}) {
  const comandosBase = [
    "docker",
    "systemctl",
    "ss",
    "getent",
    "openssl",
    "timedatectl",
    "journalctl",
    "crontab",
    "psql",
    "pg_dump",
    "pg_restore",
    "rclone",
  ];
  const comandos = [...new Set([...comandosBase, ...(extra.comandos ?? [])])].filter(
    (comando) => !(extra.semComandos ?? []).includes(comando),
  );
  return criarExecutor({
    comandos,
    respostas: (comando, argumentos) => {
      if (extra.respostas) {
        const encontrada = extra.respostas(comando, argumentos);
        if (encontrada) return encontrada;
      }
      if (comando === "docker" && argumentos[0] === "--version") {
        return resposta(0, "Docker version 29.8.2, build 123");
      }
      if (comando === "docker" && argumentos[0] === "info") {
        return resposta(0, "29.8.2");
      }
      if (comando === "docker" && argumentos[0] === "compose") {
        return resposta(0, "2.39.1");
      }
      if (comando === "docker" && argumentos[0] === "ps") {
        return resposta(
          0,
          [
            "frequenciapp-app\tUp 2 hours (healthy)\tghcr.io/eemtijca/frequenciapp:v1.0.0",
            "frequenciapp-db\tUp 2 hours\tpostgres:17",
          ].join("\n"),
        );
      }
      if (comando === "docker" && argumentos[0] === "inspect") {
        return resposta(0, "healthy");
      }
      if (comando === "docker" && argumentos[0] === "exec") {
        if (argumentos[2] === "pg_isready") return resposta(0, "accepting connections");
        if (argumentos[2]?.includes("prisma")) {
          return resposta(0, "Database schema is up to date!");
        }
        return resposta(0, "ok");
      }
      if (comando === "systemctl" && argumentos[0] === "list-timers") {
        return resposta(
          0,
          "NEXT LEFT LAST PASSED UNIT ACTIVATES\nfrequenciapp-backup.timer frequenciapp-backup.service",
        );
      }
      if (comando === "systemctl" && argumentos[0] === "is-active") {
        return resposta(0, "active");
      }
      if (comando === "ss") {
        return resposta(0, "LISTEN 0 4096 *:80 *:443 \n");
      }
      if (comando === "getent") return resposta(0, "203.0.113.10 frequencia.exemplo.br");
      if (comando === "openssl") return resposta(0, "CONNECTION ESTABLISHED");
      if (comando === "timedatectl") {
        return resposta(0, "NTPSynchronized=yes\nTimezone=America/Fortaleza");
      }
      if (comando === "journalctl") return resposta(0, "");
      if (comando === "crontab") {
        return resposta(0, "*/15 * * * * /opt/frequenciapp/scripts/servidor/agenda.sh\n");
      }
      if (["psql", "pg_dump", "pg_restore"].includes(comando)) {
        return resposta(0, `${comando} (PostgreSQL) 17.5\n`);
      }
      return null;
    },
  });
}

function auditoriaCompleta() {
  return {
    gerenciador: "apt",
    familia: "debian",
    pacotes: PACOTES.map((pacote) => ({
      pacote: pacote.id,
      nome: pacote.id,
      presente: true,
      comandoPresente: true,
      versao: "1.0.0",
      versaoMinima: pacote.minimo,
      acao: "nenhuma",
      grupo: pacote.grupo,
      origem: "distro",
    })),
    resumo: { total: PACOTES.length, presentes: PACOTES.length, faltantes: 0, desatualizados: 0 },
    avisos: [],
  };
}

describe("situacao e diagnosticar com dublês", () => {
  it("lê containers, saúde, banco, timers e backup", () => {
    const ambiente = ambienteComContainers();
    const deteccao = detectarFixture("ubuntu-26.04", ambiente);
    const estadoResultado = lerEstado({ raiz: fixture("ubuntu-26.04") });
    const documento = montarSituacao({
      configuracao: configuracaoPlano(),
      deteccao,
      estadoResultado,
      executar: ambiente.executar,
      comandoExiste: ambiente.comandoExiste,
      raiz: fixture("ubuntu-26.04"),
      agora: "2026-11-11T12:00:00Z",
    });
    assert.equal(documento.comando, "situacao");
    assert.equal(documento.dry_run, false);
    assert.equal(documento.ok, true);
    assert.equal(documento.etapas[0].id, "situacao");
    const detalhes = documento.etapas[0].detalhes;
    assert.equal(detalhes.containers.length, 2);
    assert.equal(detalhes.saude.estado, "ok");
    assert.equal(detalhes.banco.estado, "ok");
    assert.equal(detalhes.timers.quantidade, 1);
    assert.equal(detalhes.estado.presente, true);
    assert.ok(Array.isArray(detalhes.verificacoes));
    assert.ok(detalhes.verificacoes.every((item) => "comando" in item && "dica" in item));
    assert.doesNotMatch(JSON.stringify(documento), /AUTH_SECRET|POSTGRES_PASSWORD|Bearer /);
  });

  it("degradação sem Docker continua produzindo relatório", () => {
    const ambiente = criarExecutor({ comandos: ["apt-get"] });
    const deteccao = detectar({
      raiz: fixture("desconhecida"),
      arquitetura: "amd64",
      uid: 1000,
      executar: ambiente.executar,
      comandoExiste: ambiente.comandoExiste,
    });
    const documento = montarSituacao({
      configuracao: configuracaoPlano(),
      deteccao,
      estadoResultado: { presente: false },
      executar: ambiente.executar,
      comandoExiste: ambiente.comandoExiste,
      raiz: fixture("desconhecida"),
      agora: "2026-11-11T12:00:00Z",
    });
    assert.equal(documento.ok, true);
    assert.ok(documento.avisos.some((item) => item.codigo === "A_DOCKER_AUSENTE"));
  });

  it("diagnóstico completo aceita dependências, rede, banco, migrações, backup e agendador", () => {
    const raiz = copiarFixture("ubuntu-26.04");
    fs.writeFileSync(
      path.join(raiz, "var/lib/frequenciapp/ultimo-backup.json"),
      JSON.stringify({
        arquivo: "/var/backups/frequenciapp/banco.sql.gz",
        verificadoEm: "2026-11-11T10:00:00Z",
      }),
      "utf8",
    );
    const diretorio = temporario();
    const rcloneConfig = path.join(diretorio, "rclone.conf");
    const dropboxConfig = path.join(diretorio, "dropbox.json");
    const dropboxToken = path.join(diretorio, "dropbox.token");
    fs.writeFileSync(rcloneConfig, "[remoto]\ntype = local\n", { mode: 0o600 });
    fs.writeFileSync(dropboxConfig, '{"conta":"escola"}\n', { mode: 0o600 });
    fs.writeFileSync(dropboxToken, "token-ficticio\n", { mode: 0o600 });
    const ambiente = ambienteComContainers();
    const deteccao = detectarFixture("ubuntu-26.04", ambiente);
    const estadoResultado = lerEstado({ raiz });
    const documento = montarDiagnostico({
      configuracao: configuracaoPlano({
        dominio: "frequencia.exemplo.br",
        modoBackup: "url",
        destino: "remoto:backup",
        configRclone: rcloneConfig,
        perfil: "dropbox",
        configDropbox: dropboxConfig,
        arquivoTokenDropbox: dropboxToken,
      }),
      deteccao,
      estadoResultado,
      auditoria: auditoriaCompleta(),
      executar: ambiente.executar,
      comandoExiste: ambiente.comandoExiste,
      raiz,
      agora: "2026-11-11T12:00:00Z",
    });
    assert.equal(documento.comando, "diagnosticar");
    assert.equal(documento.ok, true, JSON.stringify(documento.erros));
    assert.equal(documento.codigo, null);
    assert.equal(documento.etapas[0].id, "diagnostico");
    const ids = documento.etapas[0].detalhes.verificacoes.map((item) => item.id);
    for (const id of [
      "distro",
      "pacotes",
      "ferramentas-postgres",
      "docker",
      "containers",
      "saude",
      "banco",
      "migracoes",
      "estado",
      "portas",
      "dns",
      "tls",
      "relogio",
      "disco",
      "memoria",
      "firewall",
      "selinux",
      "apparmor",
      "controlador",
      "backup",
      "rclone",
      "dropbox",
      "timers",
      "journal",
      "cron",
      "agendador",
    ]) {
      assert.ok(ids.includes(id), `verificação ausente: ${id}`);
    }
    assert.equal(documento.etapas[0].detalhes.migracoes.estado, "atualizado");
    assert.equal(documento.etapas[0].detalhes.ferramentasPostgres.modo, "url");
    assert.equal(documento.etapas[0].detalhes.configuracaoRclone.seguro, true);
    assert.equal(documento.etapas[0].detalhes.adocaoDropbox.adotado, true);
    assert.equal(documento.etapas[0].detalhes.agendador.ativo, "systemd");
  });

  it("diagnóstico sinaliza migrações pendentes e falhas do Prisma", () => {
    const ambiente = ambienteComContainers({
      respostas: (comando, argumentos) => {
        if (comando === "docker" && argumentos[0] === "exec" && argumentos[2]?.includes("prisma")) {
          return resposta(0, "Following migrations have not yet been applied:\n2026_pendente");
        }
        return null;
      },
    });
    const deteccao = detectarFixture("ubuntu-26.04", ambiente);
    const documento = montarDiagnostico({
      configuracao: configuracaoPlano(),
      deteccao,
      estadoResultado: { presente: false },
      auditoria: auditoriaCompleta(),
      executar: ambiente.executar,
      comandoExiste: ambiente.comandoExiste,
      raiz: fixture("ubuntu-26.04"),
      agora: "2026-11-11T12:00:00Z",
    });
    assert.equal(documento.ok, false);
    assert.equal(documento.codigo, "E_SAUDE");
    const migracoes = documento.etapas[0].detalhes.verificacoes.find(
      (item) => item.id === "migracoes",
    );
    assert.equal(migracoes.estado, "falha");
    assert.equal(migracoes.codigo, "E_SAUDE");
    assert.equal(documento.etapas[0].detalhes.migracoes.estado, "pendente");
  });

  it("diagnóstico avisa sobre journal, cron e agendador ausentes", () => {
    const ambiente = ambienteComContainers({
      respostas: (comando, argumentos) => {
        if (comando === "journalctl") {
          return resposta(1, "", "No journal files were found.");
        }
        if (comando === "systemctl" && argumentos[0] === "list-timers") {
          return resposta(0, "NEXT LEFT LAST PASSED UNIT ACTIVATES\n");
        }
        if (comando === "crontab") {
          return resposta(1, "", "no crontab for root");
        }
        return null;
      },
    });
    const deteccao = detectarFixture("ubuntu-26.04", ambiente);
    const documento = montarDiagnostico({
      configuracao: configuracaoPlano(),
      deteccao,
      estadoResultado: { presente: false },
      auditoria: auditoriaCompleta(),
      executar: ambiente.executar,
      comandoExiste: ambiente.comandoExiste,
      raiz: fixture("ubuntu-26.04"),
      agora: "2026-11-11T12:00:00Z",
    });
    assert.equal(documento.ok, true);
    const codigos = documento.avisos.map((item) => item.codigo);
    assert.ok(codigos.includes("A_JOURNAL"));
    assert.ok(codigos.includes("A_CRON"));
    assert.ok(codigos.includes("A_AGENDADOR"));
    assert.equal(documento.etapas[0].detalhes.agendador.ativo, "nenhum");
  });

  it("diagnóstico em modo URL exige cliente PostgreSQL 17", () => {
    const ambiente = ambienteComContainers({ semComandos: ["pg_dump"] });
    const deteccao = detectarFixture("ubuntu-26.04", ambiente);
    const documento = montarDiagnostico({
      configuracao: configuracaoPlano({ modoBackup: "url" }),
      deteccao,
      estadoResultado: { presente: false },
      auditoria: auditoriaCompleta(),
      executar: ambiente.executar,
      comandoExiste: ambiente.comandoExiste,
      raiz: fixture("ubuntu-26.04"),
      agora: "2026-11-11T12:00:00Z",
    });
    assert.equal(documento.ok, false);
    assert.equal(documento.codigo, "E_BACKUP");
    const ferramentas = documento.etapas[0].detalhes.verificacoes.find(
      (item) => item.id === "ferramentas-postgres",
    );
    assert.equal(ferramentas.estado, "falha");
    assert.ok(
      documento.etapas[0].detalhes.ferramentasPostgres.problemas.includes("pg_dump ausente"),
    );
  });

  it("diagnóstico em modo URL recusa cliente PostgreSQL abaixo de 17", () => {
    const ambiente = ambienteComContainers({
      respostas: (comando, argumentos) => {
        if (comando === "pg_restore" && argumentos[0] === "--version") {
          return resposta(0, "pg_restore (PostgreSQL) 16.3\n");
        }
        return null;
      },
    });
    const deteccao = detectarFixture("ubuntu-26.04", ambiente);
    const documento = montarDiagnostico({
      configuracao: configuracaoPlano({ modoBackup: "url" }),
      deteccao,
      estadoResultado: { presente: false },
      auditoria: auditoriaCompleta(),
      executar: ambiente.executar,
      comandoExiste: ambiente.comandoExiste,
      raiz: fixture("ubuntu-26.04"),
      agora: "2026-11-11T12:00:00Z",
    });
    assert.equal(documento.ok, false);
    assert.equal(documento.codigo, "E_BACKUP");
    assert.ok(
      documento.etapas[0].detalhes.ferramentasPostgres.problemas.includes(
        "pg_restore 16.3 abaixo de 17",
      ),
    );
  });

  it("diagnóstico confere rclone.conf e a adoção do Dropbox", () => {
    const diretorio = temporario();
    const rcloneConfig = path.join(diretorio, "rclone.conf");
    fs.writeFileSync(rcloneConfig, "[remoto]\ntype = local\n", { mode: 0o600 });
    fs.chmodSync(rcloneConfig, 0o644);
    const ambiente = ambienteComContainers();
    const deteccao = detectarFixture("ubuntu-26.04", ambiente);
    const documento = montarDiagnostico({
      configuracao: configuracaoPlano({
        destino: "remoto:backup",
        configRclone: rcloneConfig,
      }),
      deteccao,
      estadoResultado: { presente: false },
      auditoria: auditoriaCompleta(),
      executar: ambiente.executar,
      comandoExiste: ambiente.comandoExiste,
      raiz: fixture("ubuntu-26.04"),
      agora: "2026-11-11T12:00:00Z",
    });
    assert.equal(documento.ok, true);
    assert.ok(documento.avisos.some((item) => item.codigo === "A_RCLONE_PERMISSAO"));
    assert.equal(documento.etapas[0].detalhes.configuracaoRclone.seguro, false);

    const ambienteSemConfig = ambienteComContainers();
    const deteccaoSemConfig = detectarFixture("ubuntu-26.04", ambienteSemConfig);
    const semConfig = montarDiagnostico({
      configuracao: configuracaoPlano({
        destino: "remoto:backup",
        configRclone: path.join(diretorio, "ausente.conf"),
      }),
      deteccao: deteccaoSemConfig,
      estadoResultado: { presente: false },
      auditoria: auditoriaCompleta(),
      executar: ambienteSemConfig.executar,
      comandoExiste: ambienteSemConfig.comandoExiste,
      raiz: fixture("ubuntu-26.04"),
      agora: "2026-11-11T12:00:00Z",
    });
    assert.equal(semConfig.ok, false);
    assert.equal(semConfig.codigo, "E_BACKUP");

    const dropboxConfig = path.join(diretorio, "dropbox.json");
    fs.writeFileSync(dropboxConfig, '{"conta":"escola"}\n', { mode: 0o600 });
    const anterior = process.env.BACKUP_DROPBOX_CONFIG;
    process.env.BACKUP_DROPBOX_CONFIG = dropboxConfig;
    try {
      const ambienteDropbox = ambienteComContainers();
      const deteccaoDropbox = detectarFixture("ubuntu-26.04", ambienteDropbox);
      const adocao = montarDiagnostico({
        configuracao: configuracaoPlano(),
        deteccao: deteccaoDropbox,
        estadoResultado: { presente: false },
        auditoria: auditoriaCompleta(),
        executar: ambienteDropbox.executar,
        comandoExiste: ambienteDropbox.comandoExiste,
        raiz: fixture("ubuntu-26.04"),
        agora: "2026-11-11T12:00:00Z",
      });
      assert.equal(adocao.ok, true);
      assert.ok(adocao.avisos.some((item) => item.codigo === "A_DROPBOX_ADOCAO"));
      assert.equal(adocao.etapas[0].detalhes.adocaoDropbox.adotado, false);
    } finally {
      if (anterior === undefined) delete process.env.BACKUP_DROPBOX_CONFIG;
      else process.env.BACKUP_DROPBOX_CONFIG = anterior;
    }
  });

  it("diagnóstico sem Docker retorna E_DOCKER", () => {
    const ambiente = criarExecutor({ comandos: [] });
    const deteccao = detectar({
      raiz: fixture("ubuntu-26.04"),
      arquitetura: "amd64",
      uid: 1000,
      executar: ambiente.executar,
      comandoExiste: ambiente.comandoExiste,
    });
    const documento = montarDiagnostico({
      configuracao: configuracaoPlano(),
      deteccao,
      estadoResultado: { presente: false },
      auditoria: auditoriaCompleta(),
      executar: ambiente.executar,
      comandoExiste: ambiente.comandoExiste,
      raiz: fixture("ubuntu-26.04"),
      agora: "2026-11-11T12:00:00Z",
    });
    assert.equal(documento.ok, false);
    assert.equal(documento.codigo, "E_DOCKER");
    assert.ok(documento.erros.some((item) => item.codigo === "E_DOCKER"));
  });

  it("diagnóstico prioriza estado corrompido como E_VALIDACAO", () => {
    const ambiente = ambienteComContainers();
    const deteccao = detectarFixture("ubuntu-26.04", ambiente);
    const erro = new ErroInstalador("E_VALIDACAO", "O estado da instalação está corrompido.", {
      dica: "Restaure o estado.",
      documentacao: "docs/instalador.md#estado-durável",
    });
    const documento = montarDiagnostico({
      configuracao: configuracaoPlano(),
      deteccao,
      estadoResultado: { presente: false, estado: null, avisos: [], erro },
      auditoria: auditoriaCompleta(),
      executar: ambiente.executar,
      comandoExiste: ambiente.comandoExiste,
      raiz: fixture("ubuntu-26.04"),
      agora: "2026-11-11T12:00:00Z",
    });
    assert.equal(documento.ok, false);
    assert.equal(documento.codigo, "E_VALIDACAO");
    assert.equal(documento.erros[0].codigo, "E_VALIDACAO");
  });

  it("redige segredo que aparece na saída de um comando", () => {
    const ambiente = criarExecutor({
      comandos: ["docker"],
      respostas: (comando, argumentos) => {
        if (comando === "docker" && argumentos[0] === "--version") {
          return resposta(0, "Docker version 29.8.2, build 123");
        }
        if (comando === "docker" && argumentos[0] === "info") return resposta(0, "29.8.2");
        if (comando === "docker" && argumentos[0] === "compose") return resposta(0, "2.39.1");
        if (comando === "docker" && argumentos[0] === "ps") {
          return resposta(0, "app\tUp\timagem\ncontainer-AUTH_SECRET=valor-secreto\tUp\timagem");
        }
        if (comando === "docker" && argumentos[0] === "inspect") return resposta(0, "healthy");
        if (comando === "docker" && argumentos[0] === "exec") return resposta(0, "ok");
        return null;
      },
    });
    const deteccao = detectarFixture("ubuntu-26.04", ambiente);
    const documento = montarSituacao({
      configuracao: configuracaoPlano(),
      deteccao,
      estadoResultado: { presente: false },
      executar: ambiente.executar,
      comandoExiste: ambiente.comandoExiste,
      raiz: fixture("ubuntu-26.04"),
      agora: "2026-11-11T12:00:00Z",
    });
    const texto = JSON.stringify(documento);
    assert.doesNotMatch(texto, /valor-secreto/);
    assert.match(texto, /\[REDIGIDO\]/);
  });

  it("lê o ponteiro de backup e o disco", () => {
    const raiz = copiarFixture("ubuntu-26.04");
    const caminho = path.join(raiz, "var/lib/frequenciapp/ultimo-backup.json");
    fs.writeFileSync(
      caminho,
      JSON.stringify({
        arquivo: "/var/backups/frequenciapp/banco.sql.gz",
        em: "2026-11-04T12:00:00Z",
      }),
      "utf8",
    );
    const backup = lerBackup(raiz, "2026-11-11T12:00:00Z");
    assert.equal(backup.presente, true);
    assert.equal(backup.valido, true);
    assert.equal(backup.idadeDias, 7);
    assert.equal(backup.arquivo, "banco.sql.gz");
    const disco = lerDisco(raiz);
    assert.ok(disco);
    assert.ok(disco.livreBytes > 0);
    assert.ok(disco.totalBytes >= disco.livreBytes);
  });
});
