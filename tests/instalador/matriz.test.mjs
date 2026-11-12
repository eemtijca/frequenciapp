// Testa o planejar real nas distros da matriz, com o worktree somente leitura e o Node 24 fora dele.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { after, before, describe, it } from "node:test";
import { SCHEMA_ESTADO, SCHEMA_SAIDA } from "../../scripts/instalador/json.mjs";

// Runtime oficial preparado em volume próprio, fora do worktree e do host de destino.
const NODE_GLIBC =
  "node:24.22.3-bookworm-slim@sha256:dc26ae92c9fb15cf6b1d63e20f0944b2efe0f115b20e00be48fb23fceb061c54";
const NODE_MUSL =
  "node:24.22.3-alpine@sha256:98e4e60b35fd50143e1838da2957488c25aa3a3efbd48bb679923f77d6d3d873";

// As tags ficam apenas para leitura. O digest congela a imagem usada na matriz.
const IMAGENS = [
  {
    nome: "ubuntu-22.04",
    tag: "ubuntu:22.04",
    digest: "sha256:076e7bf82319619f28dd0aa9c02ab34b055ad37100395b4f49a2ffba04fb5e11",
    distro: "ubuntu",
    versaoPrefixo: "22.04",
    codename: "jammy",
    familia: "debian",
    gerenciador: "apt",
    iniciador: "systemd",
    tier: 1,
  },
  {
    nome: "ubuntu-24.04",
    tag: "ubuntu:24.04",
    digest: "sha256:fe81560990fae86dc4743202b2cb4d3df98d0bcf949173cecef15ce1127ef852",
    distro: "ubuntu",
    versaoPrefixo: "24.04",
    codename: "noble",
    familia: "debian",
    gerenciador: "apt",
    iniciador: "systemd",
    tier: 1,
  },
  {
    nome: "ubuntu-26.04",
    tag: "ubuntu:26.04",
    digest: "sha256:6a06111c3b0a8600feadb270aec771dc239bf407b25625f93f44ab00e11f4d3c",
    distro: "ubuntu",
    versaoPrefixo: "26.04",
    codename: "resolute",
    familia: "debian",
    gerenciador: "apt",
    iniciador: "systemd",
    tier: 1,
  },
  {
    nome: "debian-12",
    tag: "debian:12",
    digest: "sha256:268fb24c39bca92d326dd83ea3abebe4a3f7751c804ffef23bb6d857dd343ff8",
    distro: "debian",
    versaoPrefixo: "12",
    codename: "bookworm",
    familia: "debian",
    gerenciador: "apt",
    iniciador: "systemd",
    tier: 1,
  },
  {
    nome: "debian-13",
    tag: "debian:13",
    digest: "sha256:9c6e381421d0f48d1b8133e573f33c185ee16cbf505eda9c4a8a4791b25ea8a6",
    distro: "debian",
    versaoPrefixo: "13",
    codename: "trixie",
    familia: "debian",
    gerenciador: "apt",
    iniciador: "systemd",
    tier: 1,
  },
  {
    nome: "rocky-9",
    tag: "rockylinux:9",
    digest: "sha256:d7be1c094cc5845ee815d4632fe377514ee6ebcf8efaed6892889657e5ddaaa6",
    distro: "rocky",
    versaoPrefixo: "9.",
    codename: "",
    familia: "rhel",
    gerenciador: "dnf",
    iniciador: "systemd",
    tier: 1,
  },
  {
    nome: "almalinux-9",
    tag: "almalinux:9",
    digest: "sha256:245f8aab832fe800aa42bdab5fad75ebbd8e0b4c9f24820a83c638b177857ae2",
    distro: "almalinux",
    versaoPrefixo: "9.",
    codename: "",
    familia: "rhel",
    gerenciador: "dnf",
    iniciador: "systemd",
    tier: 1,
  },
  {
    nome: "fedora",
    tag: "fedora:latest",
    digest: "sha256:a7d72ba2745b100a3351087472e5ee7b2450af7cf331e7673007e3817612839c",
    distro: "fedora",
    versaoPrefixo: "",
    codename: "",
    familia: "fedora",
    gerenciador: "dnf",
    iniciador: "systemd",
    tier: 1,
    risco: "tag móvel; o digest fixa o conteúdo",
  },
  {
    nome: "arch",
    tag: "archlinux:latest",
    digest: "sha256:d4594bb2300cba11f41c2f27923eb56f63d9988909c402f9c95517d1e362c899",
    distro: "arch",
    versaoPrefixo: "",
    codename: "",
    familia: "arch",
    gerenciador: "pacman",
    iniciador: "systemd",
    tier: 1,
    risco: "tag móvel; o digest fixa o conteúdo",
  },
  {
    nome: "opensuse-leap-15.6",
    tag: "opensuse/leap:15.6",
    digest: "sha256:79be7751205ea84559990fb76b1bec71e38d6fad41c70a4f6c921b803b58f421",
    distro: "opensuse-leap",
    versaoPrefixo: "15.6",
    codename: "",
    familia: "suse",
    gerenciador: "zypper",
    iniciador: "systemd",
    tier: 1,
  },
  {
    nome: "amazonlinux-2023",
    tag: "amazonlinux:2023",
    digest: "sha256:3ccfbe800f864982b0a4e124a614b2382518cbd04b3c1cd35202bd46f392675b",
    distro: "amzn",
    versaoPrefixo: "2023",
    codename: "",
    familia: "rhel",
    gerenciador: "dnf",
    iniciador: "systemd",
    tier: 2,
  },
  {
    nome: "alpine-3.22",
    tag: "alpine:3.22",
    digest: "sha256:49340b346798875b5592e5d420241f2f9cfba5f47e62ebb1446a1b34734e898f",
    distro: "alpine",
    versaoPrefixo: "3.22",
    codename: "",
    familia: "alpine",
    gerenciador: "apk",
    iniciador: "openrc",
    tier: 2,
    preparar: "apk add --no-cache bash libstdc++ >/dev/null",
  },
];

