// Protótipo de ensaio inativo, não é controlador de produção nem controla serviços reais.
// Trava apenas o par raiz privada descartável + alvo; o pin e o backup são ficcionais.
import { createHash, randomUUID } from "node:crypto";
import { open, mkdir, lstat, readFile, readdir, realpath, rename, rmdir } from "node:fs/promises";
import { isAbsolute, join, relative, resolve, sep } from "node:path";

const adaptadores = new WeakMap();
const hash = (dados) => createHash("sha256").update(dados).digest("hex");
const estados = new Set(["intencao", "backup_fixado", "migracao_iniciada", "concluida"]);

// A única implementação aceita pelo fluxo é este simulador sem processos ou rede.
export function criarAdaptadorEnsaio(opcoes = {}) {
  if (
    !opcoes ||
    Object.getPrototypeOf(opcoes) !== Object.prototype ||
    Object.keys(opcoes).some(
      (chave) => !["falharEm", "bloquearEm", "migradorVivo"].includes(chave),
    ) ||
    (opcoes.falharEm !== undefined && opcoes.falharEm !== "migracao") ||
    (opcoes.bloquearEm !== undefined && opcoes.bloquearEm !== "migracao") ||
    (opcoes.migradorVivo !== undefined && typeof opcoes.migradorVivo !== "boolean")
  ) {
    throw new Error("Opções de adaptador de ensaio inválidas.");
  }
  let vivo = opcoes.migradorVivo === true;
  let migracoes = 0;
  let liberar;
  let liberado = false;
  const adaptador = Object.freeze({
    observar: () => Object.freeze({ vivo, migracoes }),
    liberar: () => {
      liberado = true;
      if (liberar) liberar();
    },
  });
  adaptadores.set(adaptador, {
    observar: () => ({ vivo, migracoes }),
    migrar: async () => {
      vivo = true;
      migracoes++;
      if (opcoes.bloquearEm === "migracao" && !liberado) {
        await new Promise((resolve) => {
          const intervalo = setInterval(() => {}, 1000);
          liberar = () => {
            clearInterval(intervalo);
            resolve();
          };
        });
      }
      if (opcoes.falharEm === "migracao") throw new Error("Falha sintética de migração.");
      vivo = false;
    },
  });
  return adaptador;
}

// Detecta links na árvore existente, mas exige raiz privada sem terceiros concorrentes;
// não protege contra troca de caminhos durante a inspeção (TOCTOU).
async function recusarLinks(caminho) {
  let entrada;
  try {
    entrada = await lstat(caminho);
  } catch (erro) {
    if (erro.code === "ENOENT") return;
    throw erro;
  }
  if (entrada.isSymbolicLink()) throw new Error("Symlink não permitido no ensaio.");
  if (entrada.isDirectory()) {
    for (const nome of await readdir(caminho)) await recusarLinks(join(caminho, nome));
  } else if (!entrada.isFile()) {
    throw new Error("Entrada especial não permitida no ensaio.");
  }
}

async function sincronizarDiretorio(caminho) {
  const diretorio = await open(caminho, "r");
  try {
    await diretorio.sync();
  } finally {
    await diretorio.close();
  }
}

async function gravarExclusivo(caminho, bytes) {
  const arquivo = await open(caminho, "wx", 0o600);
  try {
    await arquivo.writeFile(bytes);
    await arquivo.sync();
  } finally {
    await arquivo.close();
  }
}

async function substituirVerificado(pasta, nome, conteudo) {
  const temporario = join(pasta, `.estado-${randomUUID()}.tmp`);
  const destino = join(pasta, nome);
  await gravarExclusivo(temporario, conteudo);
  await rename(temporario, destino);
  await sincronizarDiretorio(pasta);
  if ((await readFile(destino, "utf8")) !== conteudo)
    throw new Error("Journal não pôde ser verificado.");
}

async function gravarEstado(pasta, dados) {
  const conteudo = JSON.stringify({ dados, sha256: hash(JSON.stringify(dados)) });
  const journals = join(pasta, "journals");
  await mkdir(journals, { recursive: true, mode: 0o700 });
  await sincronizarDiretorio(pasta);
  await substituirVerificado(journals, `${dados.operacao}.json`, conteudo);
  await substituirVerificado(pasta, "estado.json", conteudo);
}

