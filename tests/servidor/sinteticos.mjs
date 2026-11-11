// Executa e confere os ensaios em um único contêiner efêmero, sem socket ou rede.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import os from "node:os";
import { contextoFerramentas, validarImagem } from "./imagens-ensaio.mjs";

const raiz = fs.realpathSync(path.resolve(import.meta.dirname, "../.."));
const interno = "/repo/tests/servidor/sinteticos-interno.mjs";
const label = "br.app.frequenciapp.sinteticos";
const tmpfs = "rw,exec,nosuid,nodev,size=1g";
const caminho = "/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin";
const ambiente = {
  PATH: caminho,
  HOME: "/tmp",
  TMPDIR: "/tmp",
  GIT_CONFIG_NOSYSTEM: "1",
  GIT_CONFIG_GLOBAL: "/dev/null",
  GIT_ALLOW_PROTOCOL: "file",
  HELM_BIN: "/usr/local/bin/helm",
};
const perfis = ["sinteticos", "autoteste", "portabilidade", "controlador-root"];
export function inventarioPerfis(fonte = raiz) {
  const mapa = {
    sinteticos: inventario("sinteticos", fonte).map((i) => i.arquivo),
    "origem-cli": ["tests/servidor/origem-backup-cli.e2e.mjs"],
    "controlador-root": ["tests/servidor/controlador/operacional.e2e.mjs"],
    "restauracao-url": ["tests/servidor/restauracao-url.sh"],
    legadosBloqueados: [
      "backup-restauracao.sh",
      "nginx-acme.sh",
      "privilegios-preview.sh",
      "atualizacao-integracao.sh",
    ].map((n) => `tests/servidor/${n}`),
  };
  const e2e = ["tests/servidor", "tests/kubernetes"]
    .flatMap((p) =>
      percorrer(path.join(fonte, p))
        .filter((n) => n.endsWith(".e2e.mjs"))
        .map((n) => `${p}/${n}`),
    )
    .sort();
  iguais(e2e, [...mapa["origem-cli"], ...mapa["controlador-root"]].sort());
  for (const nome of [
    ...mapa["origem-cli"],
    ...mapa["controlador-root"],
    ...mapa["restauracao-url"],
    ...mapa.legadosBloqueados,
  ])
    exigir(fs.lstatSync(path.join(fonte, nome)).isFile());
  return mapa;
}
const chavesContagens = ["testes", "passaram", "falharam", "cancelados", "ignorados", "pendentes"];
const fases = [
  "preparacao",
  "imagem",
  "criacao",
  "preflight",
  "execucao",
  "encerramento",
  "resultado",
  "fontes",
  "limpeza",
  "concluido",
];
const exigir = (condicao) => assert.ok(condicao, "Contrato dos ensaios não comprovado");
const vazio = (valor) => valor === null || valor === undefined || Object.keys(valor).length === 0;
const iguais = (a, b) => assert.deepEqual(a, b);
const chaves = (obj, esperadas) => iguais(Object.keys(obj).sort(), [...esperadas].sort());
export const contagensVazias = () => Object.fromEntries(chavesContagens.map((nome) => [nome, 0]));

function percorrer(base, prefixo = "") {
  const saida = [];
  for (const item of fs
    .readdirSync(path.join(base, prefixo), { withFileTypes: true })
    .sort((a, b) => a.name.localeCompare(b.name))) {
    const nome = path.posix.join(prefixo, item.name);
    exigir(!item.isSymbolicLink());
    if (item.isDirectory()) saida.push(...percorrer(base, nome));
    else {
      exigir(item.isFile());
      saida.push(nome);
    }
  }
  return saida;
}

