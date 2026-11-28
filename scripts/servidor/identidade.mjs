// Reduz a configuração efetiva a uma identidade operacional sem segredos.
import { createHash } from "node:crypto";
import {
  closeSync,
  constants,
  fstatSync,
  lstatSync,
  openSync,
  readFileSync,
  readdirSync,
  realpathSync,
  writeFileSync,
} from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const TIPOS_MONTAGEM = new Set(["volume", "bind", "tmpfs"]);
const DESTINO_PARTIDA = "/run/frequenciapp-migracao";
const idOperacao = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/;

function exigir(condicao, mensagem) {
  if (!condicao) throw new Error(mensagem);
}

function montagemDeclarada(config, volume) {
  exigir(volume && typeof volume === "object", "Declaração de montagem inválida.");
  exigir(TIPOS_MONTAGEM.has(volume.type), "Tipo de montagem não suportado.");
  exigir(
    typeof volume.target === "string" && volume.target.length > 0,
    "Montagem sem destino verificável.",
  );
  if (volume.type === "tmpfs") {
    return { tipo: "tmpfs", origem: "", nome: "", destino: volume.target };
  }
  if (volume.type === "volume") {
    const nome = config.volumes?.[volume.source]?.name;
    exigir(
      typeof nome === "string" && nome.length > 0,
      "Volume nomeado sem identidade verificável.",
    );
    return { tipo: "volume", origem: "", nome, destino: volume.target };
  }
  exigir(
    typeof volume.source === "string" && volume.source.length > 0,
    "Montagem por bind sem origem verificável.",
  );
  return { tipo: "bind", origem: volume.source, nome: "", destino: volume.target };
}

function montagemReal(mount) {
  exigir(mount && TIPOS_MONTAGEM.has(mount.Type), "Mount sem identidade suportada.");
  exigir(
    typeof mount.Destination === "string" && mount.Destination.length > 0,
    "Mount sem destino verificável.",
  );
  if (mount.Type === "tmpfs") {
    return { tipo: "tmpfs", origem: "", nome: "", destino: mount.Destination };
  }
  if (mount.Type === "volume") {
    exigir(typeof mount.Name === "string" && mount.Name.length > 0, "Volume sem nome verificável.");
    exigir(
      typeof mount.Source === "string" && mount.Source.length > 0,
      "Volume sem origem verificável.",
    );
    return { tipo: "volume", origem: mount.Source, nome: mount.Name, destino: mount.Destination };
  }
  exigir(
    typeof mount.Source === "string" && mount.Source.length > 0,
    "Montagem por bind sem origem verificável.",
  );
  return { tipo: "bind", origem: mount.Source, nome: "", destino: mount.Destination };
}

function compararMontagem(declarada, real) {
  return (
    declarada.tipo === real.tipo &&
    declarada.destino === real.destino &&
    (declarada.tipo === "volume" ? declarada.nome === real.nome : declarada.origem === real.origem)
  );
}

function ordenarMontagens(montagens) {
  return [...montagens].sort((a, b) => a.destino.localeCompare(b.destino));
}

function declaracoesDoServico(config, servico) {
  const volumes = config.services?.[servico]?.volumes ?? [];
  exigir(Array.isArray(volumes), "Declaração de volumes inválida.");
  return ordenarMontagens(volumes.map((volume) => montagemDeclarada(config, volume)));
}

