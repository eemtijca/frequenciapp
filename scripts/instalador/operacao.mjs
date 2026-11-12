// Comandos de operação do instalador: atualizar, backup, restaurar e desinstalar.
import fs from "node:fs";
import path from "node:path";
import { ErroInstalador, aviso, erroObjeto, erroUso, erroValidacao } from "./json.mjs";
import { DOCUMENTACAO, agoraPadrao, deduplicarAvisos, montarDocumento } from "./plano.mjs";
import { acao, caminhosOperacao, executarEtapa, falha, sobRaiz } from "./passos/contexto.mjs";

export const COMANDOS_OPERACAO = new Set(["atualizar", "backup", "restaurar", "desinstalar"]);

const PADRAO_RECIBO = /^frequenciapp-\d{8}T\d{6}Z-[a-f0-9]{8}\.confirmado\.json$/;
const LIMITE_JSON = 1024 * 1024;
const CAMINHOS_PROTEGIDOS = new Set([
  "/",
  "/bin",
  "/boot",
  "/dev",
  "/etc",
  "/etc/cron.d",
  "/etc/logrotate.d",
  "/etc/systemd",
  "/etc/systemd/system",
  "/home",
  "/lib",
  "/lib64",
  "/media",
  "/mnt",
  "/opt",
  "/proc",
  "/root",
  "/run",
  "/sbin",
  "/srv",
  "/sys",
  "/tmp",
  "/usr",
  "/var",
  "/var/backups",
  "/var/lib",
  "/var/lock",
  "/var/log",
  "/var/run",
]);

function limiteMilissegundos(valor, padrao) {
  const combinacao = /^(\d+)([smh]?)$/.exec(String(valor ?? ""));
  if (!combinacao) return padrao;
  const numero = Number(combinacao[1]);
  const multiplicador = { s: 1000, m: 60000, h: 3600000 }[combinacao[2]] ?? 1000;
  return Math.max(1000, numero * multiplicador);
}

function mapaAmbiente(valor) {
  if (!valor) return {};
  if (valor instanceof Map) return Object.fromEntries(valor);
  if (typeof valor === "object" && !Array.isArray(valor)) return { ...valor };
  return {};
}

function prepararContexto(deps, configuracao, estadoResultado, deteccao, opcoes, raizInformada) {
  const modoTeste = Boolean(opcoes.booleanas.has("--modo-teste"));
  const raiz = modoTeste
    ? path.resolve(raizInformada || deps.raiz || process.env.INSTALADOR_RAIZ || "/")
    : "/";
  const estado = estadoResultado?.estado ?? null;
  const diretorioFonte =
    estado?.origem?.diretorioFonte || configuracao.diretorioFonte || "/opt/frequenciapp";
  const caminhos = caminhosOperacao(raiz, { ...configuracao, diretorioFonte }, modoTeste);
  const ambiente = mapaAmbiente(deps.ambiente);
  const ambienteBase = {
    ...process.env,
    PATH: `${path.dirname(process.execPath)}${path.delimiter}${process.env.PATH ?? ""}`,
    HOME: process.env.HOME ?? "/tmp",
    TMPDIR: process.env.TMPDIR ?? "/tmp",
    ...(deps.ambienteBase ?? {}),
    ...ambiente,
    APP_DIR: caminhos.appDir,
    APP_ENV_FILE: caminhos.appEnv,
    OPS_ENV_FILE: caminhos.opsEnv,
    SERVIDOR_CONFIG_DIR: caminhos.configDir,
    ESTADO_DIR: caminhos.estadoDir,
    LOG_DIR: caminhos.logDir,
    BACKUP_DIR: caminhos.backupDir,
    BACKUP_BANCO_DIR: caminhos.backupBancoDir,
    SERVIDOR_LOCK_DIR: caminhos.lockDir,
    SERVIDOR_USUARIO: deps.usuarioServico ?? "frequenciapp",
    COMPOSE_PROJECT_NAME: caminhos.projetoCompose,
    SERVIDOR_IDENTIDADE_ARQUIVO: caminhos.identidade,
  };
  return {
    deps,
    raiz,
    configuracao,
    deteccao,
    estadoResultado,
    estado,
    caminhos,
    opcoes,
    modoTeste,
    sim: Boolean(opcoes.booleanos.get("--sim")),
    simular: Boolean(opcoes.booleanos.get("--simular")),
    forcar: Boolean(opcoes.booleanos.get("--forcar")),
    uid: typeof deps.uid === "function" ? deps.uid() : Number(deps.uid ?? 0),
    executar:
      typeof deps.executar === "function"
        ? deps.executar
        : () => ({ status: 127, stdout: "", stderr: "", erro: "ENOENT" }),
    agora: typeof deps.agora === "function" ? deps.agora : agoraPadrao,
    ambienteBase,
    ambiente,
  };
}

