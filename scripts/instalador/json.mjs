// Contrato JSON do instalador: schema estático, códigos de erro e saída padronizada.
export const SCHEMA_SAIDA = "frequenciapp.instalador/1";
export const SCHEMA_ESTADO = "frequenciapp.instalacao/1";
export const DOCUMENTACAO = "docs/instalador.md";

export const CODIGOS_ERRO = [
  "E_USO",
  "E_DISTRO",
  "E_PACOTE",
  "E_DOCKER",
  "E_COMPOSE",
  "E_REDE",
  "E_VALIDACAO",
  "E_SAUDE",
  "E_BACKUP",
  "E_RESTAURACAO",
  "E_CONTROLADOR",
  "E_DROPBOX",
  "E_CANAL",
];

const SAIDAS = {
  E_USO: 2,
  E_DISTRO: 3,
  E_PACOTE: 8,
  E_DOCKER: 8,
  E_COMPOSE: 8,
  E_REDE: 6,
  E_VALIDACAO: 7,
  E_SAUDE: 9,
  E_BACKUP: 10,
  E_RESTAURACAO: 10,
  E_CONTROLADOR: 78,
  E_DROPBOX: 10,
  E_CANAL: 78,
};

// Erro classificado do instalador, sem stack trace na saída pública.
export class ErroInstalador extends Error {
  constructor(codigo, mensagem, opcoes = {}) {
    super(mensagem);
    this.name = "ErroInstalador";
    this.codigo = codigo;
    this.dica = opcoes.dica ?? "";
    this.comando = opcoes.comando ?? null;
    this.documentacao = opcoes.documentacao ?? `${DOCUMENTACAO}#códigos-de-erro`;
    this.saida = opcoes.saida ?? SAIDAS[codigo] ?? 1;
  }
}

export function criarErro(codigo, mensagem, opcoes = {}) {
  return new ErroInstalador(codigo, mensagem, opcoes);
}

export function erroUso(mensagem, opcoes = {}) {
  return new ErroInstalador("E_USO", mensagem, { saida: 2, ...opcoes });
}

export function erroValidacao(mensagem, opcoes = {}) {
  return new ErroInstalador("E_VALIDACAO", mensagem, { saida: 7, ...opcoes });
}

export function codigoSaida(codigo) {
  return SAIDAS[codigo] ?? 1;
}

export function erroObjeto(erro) {
  return {
    codigo: erro.codigo,
    mensagem: erro.message,
    dica: erro.dica,
    comando: erro.comando,
    documentacao: erro.documentacao,
  };
}

export function aviso(codigo, mensagem, documentacao = DOCUMENTACAO) {
  return { codigo, mensagem, documentacao };
}

const REFERENCIA_SAIDA = (nome) => ({ $ref: `#/$defs/${nome}` });

function definicoesSaida() {
  const codigoErro = { type: "string", enum: CODIGOS_ERRO };
  const estadoEtapa = {
    type: "string",
    enum: ["pendente", "executando", "concluida", "pulada", "falhou", "bloqueada"],
  };
  return {
    versao: {
      type: "object",
      additionalProperties: false,
      required: ["instalador", "projeto"],
      properties: {
        instalador: { type: "string" },
        projeto: { type: "string" },
      },
    },
    etapa: {
      type: "object",
      additionalProperties: false,
      required: ["id", "estado", "inicio", "fim", "codigo", "acoes", "avisos", "detalhes"],
      properties: {
        id: { type: "string", minLength: 1 },
        estado: estadoEtapa,
        inicio: { type: ["string", "null"], format: "date-time" },
        fim: { type: ["string", "null"], format: "date-time" },
        codigo: { anyOf: [codigoErro, { type: "null" }] },
        acoes: { type: "array", items: REFERENCIA_SAIDA("acao") },
        avisos: { type: "array", items: REFERENCIA_SAIDA("aviso") },
        detalhes: {
          type: "object",
          additionalProperties: true,
          description: "Dados estruturados da etapa, sempre redigidos.",
        },
      },
    },
    acao: {
      type: "object",
      additionalProperties: false,
      required: ["descricao", "comando", "altera"],
      properties: {
        descricao: { type: "string" },
        comando: { type: ["string", "null"] },
        altera: { type: "boolean" },
      },
    },
    erro: {
      type: "object",
      additionalProperties: false,
      required: ["codigo", "mensagem", "dica", "comando", "documentacao"],
      properties: {
        codigo: codigoErro,
        mensagem: { type: "string" },
        dica: { type: "string" },
        comando: { type: ["string", "null"] },
        documentacao: { type: "string" },
      },
    },
    aviso: {
      type: "object",
      additionalProperties: false,
      required: ["mensagem", "documentacao"],
      properties: {
        codigo: { type: "string", pattern: "^(A|E)_[A-Z0-9_]+$" },
        mensagem: { type: "string" },
        documentacao: { type: "string" },
      },
    },
  };
}

