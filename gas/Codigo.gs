/**
 * FrequenciApp: ponte conservadora entre o aplicativo e a planilha.
 *
 * Ações: ping, estrutura, ler, escrever, aplicar, criarAba, organizarAba, removerAba,
 * listarCopias, restaurarCopia, listarAbasBackup e removerAbasBackup. Toda chamada exige o token guardado em
 * Script Properties (FREQUENCIAPP_TOKEN). Nenhuma ação apaga dado que a
 * integração não tenha criado, e célula com fórmula nunca é sobrescrita.
 */

var VERSAO = 7;
var PROP_TOKEN = "FREQUENCIAPP_TOKEN";
var PROP_PLANILHA = "PLANILHA_ID";
var MAX_LER_CELULAS = 20000;
var MAX_ESCREVER_CELULAS = 5000;
var MAX_APLICAR_OPERACOES = 10000;
var MAX_INTERVALOS = 200;
var MAX_AMOSTRA_LINHAS = 12;
var MAX_AMOSTRA_COLUNAS = 60;
var MAX_DETALHE = 300;
var COPIA_PREFIXO = "_frequenciapp_backup_";
var MARCADOR_LINHA = "frequenciapp.linha";
var MARCADOR_COLUNA = "frequenciapp.coluna";
var MARCADOR_ABA = "frequenciapp.aba";
var MARCADOR_COPIA = "frequenciapp.copia";
// Código do aluno na linha: o id do aplicativo, para achar o aluno mesmo que
// o nome mude, se repita ou a linha mude de lugar.
var MARCADOR_ALUNO = "frequenciapp.aluno";
var ID_ALUNO = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** Carimbo da cópia: data, hora, milissegundos opcionais e sufixo de desempate. */
var CARIMBO_COPIA = /^(\d{8})-(\d{6})(?:-\d{3})?(?:-[a-z0-9]+)?$/;
var VALOR_MARCADOR = "1";

/** Ações que alteram a planilha: exceção no meio pode ter aplicado parte. */
var ACOES_QUE_ALTERAM = [
  "escrever",
  "aplicar",
  "restaurarCopia",
  "criarAba",
  "organizarAba",
  "removerAbasBackup",
];

function doPost(e) {
  var corpo = null;
  try {
    if (!e || !e.postData || !e.postData.contents) {
      return responder({ ok: false, erro: "Corpo vazio." });
    }
    // A mensagem de erro do JSON.parse cita o corpo, que traz o token.
    try {
      corpo = JSON.parse(e.postData.contents);
    } catch (erroJson) {
      return responder({ ok: false, erro: "Corpo inválido." });
    }
    if (!corpo || !tokenConfere(corpo.token)) {
      return responder({ ok: false, erro: "Não autorizado." });
    }
    var trava = LockService.getScriptLock();
    trava.waitLock(30000);
    try {
      return responder(rotear(corpo));
    } finally {
      trava.releaseLock();
    }
  } catch (erro) {
    console.error(ocultarSegredos(String((erro && erro.stack) || erro)));
    var resposta = { ok: false, erro: mensagemDeErro(erro) };
    var detalhe = detalheDoErro(erro);
    if (detalhe) resposta.detalhe = detalhe;
    if (corpo && ACOES_QUE_ALTERAM.indexOf(corpo.acao) >= 0) resposta.parcial = true;
    return responder(resposta);
  }
}

function doGet() {
  return responder({ ok: false, erro: "Use POST." });
}

function rotear(corpo) {
  switch (corpo.acao) {
    case "ping":
      return acaoPing();
    case "estrutura":
      return acaoEstrutura(corpo);
    case "ler":
      return acaoLer(corpo);
    case "escrever":
      return acaoEscrever(corpo);
    case "aplicar":
      return acaoAplicar(corpo);
    case "criarAba":
      return acaoCriarAba(corpo);
    case "organizarAba":
      return acaoOrganizarAba(corpo);
    case "removerAba":
      return acaoRemoverAba(corpo);
    case "listarCopias":
      return acaoListarCopias(corpo);
    case "listarAbasBackup":
      return acaoListarAbasBackup();
    case "removerAbasBackup":
      return acaoRemoverAbasBackup(corpo);
    case "restaurarCopia":
      return acaoRestaurarCopia(corpo);
    default:
      return { ok: false, erro: "Ação desconhecida." };
  }
}

// ------------------------------------------------------------- identificação

function acaoPing() {
  var planilha = abrirPlanilha();
  return {
    ok: true,
    versao: VERSAO,
    dados: {
      versao: VERSAO,
      planilha: {
        nome: planilha.getName(),
        id: planilha.getId(),
        url: planilha.getUrl(),
        fuso: planilha.getSpreadsheetTimeZone(),
      },
      abas: planilha.getSheets().map(function (aba) {
        return {
          nome: aba.getName(),
          linhas: aba.getLastRow(),
          colunas: aba.getLastColumn(),
          oculta: aba.isSheetHidden(),
        };
      }),
    },
  };
}

/** Estrutura das abas; com `aba`, só a daquela aba, para reconferir depois de um envio. */
function acaoEstrutura(corpo) {
  var planilha = abrirPlanilha();
  var nomeAba = corpo && corpo.aba ? String(corpo.aba) : "";
  return {
    ok: true,
    versao: VERSAO,
    dados: {
      planilha: {
        nome: planilha.getName(),
        id: planilha.getId(),
        url: planilha.getUrl(),
        fuso: planilha.getSpreadsheetTimeZone(),
        versao: VERSAO,
      },
      abas: (nomeAba ? [resolverAba(nomeAba)] : planilha.getSheets()).map(function (aba) {
        return {
          nome: aba.getName(),
          oculta: aba.isSheetHidden(),
          criada: temMarcador(aba, MARCADOR_ABA),
          linhas: aba.getLastRow(),
          colunas: aba.getLastColumn(),
          congeladasLinhas: aba.getFrozenRows(),
          congeladasColunas: aba.getFrozenColumns(),
          mesclagens: mesclagensDaAba(aba),
          amostra: amostraDaAba(aba, corpo.apresentacao ? 400 : MAX_AMOSTRA_COLUNAS),
        };
      }),
    },
  };
}

function amostraDaAba(aba, limiteColunas) {
  var linhas = Math.min(Math.max(aba.getLastRow(), 1), MAX_AMOSTRA_LINHAS);
  var colunas = Math.min(Math.max(aba.getLastColumn(), 1), limiteColunas || MAX_AMOSTRA_COLUNAS);
  return aba.getRange(1, 1, linhas, colunas).getDisplayValues();
}

/**
 * Mesclagens da aba. O método vive no intervalo, não na aba, e a leitura
 * precisa cobrir a aba inteira para a assinatura bater com a do aplicativo.
 */