function etapaOperacao(id, estado, inicio, fim, codigo, acoes, avisos, detalhes) {
  return {
    id,
    estado,
    inicio,
    fim,
    codigo,
    acoes,
    avisos,
    detalhes: detalhes ?? {},
  };
}

function avisosDoEstado(ctx) {
  const avisos = [...(ctx.estadoResultado?.avisos ?? [])];
  if (ctx.estadoResultado?.erro) {
    avisos.push(
      aviso(
        "A_ESTADO_INVALIDO",
        "O estado da instalação não pôde ser lido; o comando usou a configuração disponível.",
        `${DOCUMENTACAO}#estado-durável`,
      ),
    );
  }
  return avisos;
}

function documentoOperacao(ctx, comando, dryRun, etapas, avisos, proximos, erros = []) {
  return montarDocumento({
    comando,
    configuracao: ctx.configuracao,
    estado: ctx.estado,
    deteccao: ctx.deteccao,
    dryRun,
    etapas,
    avisos: deduplicarAvisos(avisos),
    erros,
    proximos,
  });
}

function documentoFalha(ctx, comando, erro, opcoes, avisosBase) {
  const agora = ctx.agora();
  return documentoOperacao(
    ctx,
    comando,
    Boolean(opcoes.booleanos.get("--simular")),
    [
      etapaOperacao(comando, "falhou", agora, agora, erro.codigo, [], [], {
        falha: erro.codigo,
      }),
    ],
    avisosBase,
    ["sudo ./instalar.sh diagnosticar --json --nao-interativo"],
    [erroObjeto(erro)],
  );
}

function exigirConfirmacao(ctx, comando) {
  if (ctx.modoTeste || ctx.simular || ctx.sim) return;
  throw erroUso(`O comando ${comando} exige confirmação explícita com --sim.`, {
    dica: "Revise a operação e repita com --sim.",
    documentacao: `${DOCUMENTACAO}#${comando}`,
  });
}

function exigirRoot(ctx, comando) {
  if (ctx.modoTeste || ctx.simular) return;
  if (ctx.uid === 0) return;
  throw erroValidacao(`O comando ${comando} exige root ou a conta de implantação com sudo.`, {
    dica: "Execute o comando com sudo.",
    documentacao: `${DOCUMENTACAO}#${comando}`,
    saida: 5,
  });
}

function validarOperandos(opcoes, comando) {
  if (opcoes.operandos.length > 1) {
    throw erroUso(`O comando ${comando} não aceita argumentos posicionais.`, {
      dica: "Use apenas as opções documentadas.",
      documentacao: `${DOCUMENTACAO}#${comando}`,
    });
  }
}

function lerPonteiroBackup(caminho) {
  let informacao;
  try {
    informacao = fs.lstatSync(caminho);
  } catch (erro) {
    if (erro.code === "ENOENT") return null;
    return null;
  }
  if (informacao.isSymbolicLink() || !informacao.isFile() || informacao.size > LIMITE_JSON) {
    return null;
  }
  try {
    const dados = JSON.parse(fs.readFileSync(caminho, "utf8"));
    if (!dados || typeof dados !== "object" || Array.isArray(dados)) return null;
    return dados;
  } catch {
    return null;
  }
}

