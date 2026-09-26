/**
 * FrequenciApp: ponte conservadora entre o aplicativo e a planilha.
 *
 * Ações: ping, estrutura, ler, escrever, aplicar, criarAba, removerAba,
 * listarCopias e restaurarCopia. Toda chamada exige o token guardado em
 * Script Properties (FREQUENCIAPP_TOKEN). Nenhuma ação apaga dado que a
 * integração não tenha criado, e célula com fórmula nunca é sobrescrita.
 */

var VERSAO = 1;
var PROP_TOKEN = "FREQUENCIAPP_TOKEN";
var PROP_PLANILHA = "PLANILHA_ID";
var MAX_LER_CELULAS = 20000;
var MAX_ESCREVER_CELULAS = 5000;
var MAX_APLICAR_OPERACOES = 10000;
var MAX_INTERVALOS = 200;
var MAX_AMOSTRA_LINHAS = 12;
var MAX_AMOSTRA_COLUNAS = 60;
var COPIA_PREFIXO = "_frequenciapp_backup_";
var COPIA_MAXIMA = 3;
var MARCADOR_LINHA = "frequenciapp.linha";
var MARCADOR_COLUNA = "frequenciapp.coluna";
var MARCADOR_ABA = "frequenciapp.aba";
var MARCADOR_COPIA = "frequenciapp.copia";