function mesclagensDaAba(aba) {
  var linhas = Math.max(aba.getMaxRows(), 1);
  var colunas = Math.max(aba.getMaxColumns(), 1);
  return aba
    .getRange(1, 1, linhas, colunas)
    .getMergedRanges()
    .map(function (faixa) {
      return faixa.getA1Notation();
    });
}

// ------------------------------------------------------------------- leitura

/**
 * Lê valores e fórmulas. Com `blocos`, lê só as faixas de colunas pedidas
 * (aluno, dias do período, total), em vez da aba inteira. Devolve também a
 * última linha com conteúdo, a assinatura atual do cabeçalho e os códigos de
 * aluno por linha, para o aplicativo planejar sem reler a estrutura.
 */
function acaoLer(corpo) {
  var inicio = Date.now();
  var aba = resolverAba(corpo.aba);
  var linhaInicial = numeroPositivo(corpo.linhaInicial, 1);
  var colunaInicial = numeroPositivo(corpo.colunaInicial, 1);
  var ultimaLinha = aba.getLastRow();
  var linhas = numeroPositivo(corpo.linhas, ultimaLinha);
  var colunas = numeroPositivo(corpo.colunas, aba.getLastColumn());
  if (linhaInicial > aba.getMaxRows() || colunaInicial > aba.getMaxColumns()) {
    return { ok: false, erro: "Intervalo fora da aba." };
  }
  linhas = Math.min(linhas, aba.getMaxRows() - linhaInicial + 1);
  var pedidos = Array.isArray(corpo.blocos) && corpo.blocos.length > 0 ? corpo.blocos : null;
  var faixas = pedidos
    ? pedidos.map(function (bloco) {
        return {
          coluna: numeroPositivo(bloco.coluna, 1),
          colunas: numeroPositivo(bloco.colunas, 1),
        };
      })
    : [{ coluna: colunaInicial, colunas: colunas }];
  var celulas = 0;
  for (var f = 0; f < faixas.length; f += 1) {
    if (faixas[f].coluna > aba.getMaxColumns())
      return { ok: false, erro: "Intervalo fora da aba." };
    faixas[f].colunas = Math.min(faixas[f].colunas, aba.getMaxColumns() - faixas[f].coluna + 1);
    celulas += linhas * faixas[f].colunas;
  }
  if (celulas > MAX_LER_CELULAS) {
    return { ok: false, erro: "Intervalo grande demais para uma leitura." };
  }
  var lidos = faixas.map(function (faixa) {
    var intervalo = aba.getRange(linhaInicial, faixa.coluna, linhas, faixa.colunas);
    return {
      coluna: faixa.coluna,
      colunas: faixa.colunas,
      valores: intervalo.getDisplayValues(),
      formula: intervalo.getFormulas().map(function (linha) {
        return linha.map(function (valor) {
          return valor !== "";
        });
      }),
    };
  });
  var dados = {
    aba: aba.getName(),
    linhaInicial: linhaInicial,
    colunaInicial: lidos[0].coluna,
    linhas: linhas,
    colunas: lidos[0].colunas,
    valores: lidos[0].valores,
    formula: lidos[0].formula,
    ultimaLinha: ultimaLinha,
    linhasCriadas: marcadores(aba, MARCADOR_LINHA),
    colunasCriadas: marcadores(aba, MARCADOR_COLUNA),
    alunosDasLinhas: alunosDasLinhas(aba),
  };
  if (pedidos) dados.blocos = lidos;
  if (corpo.cabecalhoLinha) {
    dados.assinatura = assinaturaDaAba(aba, numeroPositivo(corpo.cabecalhoLinha, 1));
  }
  dados.tempos = { ler: Date.now() - inicio };
  console.log(JSON.stringify({ acao: "ler", aba: aba.getName(), tempos: dados.tempos }));
  return { ok: true, versao: VERSAO, dados: dados };
}

// ------------------------------------------------------------ escrita segura

function acaoEscrever(corpo) {
  var aba = resolverAba(corpo.aba);
  var drift = conferirAssinatura(aba, corpo);
  if (drift) return drift;
  var intervalos = corpo.intervalos || [];
  if (intervalos.length > MAX_INTERVALOS) {
    return { ok: false, erro: "Intervalos demais em uma chamada." };
  }
  var contagem = { aplicadas: 0, puladasOcupadas: 0, puladasFormula: 0 };
  var restantes = MAX_ESCREVER_CELULAS;
  for (var i = 0; i < intervalos.length; i += 1) {
    var item = intervalos[i];
    var linhas = item.valores || [];
    if (!linhas.length || !linhas[0]) continue;
    var largura = linhas[0].length;
    var altura = linhas.length;
    if (largura * altura > restantes) {
      return { ok: false, erro: "Células demais em uma chamada." };
    }
    restantes -= largura * altura;
    var faixa = aba.getRange(item.linha, item.coluna, altura, largura);
    var atuais = faixa.getValues();
    var formulas = faixa.getFormulas();
    for (var l = 0; l < altura; l += 1) {
      // Grava só trechos contíguos de células livres. Regravar célula ocupada
      // apagaria fórmula e deixaria o Sheets reinterpretar texto.
      var inicio = -1;
      for (var c = 0; c <= largura; c += 1) {
        var livre = false;
        if (c < largura) {
          if (formulas[l][c] !== "") {
            contagem.puladasFormula += 1;
          } else if (limpar(atuais[l][c]) !== "") {
            contagem.puladasOcupadas += 1;
          } else {
            livre = true;
            contagem.aplicadas += 1;
          }
        }
        if (livre && inicio < 0) inicio = c;
        if (!livre && inicio >= 0) {
          aba
            .getRange(item.linha + l, item.coluna + inicio, 1, c - inicio)
            .setValues([trecho(linhas[l], inicio, c)]);
          inicio = -1;
        }
      }
    }
  }
  SpreadsheetApp.flush();
  return { ok: true, versao: VERSAO, dados: contagem };
}

/** Valores de um trecho da linha; posição ausente vira texto vazio. */
function trecho(linha, inicio, fim) {
  var saida = [];
  for (var i = inicio; i < fim; i += 1) {
    var valor = linha ? linha[i] : "";
    saida.push(valor === undefined || valor === null ? "" : valor);
  }
  return saida;
}

/**
 * Aplica um plano do modo completo. Operações destrutivas exigem o modo
 * declarado. Não são criadas abas de backup dentro da planilha.
 */
