// Testa o JSON Schema estático, os códigos de erro e a redação do documento.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  CODIGOS_ERRO,
  SCHEMA_ESTADO,
  SCHEMA_SAIDA,
  construirEsquema,
  construirEsquemaEstado,
} from "../../scripts/instalador/json.mjs";
import { estadoInicial } from "../../scripts/instalador/estado.mjs";
import { montarDocumento } from "../../scripts/instalador/plano.mjs";
import { redigirObjeto } from "../../scripts/instalador/redigir.mjs";

function resolver(esquema, referencia) {
  const caminho = referencia.replace(/^#\//, "").split("/");
  let atual = esquema;
  for (const parte of caminho) atual = atual[parte];
  return atual;
}

function validar(valor, esquema, raiz, caminho = "$") {
  if (!esquema || typeof esquema !== "object") return;
  if (esquema.$ref) {
    validar(valor, resolver(raiz, esquema.$ref), raiz, caminho);
    return;
  }
  if (esquema.anyOf) {
    const resultados = esquema.anyOf.map((item) => {
      try {
        validar(valor, item, raiz, caminho);
        return true;
      } catch {
        return false;
      }
    });
    assert.ok(resultados.some(Boolean), `${caminho}: nenhuma alternativa de anyOf aceitou`);
    return;
  }
  if (esquema.type) {
    const tipos = Array.isArray(esquema.type) ? esquema.type : [esquema.type];
    const tipo = valor === null ? "null" : Array.isArray(valor) ? "array" : typeof valor;
    const aceito = tipos.includes(tipo) || (tipo === "number" && tipos.includes("integer"));
    assert.ok(aceito, `${caminho}: tipo ${tipo} não aceito por ${tipos.join(", ")}`);
  }
  if (esquema.const !== undefined) assert.deepEqual(valor, esquema.const, `${caminho}: const`);
  if (esquema.enum) assert.ok(esquema.enum.includes(valor), `${caminho}: enum`);
  if (typeof valor === "string") {
    if (esquema.minLength !== undefined) {
      assert.ok(valor.length >= esquema.minLength, `${caminho}: minLength`);
    }
    if (esquema.pattern) {
      assert.match(valor, new RegExp(esquema.pattern), `${caminho}: pattern`);
    }
  }
  if (Array.isArray(valor) && esquema.items) {
    valor.forEach((item, indice) => validar(item, esquema.items, raiz, `${caminho}[${indice}]`));
  }
  if (valor && typeof valor === "object" && !Array.isArray(valor)) {
    for (const chave of esquema.required ?? []) {
      assert.ok(chave in valor, `${caminho}: campo obrigatório ${chave}`);
    }
    const propriedades = esquema.properties ?? {};
    for (const [chave, item] of Object.entries(valor)) {
      if (propriedades[chave]) {
        validar(item, propriedades[chave], raiz, `${caminho}.${chave}`);
      } else if (esquema.additionalProperties === false) {
        assert.fail(`${caminho}: campo extra ${chave}`);
      } else if (esquema.additionalProperties && typeof esquema.additionalProperties === "object") {
        validar(item, esquema.additionalProperties, raiz, `${caminho}.${chave}`);
      }
    }
  }
}

function verificarObjetosFechados(esquema, caminho = "$", aberto = false) {
  if (!esquema || typeof esquema !== "object") return;
  if (Array.isArray(esquema)) {
    esquema.forEach((item, indice) => verificarObjetosFechados(item, `${caminho}[${indice}]`));
    return;
  }
  if (esquema.type === "object" && !aberto) {
    assert.equal(esquema.additionalProperties, false, `${caminho}: additionalProperties`);
  }
  for (const [chave, valor] of Object.entries(esquema)) {
    if (valor && typeof valor === "object") {
      verificarObjetosFechados(valor, `${caminho}.${chave}`, chave === "detalhes");
    }
  }
}

function documentoExemplo() {
  return montarDocumento({
    comando: "planejar",
    configuracao: {
      perfil: "simples",
      canal: "release",
      tag: "v1.0.0",
      commit: "0000000000000000000000000000000000000000",
      imagem: "ghcr.io/eemtijca/frequenciapp",
      digest: `sha256:${"0".repeat(64)}`,
    },
    estado: null,
    deteccao: {
      distro: "ubuntu",
      versaoDistro: "26.04",
      codename: "resolute",
      familia: "debian",
      tier: 1,
      arquitetura: "amd64",
      gerenciador: "apt",
      iniciador: "systemd",
      firewall: "ufw",
      selinux: "ausente",
      apparmor: "enforcing",
    },
    dryRun: true,
    etapas: [],
    avisos: [],
    erros: [],
    proximos: ["sudo ./instalar.sh aplicar --sim"],
  });
}

describe("schema de saída", () => {
  it("é estático, draft 2020-12 e declara todos os códigos E_*", () => {
    const esquema = construirEsquema();
    assert.equal(esquema.$schema, "https://json-schema.org/draft/2020-12/schema");
    assert.equal(esquema.additionalProperties, false);
    assert.equal(esquema.properties.schema.const, SCHEMA_SAIDA);
    for (const codigo of CODIGOS_ERRO) {
      assert.ok(esquema.properties.codigo.anyOf[0].enum.includes(codigo), codigo);
      assert.ok(esquema.$defs.erro.properties.codigo.enum.includes(codigo), codigo);
    }
    for (const definicao of ["versao", "etapa", "acao", "erro", "aviso"]) {
      assert.equal(esquema.$defs[definicao].additionalProperties, false, definicao);
    }
    assert.equal(esquema.$defs.etapa.properties.detalhes.additionalProperties, true);
  });

  it("fecha todos os objetos, exceto detalhes", () => {
    const esquema = construirEsquema();
    verificarObjetosFechados(esquema);
    assert.equal(esquema.$defs.etapa.properties.detalhes.additionalProperties, true);
  });

  it("aceita um documento completo do contrato", () => {
    const esquema = construirEsquema();
    validar(documentoExemplo(), esquema, esquema);
  });

  it("recusa documento com campo extra no topo", () => {
    const esquema = construirEsquema();
    const documento = { ...documentoExemplo(), campoExtra: true };
    assert.throws(() => validar(documento, esquema, esquema));
  });
});

describe("schema do estado", () => {
  it("declara o identificador e os objetos fechados", () => {
    const esquema = construirEsquemaEstado();
    assert.equal(esquema.$schema, "https://json-schema.org/draft/2020-12/schema");
    assert.equal(esquema.properties.schema.const, SCHEMA_ESTADO);
    assert.equal(esquema.additionalProperties, false);
    for (const campo of [
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
    ]) {
      assert.ok(esquema.required.includes(campo), campo);
    }
    assert.equal(esquema.properties.controlador.additionalProperties, false);
    assert.equal(esquema.properties.backup.additionalProperties, false);
    assert.equal(esquema.properties.origem.additionalProperties, false);
  });

  it("aceita o estado inicial do instalador", () => {
    const esquema = construirEsquemaEstado();
    const estado = estadoInicial({
      configuracao: { perfil: "simples", canal: "release", tag: "v1.0.0" },
      agora: "2026-11-11T12:00:00Z",
    });
    validar(estado, esquema, esquema);
  });
});

describe("redação do documento", () => {
  it("substitui segredos antes de serializar", () => {
    const documento = redigirObjeto({
      schema: SCHEMA_SAIDA,
      detalhes: {
        AUTH_SECRET: "valor-secreto",
        DATABASE_URL: "postgresql://aluno:segredo@db:5432/frequencia",
        Authorization: "Bearer token-secreto",
        cookie: "sessao=segredo",
        tokenDropbox: "valor-do-token",
      },
      configRclone: "/root/.config/rclone/rclone.conf",
      arquivoTokenDropbox: "/root/token-dropbox",
      configuracaoRclone: { seguro: true },
      adocaoDropbox: { adotado: false },
    });
    const texto = JSON.stringify(documento);
    assert.doesNotMatch(texto, /valor-secreto|segredo|token-secreto|sessao=|valor-do-token/);
    assert.match(texto, /\[REDIGIDO\]/);
    assert.equal(documento.configRclone, "/root/.config/rclone/rclone.conf");
    assert.equal(documento.arquivoTokenDropbox, "/root/token-dropbox");
    assert.equal(documento.configuracaoRclone.seguro, true);
    assert.equal(documento.adocaoDropbox.adotado, false);
  });
});
