// Comando canal: mostra a preferência e a instalação, grava a preferência e aplica a troca.
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { gravarEstado, lerEstadoAtualizador } from "./estado.mjs";
import { DOCUMENTACAO, agoraPadrao, deduplicarAvisos, montarDocumento } from "./plano.mjs";
import {
  ErroInstalador,
  SCHEMA_ESTADO,
  aviso,
  erroObjeto,
  erroUso,
  erroValidacao,
} from "./json.mjs";
import { caminhosOperacao } from "./passos/contexto.mjs";
import * as passosCanal from "./passos/canal.mjs";
import { adquirirTravaPadrao } from "./executor.mjs";

const IMAGEM_PADRAO = "ghcr.io/eemtijca/frequenciapp";
const CANAIS = new Set(["release", "main"]);

function erroCanal(mensagem, dica) {
  return new ErroInstalador("E_CANAL", mensagem, {
    dica,
    documentacao: `${DOCUMENTACAO}#troca-de-canal`,
  });
}

function erroControlador(mensagem, dica) {
  return new ErroInstalador("E_CONTROLADOR", mensagem, {
    dica,
    documentacao: `${DOCUMENTACAO}#controlador`,
  });
}

function acao(descricao, comando, altera) {
  return { descricao, comando: comando ?? null, altera: Boolean(altera) };
}