const PADROES_SEGREDO = [
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/,
  /AGE-SECRET-KEY-[A-Z0-9]+/,
  /\bsl\.[A-Za-z0-9_-]{20,}\b/,
  /\b(?:AUTH_SECRET|CRON_SECRET|POSTGRES_PASSWORD)\s*[:=]\s*\S+/i,
  /\bBearer\s+[A-Za-z0-9._-]{8,}/i,
  /[a-z][a-z0-9+.-]*:\/\/[^/\s@:]+:[^/\s@]+@/i,
];

const ESTADOS_ETAPA = new Set([
  "pendente",
  "executando",
  "concluida",
  "pulada",
  "falhou",
  "bloqueada",
]);
const VOLUMES = [];
const VOLUME_FONTE = process.env.INSTALADOR_MATRIZ_VOLUME?.trim() ?? "";

function executar(programa, argumentos, opcoes = {}) {
  const resultado = spawnSync(programa, argumentos, {
    encoding: "utf8",
    maxBuffer: 32 * 1024 * 1024,
    windowsHide: true,
    timeout: opcoes.timeout ?? 300_000,
  });
  return {
    status: typeof resultado.status === "number" ? resultado.status : 1,
    stdout: String(resultado.stdout ?? ""),
    stderr: String(resultado.stderr ?? ""),
    erro: resultado.error ? (resultado.error.code ?? "falha") : null,
  };
}

function motivoDePulo() {
  // O job de unidade desativa a matriz para não repetir a suíte Docker.
  if (process.env.INSTALADOR_MATRIZ === "0") {
    return "Matriz desativada por INSTALADOR_MATRIZ=0.";
  }
  const sonda = executar("docker", ["info", "--format", "{{.ServerVersion}}"], { timeout: 30_000 });
  if (sonda.erro === "ENOENT") {
    return "Docker não encontrado no PATH. A matriz exige Docker.";
  }
  if (sonda.status !== 0) {
    const detalhe = (sonda.stderr || sonda.stdout).trim().split(/\r?\n/)[0] || "sem detalhe";
    return `Docker indisponível: ${detalhe}`;
  }
  return false;
}

function montagemFonte() {
  if (VOLUME_FONTE) return `${VOLUME_FONTE}:/work:ro`;
  const diretorio = path.resolve(process.cwd()).replaceAll("\\", "/");
  return `${diretorio}:/work:ro`;
}

function referencia(imagem) {
  return `${imagem.tag}@${imagem.digest}`;
}

function prepararNode(imagemNode, volume) {
  const resultado = executar(
    "docker",
    [
      "run",
      "--rm",
      "--pull=missing",
      "-v",
      `${volume}:/node`,
      imagemNode,
      "sh",
      "-c",
      "cp /usr/local/bin/node /node/node && chmod 0755 /node/node",
    ],
    { timeout: 600_000 },
  );
  assert.equal(
    resultado.status,
    0,
    `Falha ao preparar o Node fora do worktree com ${imagemNode}:\n${resultado.stderr}`,
  );
}