function conferirReciboBackup(ctx) {
  const caminho = path.join(ctx.caminhos.estadoDir, "ultimo-backup.json");
  const dados = lerPonteiroBackup(caminho);
  if (!dados) {
    throw falha("E_BACKUP", "O backup terminou sem um ponteiro de último backup válido.", {
      dica: "Confira o log do backup e o diretório de estado.",
      documentacao: `${DOCUMENTACAO}#backup`,
    });
  }
  const recibo = String(dados.recibo ?? "");
  if (!PADRAO_RECIBO.test(recibo)) {
    throw falha("E_BACKUP", "O recibo do backup não segue o formato confirmado.", {
      documentacao: `${DOCUMENTACAO}#backup`,
    });
  }
  const arquivo = String(dados.arquivo ?? "");
  if (!arquivo || path.basename(arquivo) !== arquivo) {
    throw falha("E_BACKUP", "O ponteiro do backup não informa um arquivo local válido.", {
      documentacao: `${DOCUMENTACAO}#backup`,
    });
  }
  const sha256 = String(dados.sha256 ?? "");
  if (!/^[a-f0-9]{64}$/.test(sha256)) {
    throw falha("E_BACKUP", "O ponteiro do backup não informa um checksum válido.", {
      documentacao: `${DOCUMENTACAO}#backup`,
    });
  }
  return {
    recibo,
    arquivo,
    sha256,
    em: typeof dados.em === "string" ? dados.em : null,
    modo: typeof dados.modo === "string" ? dados.modo : null,
    criptografia: typeof dados.criptografia === "string" ? dados.criptografia : null,
    verificadoRemoto: dados.verificadoRemoto === true,
    remoto: Boolean(dados.verificadoRemoto === true),
  };
}

function executarBackup(ctx, avisosBase) {
  exigirConfirmacao(ctx, "backup");
  exigirRoot(ctx, "backup");
  const inicio = ctx.agora();
  if (ctx.simular) {
    const fim = ctx.agora();
    return documentoOperacao(
      ctx,
      "backup",
      true,
      [
        etapaOperacao(
          "backup",
          "concluida",
          inicio,
          fim,
          null,
          [acao("Executa e confere um backup do banco", "scripts/servidor/backup-banco.sh", true)],
          [],
          { simulado: true },
        ),
      ],
      avisosBase,
      ["sudo ./instalar.sh backup --sim", "sudo ./instalar.sh situacao --json"],
    );
  }
  const script = path.join(ctx.caminhos.appDir, "scripts", "servidor", "backup-banco.sh");
  const resultado = executarComando(ctx, "bash", [script], {
    timeout: limiteMilissegundos(ctx.configuracao.tempoLimite, 3600000),
  });
  if (resultado.status !== 0) {
    throw falha("E_BACKUP", "O backup do banco não foi concluído.", {
      dica: "Confira a cifra, a chave pública, o espaço em disco e o destino remoto.",
      documentacao: `${DOCUMENTACAO}#backup`,
    });
  }
  const conferido = conferirReciboBackup(ctx);
  const fim = ctx.agora();
  return documentoOperacao(
    ctx,
    "backup",
    false,
    [
      etapaOperacao(
        "backup",
        "concluida",
        inicio,
        fim,
        null,
        [
          acao("Executa e confere um backup do banco", "scripts/servidor/backup-banco.sh", true),
          acao("Lê o ponteiro e valida o recibo confirmado", null, false),
        ],
        [],
        {
          recibo: conferido.recibo,
          arquivo: conferido.arquivo,
          sha256: conferido.sha256,
          em: conferido.em,
          modo: conferido.modo,
          criptografia: conferido.criptografia,
          verificadoRemoto: conferido.verificadoRemoto,
          remoto: conferido.remoto,
        },
      ),
    ],
    avisosBase,
    [
      "sudo ./instalar.sh situacao --json",
      "sudo ./instalar.sh diagnosticar --json --nao-interativo",
    ],
  );
}