function acaoAplicar(corpo) {
  var aba = resolverAba(corpo.aba);
  var drift = conferirAssinatura(aba, corpo);
  if (drift) return drift;
  var operacoes = corpo.operacoes || [];
  if (operacoes.length > MAX_APLICAR_OPERACOES) {
    return { ok: false, erro: "Operações demais em uma chamada." };
  }
  if (temOperacaoDestrutiva(operacoes)) {
    if (corpo.modoCompleto !== true) {
      return { ok: false, erro: "O modo completo não está ativo." };
    }
  }
  var contagem = {
    preenchidas: 0,
    substituidas: 0,
    limpas: 0,
    removidasLinhas: 0,
    removidasColunas: 0,
    colunasCriadas: 0,
    linhasCriadas: 0,
    puladasOcupadas: 0,
    puladasFormula: 0,
    vinculadas: 0,
    puladasVinculo: 0,
  };
  var tempos = {};
  var marcar = function (etapa, inicio) {
    tempos[etapa] = (tempos[etapa] || 0) + (Date.now() - inicio);
  };
  for (var i = 0; i < operacoes.length; i += 1) {
    var operacao = operacoes[i];
    var resultado;
    var inicio = Date.now();
    if (operacao.tipo === "preencher") {
      // Preenchimentos seguidos vão juntos: uma leitura e uma escrita por trecho.
      var lote = [operacao];
      while (i + 1 < operacoes.length && operacoes[i + 1].tipo === "preencher") {
        i += 1;
        lote.push(operacoes[i]);
      }
      aplicarPreencherLote(aba, lote, contagem);
      marcar("preencher", inicio);
      continue;
    }
    switch (operacao.tipo) {
      case "substituir":
        resultado = aplicarSubstituir(aba, operacao, contagem);
        break;
      case "limpar":
        resultado = aplicarLimpar(aba, operacao, contagem);
        break;
      case "inserirColunas":
        resultado = aplicarInserirColunas(aba, operacao, contagem);
        break;
      case "criarLinhas":
        resultado = aplicarCriarLinhas(aba, operacao, contagem);
        break;
      case "vincularLinhas":
        resultado = aplicarVincularLinhas(aba, operacao, contagem);
        break;
      case "removerColunas":
        resultado = aplicarRemoverColunas(aba, operacao, contagem);
        break;
      case "removerLinhas":
        resultado = aplicarRemoverLinhas(aba, operacao, contagem);
        break;
      default:
        return { ok: false, erro: "Operação desconhecida." };
    }
    marcar(operacao.tipo, inicio);
    if (resultado) return resultado;
  }
  var inicioFlush = Date.now();
  SpreadsheetApp.flush();
  marcar("gravar", inicioFlush);
  contagem.tempos = tempos;
  console.log(JSON.stringify({ acao: "aplicar", aba: aba.getName(), tempos: tempos }));
  return { ok: true, versao: VERSAO, dados: contagem };
}

/**
 * Preenche várias células de uma vez: por coluna, lê valores e fórmulas do
 * trecho em uma chamada e grava cada sequência de linhas livres com um só
 * setValues. Célula com fórmula ou já ocupada é pulada, como no preencher.
 */
function aplicarPreencherLote(aba, operacoes, contagem) {
  var porColuna = {};
  for (var i = 0; i < operacoes.length; i += 1) {
    var chave = String(operacoes[i].coluna);
    (porColuna[chave] = porColuna[chave] || []).push(operacoes[i]);
  }
  Object.keys(porColuna).forEach(function (chave) {
    var coluna = Number(chave);
    var lista = porColuna[chave].slice().sort(function (a, b) {
      return a.linha - b.linha;
    });
    var primeira = lista[0].linha;
    var altura = lista[lista.length - 1].linha - primeira + 1;
    var faixa = aba.getRange(primeira, coluna, altura, 1);
    var valores = faixa.getValues();
    var formulas = faixa.getFormulas();
    var trecho = [];
    var gravarTrecho = function () {
      if (trecho.length === 0) return;
      aba.getRange(trecho[0].linha, coluna, trecho.length, 1).setValues(
        trecho.map(function (item) {
          return [item.valor];
        }),
      );
      contagem.preenchidas += trecho.length;
      trecho = [];
    };
    for (var j = 0; j < lista.length; j += 1) {
      var item = lista[j];
      var indice = item.linha - primeira;
      var anterior = trecho.length ? trecho[trecho.length - 1].linha : null;
      if (anterior !== null && item.linha !== anterior + 1) gravarTrecho();
      if (anterior !== null && item.linha === anterior) continue;
      if (formulas[indice][0] !== "") {
        gravarTrecho();
        contagem.puladasFormula += 1;
      } else if (String(valores[indice][0]).trim() !== "") {
        gravarTrecho();
        contagem.puladasOcupadas += 1;
      } else {
        trecho.push(item);
      }
    }
    gravarTrecho();
  });
}

function aplicarPreencher(aba, operacao, contagem) {
  var celula = aba.getRange(operacao.linha, operacao.coluna);
  if (celula.getFormula() !== "") {
    contagem.puladasFormula += 1;
    return null;
  }
  if (String(celula.getValue()).trim() !== "") {
    contagem.puladasOcupadas += 1;
    return null;
  }
  celula.setValue(operacao.valor);
  contagem.preenchidas += 1;
  return null;
}

function aplicarSubstituir(aba, operacao, contagem) {
  var celula = aba.getRange(operacao.linha, operacao.coluna);
  if (celula.getFormula() !== "") {
    contagem.puladasFormula += 1;
    return null;
  }
  if (limpar(celula.getValue()) === "") {
    celula.setValue(operacao.valor);
    contagem.preenchidas += 1;
    return null;
  }
  if (!conferePrevio(celula, operacao)) {
    contagem.puladasOcupadas += 1;
    return null;
  }
  celula.setValue(operacao.valor);
  contagem.substituidas += 1;
  return null;
}

function aplicarLimpar(aba, operacao, contagem) {
  var celula = aba.getRange(operacao.linha, operacao.coluna);
  if (celula.getFormula() !== "") {
    contagem.puladasFormula += 1;
    return null;
  }
  if (!conferePrevio(celula, operacao)) {
    contagem.puladasOcupadas += 1;
    return null;
  }
  celula.clearContent();
  contagem.limpas += 1;
  return null;
}

/**
 * O anterior do plano vem do texto exibido (getDisplayValues na leitura).
 * Comparar com getValue falharia em data, número formatado e porcentagem.
 */
function conferePrevio(celula, operacao) {
  if (operacao.anterior === undefined || operacao.anterior === null) return true;
  return limpar(celula.getDisplayValue()) === limpar(operacao.anterior);
}

/**
 * Insere colunas com rótulo no cabeçalho. Sem posição, entram depois da
 * última coluna com conteúdo, lida antes da inserção: colunas novas nascem
 * vazias e o getLastColumn as ignora.
 */