function criarVolumeNode(sufixo, imagemNode) {
  const volume = `frequenciapp-instalador-matriz-${sufixo}-${process.pid}-${Date.now()}`;
  const criacao = executar("docker", ["volume", "create", volume], { timeout: 60_000 });
  assert.equal(criacao.status, 0, `Falha ao criar o volume ${volume}:\n${criacao.stderr}`);
  VOLUMES.push(volume);
  prepararNode(imagemNode, volume);
  return volume;
}

function argumentosPlano(imagem, volumeNode) {
  const argumentos = [
    "run",
    "--rm",
    "--pull=missing",
    "-v",
    montagemFonte(),
    "-v",
    `${volumeNode}:/node:ro`,
    "-w",
    "/work",
    "-e",
    "INSTALADOR_NODE=/node/node",
  ];
  const comando = "bash instalar.sh planejar --json --nao-interativo";
  if (imagem.preparar) {
    argumentos.push(referencia(imagem), "sh", "-c", `${imagem.preparar} && exec ${comando}`);
  } else {
    argumentos.push(
      referencia(imagem),
      "bash",
      "instalar.sh",
      "planejar",
      "--json",
      "--nao-interativo",
    );
  }
  return argumentos;
}

function conferirInstante(instante, contexto) {
  if (instante === null) return;
  assert.equal(typeof instante, "string", `${contexto}: instante precisa ser texto ou null`);
  assert.ok(!Number.isNaN(Date.parse(instante)), `${contexto}: instante inválido`);
}

function validarDocumento(documento, imagem) {
  const contexto = `${imagem.nome} (${referencia(imagem)})`;
  assert.equal(documento.schema, SCHEMA_SAIDA, `${contexto}: schema de saída`);
  assert.equal(documento.comando, "planejar", `${contexto}: comando`);
  assert.equal(documento.ok, true, `${contexto}: ok`);
  assert.equal(documento.codigo, null, `${contexto}: códigos encontrados`);
  assert.equal(documento.dry_run, true, `${contexto}: dry_run`);
  assert.equal(documento.distro, imagem.distro, `${contexto}: distro`);
  assert.equal(documento.familia, imagem.familia, `${contexto}: família`);
  assert.equal(documento.tier, imagem.tier, `${contexto}: tier`);
  assert.equal(documento.gerenciador, imagem.gerenciador, `${contexto}: gerenciador`);
  assert.equal(documento.iniciador, imagem.iniciador, `${contexto}: iniciador`);
  assert.ok(["amd64", "arm64"].includes(documento.arquitetura), `${contexto}: arquitetura`);
  assert.equal(documento.canal, "release", `${contexto}: canal padrão`);
  assert.equal(documento.perfil, "simples", `${contexto}: perfil padrão`);
  assert.equal(typeof documento.codename, "string", `${contexto}: codename`);
  if (imagem.codename) {
    assert.equal(documento.codename, imagem.codename, `${contexto}: codename da distro`);
  }
  for (const campo of ["firewall", "selinux", "apparmor"]) {
    assert.equal(typeof documento[campo], "string", `${contexto}: ${campo}`);
  }
  assert.equal(typeof documento.versao, "object", `${contexto}: versao`);
  assert.equal(typeof documento.versao.instalador, "string", `${contexto}: versão do instalador`);
  assert.equal(typeof documento.versao.projeto, "string", `${contexto}: versão do projeto`);
  assert.deepEqual(documento.erros, [], `${contexto}: erros`);
  assert.ok(Array.isArray(documento.avisos), `${contexto}: avisos`);
  assert.ok(Array.isArray(documento.proximos), `${contexto}: proximos`);
  assert.ok(documento.proximos.length > 0, `${contexto}: proximos vazio`);

  const etapas = documento.etapas;
  assert.ok(Array.isArray(etapas), `${contexto}: etapas`);
  assert.deepEqual(
    etapas.map((etapa) => etapa.id),
    ["preflight", "pacotes", "docker"],
    `${contexto}: etapas do plano`,
  );
  for (const etapa of etapas) {
    assert.ok(ESTADOS_ETAPA.has(etapa.estado), `${contexto}: estado da etapa ${etapa.id}`);
    assert.equal(typeof etapa.detalhes, "object", `${contexto}: detalhes da etapa ${etapa.id}`);
    assert.ok(Array.isArray(etapa.acoes), `${contexto}: ações da etapa ${etapa.id}`);
    assert.ok(Array.isArray(etapa.avisos), `${contexto}: avisos da etapa ${etapa.id}`);
    conferirInstante(etapa.inicio, `${contexto}: início de ${etapa.id}`);
    conferirInstante(etapa.fim, `${contexto}: fim de ${etapa.id}`);
    for (const acao of etapa.acoes) {
      assert.equal(typeof acao.descricao, "string", `${contexto}: descrição da ação`);
      assert.ok(
        acao.comando === null || typeof acao.comando === "string",
        `${contexto}: comando da ação`,
      );
      assert.equal(typeof acao.altera, "boolean", `${contexto}: altera da ação`);
    }
  }

  const preflight = etapas[0];
  assert.equal(preflight.estado, "concluida", `${contexto}: preflight`);
  assert.equal(preflight.codigo, null, `${contexto}: código do preflight`);
  assert.equal(preflight.detalhes.container, true, `${contexto}: detecção de contêiner`);
  assert.equal(preflight.detalhes.schemaEstado, SCHEMA_ESTADO, `${contexto}: schema do estado`);
  const versaoDistro = String(preflight.detalhes.versaoDistro ?? "");
  if (imagem.versaoPrefixo) {
    assert.ok(
      versaoDistro.startsWith(imagem.versaoPrefixo),
      `${contexto}: versão ${versaoDistro} não começa com ${imagem.versaoPrefixo}`,
    );
  } else {
    assert.ok(versaoDistro.length > 0, `${contexto}: versão da distro vazia`);
  }

  const pacotes = etapas[1];
  assert.equal(pacotes.detalhes.gerenciador, imagem.gerenciador, `${contexto}: pacotes`);
  assert.ok(pacotes.detalhes.resumo.total > 0, `${contexto}: resumo de pacotes`);
  assert.ok(Array.isArray(pacotes.detalhes.pacotes), `${contexto}: lista de pacotes`);
  const ids = new Set(pacotes.detalhes.pacotes.map((pacote) => pacote.pacote));
  for (const id of ["bash", "docker", "compose"]) {
    assert.ok(ids.has(id), `${contexto}: pacote ${id} ausente da auditoria`);
  }
  if (imagem.tier === 2) {
    assert.ok(
      documento.avisos.some((item) => item.codigo === "A_TIER2"),
      `${contexto}: aviso de Tier 2`,
    );
  }
}

