// Dublê do Apps Script para os testes: responde 302 como o Content Service e
// guarda a planilha em memória, aplicando as mesmas invariantes do script.
import { createServer, type Server } from "node:http";

interface Celula {
  valor: string;
  formula: string;
}

interface Metadado {
  chave: string;
  linha?: number;
  coluna?: number;
}

interface AbaFalsa {
  nome: string;
  oculta: boolean;
  celulas: Celula[][];
  metadados: Metadado[];
  congeladasLinhas: number;
  congeladasColunas: number;
  mesclagens: string[];
}

export interface GasFalso {
  url: string;
  definirToken(valor: string): void;
  definirAba(
    nome: string,
    valores: string[][],
    opcoes?: { formulas?: Record<string, string>; mesclagens?: string[] },
  ): void;
  valor(nome: string, linha: number, coluna: number): string;
  formulaDe(nome: string, linha: number, coluna: number): string;
  marcarLinha(nome: string, linha: number): void;
  marcarColuna(nome: string, coluna: number): void;
  abas(): string[];
  chamadas(): string[];
  fechar(): Promise<void>;
}

const MARCADOR_LINHA = "frequenciapp.linha";
const MARCADOR_COLUNA = "frequenciapp.coluna";
const MARCADOR_ABA = "frequenciapp.aba";
const COPIA_PREFIXO = "_frequenciapp_backup_";

function hashTexto(texto: string): string {
  let a = 0x811c9dc5;
  let b = 0x1000193;
  for (let indice = 0; indice < texto.length; indice += 1) {
    const codigo = texto.charCodeAt(indice);
    a ^= codigo;
    a = Math.imul(a, 0x01000193) >>> 0;
    b = (Math.imul(b ^ codigo, 0x85ebca6b) + indice) >>> 0;
  }
  return a.toString(16).padStart(8, "0") + b.toString(16).padStart(8, "0");
}