function aplicarInserirColunas(aba, operacao, contagem) {
  var rotulos = operacao.rotulos || [];
  if (!rotulos.length) return null;
  var antesDe = operacao.antesDe;
  if (antesDe === null || antesDe === undefined) {
    var ultima = aba.getLastColumn();
    if (ultima < 1) {
      aba.insertColumnsBefore(1, rotulos.length);
      antesDe = 1;
    } else {
      aba.insertColumnsAfter(ultima, rotulos.length);
      antesDe = ultima + 1;
    }
  } else {
    aba.insertColumnsBefore(antesDe, rotulos.length);
  }
  for (var i = 0; i < rotulos.length; i += 1) {
    marcarColuna(aba, antesDe + i);
  }
  var faixa = aba.getRange(operacao.cabecalhoLinha || 1, antesDe, 1, rotulos.length);
  faixa.setValues([rotulos]);
  rotulos.forEach(function (rotulo, indice) {
    if (!/^\d{1,2}\/\d{1,2}(\/\d{2,4})?$/.test(String(rotulo).trim())) return;
    aba.setColumnWidth(antesDe + indice, String(rotulo).split("/").length === 3 ? 110 : 68);
    aba
      .getRange(
        operacao.cabecalhoLinha || 1,
        antesDe + indice,
        aba.getMaxRows() - (operacao.cabecalhoLinha || 1) + 1,
        1,
      )
      .setHorizontalAlignment("center")
      .setWrap(true);
  });
  contagem.colunasCriadas += rotulos.length;
  return null;
}

/**
 * Cria linhas novas. A linha inteira precisa estar vazia e sem fórmula, para
 * o marcador nunca autorizar a remoção de dado manual em outra coluna. A
 * marcação vem antes da gravação: se falhar, nada fica gravado sem marcador.
 */
function aplicarCriarLinhas(aba, operacao, contagem) {
  var itens = operacao.itens || [];
  for (var i = 0; i < itens.length; i += 1) {
    var item = itens[i];
    var celulas = item.celulas || [];
    if (!linhaLivre(aba, item.linha, celulas)) {
      contagem.puladasOcupadas += 1;
      continue;
    }
    marcarLinha(aba, item.linha);
    if (ID_ALUNO.test(String(item.alunoId || ""))) {
      vincularAlunos(aba, [{ linha: item.linha, alunoId: String(item.alunoId) }]);
    }
    for (var d = 0; d < celulas.length; d += 1) {
      aba.getRange(item.linha, celulas[d].coluna).setValue(celulas[d].valor);
    }
    contagem.linhasCriadas += 1;
  }
  return null;
}

/**
 * Grava o código do aluno em linhas que já existem. A célula do nome precisa
 * mostrar o mesmo texto lido na prévia: se a linha mudou de lugar ou de dono
 * no intervalo, o vínculo é pulado em vez de cair no aluno errado. Tudo em
 * lote: uma leitura da coluna de nomes e uma busca de metadados por chamada.
 */
function aplicarVincularLinhas(aba, operacao, contagem) {
  var itens = operacao.itens || [];
  if (itens.length === 0) return null;
  var coluna = 0;
  var maiorLinha = 0;
  for (var i = 0; i < itens.length; i += 1) {
    var linha = numeroPositivo(itens[i].linha, 0);
    var colunaItem = numeroPositivo(itens[i].coluna, 0);
    if (!linha || !colunaItem || !ID_ALUNO.test(String(itens[i].alunoId || ""))) {
      return { ok: false, erro: "Vínculo de aluno inválido." };
    }
    if (coluna && colunaItem !== coluna) return { ok: false, erro: "Vínculo de aluno inválido." };
    coluna = colunaItem;
    if (linha > maiorLinha) maiorLinha = linha;
  }
  var nomes = aba.getRange(1, coluna, maiorLinha, 1).getDisplayValues();
  var aceitos = [];
  for (var j = 0; j < itens.length; j += 1) {
    var exibido = nomes[itens[j].linha - 1] ? nomes[itens[j].linha - 1][0] : "";
    if (limpar(exibido) !== limpar(itens[j].nome)) {
      contagem.puladasVinculo += 1;
      continue;
    }
    aceitos.push({ linha: numeroPositivo(itens[j].linha, 0), alunoId: String(itens[j].alunoId) });
  }
  vincularAlunos(aba, aceitos);
  contagem.vinculadas += aceitos.length;
  return null;
}

function linhaLivre(aba, linha, celulas) {
  var largura = Math.max(aba.getLastColumn(), 1);
  for (var c = 0; c < celulas.length; c += 1) {
    if (celulas[c].coluna > largura) largura = celulas[c].coluna;
  }
  var faixa = aba.getRange(linha, 1, 1, largura);
  var valores = faixa.getValues()[0];
  var formulas = faixa.getFormulas()[0];
  for (var i = 0; i < largura; i += 1) {
    if (formulas[i] !== "" || limpar(valores[i]) !== "") return false;
  }
  return true;
}

function aplicarRemoverColunas(aba, operacao, contagem) {
  var colunas = (operacao.colunas || []).slice().sort(function (a, b) {
    return b - a;
  });
  var criadas = marcadores(aba, MARCADOR_COLUNA);
  for (var i = 0; i < colunas.length; i += 1) {
    if (criadas.indexOf(colunas[i]) < 0) {
      return { ok: false, erro: "A coluna " + colunas[i] + " não foi criada pela integração." };
    }
  }
  for (var j = 0; j < colunas.length; j += 1) {
    aba.deleteColumn(colunas[j]);
    contagem.removidasColunas += 1;
  }
  return null;
}

function aplicarRemoverLinhas(aba, operacao, contagem) {
  var linhas = (operacao.linhas || []).slice().sort(function (a, b) {
    return b - a;
  });
  var criadas = marcadores(aba, MARCADOR_LINHA);
  for (var i = 0; i < linhas.length; i += 1) {
    if (criadas.indexOf(linhas[i]) < 0) {
      return { ok: false, erro: "A linha " + linhas[i] + " não foi criada pela integração." };
    }
  }
  for (var j = 0; j < linhas.length; j += 1) {
    aba.deleteRow(linhas[j]);
    contagem.removidasLinhas += 1;
  }
  return null;
}

function temOperacaoDestrutiva(operacoes) {
  for (var i = 0; i < operacoes.length; i += 1) {
    var tipo = operacoes[i].tipo;
    if (
      tipo === "substituir" ||
      tipo === "limpar" ||
      tipo === "removerLinhas" ||
      tipo === "removerColunas"
    ) {
      return true;
    }
  }
  return false;
}

// ------------------------------------------------------------------- abas

