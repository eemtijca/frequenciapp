// Liga o núcleo ao host privado e à primeira prova PostgreSQL de receita fechada.
import { createServer } from "node:http";
import { chmod, lstat, open, mkdtemp, mkdir } from "node:fs/promises";
import { constants } from "node:fs";
import { createHash, randomBytes } from "node:crypto";
import { spawn } from "node:child_process";
import {
  PIN_POSTGRES,
  aprovarImagemPostgres,
  receitaPostgres,
  criarClienteEngine,
} from "./postgres-nativo.mjs";
import { criarBarreiraEngine } from "./engine-gate.mjs";
import { executarSessao } from "./sessao.mjs";
import { join, isAbsolute } from "node:path";
import { TextDecoder } from "node:util";

// Somente um chamador host revisado fornece diretório privado; não existe entrada CLI pública.
export async function iniciarDockerReal(opcoes) {
  if (!opcoes || typeof opcoes.diretorioBase !== "string")
    throw new Error("Engine real bloqueado sem configuração host explícita.");
  await validarDiretorio(opcoes.diretorioBase);
  const rodada = randomBytes(16).toString("hex");
  const diretorio = await mkdtemp(join(opcoes.diretorioBase, "fadm-"));
  await chmod(diretorio, 0o700);
  const config = join(diretorio, "docker");
  await mkdir(config, { mode: 0o700 });
  const requisitar =
    opcoes.requisitar ??
    criarClienteEngine({
      nome: `fadm-${rodada}`,
      iniciar: () =>
        spawn("sudo", ["-n", "docker", "--config", config, "system", "dial-stdio"], {
          cwd: diretorio,
          env: { PATH: "/usr/local/bin:/usr/bin:/bin", HOME: diretorio },
          stdio: ["pipe", "pipe", "pipe"],
        }),
    });
  await opcoes.aoPreparar?.(diretorio);
  const signal = new AbortController();
  const sinais = new Map(["SIGHUP", "SIGINT", "SIGTERM"].map((s) => [s, () => signal.abort()]));
  for (const [s, f] of sinais) process.on(s, f);
  const timer = setTimeout(() => signal.abort(), 30000);
  let nucleo,
    execs,
    identidade,
    erro = null,
    limpeza = { removidos: [], preservados: [], falhas: [] };
  const salvar = async (nome, valor) => {
    const f = await open(
      join(diretorio, nome),
      constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW,
      0o600,
    );
    try {
      await f.writeFile(JSON.stringify(valor) + "\n");
      await f.sync();
    } finally {
      await f.close();
    }
    const d = await open(
      diretorio,
      constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW,
    );
    try {
      await d.sync();
    } finally {
      await d.close();
    }
  };
  try {
    const imagem = aprovarImagemPostgres(
      await requisitar("GET", `/images/${encodeURIComponent(PIN_POSTGRES)}/json`),
    );
    const spec = receitaPostgres(rodada, imagem, randomBytes(32).toString("hex"));
    nucleo = await abrirNucleoPrivado({
      diretorio,
      rodada,
      receitas: { banco: spec },
      imagens: { [imagem.id]: imagem },
      requisitar,
    });
    execs = await open(
      join(diretorio, "execs.jsonl"),
      constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW,
      0o600,
    );
    await execs.sync();
    await salvar("preflight.json", { rodada, imagem: imagem.id, perfil: imagem.perfil });
    if (signal.signal.aborted) throw new Error("Prova interrompida antes da criação.");
    const handle = await nucleo.gate.criar("banco", signal.signal);
    if (signal.signal.aborted) throw new Error("Prova interrompida antes da partida.");
    await nucleo.gate.iniciar(handle, signal.signal);
    identidade = await nucleo.gate.consultarPrimeiraIdentidade(
      handle,
      async (id) => {
        await execs.writeFile(JSON.stringify({ rodada, id, estado: "criado" }) + "\n");
        await execs.sync();
      },
      signal.signal,
    );
  } catch {
    erro = "prova-nativa-falhou";
  }
  try {
    if (nucleo)
      limpeza = await nucleo.gate.encerrar(async () =>
        salvar("coleta.json", {
          rodada,
          identidade: identidade ?? null,
          erro,
          inventario: nucleo.gate.inventario(),
        }),
      );
    else await salvar("coleta.json", { rodada, erro });
    if (limpeza.falhas.length || limpeza.preservados.length || signal.signal.aborted)
      erro ??= "limpeza-ou-sinal";
    await salvar("resultado.json", {
      rodada,
      codigo: erro ? 1 : 0,
      identidade: identidade ?? null,
      limpeza,
      erro,
    });
  } finally {
    try {
      await execs?.close();
    } finally {
      try {
        await nucleo?.fechar();
      } finally {
        // A conclusão local inclui os commits e o fechamento dos arquivos próprios.
        if (signal.signal.aborted) erro ??= "limpeza-ou-sinal";
        clearTimeout(timer);
        for (const [s, f] of sinais) process.removeListener(s, f);
      }
    }
  }
  return { rodada, diretorio, codigo: erro ? 1 : 0, identidade: identidade ?? null, limpeza, erro };
}
export function criarClienteStdio({ iniciar, prazoMs = 1000 }) {
  if (typeof iniciar !== "function" || !Number.isInteger(prazoMs) || prazoMs < 1 || prazoMs > 5000)
    throw new Error("Cliente host inválido.");
  return async (metodo, caminho, corpo) => {
    if (
      !rotaPermitida(metodo, caminho) &&
      !(metodo === "DELETE" && /^\/containers\/[a-f0-9]{64}$/.test(caminho))
    )
      throw new Error("Rota upstream não autorizada.");
    const payload = corpo === undefined ? Buffer.alloc(0) : Buffer.from(JSON.stringify(corpo));
    if (payload.length > LIMITE) throw new Error("Corpo HTTP excedido.");
    const mensagem = Buffer.concat([
      Buffer.from(
        `${metodo} ${VERSAO}${caminho} HTTP/1.1\r\nHost: docker\r\nConnection: close\r\nContent-Type: application/json\r\nContent-Length: ${payload.length}\r\n\r\n`,
      ),
      payload,
    ]);
    const filho = iniciar();
    return new Promise((resolve, reject) => {
      let total = 0;
      let stderr = 0;
      const blocos = [];
      let causa;
      const falhar = (erro) => {
        causa ??= erro;
        filho.kill("SIGKILL");
      };
      const timer = setTimeout(
        () => falhar(new Error("Prazo HTTP stdio excedido; efeito não confirmado.")),
        prazoMs,
      );
      filho.once("error", falhar);
      filho.stdin.on("error", falhar);
      filho.stdout.on("error", falhar);
      filho.stderr.on("error", falhar);
      filho.stderr.on("data", (b) => {
        stderr += b.length;
        if (stderr > 4096) falhar(new Error("Diagnóstico HTTP excedido."));
      });
      filho.stdout.on("data", (b) => {
        total += b.length;
        if (total > LIMITE + 4096) falhar(new Error("Resposta HTTP excedida."));
        else blocos.push(b);
      });
      filho.once("close", (codigo, sinal) => {
        clearTimeout(timer);
        try {
          if (causa) throw causa;
          if (codigo !== 0 || sinal !== null)
            throw new Error("Cliente HTTP stdio sem conclusão local.");
          const bytes = Buffer.concat(blocos);
          const fim = bytes.indexOf("\r\n\r\n");
          if (fim < 0 || fim > 4096) throw new Error("Cabeçalho HTTP inválido.");
          const [linha, ...linhas] = bytes.subarray(0, fim).toString("ascii").split("\r\n");
          const status = /^HTTP\/1\.1 (200|201|204|404) [\x20-\x7e]*$/.exec(linha);
          const headers = new Map();
          for (const l of linhas) {
            const m = /^([A-Za-z-]+): ([\x20-\x7e]*)$/.exec(l);
            if (!m || headers.has(m[1].toLowerCase()))
              throw new Error("Cabeçalho HTTP duplicado ou inválido.");
            headers.set(m[1].toLowerCase(), m[2]);
          }
          const tamanho = headers.get("content-length");
          if (
            !status ||
            !/^(0|[1-9]\d*)$/.test(tamanho ?? "") ||
            headers.has("transfer-encoding") ||
            headers.get("api-version") !== "1.47" ||
            Number(tamanho) > LIMITE ||
            bytes.length - fim - 4 !== Number(tamanho)
          )
            throw new Error("Resposta HTTP inválida, excedida ou truncada.");
          if (status[1] === "404") {
            const inspect =
              metodo === "GET" && /^\/containers\/([a-f0-9]{64})\/json$/.exec(caminho);
            if (!inspect) throw new Error("Ausência HTTP não autorizada.");
            if (headers.get("content-type") !== "application/json")
              throw new Error("Tipo HTTP inválido.");
            const erro = jsonEstrito(bytes.subarray(fim + 4));
            // Contrato fechado NoSuchContainerID: somente a mensagem do ID pedido confirma ausência.
            if (
              !erro ||
              Array.isArray(erro) ||
              Object.keys(erro).length !== 1 ||
              typeof erro.message !== "string" ||
              erro.message !== `No such container: ${inspect[1]}`
            )
              throw new Error("Ausência HTTP sem erro de identidade confirmado.");
            resolve(null);
          } else if (metodo === "GET" && /^\/containers\/[a-f0-9]{64}\/json$/.test(caminho)) {
            // Inspeção só usa null no 404 de identidade validado acima.
            if (status[1] !== "200" || headers.get("content-type") !== "application/json")
              throw new Error("Resposta HTTP de inspeção incompatível.");
            const inspecao = jsonEstrito(bytes.subarray(fim + 4));
            if (!inspecao || typeof inspecao !== "object" || Array.isArray(inspecao))
              throw new Error("Objeto HTTP de inspeção inválido.");
            resolve(inspecao);
          } else if (status[1] === "204" && Number(tamanho) === 0) resolve(null);
          else {
            if (headers.get("content-type") !== "application/json")
              throw new Error("Tipo HTTP inválido.");
            resolve(jsonEstrito(bytes.subarray(fim + 4)));
          }
        } catch (erro) {
          reject(erro);
        }
      });
      filho.stdin.end(mensagem);
    });
  };
}
export async function executarRunnerStdio({ iniciar, gate, coletar, timeoutMs = 5000 }) {
  if (
    typeof iniciar !== "function" ||
    !Number.isInteger(timeoutMs) ||
    timeoutMs < 1 ||
    timeoutMs > 60000
  )
    throw new Error("Runner host inválido.");
  // A fábrica pertence ao provisionador host. O wire nunca escolhe comando, argv ou ambiente.
  const filho = iniciar();
  const abort = new AbortController();
  let causa;
  const falhar = (erro) => {
    causa ??= erro;
    abort.abort();
    filho.kill("SIGKILL");
  };
  const encerramento = new Promise((resolve) =>
    filho.once("close", (codigo, sinal) => resolve({ codigo, sinal, encerrado: true })),
  );
  filho.on("error", falhar);
  filho.stdin.on("error", falhar);
  filho.stdout.on("error", falhar);
  filho.stderr.on("error", falhar);
  let diagnostico = 0;
  filho.stderr.on("data", (bloco) => {
    diagnostico += bloco.length;
    if (diagnostico > 4096) falhar(new Error("Diagnóstico do runner excedido."));
  });
  const timer = setTimeout(
    () => falhar(new Error("Prazo do runner excedido; conclusão incerta.")),
    timeoutMs,
  );
  let timerFim;
  const limiteFim = new Promise((resolve) => {
    timerFim = setTimeout(
      () => resolve({ codigo: null, sinal: null, encerrado: false }),
      timeoutMs + 1000,
    );
  });
  try {
    // A sessão toma o stdout emprestado: return encerra só a leitura; falha ainda o destrói.
    const origem = {
      [Symbol.asyncIterator]: () => filho.stdout.iterator({ destroyOnReturn: false }),
      destroy: (erro) => filho.stdout.destroy(erro),
    };
    const sessao = await executarSessao({
      origem,
      destino: filho.stdin,
      gate,
      coletar,
      signal: abort.signal,
      timeoutMs,
    });
    if (!filho.stdin.destroyed && !filho.stdin.writableEnded) filho.stdin.end();
    const cliente = await Promise.race([encerramento, limiteFim]);
    return {
      codigo:
        !causa &&
        sessao.codigo === 0 &&
        cliente.encerrado &&
        cliente.codigo === 0 &&
        cliente.sinal === null
          ? 0
          : 1,
      sessao,
      cliente,
    };
  } catch (erro) {
    falhar(erro);
    await Promise.race([encerramento, limiteFim]);
    throw erro;
  } finally {
    clearTimeout(timer);
    clearTimeout(timerFim);
  }
}
const LIMITE_JOURNAL = 1024 * 1024;
const ESTADOS = [
  "intencao",
  "criacao-confirmada",
  "inspecionado",
  "iniciado",
  "parado",
  "removido",
  "ausencia-confirmada",
  "incerto",
];
const hash = (texto) => createHash("sha256").update(texto).digest("hex");
function validarRegistro(r, rodada) {
  if (
    !r ||
    Array.isArray(r) ||
    Object.keys(r).sort().join(",") !== "especificacao,estado,handle,id,rodada,slot,tipo" ||
    r.rodada !== rodada ||
    r.tipo !== "container" ||
    r.slot !== "banco" ||
    !/^[a-f0-9]{32}$/.test(r.handle) ||
    !ESTADOS.includes(r.estado) ||
    !(
      (r.id === null && ["intencao", "incerto"].includes(r.estado)) ||
      (typeof r.id === "string" && /^[a-f0-9]{64}$/.test(r.id))
    ) ||
    !r.especificacao ||
    Array.isArray(r.especificacao) ||
    typeof r.especificacao !== "object"
  )
    throw new Error("Journal com registro inválido.");
}
async function validarArquivo(arquivo) {
  const s = await arquivo.stat();
  if (
    !s.isFile() ||
    s.uid !== process.getuid() ||
    s.nlink !== 1 ||
    (s.mode & 0o777) !== 0o600 ||
    s.size > LIMITE_JOURNAL
  )
    throw new Error("Journal sem ownership ou limite confirmado.");
}
export async function recuperarJournalPrivado({ diretorio, rodada }) {
  await validarDiretorio(diretorio);
  const arquivo = await open(
    join(diretorio, "journal.jsonl"),
    constants.O_RDONLY | constants.O_NOFOLLOW,
  );
  try {
    await validarArquivo(arquivo);
    const bytes = await arquivo.readFile();
    if (bytes.length > LIMITE_JOURNAL || bytes.at(-1) !== 10)
      throw new Error("Journal truncado ou excedido.");
    const linhas = new TextDecoder("utf-8", { fatal: true }).decode(bytes).split("\n");
    linhas.pop();
    const cabecalho = linhas.shift();
    if (
      !/^[a-f0-9]{32}$/.test(rodada) ||
      cabecalho !== JSON.stringify({ versao: 1, rodada }) ||
      linhas.length > 1024
    )
      throw new Error("Journal de outra versão ou rodada.");
    let anterior = hash(cabecalho);
    const registros = [];
    for (const linha of linhas) {
      const entrada = jsonEstrito(Buffer.from(linha));
      validarRegistro(entrada.registro, rodada);
      const conteudo = { sequencia: registros.length, anterior, registro: entrada.registro };
      if (JSON.stringify({ ...conteudo, hash: hash(JSON.stringify(conteudo)) }) !== linha)
        throw new Error("Journal com cadeia divergente.");
      anterior = entrada.hash;
      registros.push(entrada.registro);
    }
    // Recuperação é evidência somente leitura; nunca reautoriza criação, partida ou retry.
    return { rodada, registros, liberado: false };
  } finally {
    await arquivo.close();
  }
}
export async function abrirNucleoPrivado({
  diretorio,
  rodada,
  receitas,
  imagens,
  requisitar,
  supervisionar,
}) {
  await validarDiretorio(diretorio);
  if (!/^[a-f0-9]{32}$/.test(rodada)) throw new Error("Journal de rodada inválida.");
  let arquivo;
  try {
    arquivo = await open(
      join(diretorio, "journal.jsonl"),
      constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW,
      0o600,
    );
  } catch (erro) {
    if (erro.code === "EEXIST")
      throw new Error("Journal existente exige revisão; destino exclusivo indisponível.", {
        cause: erro,
      });
    throw erro;
  }
  let fechado = false;
  let causa;
  let escrita = Promise.resolve();
  const fechar = async () => {
    if (fechado) return;
    fechado = true;
    await escrita.catch(() => {});
    await arquivo.close();
  };
  try {
    await validarArquivo(arquivo);
    const cabecalho = JSON.stringify({ versao: 1, rodada });
    await arquivo.writeFile(cabecalho + "\n");
    await arquivo.sync();
    const pasta = await open(
      diretorio,
      constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW,
    );
    try {
      await pasta.sync();
    } finally {
      await pasta.close();
    }
    let anterior = hash(cabecalho);
    let sequencia = 0;
    let total = Buffer.byteLength(cabecalho) + 1;
    const persistir = (registro) => {
      // Congela a entrada antes de qualquer espera e trava todas as escritas após falha.
      const copia = structuredClone(registro);
      const atual = escrita
        .then(async () => {
          if (fechado || causa)
            throw new Error("Journal fechado ou sem commit confirmado.", { cause: causa });
          validarRegistro(copia, rodada);
          const conteudo = { sequencia, anterior, registro: copia };
          const digest = hash(JSON.stringify(conteudo));
          const linha = JSON.stringify({ ...conteudo, hash: digest }) + "\n";
          total += Buffer.byteLength(linha);
          if (sequencia >= 1024 || total > LIMITE_JOURNAL) throw new Error("Journal excedido.");
          await validarArquivo(arquivo);
          await arquivo.writeFile(linha);
          await arquivo.sync();
          anterior = digest;
          sequencia++;
        })
        .catch((erro) => {
          causa ??= erro;
          throw erro;
        });
      escrita = atual;
      return atual;
    };
    const gate = criarBarreiraEngine({
      rodada,
      receitas,
      imagens,
      requisitar,
      supervisionar,
      persistir,
    });
    return { gate, fechar };
  } catch (erro) {
    await fechar();
    throw erro;
  }
}
const LIMITE = 16384;
const VERSAO = "/v1.47";
async function validarDiretorio(diretorio) {
  const info = await lstat(diretorio);
  if (
    !isAbsolute(diretorio) ||
    !info.isDirectory() ||
    info.isSymbolicLink() ||
    info.uid !== process.getuid() ||
    (info.mode & 0o777) !== 0o700
  )
    throw new Error("Diretório administrativo não exclusivo.");
}
function jsonEstrito(bytes) {
  const texto = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  const valor = JSON.parse(texto);
  // O dialeto fechado exige a forma canônica, recusando também chaves duplicadas.
  if (JSON.stringify(valor) !== texto) throw new Error("JSON administrativo não canônico.");
  return valor;
}
function rotaPermitida(metodo, caminho) {
  return (
    (metodo === "POST" && caminho === "/containers/create") ||
    (metodo === "GET" && /^\/containers\/[a-f0-9]{64}\/json$/.test(caminho)) ||
    (metodo === "POST" && /^\/containers\/[a-f0-9]{64}\/(start|stop)$/.test(caminho))
  );
}
export async function abrirEndpointPrivado({ diretorio, gate }) {
  await validarDiretorio(diretorio);
  const socketPath = join(diretorio, "engine.sock");
  const servidor = createServer({ maxHeaderSize: 4096 }, async (req, res) => {
    try {
      const headers = new Set();
      for (let i = 0; i < req.rawHeaders.length; i += 2) {
        const nome = req.rawHeaders[i].toLowerCase();
        if (
          headers.has(nome) ||
          !["host", "connection", "x-fadm-version", "content-length", "content-type"].includes(nome)
        )
          throw new Error("Header não autorizado.");
        headers.add(nome);
      }
      const caminho = req.url?.startsWith(VERSAO) ? req.url.slice(VERSAO.length) : "";
      if (
        req.headers["x-fadm-version"] !== "1" ||
        req.headers.connection !== "close" ||
        !rotaPermitida(req.method, caminho)
      )
        throw new Error("Rota não autorizada.");
      const tamanho = Number(req.headers["content-length"] ?? 0);
      const criacao = caminho === "/containers/create";
      if (
        !Number.isSafeInteger(tamanho) ||
        tamanho < 0 ||
        tamanho > LIMITE ||
        (criacao
          ? tamanho === 0 || req.headers["content-type"] !== "application/json"
          : tamanho !== 0)
      )
        throw new Error("Corpo não autorizado.");
      const blocos = [];
      let total = 0;
      for await (const bloco of req) {
        total += bloco.length;
        if (total > LIMITE || total > tamanho) throw new Error("Corpo excedido.");
        blocos.push(bloco);
      }
      if (total !== tamanho) throw new Error("Corpo truncado.");
      const corpo = criacao ? jsonEstrito(Buffer.concat(blocos)) : undefined;
      const valor = await gate.atender(req.method, caminho, corpo);
      const bytes = Buffer.from(JSON.stringify(valor ?? null));
      if (bytes.length > LIMITE) throw new Error("Resposta excedida.");
      res.writeHead(200, {
        "Content-Type": "application/json",
        "Content-Length": bytes.length,
        "X-FADM-Version": "1",
        Connection: "close",
      });
      res.end(bytes);
    } catch {
      req.resume();
      res.writeHead(403, { "Content-Length": "0", "X-FADM-Version": "1", Connection: "close" });
      res.end();
    }
  });
  servidor.requestTimeout = 1000;
  servidor.headersTimeout = 1000;
  servidor.maxRequestsPerSocket = 1;
  servidor.on("clientError", (_erro, socket) => socket.destroy());
  await new Promise((resolve, reject) => {
    servidor.once("error", reject);
    servidor.listen(socketPath, resolve);
  });
  await chmod(socketPath, 0o600);
  return {
    socketPath,
    fechar: () =>
      new Promise((resolve, reject) => {
        servidor.close((erro) => (erro ? reject(erro) : resolve()));
        servidor.closeAllConnections();
      }),
  };
}