export function inventario(perfil, fonte = raiz) {
  exigir(perfis.includes(perfil));
  if (perfil === "controlador-root")
    return [{ arquivo: "tests/servidor/controlador/operacional.e2e.mjs", tipo: "node" }];
  if (["autoteste", "portabilidade"].includes(perfil))
    return [
      "tests/servidor/executar-sinteticos.test.mjs",
      ...(perfil === "portabilidade" ? ["tests/kubernetes/origem-backup-chart.test.mjs"] : []),
    ]
      .sort()
      .map((arquivo) => ({ arquivo, tipo: "node" }));
  const arquivos = ["tests/servidor", "tests/kubernetes"].flatMap((pasta) =>
    percorrer(path.join(fonte, pasta))
      .filter((nome) => nome.endsWith(".test.mjs"))
      .map((nome) => ({ arquivo: `${pasta}/${nome}`, tipo: "node" })),
  );
  // A remoção acidental das regressões centrais não pode produzir um gate vazio.
  for (const nome of [
    "restauracao-seguranca",
    "verificacao-backup",
    "backup-verificacao-leitura",
    "catalogo-retomada",
    "dropbox-retencao",
    "origem-backup",
    "migrar-incompleta",
    "planilhas-retencao-segura",
    "retencao-remote-segura",
    "retencao-padroes-adicionais",
    "retencao-trinta",
    "configuracao-segura",
    "executar-sinteticos",
  ]) {
    exigir(arquivos.some((item) => item.arquivo === `tests/servidor/${nome}.test.mjs`));
  }
  exigir(arquivos.some((item) => item.arquivo === "tests/kubernetes/gate-backup.test.mjs"));
  for (const nome of ["confirmacao.sh", "concorrencia.sh", "locks-operador.sh", "atualizacao.sh"])
    arquivos.push({ arquivo: `tests/servidor/${nome}`, tipo: "bash" });
  return arquivos.sort((a, b) => a.arquivo.localeCompare(b.arquivo));
}

function nomesFontes(perfil) {
  exigir(perfis.includes(perfil));
  const focais = [
    "tests/servidor/sinteticos.mjs",
    "tests/servidor/sinteticos-interno.mjs",
    "tests/servidor/executar-sinteticos.test.mjs",
    "tests/servidor/imagens-ensaio.mjs",
    "tests/servidor/Dockerfile.sinteticos",
    "tests/servidor/executar.sh",
    "tests/servidor/origem-backup-cli.e2e.mjs",
    "tests/kubernetes/origem-backup.Dockerfile",
    "tests/kubernetes/origem-backup-isolado.mjs",
    "tests/servidor/restauracao-url-harness.mjs",
    ".github/workflows/servidor.yml",
    "package.json",
    "pnpm-lock.yaml",
    "pnpm-workspace.yaml",
  ];
  // O autoteste exercita os copiadores root e origem; suas dependências também são públicas.
  const dirs = [
    "scripts/servidor",
    "tests/servidor",
    "tests/kubernetes",
    "infra/kubernetes",
    "docker/app",
  ];
  const extras = dirs.flatMap((pasta) =>
    percorrer(path.join(raiz, pasta))
      .filter((n) => /\.(?:mjs|sh|yaml|yml|tpl|txt|md)$/.test(n))
      .map((n) => `${pasta}/${n}`),
  );
  extras.push(
    "src/infra/schema-postgres.mjs",
    "scripts/backup/backup-externo.mjs",
    "scripts/backup/pacote-backup.mjs",
    "tests/unidade/infra/operacao-catalogo-cli.test.ts",
    "Dockerfile",
    ".dockerignore",
    "compose.yml",
    "compose.servidor.yml",
    "infra/servidor/nginx/.dockerignore",
    "infra/servidor/servidor.env.example",
    "infra/servidor/backup/Dockerfile",
  );
  return [...new Set([...focais, ...extras])].sort();
}
function capturarFontes(perfil) {
  const pasta = fs.mkdtempSync(path.join(os.tmpdir(), "frequenciapp-fontes-"));
  fs.chmodSync(pasta, 0o755);
  // O inventário completo continua visível, sem copiar .git, .env, node_modules ou evidências.
  const nomes = [
    ...new Set([
      ...nomesFontes(perfil),
      ...["tests/servidor", "tests/kubernetes"].flatMap((d) =>
        percorrer(path.join(raiz, d))
          .filter((n) => /\.(?:mjs|sh)$/.test(n))
          .map((n) => `${d}/${n}`),
      ),
    ]),
  ];
  for (const nome of nomes) {
    const fonte = path.join(raiz, nome);
    exigir(fs.lstatSync(fonte).isFile());
    const alvo = path.join(pasta, nome);
    fs.mkdirSync(path.dirname(alvo), { recursive: true, mode: 0o755 });
    // A umask filtra mkdir; somente os diretórios da projeção pública recebem travessia.
    for (
      let diretorio = path.dirname(alvo);
      diretorio !== pasta;
      diretorio = path.dirname(diretorio)
    )
      fs.chmodSync(diretorio, 0o755);
    fs.copyFileSync(fonte, alvo);
    fs.chmodSync(alvo, fs.statSync(fonte).mode & 0o111 ? 0o555 : 0o444);
  }
  return pasta;
}
function hashFontes(perfil, fonte = raiz) {
  const nomes = nomesFontes(perfil);
  const hash = createHash("sha256");
  for (const nome of nomes) {
    const arquivo = path.join(fonte, nome);
    exigir(fs.lstatSync(arquivo).isFile());
    const bytes = fs.readFileSync(arquivo);
    hash.update(`${nome}\0${bytes.length}\0`).update(bytes);
  }
  return hash.digest("hex");
}