function acaoCriarAba(corpo) {
  var planilha = abrirPlanilha();
  var nome = String(corpo.nome || "").trim();
  if (!nome) return { ok: false, erro: "Informe o nome da aba." };
  if (planilha.getSheetByName(nome)) return { ok: false, erro: "Já existe uma aba com esse nome." };
  var aba = planilha.insertSheet(nome);
  var cabecalho =
    Array.isArray(corpo.cabecalho) && corpo.cabecalho.length
      ? corpo.cabecalho
      : ["Aluno", "Turma atual"];
  aba.getRange(1, 1, 1, cabecalho.length).setValues([cabecalho]);
  aplicarApresentacao(aba, {
    cabecalhoLinha: 1,
    // Clientes anteriores não enviam o plano visual; os títulos padrão continuam legíveis.
    colunas:
      corpo.colunas ||
      cabecalho.map(function (rotulo, indice) {
        var nome = String(rotulo)
          .normalize("NFD")
          .replace(/[\u0300-\u036f]/g, "")
          .trim()
          .toLowerCase();
        var largura = 240;
        var alinhamento = "LEFT";
        if (["aluno", "aluna", "nome", "estudante", "nome do aluno"].indexOf(nome) >= 0)
          largura = 260;
        else if (["turma", "turma atual", "classe"].indexOf(nome) >= 0) {
          largura = 140;
          alinhamento = "CENTER";
        } else if (/^\d{1,2}\/\d{1,2}(\/\d{2,4})?$/.test(nome)) {
          largura = nome.split("/").length === 3 ? 110 : 68;
          alinhamento = "CENTER";
        } else if (
          ["data", "dia", "total", "faltas", "justificadas", "total (f + fj)"].indexOf(nome) >= 0
        ) {
          largura = 110;
          alinhamento = "CENTER";
        } else if (["horario", "aula", "momento", "momento da saida"].indexOf(nome) >= 0) {
          largura = 160;
          alinhamento = "CENTER";
        }
        return { indice: indice + 1, largura: largura, alinhamento: alinhamento };
      }),
  });
  aba.addDeveloperMetadata(MARCADOR_ABA, VALOR_MARCADOR);
  SpreadsheetApp.flush();
  return { ok: true, versao: VERSAO, dados: { aba: aba.getName() } };
}

/** Corrige somente a introdução reconhecida e datas, sem criar abas de backup. */
function acaoOrganizarAba(corpo) {
  var aba = resolverAba(corpo.aba);
  var ajuste = corpo.ajusteCabecalho;
  var mesclagens = mesclagensDaAba(aba);
  if (
    aba.isSheetHidden() ||
    mesclagens.some(function (intervalo) {
      var fim = Number((intervalo.match(/:[A-Z]+(\d+)$/) || [])[1] || Infinity);
      return !ajuste || fim > ajuste.linhasRemover;
    })
  )
    return { ok: false, erro: "Organize apenas abas visíveis e sem células mescladas." };
  var conflito = conferirAssinatura(aba, corpo);
  if (conflito) return conflito;
  // A mesma validação de faixas ocorre antes de qualquer alteração ou cópia.
  aplicarApresentacao(aba, corpo, true);
  if (ajuste) {
    var removidas = ajuste.linhasRemover;
    var largura = Math.max(aba.getLastColumn(), 1);
    var faixa = aba.getRange(1, 1, corpo.cabecalhoLinha, largura);
    var valores = faixa.getDisplayValues();
    var formulas = faixa.getFormulas();
    var introducao = valores.slice(0, removidas).map(function (linha) {
      var textos = linha.map(limpar);
      while (textos.length && textos[textos.length - 1] === "") textos.pop();
      return textos;
    });
    var reconhecida = introducao.every(function (linha) {
      var textos = linha
        .map(function (texto) {
          return texto
            .normalize("NFD")
            .replace(/[\u0300-\u036f]/g, "")
            .toLowerCase();
        })
        .filter(Boolean);
      return (
        textos.length === 0 ||
        (textos.length === 1 &&
          (/^frequencia(?:\s|[.:·-]|$)/.test(textos[0]) ||
            /^p\s*=\s*presente\b.*\bf\s*=/.test(textos[0]) ||
            textos[0] === "atualize as marcacoes no aplicativo."))
      );
    });
    if (
      !Number.isInteger(removidas) ||
      removidas < 0 ||
      removidas !== corpo.cabecalhoLinha - 1 ||
      !Array.isArray(ajuste.datas) ||
      ajuste.datas.length > 400 ||
      !reconhecida ||
      hashTexto(JSON.stringify(introducao)) !== ajuste.assinaturaIntroducao ||
      formulas.slice(0, removidas).some(function (linha) {
        return linha.some(Boolean);
      }) ||
      ajuste.datas.some(function (data) {
        if (
          !Number.isInteger(data.indice) ||
          data.indice < 1 ||
          data.indice > largura ||
          !/^\d{2}\/\d{2}\/\d{4}$/.test(data.rotulo)
        )
          return true;
        var anterior = limpar(data.anterior).replace(/\s/g, "");
        var partes = anterior.match(/^(\d{1,2})[/.-](\d{1,2})(?:[/.-](\d{2,4}))?$/);
        var iso = anterior.match(/^(\d{4})-(\d{2})-(\d{2})$/);
        var ano = Number(data.rotulo.slice(-4));
        var dia = Number(data.rotulo.slice(0, 2));
        var mes = Number(data.rotulo.slice(3, 5));
        var atual = new Date(Date.UTC(ano, mes - 1, dia));
        return (
          valores[corpo.cabecalhoLinha - 1][data.indice - 1] !== data.anterior ||
          Boolean(formulas[corpo.cabecalhoLinha - 1][data.indice - 1]) ||
          ano < 2000 ||
          ano > 2100 ||
          atual.getUTCDate() !== dia ||
          atual.getUTCMonth() !== mes - 1 ||
          (iso
            ? Number(iso[1]) !== ano || Number(iso[2]) !== mes || Number(iso[3]) !== dia
            : !partes ||
              Number(partes[1]) !== dia ||
              Number(partes[2]) !== mes ||
              (partes[3] && Number(partes[3].length === 2 ? "20" + partes[3] : partes[3]) !== ano))
        );
      })
    )
      return { ok: false, erro: "O cabeçalho mudou ou contém fórmulas. Confira uma nova prévia." };
    if (removidas || ajuste.datas.length) {
      if (
        conferirAssinatura(aba, corpo) ||
        JSON.stringify(faixa.getDisplayValues()) !== JSON.stringify(valores) ||
        JSON.stringify(faixa.getFormulas()) !== JSON.stringify(formulas)
      )
        return { ok: false, erro: "O cabeçalho mudou antes da correção. Confira uma nova prévia." };
    }
    ajuste.datas.forEach(function (data) {
      aba.getRange(corpo.cabecalhoLinha, data.indice).setValue(data.rotulo);
    });
    if (removidas) {
      var congeladas = aba.getFrozenRows();
      aba.deleteRows(1, removidas);
      aba.setFrozenRows(Math.max(0, congeladas - removidas));
    }
    corpo.cabecalhoLinha -= removidas;
  }
  aplicarApresentacao(aba, corpo);
  SpreadsheetApp.flush();
  return { ok: true, versao: VERSAO, dados: { aba: aba.getName() } };
}