// O encadeamento detecta estados inconsistentes; hashes locais não autenticam contra um atacante.
async function verificarEstado(pasta, alvo) {
  let conteudo;
  try {
    conteudo = await readFile(join(pasta, "estado.json"), "utf8");
  } catch (erro) {
    if (erro.code === "ENOENT") {
      for (const nome of ["journals", "backups"]) {
        let nomes;
        try {
          nomes = await readdir(join(pasta, nome));
        } catch (falha) {
          if (falha.code === "ENOENT") continue;
          throw falha;
        }
        if (nomes.length) throw new Error(`Estado ausente com ${nome} existentes.`);
      }
      return;
    }
    throw erro;
  }
  let registro;
  try {
    registro = JSON.parse(conteudo);
  } catch {
    throw new Error("Estado do journal inválido.");
  }
  const dados = registro?.dados;
  if (
    !dados ||
    Object.keys(registro).sort().join(",") !== "dados,sha256" ||
    Object.keys(dados).sort().join(",") !== "alvo,anterior,backup,estado,operacao,versao" ||
    registro.sha256 !== hash(JSON.stringify(dados)) ||
    dados.versao !== 1 ||
    dados.alvo !== alvo ||
    !estados.has(dados.estado) ||
    !/^[0-9a-f-]{36}$/.test(dados.operacao) ||
    dados.estado !== "concluida" ||
    !/^[0-9a-f]{64}$/.test(dados.backup)
  ) {
    throw new Error("Estado do journal inválido ou operação anterior bloqueada.");
  }
  const nomes = await readdir(join(pasta, "journals"));
  const vistos = new Set();
  let atual = dados.operacao;
  while (atual !== null) {
    if (typeof atual !== "string" || !/^[0-9a-f-]{36}$/.test(atual) || vistos.has(atual)) {
      throw new Error("Cadeia de journals inválida.");
    }
    vistos.add(atual);
    let texto;
    try {
      texto = await readFile(join(pasta, "journals", `${atual}.json`), "utf8");
    } catch {
      throw new Error("Journal ausente ou inválido.");
    }
    let item;
    try {
      item = JSON.parse(texto);
    } catch {
      throw new Error("Journal inválido.");
    }
    const d = item?.dados;
    if (
      !d ||
      Object.keys(item).sort().join(",") !== "dados,sha256" ||
      Object.keys(d).sort().join(",") !== "alvo,anterior,backup,estado,operacao,versao" ||
      item.sha256 !== hash(JSON.stringify(d)) ||
      d.versao !== 1 ||
      d.alvo !== alvo ||
      d.operacao !== atual ||
      d.estado !== "concluida" ||
      !/^[0-9a-f]{64}$/.test(d.backup) ||
      (atual === dados.operacao && texto !== conteudo)
    ) {
      throw new Error("Estado e journal divergentes ou inválidos.");
    }
    const bytes = await readFile(join(pasta, "backups", `${atual}.backup`));
    if (hash(bytes) !== d.backup) throw new Error("Estado inválido: backup anterior não confere.");
    atual = d.anterior;
  }
  if (
    nomes.length !== vistos.size ||
    nomes.some((nome) => !vistos.has(nome.replace(/\.json$/, "")) || !nome.endsWith(".json"))
  ) {
    throw new Error("Journal não reconciliado com o estado.");
  }
  return dados.operacao;
}

// A raiz precisa ser descartável; não há interface de linha de comando nem adaptador real.
export async function executar({ raiz, alvo, adaptador } = {}) {
  const simulador = adaptadores.get(adaptador);
  if (!simulador) throw new Error("Adaptador de ensaio obrigatório.");
  if (
    typeof raiz !== "string" ||
    !isAbsolute(raiz) ||
    typeof alvo !== "string" ||
    !/^[a-z0-9][a-z0-9_-]{0,63}$/.test(alvo)
  )
    throw new Error("Raiz ou alvo de ensaio inválido.");
  const raizReal = await realpath(raiz);
  const tmpReal = await realpath("/tmp");
  const relativo = relative(tmpReal, raizReal);
  if (!relativo || relativo === ".." || relativo.startsWith(`..${sep}`) || isAbsolute(relativo)) {
    throw new Error("A raiz de ensaio deve estar dentro de /tmp.");
  }
  if (
    raiz.split(sep).some((parte) => parte === "." || parte === "..") ||
    raizReal !== resolve(raiz)
  ) {
    throw new Error("Symlink ou componente relativo não permitido na raiz de ensaio.");
  }
  const pasta = join(raizReal, hash(alvo));
  await recusarLinks(pasta);
  await mkdir(pasta, { recursive: true, mode: 0o700 });
  await recusarLinks(pasta);
  await sincronizarDiretorio(raizReal);
  const trava = join(pasta, "trava");
  try {
    await mkdir(trava, { mode: 0o700 });
  } catch (erro) {
    if (erro.code === "EEXIST")
      throw new Error("Alvo bloqueado por operação anterior ou concorrente.");
    throw erro;
  }
  await sincronizarDiretorio(pasta);
  // Nenhuma limpeza de trava acontece na falha: um resultado incerto exige intervenção externa.
  if (simulador.observar().vivo) throw new Error("Migrador sintético ainda vivo; alvo bloqueado.");
  const anterior = (await verificarEstado(pasta, alvo)) ?? null;
  const operacao = randomUUID();
  const dados = { versao: 1, alvo, operacao, anterior, estado: "intencao", backup: null };
  await gravarEstado(pasta, dados);
  const backups = join(pasta, "backups");
  await mkdir(backups, { recursive: true, mode: 0o700 });
  await sincronizarDiretorio(pasta);
  const arquivo = join(backups, `${operacao}.backup`);
  const bytes = Buffer.from(`backup sintético\nalvo=${alvo}\noperação=${operacao}\n`);
  await gravarExclusivo(arquivo, bytes);
  await sincronizarDiretorio(backups);
  const digest = hash(bytes);
  if (hash(await readFile(arquivo)) !== digest) throw new Error("Backup sintético não confere.");
  dados.backup = digest;
  dados.estado = "backup_fixado";
  await gravarEstado(pasta, dados);
  dados.estado = "migracao_iniciada";
  await gravarEstado(pasta, dados);
  await simulador.migrar();
  if (simulador.observar().vivo) throw new Error("Migrador sintético ainda vivo; alvo bloqueado.");
  if (hash(await readFile(arquivo)) !== digest) throw new Error("Backup sintético não confere.");
  dados.estado = "concluida";
  await gravarEstado(pasta, dados);
  await rmdir(trava);
  await sincronizarDiretorio(pasta);
  return { estado: dados.estado, operacao, backup: { arquivo, sha256: digest } };
}