function planejar(imagem, volumeNode) {
  const resultado = executar("docker", argumentosPlano(imagem, volumeNode), { timeout: 600_000 });
  const contexto = `${imagem.nome} (${referencia(imagem)})`;
  assert.equal(
    resultado.status,
    0,
    `${contexto}: planejar falhou\nstdout:\n${resultado.stdout}\nstderr:\n${resultado.stderr}`,
  );
  let documento;
  try {
    documento = JSON.parse(resultado.stdout);
  } catch (erro) {
    assert.fail(
      `${contexto}: stdout não contém um único documento JSON (${erro.message})\n` +
        `stdout:\n${resultado.stdout}\nstderr:\n${resultado.stderr}`,
    );
  }
  assert.equal(typeof documento, "object", `${contexto}: documento JSON`);
  assert.ok(documento !== null, `${contexto}: documento JSON nulo`);
  assert.ok(!Array.isArray(documento), `${contexto}: documento JSON precisa ser objeto`);
  const texto = `${resultado.stdout}\n${resultado.stderr}`;
  for (const padrao of PADROES_SEGREDO) {
    assert.doesNotMatch(texto, padrao, `${contexto}: padrão de segredo encontrado`);
  }
  validarDocumento(documento, imagem);
  return documento;
}

describe("matriz Docker do planejar", { skip: motivoDePulo() }, () => {
  let nodeGlibc;
  let nodeMusl;

  before(
    () => {
      nodeGlibc = criarVolumeNode("glibc", NODE_GLIBC);
      nodeMusl = criarVolumeNode("musl", NODE_MUSL);
    },
    { timeout: 900_000 },
  );

  after(() => {
    for (const volume of VOLUMES) {
      executar("docker", ["volume", "rm", "-f", volume], { timeout: 60_000 });
    }
  });

  for (const imagem of IMAGENS) {
    it(`planeja em ${imagem.nome}`, { timeout: 600_000 }, (t) => {
      assert.match(imagem.digest, /^sha256:[a-f0-9]{64}$/, `${imagem.nome}: digest fixo`);
      t.diagnostic(`imagem fixa: ${referencia(imagem)}`);
      if (imagem.risco) t.diagnostic(`risco registrado: ${imagem.risco}`);
      const volumeNode = imagem.familia === "alpine" ? nodeMusl : nodeGlibc;
      const documento = planejar(imagem, volumeNode);
      t.diagnostic(
        `resultado: distro=${documento.distro} versao=${documento.etapas[0].detalhes.versaoDistro} ` +
          `familia=${documento.familia} tier=${documento.tier} gerenciador=${documento.gerenciador}`,
      );
    });
  }
});