function aplicarApresentacao(aba, corpo, validarSomente) {
  var linha = corpo.cabecalhoLinha;
  var colunas = corpo.colunas;
  if (
    !Number.isInteger(linha) ||
    linha < 1 ||
    linha > aba.getMaxRows() ||
    !Array.isArray(colunas) ||
    !colunas.length ||
    colunas.length > 400
  )
    throw new Error("Apresentação da planilha inválida.");
  var indices = {};
  colunas.forEach(function (coluna) {
    if (
      !Number.isInteger(coluna.indice) ||
      coluna.indice < 1 ||
      coluna.indice > aba.getMaxColumns() ||
      indices[coluna.indice] ||
      !Number.isInteger(coluna.largura) ||
      coluna.largura < 40 ||
      coluna.largura > 400 ||
      ["LEFT", "CENTER"].indexOf(coluna.alinhamento) < 0
    )
      throw new Error("Apresentação da planilha inválida.");
    indices[coluna.indice] = true;
  });
  var faixas = [];
  colunas
    .slice()
    .sort(function (a, b) {
      return a.indice - b.indice;
    })
    .forEach(function (coluna) {
      var ultima = faixas[faixas.length - 1];
      if (ultima && ultima.coluna + ultima.colunas === coluna.indice) ultima.colunas += 1;
      else faixas.push({ coluna: coluna.indice, colunas: 1 });
    });
  var bandas = aba.getBandings();
  var planos = faixas.map(function (faixa) {
    var sobrepostas = bandas.filter(function (banda) {
      var range = banda.getRange();
      return (
        range.getRow() + range.getNumRows() > linha &&
        range.getColumn() < faixa.coluna + faixa.colunas &&
        range.getColumn() + range.getNumColumns() > faixa.coluna
      );
    });
    if (
      sobrepostas.some(function (banda) {
        var range = banda.getRange();
        return (
          range.getRow() !== linha ||
          range.getColumn() !== faixa.coluna ||
          range.getNumColumns() !== faixa.colunas
        );
      })
    )
      throw new Error(
        "A aba já tem cores alternadas em outro intervalo. Ajuste esse intervalo na planilha antes de organizar.",
      );
    return { faixa: faixa, sobrepostas: sobrepostas };
  });
  if (validarSomente) return;
  // Todas as recusas acontecem antes do primeiro estilo ser aplicado.
  planos.forEach(function (plano) {
    plano.sobrepostas.forEach(function (banda) {
      banda.remove();
    });
    aba
      .getRange(linha, plano.faixa.coluna, aba.getMaxRows() - linha + 1, plano.faixa.colunas)
      .applyRowBanding(SpreadsheetApp.BandingTheme.LIGHT_GREY, true, false)
      .setHeaderRowColor("#166534")
      .setFirstRowColor("#ffffff")
      .setSecondRowColor("#f0f4f1");
  });
  aba.setFrozenRows(Math.max(aba.getFrozenRows(), linha));
  aba.setRowHeight(linha, 44);
  colunas.forEach(function (coluna) {
    aba.setColumnWidth(coluna.indice, coluna.largura);
    aba
      .getRange(linha, coluna.indice, aba.getMaxRows() - linha + 1, 1)
      .setVerticalAlignment("top")
      .setHorizontalAlignment(coluna.alinhamento.toLowerCase())
      .setWrap(true);
    if (aba.getMaxRows() > linha) {
      aba
        .getRange(linha + 1, coluna.indice, aba.getMaxRows() - linha, 1)
        .setBackground(null)
        .setFontColor("#1f2937");
    }
    aba
      .getRange(linha, coluna.indice, 1, 1)
      .setBackground("#166534")
      .setFontColor("#ffffff")
      .setFontWeight("bold")
      .setVerticalAlignment("middle");
  });
}

function acaoRemoverAba(corpo) {
  var planilha = abrirPlanilha();
  var aba = planilha.getSheetByName(String(corpo.aba || ""));
  if (!aba) return { ok: false, erro: "Aba não encontrada." };
  if (planilha.getSheets().length <= 1)
    return { ok: false, erro: "A planilha precisa de uma aba." };
  if (!temMarcador(aba, MARCADOR_ABA)) {
    return { ok: false, erro: "Esta aba não foi criada pela integração." };
  }
  planilha.deleteSheet(aba);
  return { ok: true, versao: VERSAO, dados: { aba: corpo.aba } };
}

// ------------------------------------------------------------------ cópias

/** Reconhece apenas cópias antigas com carimbo e marcador da integração. */
function abasBackupAntigas(planilha) {
  return planilha.getSheets().filter(function (aba) {
    return (
      /^_frequenciapp_backup_.+_\d{8}-\d{6}(?:-\d{3})?(?:-[a-z0-9]+)?$/.test(aba.getName()) &&
      aba
        .createDeveloperMetadataFinder()
        .withKey(MARCADOR_COPIA)
        .find()
        .some(function (item) {
          return (
            item.getValue() === "1" &&
            item.getLocation().getLocationType() ===
              SpreadsheetApp.DeveloperMetadataLocationType.SHEET
          );
        })
    );
  });
}

function acaoListarAbasBackup() {
  var copias = abasBackupAntigas(abrirPlanilha())
    .map(function (aba) {
      return aba.getName();
    })
    .sort();
  return { ok: true, versao: VERSAO, dados: { copias: copias } };
}

function acaoRemoverAbasBackup(corpo) {
  var planilha = abrirPlanilha();
  var copias = abasBackupAntigas(planilha);
  var nomes = copias
    .map(function (aba) {
      return aba.getName();
    })
    .sort();
  if (
    !Array.isArray(corpo.copias) ||
    JSON.stringify(nomes) !== JSON.stringify(corpo.copias.slice().sort())
  )
    return { ok: false, erro: "As cópias mudaram. Confira uma nova prévia antes de remover." };
  if (
    !planilha.getSheets().some(function (aba) {
      return !aba.isSheetHidden() && copias.indexOf(aba) < 0;
    })
  )
    return { ok: false, erro: "A planilha precisa manter uma aba visível." };
  copias.forEach(function (aba) {
    planilha.deleteSheet(aba);
  });
  return { ok: true, versao: VERSAO, dados: { removidas: copias.length } };
}

/**
 * Cópias da aba, da mais recente para a mais antiga. O resto do nome depois
 * do prefixo precisa ser só o carimbo, para a aba "A" não levar as cópias da
 * aba "A_B".
 */
function copiasDaAba(planilha, nomeAba) {
  var prefixo = COPIA_PREFIXO + nomeAba + "_";
  var copias = planilha.getSheets().filter(function (item) {
    var nome = item.getName();
    return nome.indexOf(prefixo) === 0 && CARIMBO_COPIA.test(nome.slice(prefixo.length));
  });
  copias.sort(function (a, b) {
    return b.getName().localeCompare(a.getName());
  });
  return copias;
}