function doPost(e) {
  try {
    if (!e || !e.postData || !e.postData.contents) {
      return responder({ ok: false, erro: "Corpo vazio." });
    }
    var corpo = JSON.parse(e.postData.contents);
    if (!tokenConfere(corpo.token)) {
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
    return responder({ ok: false, erro: mensagemDeErro(erro) });
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
      return acaoEstrutura();
    case "ler":
      return acaoLer(corpo);
    case "escrever":
      return acaoEscrever(corpo);
    case "aplicar":
      return acaoAplicar(corpo);
    case "criarAba":
      return acaoCriarAba(corpo);
    case "removerAba":
      return acaoRemoverAba(corpo);
    case "listarCopias":
      return acaoListarCopias(corpo);
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

function acaoEstrutura() {
  var planilha = abrirPlanilha();
  return {
    ok: true,
    versao: VERSAO,
    dados: {
      planilha: {
        nome: planilha.getName(),
        id: planilha.getId(),
        url: planilha.getUrl(),
        fuso: planilha.getSpreadsheetTimeZone(),
      },
      abas: planilha.getSheets().map(function (aba) {
        return {
          nome: aba.getName(),
          oculta: aba.isSheetHidden(),
          linhas: aba.getLastRow(),
          colunas: aba.getLastColumn(),
          congeladasLinhas: aba.getFrozenRows(),
          congeladasColunas: aba.getFrozenColumns(),
          mesclagens: aba.getMergedRanges().map(function (faixa) {
            return faixa.getA1Notation();
          }),
          amostra: amostraDaAba(aba),
        };
      }),
    },
  };
}

function amostraDaAba(aba) {
  var linhas = Math.min(Math.max(aba.getLastRow(), 1), MAX_AMOSTRA_LINHAS);
  var colunas = Math.min(Math.max(aba.getLastColumn(), 1), MAX_AMOSTRA_COLUNAS);
  return aba.getRange(1, 1, linhas, colunas).getDisplayValues();
}

// ------------------------------------------------------------------- leitura

function acaoLer(corpo) {
  var aba = resolverAba(corpo.aba);
  var linhaInicial = numeroPositivo(corpo.linhaInicial, 1);
  var colunaInicial = numeroPositivo(corpo.colunaInicial, 1);
  var linhas = numeroPositivo(corpo.linhas, aba.getLastRow());
  var colunas = numeroPositivo(corpo.colunas, aba.getLastColumn());
  if (linhaInicial > aba.getMaxRows() || colunaInicial > aba.getMaxColumns()) {
    return { ok: false, erro: "Intervalo fora da aba." };
  }
  linhas = Math.min(linhas, aba.getMaxRows() - linhaInicial + 1);
  colunas = Math.min(colunas, aba.getMaxColumns() - colunaInicial + 1);
  if (linhas * colunas > MAX_LER_CELULAS) {
    return { ok: false, erro: "Intervalo grande demais para uma leitura." };
  }
  var faixa = aba.getRange(linhaInicial, colunaInicial, linhas, colunas);
  var formulas = faixa.getFormulas();
  return {
    ok: true,
    versao: VERSAO,
    dados: {
      aba: aba.getName(),
      linhaInicial: linhaInicial,
      colunaInicial: colunaInicial,
      linhas: linhas,
      colunas: colunas,
      valores: faixa.getDisplayValues(),
      formula: formulas.map(function (linha) {
        return linha.map(function (valor) {
          return valor !== "";
        });
      }),
      linhasCriadas: marcadores(aba, MARCADOR_LINHA),
      colunasCriadas: marcadores(aba, MARCADOR_COLUNA),
    },
  };
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
    var segura = [];
    var houve = false;
    for (var l = 0; l < altura; l += 1) {
      segura.push([]);
      for (var c = 0; c < largura; c += 1) {
        var vazio = String(atuais[l][c] === null ? "" : atuais[l][c]).trim() === "";
        if (formulas[l][c] !== "") {
          contagem.puladasFormula += 1;
          segura[l].push(atuais[l][c]);
        } else if (!vazio) {
          contagem.puladasOcupadas += 1;
          segura[l].push(atuais[l][c]);
        } else {
          segura[l].push(linhas[l][c]);
          contagem.aplicadas += 1;
          houve = true;
        }
      }
    }
    if (houve) faixa.setValues(segura);
  }
  SpreadsheetApp.flush();
  return { ok: true, versao: VERSAO, dados: contagem };
}

/**
 * Aplica um plano do modo completo. Operações destrutivas exigem o modo
 * declarado e criam cópia oculta da aba antes de qualquer alteração.
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
    criarCopia(aba);
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
  };
  var copiaAtual = null;
  for (var i = 0; i < operacoes.length; i += 1) {
    var operacao = operacoes[i];
    var resultado;
    switch (operacao.tipo) {
      case "preencher":
        resultado = aplicarPreencher(aba, operacao, contagem);
        break;
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
      case "removerColunas":
        resultado = aplicarRemoverColunas(aba, operacao, contagem);
        break;
      case "removerLinhas":
        resultado = aplicarRemoverLinhas(aba, operacao, contagem);
        break;
      default:
        return { ok: false, erro: "Operação desconhecida." };
    }
    if (resultado) return resultado;
  }
  SpreadsheetApp.flush();
  return { ok: true, versao: VERSAO, dados: contagem };
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
  var atual = String(celula.getValue() === null ? "" : celula.getValue());
  if (atual.trim() === "") {
    celula.setValue(operacao.valor);
    contagem.preenchidas += 1;
    return null;
  }
  if (operacao.anterior !== undefined && atual !== operacao.anterior) {
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
  var atual = String(celula.getValue() === null ? "" : celula.getValue());
  if (operacao.anterior !== undefined && atual !== operacao.anterior) {
    contagem.puladasOcupadas += 1;
    return null;
  }
  celula.clearContent();
  contagem.limpas += 1;
  return null;
}

function aplicarInserirColunas(aba, operacao, contagem) {
  var rotulos = operacao.rotulos || [];
  if (!rotulos.length) return null;
  if (rotulos.length + aba.getLastColumn() > aba.getMaxColumns()) {
    return { ok: false, erro: "A aba não comporta mais colunas." };
  }
  var antesDe = operacao.antesDe;
  if (antesDe === null || antesDe === undefined) {
    aba.insertColumnsAfter(aba.getLastColumn(), rotulos.length);
    antesDe = aba.getLastColumn() - rotulos.length + 1;
  } else {
    aba.insertColumnsBefore(antesDe, rotulos.length);
  }
  var faixa = aba.getRange(operacao.cabecalhoLinha || 1, antesDe, 1, rotulos.length);
  faixa.setValues([rotulos]);
  for (var i = 0; i < rotulos.length; i += 1) {
    marcarColuna(aba, antesDe + i);
  }
  contagem.colunasCriadas += rotulos.length;
  return null;
}

function aplicarCriarLinhas(aba, operacao, contagem) {
  var itens = operacao.itens || [];
  for (var i = 0; i < itens.length; i += 1) {
    var item = itens[i];
    var celulas = item.celulas || [];
    var livre = true;
    for (var c = 0; c < celulas.length; c += 1) {
      var alvo = aba.getRange(item.linha, celulas[c].coluna);
      if (alvo.getFormula() !== "" || String(alvo.getValue()).trim() !== "") {
        livre = false;
        break;
      }
    }
    if (!livre) {
      contagem.puladasOcupadas += 1;
      continue;
    }
    for (var d = 0; d < celulas.length; d += 1) {
      aba.getRange(item.linha, celulas[d].coluna).setValue(celulas[d].valor);
    }
    marcarLinha(aba, item.linha);
    contagem.linhasCriadas += 1;
  }
  return null;
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
  var cabecalho = corpo.cabecalho || ["Aluno", "Turma atual"];
  aba.getRange(1, 1, 1, cabecalho.length).setValues([cabecalho]);
  aba.setFrozenRows(1);
  aba.addDeveloperMetadata(MARCADOR_ABA, "1");
  SpreadsheetApp.flush();
  return { ok: true, versao: VERSAO, dados: { aba: aba.getName() } };
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
  criarCopia(aba);
  planilha.deleteSheet(aba);
  return { ok: true, versao: VERSAO, dados: { aba: corpo.aba } };
}

// ------------------------------------------------------------------ cópias

function criarCopia(aba) {
  var planilha = abrirPlanilha();
  var agora = Utilities.formatDate(
    new Date(),
    planilha.getSpreadsheetTimeZone(),
    "yyyyMMdd-HHmmss",
  );
  var nome = COPIA_PREFIXO + aba.getName() + "_" + agora;
  var copia = aba.copyTo(planilha).setName(nome);
  copia.hideSheet();
  copia.addDeveloperMetadata(MARCADOR_COPIA, "1");
  podarCopias(aba.getName());
  return copia;
}

function podarCopias(nomeAba) {
  var planilha = abrirPlanilha();
  var copias = copiasDaAba(planilha, nomeAba);
  for (var i = COPIA_MAXIMA; i < copias.length; i += 1) {
    planilha.deleteSheet(copias[i]);
  }
}

function copiasDaAba(planilha, nomeAba) {
  var prefixo = COPIA_PREFIXO + nomeAba + "_";
  var copias = planilha.getSheets().filter(function (item) {
    return item.getName().indexOf(prefixo) === 0;
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

function nomeAbaData(nome) {
  var partes = nome.split("_");
  var carimbo = partes[partes.length - 1] || "";
  if (!/^\d{8}-\d{6}$/.test(carimbo)) return "";
  return (
    carimbo.substring(0, 4) +
    "-" +
    carimbo.substring(4, 6) +
    "-" +
    carimbo.substring(6, 8) +
    " " +
    carimbo.substring(9, 11) +
    ":" +
    carimbo.substring(11, 13)
  );
}

function acaoRestaurarCopia(corpo) {
  var planilha = abrirPlanilha();
  var nomeAba = String(corpo.aba || "").trim();
  var nomeCopia = String(corpo.copia || "").trim();
  var atual = planilha.getSheetByName(nomeAba);
  var copia = planilha.getSheetByName(nomeCopia);
  if (!atual || !copia) return { ok: false, erro: "Aba ou cópia não encontrada." };
  var prefixo = COPIA_PREFIXO + nomeAba + "_";
  if (nomeCopia.indexOf(prefixo) !== 0) {
    return { ok: false, erro: "Esta aba não é uma cópia da integração." };
  }
  var anterior = criarCopia(atual);
  var restaurada = copia.copyTo(planilha);
  var temporario =
    COPIA_PREFIXO +
    nomeAba +
    "_" +
    Utilities.formatDate(new Date(), planilha.getSpreadsheetTimeZone(), "yyyyMMdd-HHmmss") +
    "-troca";
  atual.setName(temporario);
  atual.addDeveloperMetadata(MARCADOR_COPIA, "1");
  restaurada.setName(nomeAba);
  atual.hideSheet();
  SpreadsheetApp.flush();
  podarCopias(nomeAba);
  return {
    ok: true,
    versao: VERSAO,
    dados: { aba: nomeAba, copia: nomeCopia, anterior: anterior.getName() },
  };
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

function tokenConfere(valor) {
  var esperado = PropertiesService.getScriptProperties().getProperty(PROP_TOKEN);
  if (!esperado) return false;
  return String(valor || "") === esperado;
}

function conferirAssinatura(aba, corpo) {
  var cabecalhoLinha = numeroPositivo(corpo.cabecalhoLinha, 1);
  var largura = Math.max(aba.getLastColumn(), 1);
  var cabecalho = aba.getRange(cabecalhoLinha, 1, 1, largura).getDisplayValues()[0];
  var mesclagens = aba.getMergedRanges().map(function (faixa) {
    return faixa.getA1Notation();
  });
  var atual = hashTexto(
    JSON.stringify([aba.getName(), cabecalho.map(limpar), mesclagens.slice().sort()]),
  );
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

function marcadores(aba, chave) {
  var achados = aba.createDeveloperMetadataFinder().withKey(chave).find();
  var valores = [];
  for (var i = 0; i < achados.length; i += 1) {
    var local = achados[i].getLocation();
    var linha = local.getRow();
    var coluna = local.getColumn();
    if (linha !== null && linha !== undefined && linha > 0) valores.push(linha);
    else if (coluna !== null && coluna !== undefined && coluna > 0) valores.push(coluna);
  }
  valores.sort(function (a, b) {
    return a - b;
  });
  return valores;
}

function marcarLinha(aba, linha) {
  aba.getRange(linha, 1).addDeveloperMetadata(MARCADOR_LINHA, "1");
}

function marcarColuna(aba, coluna) {
  aba.getRange(1, coluna).addDeveloperMetadata(MARCADOR_COLUNA, "1");
}

function temMarcador(aba, chave) {
  return aba.createDeveloperMetadataFinder().withKey(chave).find().length > 0;
}

function mensagemDeErro(erro) {
  var texto = String((erro && erro.message) || erro || "");
  if (texto.indexOf("Aba não encontrada") === 0) return "Aba não encontrada.";
  if (texto.indexOf("Planilha não definida") === 0) return "Planilha não definida no script.";
  return "Não foi possível concluir a operação na planilha.";
}

function responder(dados) {
  return ContentService.createTextOutput(JSON.stringify(dados)).setMimeType(
    ContentService.MimeType.JSON,
  );
}