export function validarResultadoInterno(valor, perfil, esperados) {
  chaves(valor, ["schema", "perfil", "arquivos"]);
  exigir(valor.schema === 1 && valor.perfil === perfil && Array.isArray(valor.arquivos));
  iguais(
    valor.arquivos.map(({ arquivo, tipo }) => ({ arquivo, tipo })),
    esperados,
  );
  const totais = { arquivos: valor.arquivos.length, aprovados: 0, falhos: 0, ...contagensVazias() };
  for (const item of valor.arquivos) {
    chaves(item, ["arquivo", "tipo", "estado", "codigo", "contagens"]);
    exigir(["aprovado", "falhou"].includes(item.estado));
    exigir(Number.isInteger(item.codigo) && item.codigo >= 0 && item.codigo <= 255);
    chaves(item.contagens, chavesContagens);
    for (const nome of chavesContagens) {
      exigir(Number.isSafeInteger(item.contagens[nome]) && item.contagens[nome] >= 0);
      totais[nome] += item.contagens[nome];
    }
    const c = item.contagens;
    exigir(c.testes === c.passaram + c.falharam + c.cancelados + c.ignorados + c.pendentes);
    const aprovado = item.codigo === 0 && c.testes > 0 && c.passaram === c.testes;
    exigir((item.estado === "aprovado") === aprovado);
    totais[aprovado ? "aprovados" : "falhos"]++;
  }
  exigir(totais.arquivos > 0);
  return totais;
}

export function validarRelatorioPublico(p) {
  chaves(p, ["schema", "perfil", "resultado", "fase", "contagens", "encerramento", "limpeza"]);
  exigir(p.schema === 1 && perfis.includes(p.perfil));
  exigir(["aprovado", "falhou", "interrompido"].includes(p.resultado) && fases.includes(p.fase));
  exigir(["confirmado", "incerto", "nao-iniciado"].includes(p.encerramento));
  exigir(["removido", "preservado", "nao-criado"].includes(p.limpeza));
  chaves(p.contagens, ["arquivos", "aprovados", "falhos", ...chavesContagens]);
  for (const n of Object.values(p.contagens)) exigir(Number.isSafeInteger(n) && n >= 0);
  const c = p.contagens;
  exigir(c.arquivos === c.aprovados + c.falhos);
  exigir(c.testes === c.passaram + c.falharam + c.cancelados + c.ignorados + c.pendentes);
  if (p.resultado === "aprovado")
    exigir(
      p.fase === "concluido" &&
        p.encerramento === "confirmado" &&
        p.limpeza === "removido" &&
        c.arquivos > 0 &&
        c.aprovados === c.arquivos &&
        c.testes > 0 &&
        c.passaram === c.testes,
    );
  return p;
}