function falhaAtualizacao(resultado) {
  const texto = `${resultado.stdout ?? ""}\n${resultado.stderr ?? ""}`.toLowerCase();
  if (/(sa[uú]de|health|timeout|responde)/.test(texto)) {
    return falha("E_SAUDE", "A atualização terminou sem comprovar a saúde da aplicação.", {
      dica: "Confira o log do atualizar.sh, a saúde e o estado antes de repetir.",
      documentacao: `${DOCUMENTACAO}#atualizar`,
    });
  }
  if (/(canal|tag|release|downgrade|migra|reposit|refer|commit|checkout|git)/.test(texto)) {
    return falha("E_CANAL", "A atualização recusou o canal, a referência ou a migração.", {
      dica: "Confira o canal, a tag, a referência e o histórico de migrações.",
      documentacao: `${DOCUMENTACAO}#atualizar`,
    });
  }
  return falha("E_SAUDE", "A atualização não foi concluída.", {
    dica: "Confira o log do atualizar.sh e o estado da instalação.",
    documentacao: `${DOCUMENTACAO}#atualizar`,
  });
}

function executarAtualizacao(ctx, avisosBase) {
  exigirConfirmacao(ctx, "atualizar");
  exigirRoot(ctx, "atualizar");
  const canal = ctx.configuracao.canal === "main" ? "main" : "release";
  const tag = String(ctx.configuracao.tag ?? "");
  const ref = String(ctx.configuracao.ref ?? "");
  if (canal === "release" && !tag) {
    throw erroUso("O canal release exige uma tag estável em --tag.", {
      dica: "Informe --tag vX.Y.Z.",
      documentacao: `${DOCUMENTACAO}#atualizar`,
    });
  }
  if (canal === "main" && !ctx.opcoes.booleanas.has("--permitir-instavel")) {
    throw falha("E_CANAL", "O canal main exige confirmação explícita.", {
      dica: "Repita o comando com --permitir-instavel.",
      documentacao: `${DOCUMENTACAO}#canal-release-e-main`,
    });
  }
  const refAlvo = canal === "release" ? tag : ref || "main";
  const permitirMigracoes = Boolean(ctx.opcoes.booleanos.get("--permitir-migracoes"));
  const avisos = [...avisosBase];
  if (canal === "main") {
    avisos.push(
      aviso(
        "A_CANAL_MAIN",
        "O canal main é instável e exige acompanhamento.",
        `${DOCUMENTACAO}#canal-release-e-main`,
      ),
    );
  }
  const script = path.join(ctx.caminhos.appDir, "scripts", "servidor", "atualizar.sh");
  const argumentos = [script, "--modo", canal];
  if (canal === "release") argumentos.push("--tag", tag);
  if (canal === "main" && ref) argumentos.push("--ref", ref);
  if (ctx.simular) argumentos.push("--simular");
  if (permitirMigracoes) argumentos.push("--permitir-migracoes");
  if (ctx.forcar) argumentos.push("--forcar");
  const inicio = ctx.agora();
  const resultado = executarComando(ctx, "bash", argumentos, {
    timeout: limiteMilissegundos(ctx.configuracao.tempoLimite, 7200000),
    env: {
      ATUALIZAR_MODO: canal,
      ATUALIZAR_REF: refAlvo,
      ATUALIZAR_PERMITIR_MIGRACOES: permitirMigracoes ? "true" : "false",
      ATUALIZAR_BACKUP_ANTES: "true",
    },
  });
  if (resultado.status !== 0) throw falhaAtualizacao(resultado);
  const fim = ctx.agora();
  const detalhes = {
    modo: canal,
    ref: refAlvo,
    permitirMigracoes,
    simulado: ctx.simular,
  };
  const proximos = ctx.simular
    ? [
        `sudo ./instalar.sh atualizar --canal ${canal}${
          canal === "release" ? ` --tag ${tag || refAlvo}` : ` --ref ${refAlvo}`
        } --sim`,
      ]
    : ["sudo ./instalar.sh situacao --json", "sudo ./instalar.sh backup"];
  return documentoOperacao(
    ctx,
    "atualizar",
    ctx.simular,
    [
      etapaOperacao(
        "atualizar",
        "concluida",
        inicio,
        fim,
        null,
        [
          acao(
            "Delega a atualização ao atualizar.sh no modo do canal",
            "scripts/servidor/atualizar.sh",
            !ctx.simular,
          ),
          acao("Confere o backup anterior e a saúde da aplicação", null, false),
        ],
        [],
        detalhes,
      ),
    ],
    avisos,
    proximos,
  );
}