export function identidadeCompose(config, daemon, containers, parametros, fase = "conferir") {
  const { projeto, app, db } = parametros;
  exigir(
    /^[a-z0-9][a-z0-9_-]*$/.test(projeto ?? "") && config.name === projeto,
    "Projeto Compose explícito diverge da configuração efetiva.",
  );
  exigir(typeof daemon?.ID === "string" && daemon.ID.length > 0, "Daemon Docker não identificado.");
  exigir(Boolean(config.services?.[app]), "Serviço da aplicação não existe na configuração.");
  exigir(Boolean(config.services?.[db]), "Serviço do banco não existe na configuração.");
  exigir(Array.isArray(containers), "Lista de containers inválida.");

  const declarados = new Map([
    [app, declaracoesDoServico(config, app)],
    [db, declaracoesDoServico(config, db)],
  ]);
  exigir(
    declarados.get(db).some((montagem) => montagem.tipo !== "tmpfs"),
    "Banco sem armazenamento persistente declarado.",
  );

  const recursos = [];
  if (fase === "inicial") {
    exigir(
      containers.length === 0,
      "O modo inicial só é aceito antes da primeira subida do projeto.",
    );
    for (const servico of [app, db]) {
      recursos.push({ servico, montagens: declarados.get(servico) });
    }
  } else {
    exigir(containers.length > 0, "Nenhum recurso existente para conferir ou adotar.");
    for (const servico of [app, db]) {
      const candidatos = containers.filter(
        (container) => container.Config?.Labels?.["com.docker.compose.service"] === servico,
      );
      exigir(candidatos.length === 1, "Serviço ausente ou ambíguo; adoção precisa ser explícita.");
      const container = candidatos[0];
      exigir(
        container.Config?.Labels?.["com.docker.compose.project"] === projeto,
        "Labels não correspondem ao projeto Compose.",
      );
      exigir(Array.isArray(container.Mounts), "Mounts não correspondem ao projeto.");
      const montagens = ordenarMontagens(container.Mounts.map(montagemReal));
      for (const declarada of declarados.get(servico)) {
        const real = montagens.find((montagem) => montagem.destino === declarada.destino);
        exigir(
          real && compararMontagem(declarada, real),
          "Configuração de armazenamento diverge dos recursos existentes.",
        );
      }
      recursos.push({ servico, montagens });
    }
  }

  const banco = recursos.find((recurso) => recurso.servico === db);
  exigir(Boolean(banco), "Recursos do banco não identificados.");
  const chave = createHash("sha256")
    .update(JSON.stringify({ versao: 1, projeto, daemon: daemon.ID, banco: banco.montagens }))
    .digest("hex");
  // A trava ignora o caminho do host do volume nomeado, que muda com o daemon.
  const montagensTrava = banco.montagens.map(({ tipo, origem, nome, destino }) => ({
    tipo,
    origem: tipo === "volume" ? "" : origem,
    nome,
    destino,
  }));
  const trava = createHash("sha256")
    .update(JSON.stringify({ versao: 1, projeto, daemon: daemon.ID, banco: montagensTrava }))
    .digest("hex");

  return {
    versao: 1,
    fase: fase === "inicial" ? "inicial" : "adotada",
    daemon: daemon.ID,
    projeto,
    recursos,
    chave,
    trava,
  };
}

function lerRegistro(registro) {
  const stat = lstatSync(registro);
  exigir(
    stat.isFile() && !stat.isSymbolicLink() && (stat.mode & 0o037) === 0,
    "Registro de identidade precisa ser arquivo privado regular.",
  );
  return JSON.parse(readFileSync(registro, "utf8"));
}