function acaoListarCopias(corpo) {
  var planilha = abrirPlanilha();
  var nomeAba = String(corpo.aba || "").trim();
  if (!nomeAba) return { ok: false, erro: "Informe a aba." };
  var copias = copiasDaAba(planilha, nomeAba).map(function (item) {
    return { nome: item.getName(), criadaEm: nomeAbaData(item.getName()) };
  });
  return { ok: true, versao: VERSAO, dados: { copias: copias } };
}

/** Data e hora do carimbo; aceita também os nomes antigos, sem milissegundos. */
function nomeAbaData(nome) {
  var partes = nome.split("_");
  var achado = CARIMBO_COPIA.exec(partes[partes.length - 1] || "");
  if (!achado) return "";
  var data = achado[1];
  var hora = achado[2];
  return (
    data.substring(0, 4) +
    "-" +
    data.substring(4, 6) +
    "-" +
    data.substring(6, 8) +
    " " +
    hora.substring(0, 2) +
    ":" +
    hora.substring(2, 4)
  );
}

/**
 * Restaura a cópia dentro da própria aba: valores, fórmulas, formatos,
 * mesclagens e congelamento. A aba mantém ID, posição e as referências de
 * outras abas. Os marcadores de linha e coluna passam a ser os da cópia; se a
 * cópia não os tiver, a aba fica sem eles, e a integração não remove nada.
 */
function acaoRestaurarCopia(corpo) {
  var planilha = abrirPlanilha();
  var nomeAba = String(corpo.aba || "").trim();
  var nomeCopia = String(corpo.copia || "").trim();
  var atual = planilha.getSheetByName(nomeAba);
  var copia = planilha.getSheetByName(nomeCopia);
  if (!atual || !copia) return { ok: false, erro: "Aba ou cópia não encontrada." };
  var prefixo = COPIA_PREFIXO + nomeAba + "_";
  if (nomeCopia.indexOf(prefixo) !== 0 || !CARIMBO_COPIA.test(nomeCopia.slice(prefixo.length))) {
    return { ok: false, erro: "Esta aba não é uma cópia da integração." };
  }
  var linhas = copia.getMaxRows();
  var colunas = copia.getMaxColumns();
  if (atual.getMaxRows() < linhas) {
    atual.insertRowsAfter(atual.getMaxRows(), linhas - atual.getMaxRows());
  }
  if (atual.getMaxColumns() < colunas) {
    atual.insertColumnsAfter(atual.getMaxColumns(), colunas - atual.getMaxColumns());
  }
  atual.getRange(1, 1, atual.getMaxRows(), atual.getMaxColumns()).breakApart();
  atual.clear();
  copia.getRange(1, 1, linhas, colunas).copyTo(atual.getRange(1, 1, linhas, colunas));
  atual.setFrozenRows(copia.getFrozenRows());
  atual.setFrozenColumns(copia.getFrozenColumns());
  removerMarcadoresDeAba(atual, MARCADOR_COPIA);
  recriarMarcadores(copia, atual, MARCADOR_LINHA);
  recriarMarcadores(copia, atual, MARCADOR_COLUNA);
  recriarVinculos(copia, atual);
  if (atual.isSheetHidden()) atual.showSheet();
  SpreadsheetApp.flush();
  return {
    ok: true,
    versao: VERSAO,
    dados: { aba: nomeAba, copia: nomeCopia },
  };
}

/** Troca os marcadores de linha ou coluna do destino pelos da origem. */
function recriarMarcadores(origem, destino, chave) {
  var achados = destino.createDeveloperMetadataFinder().withKey(chave).find();
  for (var i = 0; i < achados.length; i += 1) achados[i].remove();
  var posicoes = marcadores(origem, chave);
  for (var j = 0; j < posicoes.length; j += 1) {
    if (chave === MARCADOR_LINHA) marcarLinha(destino, posicoes[j]);
    else marcarColuna(destino, posicoes[j]);
  }
}

/** Troca os códigos de aluno do destino pelos da origem, linha a linha. */
function recriarVinculos(origem, destino) {
  var achados = destino.createDeveloperMetadataFinder().withKey(MARCADOR_ALUNO).find();
  for (var i = 0; i < achados.length; i += 1) achados[i].remove();
  vincularAlunos(destino, alunosDasLinhas(origem));
}

/** Remove metadados de nível de aba com a chave, sem tocar linha ou coluna. */
function removerMarcadoresDeAba(aba, chave) {
  var tipos = SpreadsheetApp.DeveloperMetadataLocationType;
  var achados = aba.createDeveloperMetadataFinder().withKey(chave).find();
  for (var i = 0; i < achados.length; i += 1) {
    if (achados[i].getLocation().getLocationType() === tipos.SHEET) achados[i].remove();
  }
}

// --------------------------------------------------------------- utilitários

function abrirPlanilha() {
  var propriedades = PropertiesService.getScriptProperties();
  var id = propriedades.getProperty(PROP_PLANILHA);
  if (id) return SpreadsheetApp.openById(id);
  var ativa = SpreadsheetApp.getActiveSpreadsheet();
  if (!ativa) throw new Error("Planilha não definida.");
  return ativa;
}

function resolverAba(nome) {
  var planilha = abrirPlanilha();
  var aba = planilha.getSheetByName(String(nome || ""));
  if (!aba) throw new Error("Aba não encontrada.");
  return aba;
}

/** Comparação em tempo constante para o conteúdo do token. */
function tokenConfere(valor) {
  var esperado = PropertiesService.getScriptProperties().getProperty(PROP_TOKEN);
  if (!esperado) return false;
  var recebido = String(valor || "");
  if (recebido.length !== esperado.length) return false;
  var diferenca = 0;
  for (var i = 0; i < esperado.length; i += 1) {
    diferenca |= recebido.charCodeAt(i) ^ esperado.charCodeAt(i);
  }
  return diferenca === 0;
}

/** Assinatura da aba: nome, cabeçalho e mesclagens, como no aplicativo. */
function assinaturaDaAba(aba, cabecalhoLinha) {
  var largura = Math.max(aba.getLastColumn(), 1);
  var cabecalho = aba.getRange(cabecalhoLinha, 1, 1, largura).getDisplayValues()[0];
  var mesclagens = mesclagensDaAba(aba);
  return hashTexto(
    JSON.stringify([aba.getName(), cabecalho.map(limpar), mesclagens.slice().sort()]),
  );
}

function conferirAssinatura(aba, corpo) {
  var atual = assinaturaDaAba(aba, numeroPositivo(corpo.cabecalhoLinha, 1));
  if (String(corpo.assinatura || "") !== atual) {
    return { ok: false, erro: "A estrutura da planilha mudou. Confira de novo antes de enviar." };
  }
  return null;
}