function executarRestauracao(ctx, avisosBase) {
  exigirConfirmacao(ctx, "restaurar");
  exigirRoot(ctx, "restaurar");
  const arquivo = String(ctx.opcoes.valores.get("--arquivo") ?? "");
  const remoto = Boolean(ctx.opcoes.booleanos.get("--do-remoto"));
  if (Boolean(arquivo) === remoto) {
    throw erroUso("O comando restaurar exige --arquivo ou --do-remoto, mas não os dois.", {
      dica: "Escolha uma origem para a restauração.",
      documentacao: `${DOCUMENTACAO}#restaurar`,
    });
  }
  const inicio = ctx.agora();
  if (ctx.simular) {
    const fim = ctx.agora();
    return documentoOperacao(
      ctx,
      "restaurar",
      true,
      [
        etapaOperacao(
          "restaurar",
          "concluida",
          inicio,
          fim,
          null,
          [
            acao(
              remoto ? "Baixa e confere o backup remoto" : "Confere o arquivo de backup local",
              null,
              true,
            ),
            acao("Valida o checksum e restaura o banco", "scripts/servidor/restaurar.sh", true),
          ],
          [],
          {
            origem: remoto ? "remoto" : "arquivo",
            arquivo: remoto ? null : path.basename(arquivo),
            simulado: true,
          },
        ),
      ],
      avisosBase,
      ["sudo ./instalar.sh restaurar --do-remoto --sim", "sudo ./instalar.sh situacao --json"],
    );
  }
  const script = remoto
    ? path.join(ctx.caminhos.appDir, "scripts", "servidor", "baixar-backup.sh")
    : path.join(ctx.caminhos.appDir, "scripts", "servidor", "restaurar.sh");
  const argumentos = remoto
    ? [script, "--restaurar", "--", "--confirmar"]
    : [script, "--arquivo", arquivo, "--confirmar"];
  const resultado = executarComando(ctx, "bash", argumentos, {
    timeout: limiteMilissegundos(ctx.configuracao.tempoLimite, 7200000),
  });
  if (resultado.status !== 0) {
    throw falha("E_RESTAURACAO", "A restauração não foi concluída.", {
      dica: "Confira a chave privada, o checksum, o dump e o banco anterior.",
      documentacao: `${DOCUMENTACAO}#restaurar`,
    });
  }
  const fim = ctx.agora();
  return documentoOperacao(
    ctx,
    "restaurar",
    false,
    [
      etapaOperacao(
        "restaurar",
        "concluida",
        inicio,
        fim,
        null,
        [
          acao(
            remoto ? "Baixa e confere o backup remoto" : "Confere o arquivo de backup local",
            null,
            false,
          ),
          acao("Valida o checksum e restaura o banco", "scripts/servidor/restaurar.sh", true),
        ],
        [],
        {
          origem: remoto ? "remoto" : "arquivo",
          arquivo: remoto ? null : path.basename(arquivo),
        },
      ),
    ],
    avisosBase,
    [
      "sudo ./instalar.sh situacao --json",
      "sudo ./instalar.sh diagnosticar --json --nao-interativo",
    ],
  );
}

function executarSeguro(ctx, comando, argumentos, opcoes = {}) {
  if (typeof ctx.executar !== "function") {
    return { status: 127, stdout: "", stderr: "", erro: "ENOENT" };
  }
  try {
    const resultado = ctx.executar(comando, argumentos, opcoes);
    if (resultado && typeof resultado === "object") return resultado;
    return { status: 1, stdout: "", stderr: "", erro: null };
  } catch {
    return { status: 1, stdout: "", stderr: "", erro: "falha" };
  }
}