function lerEstadoPrivado(caminho, dono) {
  const fd = openSync(caminho, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
  try {
    const stat = fstatSync(fd);
    exigir(
      stat.isFile() && stat.uid === dono && (stat.mode & 0o777) === 0o600 && stat.size <= 65536,
      "Evidência da partida manual não é um arquivo privado regular.",
    );
    return JSON.parse(readFileSync(fd, "utf8"));
  } finally {
    closeSync(fd);
  }
}

function conferirVinculoTroca(esperado, dono) {
  const caminho = "/proc/self/fd/7";
  if (
    typeof esperado !== "string" ||
    !/^[0-9a-f]{64}$/.test(esperado) ||
    !lstatSync(caminho, { throwIfNoEntry: false })
  )
    return false;
  const fd = openSync(caminho, constants.O_RDONLY | constants.O_NONBLOCK);
  try {
    const stat = fstatSync(fd);
    if (
      !stat.isFile() ||
      stat.uid !== dono ||
      (stat.mode & 0o777) !== 0o600 ||
      stat.nlink !== 0 ||
      stat.size !== 32
    )
      return false;
    return createHash("sha256").update(readFileSync(fd)).digest("hex") === esperado;
  } finally {
    closeSync(fd);
  }
}

function lerDiretorioEstado(dirEstado) {
  exigir(typeof dirEstado === "string" && dirEstado.length > 0, "Diretório de estado ausente.");
  const pasta = resolve(dirEstado);
  const stat = lstatSync(pasta);
  exigir(
    stat.isDirectory() && (stat.mode & 0o777) === 0o700 && realpathSync(pasta) === pasta,
    "O diretório de estado da partida manual não é privado e canônico.",
  );
  return { pasta, dono: stat.uid };
}

function conferirDiretorioRevogado({ pasta, dono }, origem, inode) {
  const pai = dirname(origem);
  const erro = "O diretório revogado da partida manual não está vazio e íntegro.";
  exigir(
    dirname(pai) === pasta &&
      /^migracao-partida\.[A-Za-z0-9]{12}$/.test(basename(pai)) &&
      join(pai, "entrada") === origem,
    erro,
  );
  for (const [dir, modo] of [
    [pai, 0o700],
    [origem, 0o755],
  ]) {
    const stat = lstatSync(dir);
    exigir(stat.isDirectory() && stat.uid === dono && (stat.mode & 0o777) === modo, erro);
  }
  const alvo = lstatSync(origem, { bigint: true });
  exigir(inode === `${alvo.dev}:${alvo.ino}` && readdirSync(origem).length === 0, erro);
}

function conferirTransicao(atual, container, { pasta, dono }, transicao) {
  // A exceção é da execução ativa, mesmo quando a base não tem bind residual.
  const operacao = lerEstadoPrivado(join(pasta, "atualizacao-manual-pendente.json"), dono);
  exigir(
    idOperacao.test(transicao) &&
      operacao.versao === 1 &&
      operacao.fase === "troca" &&
      operacao.operacao === transicao &&
      operacao.chave === atual.trava &&
      typeof operacao.base === "string" &&
      /^[0-9a-f]{40}$/.test(operacao.base) &&
      typeof operacao.appBase?.container === "string" &&
      /^[0-9a-f]{64}$/.test(operacao.appBase.container) &&
      operacao.appBase.container === container?.Id &&
      typeof operacao.appBase.imagem === "string" &&
      /^sha256:[0-9a-f]{64}$/.test(operacao.appBase.imagem) &&
      operacao.appBase.imagem === container.Image,
    "Marcador não corresponde à troca e à revisão ativa da base.",
  );
  exigir(
    conferirVinculoTroca(operacao.vinculoTroca, dono),
    "A conferência durante a troca exige o vínculo privado do atualizador ativo.",
  );
  return operacao;
}

function recursosSemPartidaRevogada(atual, entrada, container, dirEstado, troca) {
  const { app } = entrada.parametros;
  if (!container) return atual.recursos;
  const montagens = container.Mounts.filter((m) => m.Destination === DESTINO_PARTIDA);
  if (
    !dirEstado ||
    montagens.length !== 1 ||
    declaracoesDoServico(entrada.config, app).some((m) => m.destino === DESTINO_PARTIDA)
  )
    return atual.recursos;

  const diretorio = lerDiretorioEstado(dirEstado);
  const exigirProva = (ok) => exigir(ok, "Montagem de partida manual sem revogação comprovada.");
  const marcador = join(diretorio.pasta, "atualizacao-manual-pendente.json");
  const pendente = lstatSync(marcador, { throwIfNoEntry: false });
  exigir(
    !pendente || troca,
    "Atualização manual pendente ou incerta; identidade aguarda revisão da recuperação.",
  );
  const estado = lerEstadoPrivado(join(diretorio.pasta, "estado.json"), diretorio.dono);
  const { partidaManual: prova, commit } = estado;
  const [montagem] = montagens;
  exigirProva(
    prova?.versao === 1 &&
      typeof prova.operacao === "string" &&
      idOperacao.test(prova.operacao) &&
      typeof commit === "string" &&
      /^[0-9a-f]{40}$/.test(commit) &&
      prova.revisao === commit &&
      typeof prova.container === "string" &&
      /^[0-9a-f]{64}$/.test(prova.container) &&
      prova.container === container.Id &&
      typeof prova.imagem === "string" &&
      /^sha256:[0-9a-f]{64}$/.test(prova.imagem) &&
      prova.imagem === container.Image &&
      typeof prova.origem === "string" &&
      montagem.Type === "bind" &&
      montagem.RW === false &&
      montagem.Source === prova.origem,
  );
  conferirDiretorioRevogado(diretorio, prova.origem, prova.inode);
  if (troca) exigirProva(pendente && troca.operacao !== prova.operacao && troca.base === commit);
  return atual.recursos.map((r) =>
    r.servico === app
      ? { ...r, montagens: r.montagens.filter((m) => m.destino !== DESTINO_PARTIDA) }
      : r,
  );
}

function compararRegistro(anterior, atual, entrada, dirEstado, transicao) {
  exigir(
    anterior.versao === atual.versao &&
      anterior.projeto === atual.projeto &&
      anterior.daemon === atual.daemon &&
      anterior.chave === atual.chave &&
      anterior.trava === atual.trava,
    "Identidade efetiva mudou; nenhuma adoção automática é permitida.",
  );
  const app = entrada.containers.find(
    (c) => c.Config?.Labels?.["com.docker.compose.service"] === entrada.parametros.app,
  );
  const troca = transicao
    ? conferirTransicao(atual, app, lerDiretorioEstado(dirEstado), transicao)
    : null;
  const esperados = JSON.stringify(anterior.recursos);
  if (esperados === JSON.stringify(atual.recursos)) return;
  exigir(
    esperados === JSON.stringify(recursosSemPartidaRevogada(atual, entrada, app, dirEstado, troca)),
    "Identidade efetiva mudou; nenhuma adoção automática é permitida.",
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const [acao, registro, dirEstado, transicao] = process.argv.slice(2);
    if (acao === "conferir-diretorio-partida") {
      // Nesta ação, os argumentos são diretório de estado, origem e inode.
      conferirDiretorioRevogado(lerDiretorioEstado(registro), dirEstado, transicao);
      process.exit(0);
    }
    const entrada = JSON.parse(readFileSync(0, "utf8"));
    let acaoEfetiva = acao;
    if (acao === "auto") {
      let registroExiste = false;
      try {
        lstatSync(registro);
        registroExiste = true;
      } catch (erro) {
        if (erro.code !== "ENOENT") throw erro;
      }
      if (registroExiste) {
        acaoEfetiva = "conferir";
      } else if (Array.isArray(entrada.containers) && entrada.containers.length === 0) {
        acaoEfetiva = "inicial";
      } else {
        throw new Error(
          "Projeto existente sem identidade adotada; execute identidade.sh --adotar --confirmar.",
        );
      }
    }
    if (!["inicial", "adotar", "conferir"].includes(acaoEfetiva)) {
      throw new Error("Ação de identidade inválida.");
    }
    exigir(
      !transicao || acaoEfetiva === "conferir",
      "Troca exige identidade adotada para conferência.",
    );
    const identidade = identidadeCompose(
      entrada.config,
      entrada.daemon,
      entrada.containers,
      entrada.parametros,
      acaoEfetiva === "inicial" ? "inicial" : "conferir",
    );
    if (acaoEfetiva === "adotar") {
      try {
        lstatSync(registro);
        throw new Error("Identidade já existe; revisar divergência sem sobrescrever.");
      } catch (erro) {
        if (erro.code !== "ENOENT") throw erro;
      }
      writeFileSync(registro, JSON.stringify(identidade) + "\n", { mode: 0o600, flag: "wx" });
    } else if (acaoEfetiva === "conferir") {
      compararRegistro(lerRegistro(registro), identidade, entrada, dirEstado, transicao);
    }
    process.stdout.write(identidade.trava);
  } catch (erro) {
    console.error(`[identidade] ${erro instanceof Error ? erro.message : "validação falhou"}`);
    process.exitCode = 1;
  }
}