function lerAmbiente(env) {
  exigir(Array.isArray(env));
  const mapa = {};
  for (const item of env) {
    exigir(typeof item === "string" && item.includes("="));
    const [nome, ...resto] = item.split("=");
    exigir(!Object.hasOwn(mapa, nome));
    mapa[nome] = resto.join("=");
  }
  return mapa;
}

export async function executarLauncher(opcoes) {
  exigir(!process.env.DOCKER_HOST && !process.env.DOCKER_CONTEXT);
  exigir(!(opcoes.selftest && opcoes.perfil));
  const perfil = opcoes.selftest ? "autoteste" : opcoes.perfil || "sinteticos";
  exigir(perfis.includes(perfil));
  const root = perfil === "controlador-root";
  const tmpfsEsperado = {
    "/tmp": tmpfs,
    ...(root ? { "/sandbox": "rw,exec,nosuid,nodev,size=1g,mode=0700" } : {}),
  };
  const publico = {
    schema: 1,
    perfil,
    resultado: "falhou",
    fase: "preparacao",
    contagens: { arquivos: 0, aprovados: 0, falhos: 0, ...contagensVazias() },
    encerramento: "nao-iniciado",
    limpeza: "nao-criado",
  };
  const rodada = randomBytes(24).toString("hex");
  // Nunca inclui argv, ambiente, texto de logs ou detalhes de erro no relatório.
  const privado = {
    schema: 1,
    container: null,
    causa: null,
    resultado: "falhou",
    comandos: [],
    estados: [],
  };
  let cid,
    image,
    envEsperado,
    iniciou = false,
    codigo = 1,
    sinal = 0,
    ativo,
    fd,
    fdPrivado,
    antes,
    captura,
    causa;
  const cancelar = (nome) => {
    sinal ||= nome === "SIGINT" ? 130 : 143;
    ativo?.kill("SIGTERM");
  };
  const int = () => cancelar("SIGINT"),
    term = () => cancelar("SIGTERM");
  const vigente = () => exigir(sinal === 0);
  process.on("SIGINT", int);
  process.on("SIGTERM", term);
  const docker = (args, { input, limite = 120000, coleta = false } = {}) =>
    new Promise((resolve, reject) => {
      const filho = spawn("docker", args, { stdio: ["pipe", "pipe", "pipe"] });
      if (!coleta) ativo = filho;
      let stdout = "",
        stderr = "",
        excesso = false,
        expirou = false;
      const timer = setTimeout(() => {
        expirou = true;
        filho.kill("SIGKILL");
      }, limite);
      filho.stdout.on("data", (b) => {
        stdout += b.toString();
        if (stdout.length > 8 * 1024 * 1024) {
          excesso = true;
          filho.kill("SIGKILL");
        }
      });
      filho.stderr.on("data", (b) => {
        stderr += b.toString();
        if (stderr.length > 1024 * 1024) {
          excesso = true;
          filho.kill("SIGKILL");
        }
      });
      filho.once("error", (erro) => {
        clearTimeout(timer);
        reject(erro);
      });
      filho.once("close", (code, signal) => {
        clearTimeout(timer);
        if (ativo === filho) ativo = undefined;
        privado.comandos.push({
          operacao: args[0],
          code,
          signal:
            signal === null || ["SIGINT", "SIGTERM", "SIGKILL"].includes(signal) ? signal : "outro",
          excesso,
          expirou,
          stdoutSha256: createHash("sha256").update(stdout).digest("hex"),
          stderrSha256: createHash("sha256").update(stderr).digest("hex"),
        });
        resolve({ code, signal, stdout, stderr, excesso, expirou });
      });
      filho.stdin.on("error", () => {});
      filho.stdin.end(input);
    });
  const ok = (r) => {
    exigir(r.code === 0 && r.signal === null && !r.excesso && !r.expirou);
    return r.stdout.trim();
  };
  const inspecionar = async () => {
    const lista = JSON.parse(ok(await docker(["inspect", cid], { coleta: true })));
    exigir(lista.length === 1);
    return lista[0];
  };
  const proprio = (s) => {
    exigir(
      s.Id === cid &&
        s.Image === image &&
        s.Config?.Labels?.[label] === "1" &&
        s.Config.Labels[`${label}.rodada`] === rodada,
    );
    exigir(
      s.State &&
        typeof s.State.Running === "boolean" &&
        ["created", "running", "exited"].includes(s.State.Status),
    );
    privado.estados.push({
      status: s.State.Status,
      running: s.State.Running,
      exitCode: Number.isInteger(s.State.ExitCode) ? s.State.ExitCode : null,
    });
  };
  const topologia = (s) => {
    proprio(s);
    const h = s.HostConfig,
      c = s.Config;
    exigir(
      h.NetworkMode === "none" &&
        h.ReadonlyRootfs === true &&
        h.Privileged === false &&
        h.AutoRemove === false &&
        h.Init === true,
    );
    iguais(h.CapDrop, ["ALL"]);
    exigir(vazio(h.CapAdd));
    iguais(h.SecurityOpt, ["no-new-privileges:true"]);
    iguais(h.Tmpfs, tmpfsEsperado);
    exigir(vazio(h.Binds) && vazio(h.PortBindings) && h.PublishAllPorts === false);
    exigir(
      h.PidMode === "" && h.IpcMode === "private" && vazio(h.Devices) && vazio(h.DeviceRequests),
    );
    exigir(h.RestartPolicy.Name === "no");
    exigir(c.User === (root ? "0:0" : "1000:1000") && c.WorkingDir === "/repo");
    iguais(c.Entrypoint, ["node"]);
    iguais(c.Cmd, [interno, perfil, rodada]);
    iguais(lerAmbiente(c.Env), envEsperado);
    exigir(s.Mounts?.length === 1);
    const m = s.Mounts[0];
    exigir(
      m.Type === "bind" && m.Source === captura && m.Destination === "/repo" && m.RW === false,
    );
    exigir(vazio(s.NetworkSettings.Ports));
    iguais(Object.keys(s.NetworkSettings.Networks), ["none"]);
  };
  const salvar = () => {
    validarRelatorioPublico(publico);
    if (fd !== undefined) {
      const bytes = Buffer.from(JSON.stringify(publico) + "\n");
      fs.ftruncateSync(fd, 0);
      fs.writeSync(fd, bytes, 0, bytes.length, 0);
      fs.fsyncSync(fd);
      const conferido = Buffer.alloc(bytes.length);
      exigir(fs.readSync(fd, conferido, 0, bytes.length, 0) === bytes.length);
      exigir(bytes.equals(conferido));
    }
  };
  try {
    if (opcoes.report) {
      exigir(path.isAbsolute(opcoes.report));
      fd = fs.openSync(opcoes.report, "wx+", 0o600);
      fdPrivado = fs.openSync(opcoes.report + ".privado.json", "wx", 0o600);
    }
    salvar();
    vigente();
    const esperados = inventario(perfil);
    inventarioPerfis();
    antes = hashFontes(perfil);
    captura = capturarFontes(perfil);
    iguais(hashFontes(perfil, captura), antes);
    privado.fontesSha256 = antes;
    publico.fase = "imagem";
    let referencia = opcoes.image;
    if (!referencia) {
      const contexto = contextoFerramentas();
      try {
        const receita = fs.readFileSync(path.join(contexto, "Dockerfile.sinteticos"));
        referencia = `frequenciapp-sinteticos:${createHash("sha256")
          .update(receita)
          .update(fs.readFileSync(path.join(contexto, "pnpm-lock.yaml")))
          .digest("hex")
          .slice(0, 20)}`;
        vigente();
        ok(
          await docker(
            [
              "build",
              "--tag",
              referencia,
              "--file",
              path.join(contexto, "Dockerfile.sinteticos"),
              contexto,
            ],
            { limite: 600000 },
          ),
        );
      } finally {
        fs.rmSync(contexto, { recursive: true, force: true });
      }
    }
    vigente();
    const imagens = JSON.parse(ok(await docker(["image", "inspect", referencia])));
    exigir(imagens.length === 1);
    const info = imagens[0];
    image = info.Id;
    const herdado = validarImagem(info, "ferramentas");
    envEsperado = { ...herdado, ...ambiente };
    publico.fase = "criacao";
    vigente();
    const criado = ok(
      await docker([
        "create",
        "--label",
        `${label}=1`,
        "--label",
        `${label}.rodada=${rodada}`,
        "--network",
        "none",
        "--read-only",
        "--user",
        root ? "0:0" : "1000:1000",
        "--cap-drop",
        "ALL",
        "--security-opt",
        "no-new-privileges:true",
        ...Object.entries(tmpfsEsperado).flatMap(([destino, valor]) => [
          "--tmpfs",
          `${destino}:${valor}`,
        ]),
        "--mount",
        `type=bind,src=${captura},dst=/repo,readonly`,
        "--workdir",
        "/repo",
        "--init",
        "--ipc",
        "private",
        "--pids-limit",
        "256",
        "--memory",
        "2g",
        "--cpus",
        "2",
        ...Object.entries(ambiente).flatMap(([k, v]) => ["--env", `${k}=${v}`]),
        "--entrypoint",
        "node",
        image,
        interno,
        perfil,
        rodada,
      ]),
    );
    exigir(/^[a-f0-9]{64}$/.test(criado));
    cid = criado;
    publico.limpeza = "preservado";
    privado.container = cid;
    publico.fase = "preflight";
    const inicio = await inspecionar();
    topologia(inicio);
    exigir(inicio.State.Status === "created" && inicio.State.Running === false);
    vigente();
    publico.fase = "execucao";
    iniciou = true;
    publico.encerramento = "incerto";
    const resultado = await docker(["start", "--attach", cid], { limite: 1800000 });
    vigente();
    publico.fase = "encerramento";
    const wait = ok(await docker(["wait", cid]));
    exigir(/^(0|[1-9]\d{0,2})$/.test(wait));
    const fim = await inspecionar();
    topologia(fim);
    exigir(
      fim.State.Running === false &&
        fim.State.Status === "exited" &&
        Number.isInteger(fim.State.ExitCode) &&
        fim.State.ExitCode === Number(wait),
    );
    publico.encerramento = "confirmado";
    if (opcoes.report)
      fs.writeFileSync(
        opcoes.report + ".execucao.log",
        resultado.stdout + "\n" + resultado.stderr,
        { flag: "wx", mode: 0o600 },
      );
    publico.fase = "resultado";
    causa = "resultado-invalido";
    const prefixo = `FREQUENCIAPP_SINTETICOS_RESULTADO=${rodada}:`;
    const linhas = resultado.stdout.split(/\r?\n/).filter((linha) => linha.startsWith(prefixo));
    exigir(linhas.length === 1);
    const texto = linhas[0].slice(prefixo.length);
    exigir(/^[A-Za-z0-9+/]+={0,2}$/.test(texto));
    publico.contagens = validarResultadoInterno(
      JSON.parse(Buffer.from(texto, "base64").toString("utf8")),
      perfil,
      esperados,
    );
    causa =
      resultado.code === fim.State.ExitCode && fim.State.ExitCode !== 0
        ? "suite-falhou"
        : "attach-invalido";
    ok(resultado);
    causa = "suite-falhou";
    exigir(fim.State.ExitCode === 0 && publico.contagens.falhos === 0);
    causa = undefined;
    publico.fase = "fontes";
    iguais(hashFontes(perfil), antes);
    vigente();
    codigo = 0;
  } catch {
    privado.causa = sinal ? "sinal" : causa || publico.fase;
    codigo = sinal || 1;
  } finally {
    if (cid) {
      try {
        const s = await inspecionar();
        proprio(s);
        if (s.State.Running) {
          ok(await docker(["stop", "--time", "5", cid], { coleta: true }));
        }
        if (iniciou && publico.encerramento !== "confirmado") {
          const wait = ok(await docker(["wait", cid], { coleta: true }));
          exigir(/^(0|[1-9]\d{0,2})$/.test(wait));
          const parado = await inspecionar();
          proprio(parado);
          exigir(
            !parado.State.Running &&
              parado.State.Status === "exited" &&
              Number.isInteger(parado.State.ExitCode) &&
              parado.State.ExitCode === Number(wait),
          );
          publico.encerramento = "confirmado";
        }
        const parado = await inspecionar();
        proprio(parado);
        exigir(parado.State.Running === false);
        const removido = ok(await docker(["rm", cid], { coleta: true }));
        exigir(removido === cid);
        publico.limpeza = "removido";
      } catch {
        codigo ||= 1;
        privado.causa ||= "limpeza";
        publico.limpeza = "preservado";
      }
    }
    if (antes && hashFontes(perfil) !== antes) {
      codigo ||= 1;
      privado.causa ||= "fontes";
      publico.fase = "fontes";
    }
    if (captura && (!cid || publico.limpeza === "removido"))
      fs.rmSync(captura, { recursive: true, force: true });
    codigo = sinal || codigo;
    publico.resultado = sinal ? "interrompido" : codigo === 0 ? "aprovado" : "falhou";
    if (codigo === 0) publico.fase = "concluido";
    privado.resultado = publico.resultado;
    privado.causa = sinal ? "sinal" : privado.causa;
    try {
      if (fdPrivado !== undefined) {
        fs.writeSync(fdPrivado, JSON.stringify(privado) + "\n");
        fs.fsyncSync(fdPrivado);
      }
    } catch {
      codigo ||= 1;
      publico.resultado = sinal ? "interrompido" : "falhou";
    } finally {
      if (fdPrivado !== undefined) fs.closeSync(fdPrivado);
    }
    try {
      salvar();
    } catch {
      codigo ||= 1;
      publico.resultado = sinal ? "interrompido" : "falhou";
    }
    if (fd !== undefined) fs.closeSync(fd);
    process.off("SIGINT", int);
    process.off("SIGTERM", term);
  }
  process.stdout.write(JSON.stringify(publico) + "\n");
  return codigo;
}