function executarComando(ctx, comando, argumentos, opcoes = {}) {
  if (typeof ctx.executar !== "function") {
    return { status: 127, stdout: "", stderr: "", erro: "ENOENT" };
  }
  return executarEtapa(ctx, comando, argumentos, opcoes);
}

function listarUnidadesSystemd(ctx) {
  const diretorio = sobRaiz(ctx.raiz, "/etc/systemd/system");
  let entradas;
  try {
    entradas = fs.readdirSync(diretorio, { withFileTypes: true });
  } catch (erro) {
    if (erro.code === "ENOENT") return [];
    throw falha("E_VALIDACAO", "Não foi possível listar as units do systemd.", {
      dica: "Confira a permissão de /etc/systemd/system.",
      documentacao: `${DOCUMENTACAO}#desinstalar`,
    });
  }
  return entradas
    .filter((entrada) => entrada.name.startsWith("frequenciapp-"))
    .map((entrada) => entrada.name)
    .sort();
}

function removerArquivo(ctx, caminho, rotulo, acoes) {
  let informacao;
  try {
    informacao = fs.lstatSync(caminho);
  } catch (erro) {
    if (erro.code === "ENOENT") return false;
    throw falha("E_VALIDACAO", `Não foi possível consultar ${rotulo}.`, {
      dica: "Confira a permissão do caminho.",
      documentacao: `${DOCUMENTACAO}#desinstalar`,
    });
  }
  if (informacao.isDirectory()) {
    throw falha("E_VALIDACAO", `O caminho de ${rotulo} não é um arquivo.`, {
      dica: "Revise o caminho antes de repetir a desinstalação.",
      documentacao: `${DOCUMENTACAO}#desinstalar`,
    });
  }
  if (ctx.simular) {
    acoes.push(acao(`Removeria ${rotulo} em ${caminho}`, null, true));
    return true;
  }
  try {
    fs.rmSync(caminho, { force: true });
  } catch {
    throw falha("E_VALIDACAO", `Não foi possível remover ${rotulo}.`, {
      dica: "Confira a permissão do caminho.",
      documentacao: `${DOCUMENTACAO}#desinstalar`,
    });
  }
  acoes.push(acao(`Remove ${rotulo} em ${caminho}`, null, true));
  return true;
}

function validarRemocao(raiz, caminho, rotulo) {
  const raizResolvida = path.resolve(raiz || "/");
  const alvo = path.resolve(caminho);
  const relativo = path.relative(raizResolvida, alvo);
  const segmentos = relativo ? relativo.split(path.sep).filter(Boolean) : [];
  const foraDaRaiz =
    !relativo ||
    relativo === ".." ||
    relativo.startsWith(`..${path.sep}`) ||
    path.isAbsolute(relativo);
  if (foraDaRaiz || segmentos.length < 2 || CAMINHOS_PROTEGIDOS.has(alvo)) {
    throw erroValidacao(`O caminho de ${rotulo} não pode ser removido.`, {
      dica: "Confira --diretorio-fonte e a raiz efetiva antes de repetir.",
      documentacao: `${DOCUMENTACAO}#desinstalar`,
    });
  }
  return alvo;
}

function alvosDeDados(ctx) {
  return [
    { rotulo: "configuração", caminho: ctx.caminhos.configDir },
    { rotulo: "estado", caminho: ctx.caminhos.estadoDir },
    { rotulo: "backup", caminho: ctx.caminhos.backupDir },
    { rotulo: "checkout", caminho: ctx.caminhos.appDir },
    { rotulo: "controlador", caminho: ctx.caminhos.controladorPrefixo },
  ];
}