function etapa(id, estado, inicio, fim, codigo, acoes, avisos, detalhes) {
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

function baseImagem(valor) {
  const semDigest = String(valor || IMAGEM_PADRAO).split("@")[0];
  const partes = semDigest.split("/");
  const ultima = partes[partes.length - 1] ?? "";
  if (!ultima.includes(":")) return semDigest;
  return semDigest.slice(0, semDigest.lastIndexOf(":"));
}

function criarLeitorBlob(appDir) {
  return (commit, arquivo) => {
    if (!/^[a-f0-9]{7,64}$/.test(commit)) return null;
    if (!/^[A-Za-z0-9._/-]+$/.test(arquivo)) return null;
    const resultado = spawnSync("git", ["-C", appDir, "show", `${commit}:${arquivo}`], {
      encoding: null,
      timeout: 30000,
      maxBuffer: 16 * 1024 * 1024,
      windowsHide: true,
    });
    if (resultado.status !== 0 || !resultado.stdout) return null;
    return resultado.stdout;
  };
}

function prepararContexto(deps, configuracao, raiz, estado, opcoes) {
  const diretorioFonte =
    estado?.origem?.diretorioFonte || configuracao.diretorioFonte || "/opt/frequenciapp";
  const caminhos = caminhosOperacao(
    raiz,
    { ...configuracao, diretorioFonte },
    Boolean(opcoes.booleanas.has("--modo-teste")),
  );
  return {
    deps,
    raiz,
    configuracao,
    caminhos,
    estado,
    opcoes,
    executar: deps.executar,
    agora: deps.agora ?? agoraPadrao,
    gravarArquivoAtomico: deps.gravarArquivoAtomico,
    lerBlob: deps.lerBlob ?? criarLeitorBlob(caminhos.appDir),
    ambienteBase: {
      PATH: `${path.dirname(process.execPath)}${path.delimiter}${process.env.PATH ?? ""}`,
      HOME: process.env.HOME ?? "/tmp",
      TMPDIR: process.env.TMPDIR ?? "/tmp",
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
    },
  };
}

function consultarDigestPadrao(executar, imagem) {
  const resultado = executar(
    "docker",
    ["image", "inspect", "--format", "{{json .RepoDigests}}", imagem],
    { timeout: 30000 },
  );
  if (resultado.status !== 0) return "";
  let lista;
  try {
    lista = JSON.parse(String(resultado.stdout ?? "[]"));
  } catch {
    return "";
  }
  if (!Array.isArray(lista)) return "";
  for (const referencia of lista) {
    const combinacao = /@(sha256:[a-f0-9]{64})$/.exec(String(referencia));
    if (combinacao) return combinacao[1];
  }
  return "";
}

function resolverDigest(deps, configuracao, imagem) {
  const informado = String(configuracao.imagemDigest ?? "");
  if (informado) return informado;
  try {
    const encontrado = deps.consultarDigest
      ? deps.consultarDigest(imagem)
      : consultarDigestPadrao(deps.executar, imagem);
    return typeof encontrado === "string" ? encontrado : "";
  } catch {
    return "";
  }
}

function validarImagem(alvo, exigirDigest) {
  if (!alvo.imagem || alvo.imagem.endsWith(":latest") || /\/latest$/.test(alvo.imagem)) {
    throw erroCanal(
      "A imagem alvo não é imutável.",
      "Use uma tag de release e um digest sha256 publicado no registro.",
    );
  }
  if (!exigirDigest) return;
  if (!/^sha256:[a-f0-9]{64}$/.test(alvo.digest)) {
    throw erroCanal(
      "A imagem alvo não tem um digest sha256 válido.",
      "Publique a imagem e informe --imagem-digest ou deixe o Docker informar o digest local.",
    );
  }
}

function montarAlvo(ctx, canal, opcoes) {
  const base = baseImagem(ctx.configuracao.imagem);
  const tagInformada = String(opcoes.valores.get("--tag") ?? "");
  let commit = "";
  let tag = "";
  let ref = "";
  let imagem = "";
  let imagemBackup = "";
  if (canal === "release") {
    if (!tagInformada) {
      throw erroUso("O canal release exige --tag vX.Y.Z.", {
        dica: "Informe a tag estável publicada e repita o comando.",
        documentacao: `${DOCUMENTACAO}#troca-de-canal`,
      });
    }
    tag = tagInformada;
    commit = passosCanal.resolverCommit(ctx, `refs/tags/${tag}`);
    if (!commit) {
      throw erroCanal(
        `A tag ${tag} não foi encontrada no repositório local.`,
        "Atualize as tags com git fetch --tags e repita a troca.",
      );
    }
    imagem = `${base}:${tag.replace(/^v/, "")}`;
    imagemBackup = `${base}-backup:${tag.replace(/^v/, "")}`;
    ref = tag;
  } else {
    if (tagInformada) {
      throw erroUso("O canal main não usa tag estável.", {
        dica: "Remova --tag ou escolha o canal release.",
        documentacao: `${DOCUMENTACAO}#troca-de-canal`,
      });
    }
    ref = String(opcoes.valores.get("--ref") ?? "main");
    commit = passosCanal.resolverCommit(ctx, ref);
    if (!commit) {
      throw erroCanal(
        `A referência ${ref} não foi encontrada no repositório local.`,
        "Confira a branch ou o commit e atualize as referências do Git.",
      );
    }
    tag = "";
    imagem = `${base}:main-${commit.slice(0, 12)}`;
    imagemBackup = `${base}-backup:main-${commit.slice(0, 12)}`;
  }
  return {
    canal,
    tag,
    ref,
    commit,
    imagem,
    imagemRef: imagem,
    imagemBackup,
    digest: "",
    permitirMigracoes: Boolean(opcoes.booleanos.get("--permitir-migracoes")),
  };
}

function commitDaTag(ctx, tag) {
  if (!tag) return "";
  return passosCanal.resolverCommit(ctx, `refs/tags/${tag}`);
}

function leituraDivergente(ctx, estado, estadoAtualizador) {
  if (!estado) return false;
  const informado = estadoAtualizador?.presente ? estadoAtualizador.estado : null;
  if (informado) {
    const canalDiferente = estado.canal !== informado.modo;
    const tagDiferente =
      estado.canal === "release" &&
      Boolean(estado.tag) &&
      Boolean(informado.ref) &&
      estado.tag !== informado.ref;
    const commitDiferente =
      Boolean(estado.commit) && Boolean(informado.commit) && estado.commit !== informado.commit;
    return canalDiferente || tagDiferente || commitDiferente;
  }
  if (estado.canal === "release" && estado.tag) {
    const commit = commitDaTag(ctx, estado.tag);
    return Boolean(commit && estado.commit && commit !== estado.commit);
  }
  return false;
}

function mostrarCanal(ctx, base) {
  const estado = ctx.estado;
  if (!estado) {
    throw erroValidacao("Nenhuma instalação registrada foi encontrada.", {
      dica: "Execute o aplicar do perfil antes de consultar o canal.",
      documentacao: `${DOCUMENTACAO}#estado-durável`,
    });
  }
  const estadoAtualizador = lerEstadoAtualizador({ raiz: ctx.raiz });
  const divergente = leituraDivergente(ctx, estado, estadoAtualizador);
  const preferencia = { canal: estado.canal, tag: estado.tag };
  const instalado = estadoAtualizador.estado
    ? {
        canal: estadoAtualizador.estado.modo,
        tag: estadoAtualizador.estado.ref,
        commit: estadoAtualizador.estado.commit,
        imagem: estadoAtualizador.estado.imagem,
        digest: estado.digest,
        atualizadoEm: estadoAtualizador.estado.atualizadoEm,
      }
    : {
        canal: estado.canal,
        tag: estado.tag,
        commit: estado.commit,
        imagem: estado.imagem,
        digest: estado.digest,
        atualizadoEm: estado.atualizadoEm,
      };
  const avisos = [...base.avisos];
  if (divergente) {
    avisos.push(
      aviso(
        "A_CANAL_DIVERGENTE",
        "A preferência de canal diverge da instalação em execução.",
        `${DOCUMENTACAO}#troca-de-canal`,
      ),
    );
  }
  if (estado.canal === "main") {
    avisos.push(
      aviso(
        "A_CANAL_MAIN",
        "A preferência é o canal main, considerado instável.",
        `${DOCUMENTACAO}#canal-release-e-main`,
      ),
    );
  }
  if (estadoAtualizador.erro) {
    avisos.push(
      aviso("A_ESTADO_ATUALIZADOR", estadoAtualizador.erro, `${DOCUMENTACAO}#estado-durável`),
    );
  }
  if (estado.controlador?.readocaoPendente) {
    avisos.push(
      aviso(
        "A_CONTROLADOR_READOCAO",
        "O controlador aguarda readoção depois da troca de canal.",
        `${DOCUMENTACAO}#controlador`,
      ),
    );
  }
  const detalhes = {
    schema: estado.schema ?? SCHEMA_ESTADO,
    migradorSha256: estado.migradorSha256,
    instaladoEm: estado.instaladoEm,
    atualizadoEm: estado.atualizadoEm,
    controlador: estado.controlador,
    preferencia,
    instalacao: instalado,
    divergente,
  };
  const agora = ctx.agora();
  return {
    documento: montarDocumento({
      comando: "canal mostrar",
      configuracao: { ...ctx.configuracao, canal: estado.canal, tag: estado.tag },
      estado,
      deteccao: base.deteccao,
      dryRun: false,
      etapas: [
        etapa(
          "canal",
          "concluida",
          agora,
          agora,
          null,
          [
            acao("Lê a preferência de canal do estado da instalação", null, false),
            acao("Lê a última atualização gravada pelo atualizar.sh", null, false),
            acao("Compara a preferência com a instalação em execução", null, false),
          ],
          [],
          detalhes,
        ),
      ],
      avisos,
      erros: [],
      proximos: divergente
        ? [
            "sudo ./instalar.sh canal definir release --tag vX.Y.Z --aplicar --sim",
            "sudo ./instalar.sh situacao --json",
          ]
        : ["sudo ./instalar.sh diagnosticar --json --nao-interativo"],
    }),
  };
}

function gravarPreferencia(ctx, deps, canal, tag, pendente) {
  const atual = ctx.estado;
  const proximo = { ...atual, canal, tag };
  if (pendente !== undefined) {
    proximo.controlador = { ...(atual.controlador ?? {}), readocaoPendente: pendente };
  }
  const mudou =
    atual.canal !== proximo.canal ||
    atual.tag !== proximo.tag ||
    atual.controlador?.readocaoPendente !== proximo.controlador?.readocaoPendente;
  if (!mudou) return { alterou: false, estado: proximo };
  (deps.gravarEstado ?? gravarEstado)(proximo, { caminho: ctx.caminhos.estado });
  ctx.estado = proximo;
  return { alterou: true, estado: proximo };
}

function validarArquivosDaInstalacao(ctx) {
  for (const [caminho, rotulo] of [
    [ctx.caminhos.appEnv, "app.env"],
    [ctx.caminhos.opsEnv, "ops.env"],
  ]) {
    try {
      const informacao = fs.lstatSync(caminho);
      if (informacao.isSymbolicLink() || !informacao.isFile()) {
        throw new Error("arquivo inválido");
      }
    } catch {
      throw erroValidacao(`O arquivo ${rotulo} da instalação não foi encontrado.`, {
        dica: "Execute o aplicar do perfil antes de trocar o canal.",
        documentacao: `${DOCUMENTACAO}#estado-durável`,
      });
    }
  }
}

function definirCanal(ctx, base, deps, opcoes, canal) {
  if (!CANAIS.has(canal)) {
    throw erroUso("O comando canal definir exige release ou main.", {
      dica: "Use canal definir release ou canal definir main.",
      documentacao: `${DOCUMENTACAO}#troca-de-canal`,
    });
  }
  if (opcoes.operandos.length > 3) {
    throw erroUso("O comando canal definir aceita apenas o canal como argumento.", {
      documentacao: `${DOCUMENTACAO}#troca-de-canal`,
    });
  }
  const aplicar = Boolean(opcoes.booleanas.has("--aplicar"));
  const planejar =
    Boolean(opcoes.booleanas.has("--planejar")) || Boolean(opcoes.booleanas.has("--simular"));
  if (aplicar && planejar) {
    throw erroUso("As opções --planejar e --aplicar são mutuamente exclusivas.", {
      documentacao: `${DOCUMENTACAO}#troca-de-canal`,
    });
  }
  if (canal === "main" && !opcoes.booleanos.get("--permitir-instavel")) {
    throw erroCanal(
      "O canal main exige confirmação explícita.",
      "Repita o comando com --permitir-instavel para usar o canal main.",
    );
  }
  const canalFlag = opcoes.origem.get("--canal") === "flag" ? opcoes.valores.get("--canal") : "";
  if (canalFlag && canalFlag !== canal) {
    throw erroUso("O canal do subcomando diverge da opção --canal.", {
      dica: "Informe o canal apenas no subcomando.",
      documentacao: `${DOCUMENTACAO}#troca-de-canal`,
    });
  }
  if (canal === "release" && !opcoes.valores.get("--tag")) {
    throw erroUso("O canal release exige --tag vX.Y.Z.", {
      dica: "Informe a tag estável publicada e repita o comando.",
      documentacao: `${DOCUMENTACAO}#troca-de-canal`,
    });
  }
  if (canal === "main" && opcoes.valores.get("--tag")) {
    throw erroUso("O canal main não usa tag estável.", {
      dica: "Remova --tag ou escolha o canal release.",
      documentacao: `${DOCUMENTACAO}#troca-de-canal`,
    });
  }
  if (aplicar && !opcoes.booleanos.get("--sim")) {
    throw erroUso("A troca aplicada exige confirmação explícita com --sim.", {
      dica: "Revise a preferência e repita com --aplicar --sim.",
      documentacao: `${DOCUMENTACAO}#troca-de-canal`,
    });
  }
  if (!ctx.estado) {
    throw erroValidacao("Nenhuma instalação registrada foi encontrada.", {
      dica: "Execute o aplicar do perfil antes de trocar o canal.",
      documentacao: `${DOCUMENTACAO}#estado-durável`,
    });
  }
  if (aplicar) validarArquivosDaInstalacao(ctx);

  const alvo = montarAlvo(ctx, canal, opcoes);
  const estadoAtualizador = lerEstadoAtualizador({ raiz: ctx.raiz });
  if (aplicar || opcoes.booleanos.get("--permitir-downgrade")) {
    if (estadoAtualizador.erro) {
      throw erroCanal("O estado do atualizador está incerto.", {
        dica: "Confira /var/lib/frequenciapp/estado.json antes de trocar o canal.",
        documentacao: `${DOCUMENTACAO}#estado-durável`,
      });
    }
    if (
      estadoAtualizador.estado?.commit &&
      ctx.estado.commit &&
      estadoAtualizador.estado.commit !== ctx.estado.commit
    ) {
      throw erroCanal("O estado da instalação diverge do estado do atualizador.", {
        dica: "Registre ou restaure o estado antes de trocar o canal.",
        documentacao: `${DOCUMENTACAO}#estado-durável`,
      });
    }
  }
  const commitAtual = passosCanal.resolverCommit(ctx, ctx.estado.commit);
  if (!commitAtual) {
    throw erroCanal(
      "O commit instalado não foi encontrado no repositório local.",
      "Confira o estado da instalação e o checkout antes de trocar o canal.",
    );
  }
  const relacao = passosCanal.classificarAncestralidade(ctx, commitAtual, alvo.commit);
  const downgrade = !["igual", "ascendente"].includes(relacao);
  const permitirDowngrade = Boolean(opcoes.booleanos.get("--permitir-downgrade"));
  if (downgrade && !permitirDowngrade) {
    throw erroCanal(
      relacao === "descendente"
        ? "O alvo escolhido é anterior ao commit instalado."
        : "O alvo não tem ancestralidade comprovada com o commit instalado.",
      "Use uma tag que contenha o commit atual ou autorize a descida com --permitir-downgrade.",
    );
  }
  if (downgrade && !opcoes.booleanos.get("--sim")) {
    throw erroUso("O downgrade exige confirmação explícita com --sim.", {
      dica: "Revise o backup e repita com --sim.",
      documentacao: `${DOCUMENTACAO}#downgrade`,
    });
  }
  if (downgrade) {
    const marcadores = passosCanal.lerMarcadoresIncerto(ctx);
    if (marcadores.estadoIncerto || marcadores.journalIncerto) {
      throw erroCanal("O downgrade foi recusado por estado ou journal incerto.", {
        dica: marcadores.motivos.join(" ") || "Revise o estado antes de repetir.",
        documentacao: `${DOCUMENTACAO}#downgrade`,
      });
    }
    if (!aplicar) {
      passosCanal.conferirBackupExistente(ctx);
    }
  }
  if (aplicar || downgrade) {
    alvo.digest = resolverDigest(deps, ctx.configuracao, alvo.imagemRef);
    validarImagem(alvo, true);
  } else {
    validarImagem(alvo, false);
  }

  const migracoes = passosCanal.compararMigracoes(ctx, commitAtual, alvo.commit);
  if (!migracoes.compativel) {
    throw erroCanal(
      `O alvo não contém as migrações instaladas: ${migracoes.removidas.join(", ")}.`,
      "Escolha um release que contenha todas as migrações atuais ou restaure o backup anterior.",
    );
  }
  if (migracoes.novas.length && aplicar && !alvo.permitirMigracoes) {
    throw erroCanal(
      `O alvo tem migrações novas: ${migracoes.novas.join(", ")}.`,
      "Revise as migrações e repita com --permitir-migracoes.",
    );
  }

  const migradorAlvo = passosCanal.hashMigradorCommit(ctx, alvo.commit);
  if (aplicar && !migradorAlvo) {
    throw erroCanal("O alvo não contém o migrador da aplicação.", {
      dica: "Escolha um release que contenha docker/app/migrar.mjs.",
      documentacao: `${DOCUMENTACAO}#troca-de-canal`,
    });
  }
  const controlador = ctx.estado.controlador ?? {
    adotado: false,
    migradorSha256: null,
    readocaoPendente: false,
  };
  if (controlador.adotado && !migradorAlvo) {
    throw erroCanal("O alvo não contém o migrador exigido pelo controlador.", {
      dica: "Escolha um release que contenha docker/app/migrar.mjs.",
      documentacao: `${DOCUMENTACAO}#controlador`,
    });
  }
  const hashDivergente =
    Boolean(controlador.adotado) && controlador.migradorSha256 !== migradorAlvo;
  const precisaReadocao =
    Boolean(controlador.adotado) && (hashDivergente || controlador.readocaoPendente);

  const acoes = [];
  const avisos = [...base.avisos];
  if (canal === "main") {
    avisos.push(
      aviso(
        "A_CANAL_MAIN",
        "O canal main é instável e não é recomendado para produção.",
        `${DOCUMENTACAO}#canal-release-e-main`,
      ),
    );
  }
  if (migracoes.novas.length) {
    avisos.push(
      aviso(
        "A_MIGRACOES_NOVAS",
        `O alvo contém migrações novas: ${migracoes.novas.join(", ")}.`,
        `${DOCUMENTACAO}#migrações-incompatíveis`,
      ),
    );
  }
  if (precisaReadocao && planejar) {
    avisos.push(
      aviso(
        "A_CONTROLADOR_READOCAO",
        "A troca exigirá readoção do controlador por causa do migrador.",
        `${DOCUMENTACAO}#controlador`,
      ),
    );
  }
  acoes.push(
    acao("Resolve a tag, o commit, a imagem e o digest do alvo", null, false),
    acao("Confere a ancestralidade e as migrações do alvo", null, false),
  );

  const resultadoPreferencia = gravarPreferencia(ctx, deps, canal, alvo.tag, undefined);
  if (resultadoPreferencia.alterou) {
    acoes.push(acao("Grava a preferência de canal no estado", null, true));
  } else {
    acoes.push(acao("A preferência de canal já está registrada", null, false));
  }

  if (planejar) {
    acoes.push(acao("Executa backup confirmado antes da atualização", null, true));
    acoes.push(acao("Delega a atualização ao atualizar.sh no modo do canal", null, true));
    acoes.push(acao("Atualiza o estado, o ops.env e confere o controlador", null, true));
    if (precisaReadocao) {
      acoes.push(acao("Marca a readoção do controlador como pendente", null, true));
    }
    const agora = ctx.agora();
    return {
      documento: montarDocumento({
        comando: "canal definir",
        configuracao: {
          ...ctx.configuracao,
          canal,
          tag: alvo.tag,
          commit: ctx.estado.commit,
          imagem: alvo.imagem,
          digest: alvo.digest,
        },
        estado: ctx.estado,
        deteccao: base.deteccao,
        dryRun: true,
        etapas: [
          etapa("canal", "concluida", agora, agora, null, acoes, [], {
            preferencia: { canal, tag: alvo.tag },
            alvo: {
              canal: alvo.canal,
              tag: alvo.tag,
              ref: alvo.ref,
              commit: alvo.commit,
              imagem: alvo.imagem,
              digest: alvo.digest,
            },
            migracoes,
            migradorSha256: migradorAlvo,
            controlador: { ...controlador, readocaoPendente: precisaReadocao },
            backup: null,
          }),
        ],
        avisos: deduplicarAvisos([
          ...avisos,
          aviso(
            "A_PREFERENCIA",
            "A preferência foi gravada sem alterar a instalação em execução.",
            `${DOCUMENTACAO}#troca-de-canal`,
          ),
        ]),
        erros: [],
        proximos: [
          `sudo ./instalar.sh canal definir ${canal}${
            alvo.tag ? ` --tag ${alvo.tag}` : ""
          } --aplicar --sim`,
          "sudo ./instalar.sh situacao --json",
        ],
      }),
    };
  }

  if (!aplicar) {
    if (precisaReadocao && controlador.adotado) {
      gravarPreferencia(ctx, deps, canal, alvo.tag, true);
      throw erroControlador(
        "O canal foi registrado, mas o controlador exige readoção antes do novo migrador.",
        "Revise o journal e os pins e repita com aplicar --perfil controlador.",
      );
    }
    acoes.push(acao("A instalação em execução permanece na versão anterior", null, false));
    const agora = ctx.agora();
    return {
      documento: montarDocumento({
        comando: "canal definir",
        configuracao: {
          ...ctx.configuracao,
          canal,
          tag: alvo.tag,
          commit: ctx.estado.commit,
          imagem: ctx.estado.imagem,
          digest: ctx.estado.digest,
        },
        estado: ctx.estado,
        deteccao: base.deteccao,
        dryRun: false,
        etapas: [
          etapa("canal", "concluida", agora, agora, null, acoes, [], {
            preferencia: { canal, tag: alvo.tag },
            alvo: {
              canal: alvo.canal,
              tag: alvo.tag,
              ref: alvo.ref,
              commit: alvo.commit,
              imagem: alvo.imagem,
              digest: alvo.digest,
            },
            migracoes,
            migradorSha256: migradorAlvo,
            controlador,
            backup: null,
          }),
        ],
        avisos: deduplicarAvisos([
          ...avisos,
          aviso(
            "A_PREFERENCIA",
            "A preferência foi gravada sem alterar a instalação em execução.",
            `${DOCUMENTACAO}#troca-de-canal`,
          ),
        ]),
        erros: [],
        proximos: [
          `sudo ./instalar.sh canal definir ${canal}${
            alvo.tag ? ` --tag ${alvo.tag}` : ""
          } --aplicar --sim`,
          "sudo ./instalar.sh situacao --json",
        ],
      }),
    };
  }

  const jaAplicado =
    ctx.estado.canal === alvo.canal &&
    ctx.estado.tag === alvo.tag &&
    ctx.estado.commit === alvo.commit &&
    ctx.estado.imagem === alvo.imagem &&
    ctx.estado.digest === alvo.digest;
  if (jaAplicado) {
    if (precisaReadocao) {
      throw erroControlador(
        "O controlador aguarda readoção depois da troca de canal.",
        "Revise o journal e os pins e repita com aplicar --perfil controlador.",
      );
    }
    acoes.push(acao("A instalação já está no canal e no commit escolhidos", null, false));
    const agora = ctx.agora();
    return {
      documento: montarDocumento({
        comando: "canal definir",
        configuracao: {
          ...ctx.configuracao,
          canal,
          tag: alvo.tag,
          commit: alvo.commit,
          imagem: alvo.imagem,
          digest: alvo.digest,
        },
        estado: ctx.estado,
        deteccao: base.deteccao,
        dryRun: false,
        etapas: [
          etapa("canal", "concluida", agora, agora, null, acoes, [], {
            preferencia: { canal, tag: alvo.tag },
            alvo,
            migracoes,
            migradorSha256: migradorAlvo,
            controlador,
            backup: null,
          }),
        ],
        avisos: deduplicarAvisos([
          ...avisos,
          aviso(
            "A_SEM_MUDANCAS",
            "A segunda execução não alterou o canal nem a instalação.",
            `${DOCUMENTACAO}#idempotência`,
          ),
        ]),
        erros: [],
        proximos: ["sudo ./instalar.sh situacao --json"],
      }),
    };
  }

  const adquirirTrava =
    deps.adquirirTrava ??
    ((diretorio) => adquirirTravaPadrao(path.join(diretorio, "instalador.lock")));
  const trava = adquirirTrava(ctx.caminhos.lockDir);
  try {
    acoes.push(
      acao("Executa um backup novo e confirma o recibo", "scripts/servidor/backup-banco.sh", true),
    );
    const backup = passosCanal.executarBackupConfirmado(ctx);
    acoes.push(acao("Delega a atualização ao atualizar.sh no modo do canal", null, true));
    const estadoAtualizador = passosCanal.delegarAtualizacao(ctx, alvo);
    acoes.push(acao("Atualiza as chaves de atualização do ops.env", null, true));
    passosCanal.atualizarOpsEnv(ctx, alvo);
    const proximo = {
      ...ctx.estado,
      canal: alvo.canal,
      tag: alvo.tag,
      commit: alvo.commit,
      imagem: alvo.imagem,
      digest: alvo.digest,
      migradorSha256: migradorAlvo ?? ctx.estado.migradorSha256 ?? null,
      atualizadoEm: ctx.agora(),
    };
    proximo.controlador = {
      ...controlador,
      readocaoPendente: Boolean(
        controlador.adotado && (hashDivergente || controlador.readocaoPendente),
      ),
    };
    (deps.gravarEstado ?? gravarEstado)(proximo, { caminho: ctx.caminhos.estado });
    ctx.estado = proximo;
    acoes.push(acao("Atualiza o estado da instalação", null, true));
    if (proximo.controlador.readocaoPendente) {
      acoes.push(acao("Marca a readoção do controlador como pendente", null, true));
      throw erroControlador(
        "A troca foi aplicada, mas o controlador exige readoção pelo novo migrador.",
        "Revise o journal e os pins e repita com aplicar --perfil controlador.",
      );
    }
    const agora = ctx.agora();
    return {
      documento: montarDocumento({
        comando: "canal definir",
        configuracao: {
          ...ctx.configuracao,
          canal: alvo.canal,
          tag: alvo.tag,
          commit: alvo.commit,
          imagem: alvo.imagem,
          digest: alvo.digest,
        },
        estado: proximo,
        deteccao: base.deteccao,
        dryRun: false,
        etapas: [
          etapa("canal", "concluida", agora, agora, null, acoes, [], {
            preferencia: { canal, tag: alvo.tag },
            alvo,
            migracoes,
            migradorSha256: migradorAlvo,
            controlador: proximo.controlador,
            backup,
            estadoAtualizador,
          }),
        ],
        avisos: deduplicarAvisos(avisos),
        erros: [],
        proximos: ["sudo ./instalar.sh situacao --json"],
      }),
    };
  } finally {
    if (trava) trava.liberar();
  }
}

// Executa canal mostrar ou canal definir e devolve o documento do contrato.
export function executarCanal(opcoes, deps, dados) {
  const comando = `canal ${opcoes.operandos[1]}`;
  const raiz = dados.raiz ?? "/";
  const configuracao = dados.configuracao ?? {};
  const deteccao = dados.deteccao;
  const estadoResultado = dados.estadoResultado ?? {
    presente: false,
    estado: null,
    avisos: [],
    erro: null,
  };
  const ctx = prepararContexto(deps, configuracao, raiz, estadoResultado.estado, opcoes);
  const base = {
    deteccao,
    avisos: [...(dados.avisosConfig ?? []), ...(estadoResultado.avisos ?? [])],
  };
  try {
    if (estadoResultado.erro) {
      throw estadoResultado.erro;
    }
    if (comando === "canal mostrar") {
      if (opcoes.operandos.length > 2) {
        throw erroUso("O comando canal mostrar não aceita argumentos posicionais.", {
          documentacao: `${DOCUMENTACAO}#troca-de-canal`,
        });
      }
      return mostrarCanal(ctx, base).documento;
    }
    const canal = opcoes.operandos[2];
    return definirCanal(ctx, base, deps, opcoes, canal).documento;
  } catch (erro) {
    if (!(erro instanceof ErroInstalador)) throw erro;
    const estado = ctx.estado;
    const agora = ctx.agora();
    return montarDocumento({
      comando,
      configuracao: {
        ...configuracao,
        canal: estado?.canal ?? configuracao.canal,
        tag: estado?.tag ?? configuracao.tag,
      },
      estado,
      deteccao,
      dryRun: Boolean(opcoes.booleanas.has("--planejar") || opcoes.booleanas.has("--simular")),
      etapas: [
        etapa("canal", "falhou", agora, agora, erro.codigo, [], [], {
          codigo: erro.codigo,
        }),
      ],
      avisos: base.avisos,
      erros: [erroObjeto(erro)],
      proximos:
        erro.codigo === "E_CONTROLADOR"
          ? [
              "sudo ./instalar.sh aplicar --perfil controlador --sim",
              "sudo ./instalar.sh canal mostrar --json",
            ]
          : [
              "sudo ./instalar.sh canal mostrar --json",
              "sudo ./instalar.sh diagnosticar --json --nao-interativo",
            ],
    });
  }
}
