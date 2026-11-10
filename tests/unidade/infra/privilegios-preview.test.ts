// Testa a conferência pura do relatório de privilégios do schema de preview.
import { describe, expect, it } from "vitest";
import { conferirPrivilegios } from "../../apoio/privilegios-preview.mjs";
import type {
  MembershipPrivilegiosPreview,
  ObjetoPrivilegiosPreview,
  PapelPrivilegiosPreview,
  RelatorioPrivilegiosPreview,
} from "../../apoio/privilegios-preview.mjs";

const papelValido = (): PapelPrivilegiosPreview => ({
  login: true,
  herda: false,
  superusuario: false,
  criaPapel: false,
  criaBanco: false,
  replica: false,
  ignoraRls: false,
});

const tabelaValida = (): ObjetoPrivilegiosPreview => ({
  nome: "teste",
  dono: "preview_migrador",
  publico: 0,
  appSeleciona: true,
  appInsere: true,
  appAtualiza: true,
  appRemove: true,
});

const sequenciaValida = (): ObjetoPrivilegiosPreview => ({
  nome: "seq_teste",
  dono: "preview_migrador",
  publico: 0,
  appUso: true,
  appSeleciona: true,
});

const funcaoValida = (): ObjetoPrivilegiosPreview => ({
  nome: "funcao_teste",
  dono: "preview_migrador",
  publico: 0,
  appExecuta: true,
});

const tipoValido = (): ObjetoPrivilegiosPreview => ({
  nome: "estado_teste",
  dono: "preview_migrador",
  publico: 0,
  appUsa: true,
});

const membroValido = (mudanca: Partial<MembershipPrivilegiosPreview> = {}) => ({
  papel: "preview_migrador",
  membro: "preview_admin_ensaio",
  herda: false,
  set: true,
  admin: false,
  ...mudanca,
});

const relatorioValido = (): RelatorioPrivilegiosPreview => ({
  administrador: "preview_admin_ensaio",
  papeis: {
    preview_migrador: papelValido(),
    preview_app: papelValido(),
  },
  membrosSaida: 0,
  membrosEntrada: [
    membroValido({ set: false, admin: true }),
    membroValido(),
    membroValido({ papel: "preview_app", set: false, admin: true }),
  ],
  schemaPreview: {
    dono: "preview_migrador",
    migradorUso: true,
    migradorCria: true,
    appUso: true,
    appCria: false,
    publico: 0,
  },
  tabelas: [tabelaValida()],
  sequencias: [sequenciaValida()],
  funcoes: [funcaoValida()],
  tipos: [tipoValido()],
  banco: {
    migradorConecta: true,
    migradorCria: true,
    appConecta: true,
    appCria: false,
  },
  schemaAlheio: {
    appUso: false,
    appSeleciona: false,
    migradorUso: false,
    migradorSeleciona: false,
  },
  publicoAlheio: { appSeleciona: false },
});

function papel(relatorio: RelatorioPrivilegiosPreview, nome: string): PapelPrivilegiosPreview {
  const encontrado = relatorio.papeis[nome];
  if (!encontrado) throw new Error(`Papel ausente no relatório: ${nome}`);
  return encontrado;
}