// Constrói o schema estático da saída JSON do instalador.
export function construirEsquema() {
  const codigoErro = { type: "string", enum: CODIGOS_ERRO };
  return {
    $schema: "https://json-schema.org/draft/2020-12/schema",
    $id: "urn:frequenciapp:instalador:1",
    title: "Saída do instalador do FrequenciApp",
    description: "Contrato frequenciapp.instalador/1 para comandos e automação.",
    type: "object",
    additionalProperties: false,
    required: [
      "schema",
      "comando",
      "ok",
      "codigo",
      "dry_run",
      "distro",
      "versao",
      "codename",
      "familia",
      "tier",
      "arquitetura",
      "gerenciador",
      "iniciador",
      "firewall",
      "selinux",
      "apparmor",
      "canal",
      "perfil",
      "tag",
      "commit",
      "imagem",
      "digest",
      "etapas",
      "avisos",
      "erros",
      "proximos",
      "relatorio",
    ],
    properties: {
      schema: { const: SCHEMA_SAIDA },
      comando: {
        type: "string",
        enum: [
          "planejar",
          "aplicar",
          "situacao",
          "diagnosticar",
          "atualizar",
          "backup",
          "restaurar",
          "desinstalar",
          "canal mostrar",
          "canal definir",
          "versao",
          "esquema",
        ],
      },
      ok: { type: "boolean" },
      codigo: { anyOf: [codigoErro, { type: "null" }] },
      dry_run: { type: "boolean" },
      distro: { type: "string" },
      versao: REFERENCIA_SAIDA("versao"),
      codename: { type: "string" },
      familia: {
        type: "string",
        enum: ["debian", "rhel", "fedora", "arch", "suse", "alpine", "desconhecida"],
      },
      tier: { type: "integer", enum: [1, 2, 3] },
      arquitetura: { type: "string" },
      gerenciador: {
        type: "string",
        enum: ["apt", "dnf", "pacman", "zypper", "apk", "desconhecido"],
      },
      iniciador: { type: "string", enum: ["systemd", "openrc", "desconhecido"] },
      firewall: { type: "string", enum: ["ufw", "firewalld", "nft", "nenhum"] },
      selinux: { type: "string", enum: ["enforcing", "permissive", "disabled", "ausente"] },
      apparmor: { type: "string", enum: ["enforcing", "complain", "disabled", "ausente"] },
      canal: { type: "string", enum: ["release", "main"] },
      perfil: { type: "string", enum: ["simples", "controlador", "dropbox", "completo"] },
      tag: { type: "string", pattern: "^$|^v\\d+\\.\\d+\\.\\d+$" },
      commit: { type: "string", pattern: "^$|^[a-f0-9]{7,64}$" },
      imagem: { type: "string" },
      digest: { type: "string", pattern: "^$|^sha256:[a-f0-9]{64}$" },
      etapas: { type: "array", items: REFERENCIA_SAIDA("etapa") },
      avisos: { type: "array", items: REFERENCIA_SAIDA("aviso") },
      erros: { type: "array", items: REFERENCIA_SAIDA("erro") },
      proximos: { type: "array", items: { type: "string" } },
      relatorio: { type: ["string", "null"] },
    },
    $defs: definicoesSaida(),
  };
}

// Constrói o schema estático do estado durável em instalação.json.
export function construirEsquemaEstado() {
  const definicoes = definicoesSaida();
  return {
    $schema: "https://json-schema.org/draft/2020-12/schema",
    $id: "urn:frequenciapp:instalacao:1",
    title: "Estado do instalador do FrequenciApp",
    description: "Contrato frequenciapp.instalacao/1 do estado durável.",
    type: "object",
    additionalProperties: false,
    required: [
      "schema",
      "instaladoEm",
      "atualizadoEm",
      "perfil",
      "canal",
      "tag",
      "commit",
      "imagem",
      "digest",
      "migradorSha256",
      "etapas",
      "controlador",
      "backup",
      "origem",
    ],
    properties: {
      schema: { const: SCHEMA_ESTADO },
      instaladoEm: { type: ["string", "null"], format: "date-time" },
      atualizadoEm: { type: ["string", "null"], format: "date-time" },
      perfil: { type: "string", enum: ["simples", "controlador", "dropbox", "completo"] },
      canal: { type: "string", enum: ["release", "main"] },
      tag: { type: "string", pattern: "^$|^v\\d+\\.\\d+\\.\\d+$" },
      commit: { type: "string", pattern: "^$|^[a-f0-9]{7,64}$" },
      imagem: { type: "string" },
      digest: { type: "string", pattern: "^$|^sha256:[a-f0-9]{64}$" },
      migradorSha256: {
        anyOf: [{ type: "string", pattern: "^[a-f0-9]{64}$" }, { type: "null" }],
      },
      etapas: { type: "array", items: REFERENCIA_SAIDA("etapa") },
      controlador: {
        type: "object",
        additionalProperties: false,
        required: ["adotado", "migradorSha256", "readocaoPendente"],
        properties: {
          adotado: { type: "boolean" },
          migradorSha256: {
            anyOf: [{ type: "string", pattern: "^[a-f0-9]{64}$" }, { type: "null" }],
          },
          readocaoPendente: { type: "boolean" },
        },
      },
      backup: {
        type: "object",
        additionalProperties: false,
        required: ["ultimoRecibo", "verificadoEm"],
        properties: {
          ultimoRecibo: { type: ["string", "null"] },
          verificadoEm: { type: ["string", "null"], format: "date-time" },
        },
      },
      origem: {
        type: "object",
        additionalProperties: false,
        required: ["repositorio", "diretorioFonte"],
        properties: {
          repositorio: { type: "string" },
          diretorioFonte: { type: "string" },
        },
      },
    },
    $defs: definicoes,
  };
}