function removerCaminhoDados(ctx, caminho, rotulo, acoes) {
  const alvo = validarRemocao(ctx.raiz, caminho, rotulo);
  let informacao;
  try {
    informacao = fs.lstatSync(alvo);
  } catch (erro) {
    if (erro.code === "ENOENT") return;
    throw falha("E_VALIDACAO", `Não foi possível consultar ${rotulo}.`, {
      dica: "Confira a permissão do caminho.",
      documentacao: `${DOCUMENTACAO}#desinstalar`,
    });
  }
  if (ctx.simular) {
    acoes.push(acao(`Removeria ${rotulo} em ${alvo}`, null, true));
    return;
  }
  try {
    fs.rmSync(alvo, { recursive: informacao.isDirectory(), force: true });
  } catch {
    throw falha("E_VALIDACAO", `Não foi possível remover ${rotulo}.`, {
      dica: "Confira a permissão do caminho.",
      documentacao: `${DOCUMENTACAO}#desinstalar`,
    });
  }
  acoes.push(acao(`Remove ${rotulo} em ${alvo}`, null, true));
}

function removerContainers(ctx, removerDados, acoes, avisos) {
  if (ctx.simular) {
    acoes.push(
      acao(
        removerDados
          ? "Removeria containers, redes e volumes do projeto Compose"
          : "Removeria containers e redes do projeto Compose",
        null,
        true,
      ),
    );
    return;
  }
  const argumentos = ["compose", "-p", ctx.caminhos.projetoCompose, "down", "--remove-orphans"];
  if (removerDados) argumentos.push("-v");
  const opcoes = {
    timeout: limiteMilissegundos(ctx.configuracao.tempoLimite, 600000),
    env: ctx.ambienteBase,
  };
  if (fs.existsSync(ctx.caminhos.appDir)) opcoes.cwd = ctx.caminhos.appDir;
  const resultado = executarSeguro(ctx, "docker", argumentos, opcoes);
  if (resultado.status === 0) {
    acoes.push(
      acao(
        removerDados
          ? "Remove containers, redes e volumes do projeto Compose"
          : "Remove containers e redes do projeto Compose",
        null,
        true,
      ),
    );
    return;
  }
  avisos.push(
    aviso(
      "A_DOCKER_REMOCAO",
      "O Docker não confirmou a remoção dos containers; confira o projeto Compose.",
      `${DOCUMENTACAO}#desinstalar`,
    ),
  );
}