async function main(args) {
  if (args[0] === "--export-report" && args.length === 3) {
    let p,
      valido = true;
    try {
      exigir(fs.statSync(args[1]).size <= 8192);
      p = validarRelatorioPublico(JSON.parse(fs.readFileSync(args[1], "utf8")));
    } catch {
      valido = false;
      p = {
        schema: 1,
        perfil: "sinteticos",
        resultado: "falhou",
        fase: "resultado",
        contagens: { arquivos: 0, aprovados: 0, falhos: 0, ...contagensVazias() },
        encerramento: "incerto",
        limpeza: "preservado",
      };
    }
    // A lista fechada do validador impede publicar campos, logs ou identificadores extras.
    validarRelatorioPublico(p);
    exigir(path.isAbsolute(args[2]));
    fs.writeFileSync(args[2], JSON.stringify(p) + "\n", { flag: "wx", mode: 0o600 });
    return valido ? 0 : 1;
  }
  if (args[0] === "--check-report" && args.length === 2) {
    const p = validarRelatorioPublico(JSON.parse(fs.readFileSync(args[1], "utf8")));
    return p.resultado === "aprovado" ? 0 : 1;
  }
  if (args[0] === "--inventario" && args.length === 1) {
    process.stdout.write(JSON.stringify(inventarioPerfis(), null, 2) + "\n");
    return 0;
  }
  const opcoes = {};
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === "--selftest") {
      exigir(!opcoes.selftest);
      opcoes.selftest = true;
    } else if (a === "--image" || a === "--report" || a === "--perfil") {
      const k = a.slice(2);
      exigir(!opcoes[k] && args[i + 1] && !args[i + 1].startsWith("--"));
      opcoes[k] = args[++i];
    } else
      throw new Error(
        "Uso: sinteticos.mjs [--selftest] [--image imagem] [--report caminho-absoluto-novo]",
      );
  }
  return executarLauncher(opcoes);
}

if (process.argv[1] && fs.realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    process.exitCode = await main(process.argv.slice(2));
  } catch {
    process.stderr.write("Execução ou relatório dos sintéticos inválido.\n");
    process.exitCode = 1;
  }
}