describe("conferência de privilégios do preview", () => {
  it("aceita o relatório completo com a membership administrativa", () => {
    expect(conferirPrivilegios(relatorioValido(), { exigirMembership: true })).toEqual([]);
  });

  it("aceita o relatório de superusuário sem membership", () => {
    const relatorio = relatorioValido();
    relatorio.administrador = "postgres";
    relatorio.membrosEntrada = [];
    expect(conferirPrivilegios(relatorio)).toEqual([]);
    expect(conferirPrivilegios(relatorio, { exigirMembership: true })).not.toEqual([]);
  });

  it("reprova atributos perigosos nas roles", () => {
    for (const atributo of [
      "superusuario",
      "criaPapel",
      "criaBanco",
      "replica",
      "ignoraRls",
      "herda",
    ] as const) {
      const relatorio = relatorioValido();
      papel(relatorio, "preview_app")[atributo] = true;
      expect(conferirPrivilegios(relatorio), atributo).not.toEqual([]);
    }
  });

  it("reprova memberships de saída, herança e SET ROLE indevido", () => {
    const saida = relatorioValido();
    saida.membrosSaida = 1;
    expect(conferirPrivilegios(saida)).not.toEqual([]);

    const heranca = relatorioValido();
    heranca.membrosEntrada = [membroValido({ herda: true })];
    expect(conferirPrivilegios(heranca, { exigirMembership: true })).not.toEqual([]);

    const outroMembro = relatorioValido();
    outroMembro.membrosEntrada = [membroValido({ membro: "preview_app" })];
    expect(conferirPrivilegios(outroMembro, { exigirMembership: true })).not.toEqual([]);

    const setRuntime = relatorioValido();
    setRuntime.membrosEntrada = [membroValido({ papel: "preview_app", set: true })];
    expect(conferirPrivilegios(setRuntime, { exigirMembership: true })).not.toEqual([]);

    const semSet = relatorioValido();
    semSet.membrosEntrada = [membroValido({ set: false })];
    expect(conferirPrivilegios(semSet, { exigirMembership: true })).not.toEqual([]);
  });

  it("reprova schema, tabelas, sequences, rotinas e tipos expostos a PUBLIC", () => {
    const schema = relatorioValido();
    schema.schemaPreview.publico = 1;
    expect(conferirPrivilegios(schema)).not.toEqual([]);

    const appCria = relatorioValido();
    appCria.schemaPreview.appCria = true;
    expect(conferirPrivilegios(appCria)).not.toEqual([]);

    const tabela = relatorioValido();
    tabela.tabelas = [{ ...tabelaValida(), appRemove: false, publico: 1 }];
    expect(conferirPrivilegios(tabela)).not.toEqual([]);

    const sequencia = relatorioValido();
    sequencia.sequencias = [{ ...sequenciaValida(), appUso: false, publico: 1 }];
    expect(conferirPrivilegios(sequencia)).not.toEqual([]);

    const funcao = relatorioValido();
    funcao.funcoes = [{ ...funcaoValida(), appExecuta: false, publico: 1 }];
    expect(conferirPrivilegios(funcao)).not.toEqual([]);

    const tipo = relatorioValido();
    tipo.tipos = [{ ...tipoValido(), appUsa: false, publico: 1 }];
    expect(conferirPrivilegios(tipo)).not.toEqual([]);
  });

  it("reprova listas vazias e acesso a schema alheio", () => {
    for (const lista of ["tabelas", "sequencias", "funcoes", "tipos"] as const) {
      const relatorio = relatorioValido();
      relatorio[lista] = [];
      expect(conferirPrivilegios(relatorio), lista).not.toEqual([]);
    }

    const alheio = relatorioValido();
    alheio.schemaAlheio.appSeleciona = true;
    expect(conferirPrivilegios(alheio)).not.toEqual([]);

    const publico = relatorioValido();
    publico.publicoAlheio.appSeleciona = true;
    expect(conferirPrivilegios(publico)).not.toEqual([]);

    const banco = relatorioValido();
    banco.banco.appCria = true;
    expect(conferirPrivilegios(banco)).not.toEqual([]);
  });

  it("reprova relatório ausente ou inválido", () => {
    expect(conferirPrivilegios(null)).not.toEqual([]);
    expect(conferirPrivilegios({})).not.toEqual([]);

    const executadoPorPreview = relatorioValido();
    executadoPorPreview.administrador = "preview_app";
    executadoPorPreview.membrosEntrada = [];
    expect(conferirPrivilegios(executadoPorPreview, { exigirMembership: true })).not.toEqual([]);
  });
});