/**
 * Mesma função de hash do domínio em src/domain/planilha.ts. As duas pontas
 * precisam concordar para a assinatura de esquema detectar deriva.
 */
function hashTexto(texto) {
  var a = 0x811c9dc5;
  var b = 0x1000193;
  for (var indice = 0; indice < texto.length; indice += 1) {
    var codigo = texto.charCodeAt(indice);
    a ^= codigo;
    a = Math.imul(a, 0x01000193) >>> 0;
    b = (Math.imul(b ^ codigo, 0x85ebca6b) + indice) >>> 0;
  }
  return preencher(a.toString(16), 8) + preencher(b.toString(16), 8);
}

function preencher(texto, tamanho) {
  var saida = texto;
  while (saida.length < tamanho) saida = "0" + saida;
  return saida;
}

function limpar(valor) {
  return String(valor === null || valor === undefined ? "" : valor).trim();
}

function numeroPositivo(valor, padrao) {
  var numero = Number(valor);
  if (!isFinite(numero) || numero < 1) return padrao;
  return Math.floor(numero);
}

/**
 * Posições marcadas pela integração, lidas da localização do metadado. O
 * Google move o metadado junto com a linha ou coluna quando outras entram ou
 * saem antes dela, e o apaga junto com ela; o valor não carrega posição. O
 * marcador antigo ("linha:2", já preso à linha inteira) segue reconhecido,
 * porque só a localização conta. Metadado de outro tipo fica de fora.
 */
function marcadores(aba, chave) {
  var tipos = SpreadsheetApp.DeveloperMetadataLocationType;
  var achados = aba.createDeveloperMetadataFinder().withKey(chave).find();
  var valores = [];
  for (var i = 0; i < achados.length; i += 1) {
    var local = achados[i].getLocation();
    var tipo = local.getLocationType();
    var faixa = null;
    var numero = 0;
    if (tipo === tipos.ROW) {
      faixa = local.getRow();
      numero = faixa ? faixa.getRow() : 0;
    } else if (tipo === tipos.COLUMN) {
      faixa = local.getColumn();
      numero = faixa ? faixa.getColumn() : 0;
    }
    if (numero > 0 && valores.indexOf(numero) < 0) valores.push(numero);
  }
  valores.sort(function (a, b) {
    return a - b;
  });
  return valores;
}

/** O Google só aceita metadado na linha ou na coluna inteira, não na célula. */
function marcarLinha(aba, linha) {
  aba.getRange(linha + ":" + linha).addDeveloperMetadata(MARCADOR_LINHA, VALOR_MARCADOR);
}

function marcarColuna(aba, coluna) {
  var letra = aba.getRange(1, coluna).getA1Notation().replace(/\d+$/, "");
  aba.getRange(letra + ":" + letra).addDeveloperMetadata(MARCADOR_COLUNA, VALOR_MARCADOR);
}

/**
 * Códigos de aluno por linha, lidos da localização do metadado, que acompanha
 * a linha quando outras entram, saem ou a aba é ordenada.
 */
function alunosDasLinhas(aba) {
  var tipos = SpreadsheetApp.DeveloperMetadataLocationType;
  var achados = aba.createDeveloperMetadataFinder().withKey(MARCADOR_ALUNO).find();
  var vinculos = [];
  for (var i = 0; i < achados.length; i += 1) {
    var local = achados[i].getLocation();
    if (local.getLocationType() !== tipos.ROW) continue;
    var faixa = local.getRow();
    var linha = faixa ? faixa.getRow() : 0;
    var alunoId = String(achados[i].getValue() || "");
    if (linha > 0 && ID_ALUNO.test(alunoId)) vinculos.push({ linha: linha, alunoId: alunoId });
  }
  vinculos.sort(function (a, b) {
    return a.linha - b.linha;
  });
  return vinculos;
}

/**
 * Um código por linha e uma linha por código: os vínculos novos substituem os
 * antigos. Uma só busca de metadados para o lote inteiro; cada metadado é
 * lido uma vez, e só as linhas e os códigos envolvidos são removidos.
 */
function vincularAlunos(aba, vinculos) {
  if (vinculos.length === 0) return;
  var linhas = {};
  var codigos = {};
  for (var i = 0; i < vinculos.length; i += 1) {
    linhas[vinculos[i].linha] = true;
    codigos[vinculos[i].alunoId] = true;
  }
  var tipos = SpreadsheetApp.DeveloperMetadataLocationType;
  var achados = aba.createDeveloperMetadataFinder().withKey(MARCADOR_ALUNO).find();
  for (var j = 0; j < achados.length; j += 1) {
    var local = achados[j].getLocation();
    if (local.getLocationType() !== tipos.ROW) continue;
    var faixa = local.getRow();
    var linha = faixa ? faixa.getRow() : 0;
    if (linhas[linha] || codigos[achados[j].getValue()]) achados[j].remove();
  }
  for (var k = 0; k < vinculos.length; k += 1) {
    aba
      .getRange(vinculos[k].linha + ":" + vinculos[k].linha)
      .addDeveloperMetadata(MARCADOR_ALUNO, vinculos[k].alunoId);
  }
}

function temMarcador(aba, chave) {
  return aba.createDeveloperMetadataFinder().withKey(chave).find().length > 0;
}

function mensagemDeErro(erro) {
  var texto = String((erro && erro.message) || erro || "");
  if (
    texto ===
      "A aba já tem cores alternadas em outro intervalo. Ajuste esse intervalo na planilha antes de organizar." ||
    texto === "Apresentação da planilha inválida."
  )
    return texto;
  if (texto.indexOf("Aba não encontrada") === 0) return "Aba não encontrada.";
  if (texto.indexOf("Planilha não definida") === 0) return "Planilha não definida no script.";
  return "Não foi possível concluir a operação na planilha.";
}

/**
 * Mensagem original da exceção, para diagnóstico no aplicativo. Sai sem o
 * token nem o identificador da planilha, e com tamanho limitado.
 */
function detalheDoErro(erro) {
  if (!erro || erro.name === "SyntaxError") return "";
  var texto = String(erro.message || erro || "").trim();
  if (!texto) return "";
  return ocultarSegredos(texto).slice(0, MAX_DETALHE);
}

/** Sem acesso às propriedades, não há como limpar: nada é devolvido. */
function ocultarSegredos(texto) {
  var saida = String(texto || "");
  try {
    var propriedades = PropertiesService.getScriptProperties();
    var segredos = [propriedades.getProperty(PROP_TOKEN), propriedades.getProperty(PROP_PLANILHA)];
    for (var i = 0; i < segredos.length; i += 1) {
      if (segredos[i]) saida = saida.split(segredos[i]).join("***");
    }
    return saida;
  } catch (erro) {
    return "";
  }
}

function responder(dados) {
  return ContentService.createTextOutput(JSON.stringify(dados)).setMimeType(
    ContentService.MimeType.JSON,
  );
}