export async function criarGasFalso(): Promise<GasFalso> {
  const abas: AbaFalsa[] = [];
  const chamadas: string[] = [];
  const resultados = new Map<string, string>();
  let token = "segredo-de-teste";
  let contadorCopia = 0;

  function aba(nome: string): AbaFalsa | undefined {
    return abas.find((item) => item.nome === nome);
  }

  function garantir(planilhaAba: AbaFalsa, linha: number, coluna: number): Celula {
    while (planilhaAba.celulas.length < linha) {
      planilhaAba.celulas.push(Array.from({ length: 60 }, () => ({ valor: "", formula: "" })));
    }
    const fileira = planilhaAba.celulas[linha - 1];
    if (fileira) {
      while (fileira.length < coluna) fileira.push({ valor: "", formula: "" });
      const celula = fileira[coluna - 1];
      if (celula) return celula;
    }
    return { valor: "", formula: "" };
  }

  function ultimaLinha(planilhaAba: AbaFalsa): number {
    let ultima = 0;
    for (let linha = 0; linha < planilhaAba.celulas.length; linha += 1) {
      const fileira = planilhaAba.celulas[linha] ?? [];
      if (fileira.some((celula) => celula.valor !== "" || celula.formula !== ""))
        ultima = linha + 1;
    }
    return ultima;
  }

  function ultimaColuna(planilhaAba: AbaFalsa): number {
    let ultima = 0;
    for (const fileira of planilhaAba.celulas) {
      for (let coluna = 0; coluna < fileira.length; coluna += 1) {
        const celula = fileira[coluna];
        if (celula && (celula.valor !== "" || celula.formula !== "")) {
          if (coluna + 1 > ultima) ultima = coluna + 1;
        }
      }
    }
    return ultima;
  }

  function assinatura(planilhaAba: AbaFalsa, cabecalhoLinha: number): string {
    const largura = Math.max(ultimaColuna(planilhaAba), 1);
    const cabecalho: string[] = [];
    for (let coluna = 1; coluna <= largura; coluna += 1) {
      cabecalho.push(garantir(planilhaAba, cabecalhoLinha, coluna).valor.trim());
    }
    return hashTexto(
      JSON.stringify([planilhaAba.nome, cabecalho, planilhaAba.mesclagens.slice().sort()]),
    );
  }

  function marcadores(planilhaAba: AbaFalsa, chave: string): number[] {
    return planilhaAba.metadados
      .filter((item) => item.chave === chave)
      .map((item) => item.linha ?? item.coluna ?? 0)
      .filter((valor) => valor > 0)
      .sort((a, b) => a - b);
  }

  function criarCopia(planilhaAba: AbaFalsa): AbaFalsa {
    contadorCopia += 1;
    const copia: AbaFalsa = {
      nome: `${COPIA_PREFIXO}${planilhaAba.nome}_20260926-0300${String(contadorCopia).padStart(2, "0")}`,
      oculta: true,
      celulas: planilhaAba.celulas.map((fileira) => fileira.map((celula) => ({ ...celula }))),
      metadados: [],
      congeladasLinhas: planilhaAba.congeladasLinhas,
      congeladasColunas: planilhaAba.congeladasColunas,
      mesclagens: planilhaAba.mesclagens.slice(),
    };
    abas.push(copia);
    return copia;
  }

  function responderJson(res: import("node:http").ServerResponse, dados: unknown) {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify(dados));
  }

  function executar(corpo: Record<string, unknown>): unknown {
    if (corpo.token !== token) return { ok: false, erro: "Não autorizado." };
    const acao = String(corpo.acao ?? "");
    chamadas.push(acao);
    const nomeAba = String(corpo.aba ?? "");
    switch (acao) {
      case "ping":
        return {
          ok: true,
          versao: 1,
          dados: {
            versao: 1,
            planilha: {
              nome: "Planilha de teste",
              id: "falsa",
              url: "https://docs.google.com/spreadsheets/d/falsa",
              fuso: "America/Fortaleza",
            },
            abas: abas.map((item) => ({
              nome: item.nome,
              linhas: ultimaLinha(item),
              colunas: ultimaColuna(item),
              oculta: item.oculta,
            })),
          },
        };
      case "estrutura":
        return {
          ok: true,
          versao: 1,
          dados: {
            planilha: {
              nome: "Planilha de teste",
              id: "falsa",
              url: "https://docs.google.com/spreadsheets/d/falsa",
              fuso: "America/Fortaleza",
              versao: 1,
            },
            abas: abas.map((item) => {
              const linhas = Math.min(Math.max(ultimaLinha(item), 1), 12);
              const colunas = Math.min(Math.max(ultimaColuna(item), 1), 60);
              const amostra: string[][] = [];
              for (let linha = 1; linha <= linhas; linha += 1) {
                const fileira: string[] = [];
                for (let coluna = 1; coluna <= colunas; coluna += 1) {
                  fileira.push(garantir(item, linha, coluna).valor);
                }
                amostra.push(fileira);
              }
              return {
                nome: item.nome,
                oculta: item.oculta,
                criada: item.metadados.some((meta) => meta.chave === MARCADOR_ABA),
                linhas: ultimaLinha(item),
                colunas: ultimaColuna(item),
                congeladasLinhas: item.congeladasLinhas,
                congeladasColunas: item.congeladasColunas,
                mesclagens: item.mesclagens,
                amostra,
              };
            }),
          },
        };
      case "ler": {
        const item = aba(nomeAba);
        if (!item) return { ok: false, erro: "Aba não encontrada." };
        const linhaInicial = Number(corpo.linhaInicial ?? 1);
        const colunaInicial = Number(corpo.colunaInicial ?? 1);
        const linhas = Number(corpo.linhas ?? ultimaLinha(item));
        const colunas = Number(corpo.colunas ?? ultimaColuna(item));
        const valores: string[][] = [];
        const formula: boolean[][] = [];
        for (let linha = 0; linha < linhas; linha += 1) {
          const fileiraValores: string[] = [];
          const fileiraFormula: boolean[] = [];
          for (let coluna = 0; coluna < colunas; coluna += 1) {
            const celula = garantir(item, linhaInicial + linha, colunaInicial + coluna);
            fileiraValores.push(celula.valor);
            fileiraFormula.push(celula.formula !== "");
          }
          valores.push(fileiraValores);
          formula.push(fileiraFormula);
        }
        return {
          ok: true,
          versao: 1,
          dados: {
            aba: item.nome,
            linhaInicial,
            colunaInicial,
            linhas,
            colunas,
            valores,
            formula,
            linhasCriadas: marcadores(item, MARCADOR_LINHA),
            colunasCriadas: marcadores(item, MARCADOR_COLUNA),
          },
        };
      }
      case "escrever": {
        const item = aba(nomeAba);
        if (!item) return { ok: false, erro: "Aba não encontrada." };
        const cabecalhoLinha = Number(corpo.cabecalhoLinha ?? 1);
        if (corpo.assinatura !== assinatura(item, cabecalhoLinha)) {
          return {
            ok: false,
            erro: "A estrutura da planilha mudou. Confira de novo antes de enviar.",
          };
        }
        const contagem = { aplicadas: 0, puladasOcupadas: 0, puladasFormula: 0 };
        for (const intervalo of (corpo.intervalos ?? []) as {
          linha: number;
          coluna: number;
          valores: string[][];
        }[]) {
          const valores = intervalo.valores ?? [];
          for (let l = 0; l < valores.length; l += 1) {
            const fileira = valores[l] ?? [];
            for (let c = 0; c < fileira.length; c += 1) {
              const celula = garantir(item, intervalo.linha + l, intervalo.coluna + c);
              if (celula.formula !== "") {
                contagem.puladasFormula += 1;
              } else if (celula.valor.trim() !== "") {
                contagem.puladasOcupadas += 1;
              } else {
                celula.valor = String(fileira[c] ?? "");
                contagem.aplicadas += 1;
              }
            }
          }
        }
        return { ok: true, versao: 1, dados: contagem };
      }
      case "aplicar": {
        const item = aba(nomeAba);
        if (!item) return { ok: false, erro: "Aba não encontrada." };
        const cabecalhoLinha = Number(corpo.cabecalhoLinha ?? 1);
        if (corpo.assinatura !== assinatura(item, cabecalhoLinha)) {
          return {
            ok: false,
            erro: "A estrutura da planilha mudou. Confira de novo antes de enviar.",
          };
        }
        const operacoes = (corpo.operacoes ?? []) as Record<string, unknown>[];
        const destrutiva = operacoes.some((item2) =>
          ["substituir", "limpar", "removerLinhas", "removerColunas"].includes(String(item2.tipo)),
        );
        if (destrutiva && corpo.modoCompleto !== true) {
          return { ok: false, erro: "O modo completo não está ativo." };
        }
        if (destrutiva) criarCopia(item);
        const contagem = {
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
        for (const operacao of operacoes) {
          const tipo = String(operacao.tipo);
          if (tipo === "preencher" || tipo === "substituir" || tipo === "limpar") {
            const celula = garantir(item, Number(operacao.linha), Number(operacao.coluna));
            if (celula.formula !== "") {
              contagem.puladasFormula += 1;
              continue;
            }
            const anterior = String(operacao.anterior ?? "");
            if (tipo === "preencher") {
              if (celula.valor.trim() !== "") {
                contagem.puladasOcupadas += 1;
                continue;
              }
              celula.valor = String(operacao.valor ?? "");
              contagem.preenchidas += 1;
            } else if (tipo === "substituir") {
              if (celula.valor !== anterior) {
                contagem.puladasOcupadas += 1;
                continue;
              }
              celula.valor = String(operacao.valor ?? "");
              celula.formula = "";
              contagem.substituidas += 1;
            } else {
              if (celula.valor !== anterior) {
                contagem.puladasOcupadas += 1;
                continue;
              }
              celula.valor = "";
              celula.formula = "";
              contagem.limpas += 1;
            }
            continue;
          }
          if (tipo === "inserirColunas") {
            const rotulos = (operacao.rotulos ?? []) as string[];
            const antesDe =
              operacao.antesDe === null ? ultimaColuna(item) + 1 : Number(operacao.antesDe);
            for (const planilhaAba of abas) {
              for (const fileira of planilhaAba.celulas) {
                fileira.splice(antesDe - 1, 0, ...rotulos.map(() => ({ valor: "", formula: "" })));
              }
            }
            for (let indice = 0; indice < rotulos.length; indice += 1) {
              garantir(item, cabecalhoLinha, antesDe + indice).valor = rotulos[indice] ?? "";
              item.metadados.push({ chave: MARCADOR_COLUNA, coluna: antesDe + indice });
            }
            contagem.colunasCriadas += rotulos.length;
            continue;
          }
          if (tipo === "criarLinhas") {
            for (const linha of (operacao.itens ?? []) as {
              linha: number;
              celulas: { coluna: number; valor: string }[];
            }[]) {
              const livre = linha.celulas.every((celula) => {
                const alvo = garantir(item, linha.linha, celula.coluna);
                return alvo.formula === "" && alvo.valor.trim() === "";
              });
              if (!livre) {
                contagem.puladasOcupadas += 1;
                continue;
              }
              for (const celula of linha.celulas) {
                garantir(item, linha.linha, celula.coluna).valor = celula.valor;
              }
              item.metadados.push({ chave: MARCADOR_LINHA, linha: linha.linha });
              contagem.linhasCriadas += 1;
            }
            continue;
          }
          if (tipo === "removerLinhas" || tipo === "removerColunas") {
            const chave = tipo === "removerLinhas" ? MARCADOR_LINHA : MARCADOR_COLUNA;
            const lista = ((tipo === "removerLinhas" ? operacao.linhas : operacao.colunas) ??
              []) as number[];
            const criadas = marcadores(item, chave);
            if (lista.some((posicao) => !criadas.includes(posicao))) {
              return { ok: false, erro: "A posição não foi criada pela integração." };
            }
            for (const posicao of lista.slice().sort((a, b) => b - a)) {
              if (tipo === "removerLinhas") {
                item.celulas.splice(posicao - 1, 1);
                contagem.removidasLinhas += 1;
              } else {
                item.celulas.forEach((fileira) => fileira.splice(posicao - 1, 1));
                contagem.removidasColunas += 1;
              }
            }
            continue;
          }
        }
        return { ok: true, versao: 1, dados: contagem };
      }
      case "criarAba": {
        const nome = String(corpo.nome ?? "").trim();
        if (!nome) return { ok: false, erro: "Informe o nome da aba." };
        if (aba(nome)) return { ok: false, erro: "Já existe uma aba com esse nome." };
        const nova: AbaFalsa = {
          nome,
          oculta: false,
          celulas: [],
          metadados: [{ chave: MARCADOR_ABA }],
          congeladasLinhas: 1,
          congeladasColunas: 0,
          mesclagens: [],
        };
        const cabecalho = (corpo.cabecalho ?? ["Aluno", "Turma atual"]) as string[];
        cabecalho.forEach((valor, indice) => {
          garantir(nova, 1, indice + 1).valor = valor;
        });
        abas.push(nova);
        return { ok: true, versao: 1, dados: { aba: nome } };
      }
      case "removerAba": {
        const item = aba(nomeAba);
        if (!item) return { ok: false, erro: "Aba não encontrada." };
        if (!item.metadados.some((meta) => meta.chave === MARCADOR_ABA)) {
          return { ok: false, erro: "Esta aba não foi criada pela integração." };
        }
        abas.splice(abas.indexOf(item), 1);
        return { ok: true, versao: 1, dados: { aba: nomeAba } };
      }
      case "listarCopias": {
        const prefixo = `${COPIA_PREFIXO}${nomeAba}_`;
        return {
          ok: true,
          versao: 1,
          dados: {
            copias: abas
              .filter((item) => item.nome.startsWith(prefixo))
              .map((item) => ({ nome: item.nome, criadaEm: "2026-09-26 03:00" })),
          },
        };
      }
      case "restaurarCopia": {
        const atual = aba(nomeAba);
        const copia = aba(String(corpo.copia ?? ""));
        if (!atual || !copia) return { ok: false, erro: "Aba ou cópia não encontrada." };
        if (!copia.nome.startsWith(`${COPIA_PREFIXO}${nomeAba}_`)) {
          return { ok: false, erro: "Esta aba não é uma cópia da integração." };
        }
        criarCopia(atual);
        atual.celulas = copia.celulas.map((fileira) => fileira.map((celula) => ({ ...celula })));
        return {
          ok: true,
          versao: 1,
          dados: { aba: nomeAba, copia: copia.nome, anterior: "copia" },
        };
      }
      default:
        return { ok: false, erro: "Ação desconhecida." };
    }
  }

  let sequencia = 0;
  const servidor: Server = createServer((req, res) => {
    if (req.method === "POST" && req.url?.startsWith("/exec")) {
      let corpo = "";
      req.on("data", (pedaco) => {
        corpo += pedaco;
      });
      req.on("end", () => {
        sequencia += 1;
        const id = String(sequencia);
        try {
          const dados = executar(JSON.parse(corpo) as Record<string, unknown>);
          resultados.set(id, JSON.stringify(dados));
        } catch {
          resultados.set(id, JSON.stringify({ ok: false, erro: "Corpo inválido." }));
        }
        res.writeHead(302, { Location: `/resultado/${id}` });
        res.end();
      });
      return;
    }
    if (req.url?.startsWith("/resultado/")) {
      const id = req.url.replace("/resultado/", "");
      const dados = resultados.get(id) ?? JSON.stringify({ ok: false, erro: "Sem resposta." });
      responderJson(res, JSON.parse(dados));
      return;
    }
    res.writeHead(404);
    res.end();
  });

  await new Promise<void>((resolver) => servidor.listen(0, "127.0.0.1", resolver));
  const endereco = servidor.address();
  const porta = typeof endereco === "object" && endereco ? endereco.port : 0;

  return {
    url: `http://127.0.0.1:${porta}/exec`,
    definirToken: (valor) => {
      token = valor;
    },
    definirAba: (nome, valores, opcoes) => {
      const nova: AbaFalsa = {
        nome,
        oculta: false,
        celulas: [],
        metadados: [],
        congeladasLinhas: 1,
        congeladasColunas: 0,
        mesclagens: opcoes?.mesclagens ?? [],
      };
      valores.forEach((fileira, linha) => {
        fileira.forEach((valor, coluna) => {
          const celula = garantir(nova, linha + 1, coluna + 1);
          celula.valor = valor;
        });
      });
      for (const [chave, formula] of Object.entries(opcoes?.formulas ?? {})) {
        const partes = chave.match(/^([A-Z]+)(\d+)$/);
        if (!partes) continue;
        const coluna = (partes[1] ?? "").charCodeAt(0) - 64;
        const linha = Number(partes[2]);
        garantir(nova, linha, coluna).formula = formula;
      }
      const existente = abas.findIndex((item) => item.nome === nome);
      if (existente >= 0) abas[existente] = nova;
      else abas.push(nova);
    },
    valor: (nome, linha, coluna) => {
      const item = aba(nome);
      return item ? garantir(item, linha, coluna).valor : "";
    },
    formulaDe: (nome, linha, coluna) => {
      const item = aba(nome);
      return item ? garantir(item, linha, coluna).formula : "";
    },
    marcarLinha: (nome, linha) => {
      aba(nome)?.metadados.push({ chave: MARCADOR_LINHA, linha });
    },
    marcarColuna: (nome, coluna) => {
      aba(nome)?.metadados.push({ chave: MARCADOR_COLUNA, coluna });
    },
    abas: () => abas.map((item) => item.nome),
    chamadas: () => chamadas.slice(),
    fechar: () =>
      new Promise<void>((resolver) => {
        servidor.close(() => resolver());
      }),
  };
}