function executarDesinstalacao(ctx, avisosBase) {
  const removerDados = Boolean(ctx.opcoes.booleanos.get("--remover-dados"));
  if (removerDados && !ctx.sim) {
    throw erroUso("A remoção de dados exige confirmação explícita com --sim.", {
      dica: "Revise a instalação e repita com --remover-dados --sim.",
      documentacao: `${DOCUMENTACAO}#desinstalar`,
    });
  }
  if (ctx.modoTeste && path.resolve(ctx.raiz) === path.parse(path.resolve(ctx.raiz)).root) {
    throw erroValidacao("O modo de teste exige uma raiz sintética para desinstalar.", {
      dica: "Defina INSTALADOR_RAIZ ou a raiz de teste antes de repetir.",
      documentacao: `${DOCUMENTACAO}#desinstalar`,
    });
  }
  if (!ctx.modoTeste && !ctx.simular && ctx.uid !== 0) {
    throw erroValidacao("O comando desinstalar exige root ou a conta de implantação com sudo.", {
      dica: "Execute o comando com sudo.",
      documentacao: `${DOCUMENTACAO}#desinstalar`,
      saida: 5,
    });
  }
  const alvos = alvosDeDados(ctx);
  if (removerDados) {
    for (const alvo of alvos) validarRemocao(ctx.raiz, alvo.caminho, alvo.rotulo);
  }
  const inicio = ctx.agora();
  const acoes = [];
  const avisos = [...avisosBase];
  const unidades = listarUnidadesSystemd(ctx);
  const unidadesValidas = unidades.filter((unidade) => /\.(service|timer)$/.test(unidade));
  if (!ctx.simular && unidadesValidas.length) {
    for (const unidade of unidadesValidas) {
      executarSeguro(ctx, "systemctl", ["stop", unidade], {
        timeout: 60000,
        env: ctx.ambienteBase,
      });
      executarSeguro(ctx, "systemctl", ["disable", unidade], {
        timeout: 60000,
        env: ctx.ambienteBase,
      });
    }
    acoes.push(acao("Para e desativa as units do FrequenciApp", "systemctl stop/disable", true));
  }
  for (const unidade of unidades) {
    removerArquivo(
      ctx,
      path.join(sobRaiz(ctx.raiz, "/etc/systemd/system"), unidade),
      `a unidade ${unidade}`,
      acoes,
    );
  }
  if (!ctx.simular) {
    const recarga = executarSeguro(ctx, "systemctl", ["daemon-reload"], {
      timeout: 60000,
      env: ctx.ambienteBase,
    });
    acoes.push(acao("Recarrega a configuração do systemd", "systemctl daemon-reload", true));
    if (unidadesValidas.length && recarga.status !== 0) {
      avisos.push(
        aviso(
          "A_SYSTEMD_RECARGA",
          "O systemd não confirmou a recarga após a remoção das units.",
          `${DOCUMENTACAO}#desinstalar`,
        ),
      );
    }
  }
  removerArquivo(ctx, ctx.caminhos.cronFrequenciapp, "o cron do FrequenciApp", acoes);
  removerArquivo(
    ctx,
    sobRaiz(ctx.raiz, "/etc/logrotate.d/frequenciapp"),
    "o logrotate do FrequenciApp",
    acoes,
  );
  removerContainers(ctx, removerDados, acoes, avisos);
  if (removerDados) {
    for (const alvo of alvos) removerCaminhoDados(ctx, alvo.caminho, alvo.rotulo, acoes);
    avisos.push(
      aviso(
        "A_DADOS_REMOVIDOS",
        "Os dados locais e o checkout foram removidos; a ação não é reversível.",
        `${DOCUMENTACAO}#desinstalar`,
      ),
    );
  } else {
    avisos.push(
      aviso(
        "A_DADOS_PRESERVADOS",
        "Os dados locais, o checkout e o controlador foram preservados.",
        `${DOCUMENTACAO}#desinstalar`,
      ),
    );
  }
  const fim = ctx.agora();
  if (acoes.length === 0) {
    acoes.push(
      acao("Confere que os serviços e containers do FrequenciApp já estão ausentes", null, false),
    );
  }
  return documentoOperacao(
    ctx,
    "desinstalar",
    ctx.simular,
    [
      etapaOperacao("desinstalar", "concluida", inicio, fim, null, acoes, [], {
        removerDados,
        preservados: removerDados
          ? []
          : ["configuração", "estado", "backup", "checkout", "controlador"],
        unidades,
        projeto: ctx.caminhos.projetoCompose,
        simulado: ctx.simular,
      }),
    ],
    avisos,
    removerDados
      ? ["Remova os backups remotos fora do servidor, se necessário."]
      : ["Os dados foram preservados; use --remover-dados --sim para apagar os dados locais."],
  );
}

// Executa um comando de operação e devolve o documento do contrato.
export function executarOperacao(opcoes, deps, dados) {
  const comando = opcoes.operandos[0];
  const configuracao = dados.configuracao ?? {};
  const estadoResultado = dados.estadoResultado ?? {
    presente: false,
    estado: null,
    avisos: [],
    erro: null,
  };
  const ctx = prepararContexto(
    deps,
    configuracao,
    estadoResultado,
    dados.deteccao,
    opcoes,
    dados.raiz,
  );
  const avisosBase = [...(dados.avisosConfig ?? []), ...avisosDoEstado(ctx)];
  try {
    if (!COMANDOS_OPERACAO.has(comando)) {
      throw erroUso("Comando de operação desconhecido.");
    }
    validarOperandos(opcoes, comando);
    if (comando === "backup") return executarBackup(ctx, avisosBase);
    if (comando === "atualizar") return executarAtualizacao(ctx, avisosBase);
    if (comando === "restaurar") return executarRestauracao(ctx, avisosBase);
    return executarDesinstalacao(ctx, avisosBase);
  } catch (erro) {
    if (!(erro instanceof ErroInstalador)) throw erro;
    return documentoFalha(ctx, comando, erro, opcoes, avisosBase);
  }
}
