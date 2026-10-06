// Valida o isolamento por schema e a preparação segura das sessões administrativas.
import { describe, expect, it, vi } from "vitest";
import {
  identificadorPostgres,
  resolverSchema,
  schemaDaConexao,
  selecionarSchema,
} from "@/infra/schema-postgres.mjs";

const URL_LOCAL = "postgresql://qa:senha-local@localhost:5432/qa";

function conexaoComSchema(schema: string) {
  const url = new URL(URL_LOCAL);
  url.searchParams.set("schema", schema);
  return url.toString();
}

describe("schema da conexão PostgreSQL", () => {
  it("mantém public como padrão e respeita o schema explícito", () => {
    expect(schemaDaConexao(URL_LOCAL)).toBe("public");
    expect(schemaDaConexao(`${URL_LOCAL}?sslmode=require&schema=preview`)).toBe("preview");
    expect(schemaDaConexao(URL_LOCAL.replace("postgresql:", "postgres:"))).toBe("public");
  });

  it("preserva maiúsculas, acentos e caracteres escapados da URL", () => {
    expect(schemaDaConexao(conexaoComSchema("QA Prévia, outubro"))).toBe("QA Prévia, outubro");
  });

  it.each(["", "\0", "qa\0preview", "a".repeat(64), "á".repeat(32)])(
    "rejeita schema vazio, NUL ou maior que 63 bytes: %j",
    (schema) => {
      expect(() => schemaDaConexao(conexaoComSchema(schema))).toThrow(
        "O schema da conexão PostgreSQL é inválido.",
      );
    },
  );

  it("aceita o limite PostgreSQL de 63 bytes", () => {
    expect(schemaDaConexao(conexaoComSchema("a".repeat(63)))).toBe("a".repeat(63));
    const nome = "á".repeat(31) + "a";
    expect(schemaDaConexao(conexaoComSchema(nome))).toBe(nome);
  });

  it("recusa parâmetros duplicados em vez de escolher silenciosamente um schema", () => {
    expect(() => schemaDaConexao(`${URL_LOCAL}?schema=preview&schema=public`)).toThrow(
      "O schema da conexão PostgreSQL deve ser informado apenas uma vez.",
    );
  });

  it("recusa o marcador especial que search_path expande para o usuário conectado", () => {
    expect(() => schemaDaConexao(conexaoComSchema("$user"))).toThrow(
      "O schema da conexão PostgreSQL é inválido.",
    );
  });

  it.each(['QA "Prévia"', "qa\npreview", "qa\tpreview", "qa\u007fpreview", "qa\u0085preview"])(
    "recusa aspas e controles que o compiler Prisma não aceita com segurança: %j",
    (schema) => {
      expect(() => schemaDaConexao(conexaoComSchema(schema))).toThrow(
        "O schema da conexão PostgreSQL é inválido.",
      );
    },
  );

  it.each(["", "credencial-invalida", "https://qa:segredo@localhost/qa", "postgresql:///qa"])(
    "rejeita URL inválida sem reproduzir credenciais: %j",
    (url) => {
      expect(() => schemaDaConexao(url)).toThrow("A URL de conexão PostgreSQL é inválida.");
    },
  );

  it.each([
    "postgresql://qa:senha@localhost:5432/qa&schema=preview",
    "postgresql://qa:senha@localhost:5432/qa&sslmode=require",
    "postgresql://qa:senha@localhost:5432/qa=x",
  ])("rejeita parâmetros colados no caminho sem o separador ?: %j", (url) => {
    expect(() => schemaDaConexao(url)).toThrow(
      "A URL de conexão PostgreSQL tem parâmetros sem o separador ?.",
    );
  });
});

describe("resolução do schema efetivo", () => {
  it("prefere a variável explícita, cai na URL e usa public como padrão", () => {
    expect(
      resolverSchema({ url: conexaoComSchema("preview"), schemaExplicito: "preview_pr_12" }),
    ).toBe("preview_pr_12");
    expect(resolverSchema({ url: conexaoComSchema("preview") })).toBe("preview");
    expect(resolverSchema({ url: URL_LOCAL, schemaExplicito: "" })).toBe("public");
    expect(resolverSchema({ url: URL_LOCAL })).toBe("public");
  });

  it("valida a variável explícita com as mesmas regras da URL", () => {
    for (const schema of ["$user", 'QA "Prévia"', "a".repeat(64), "qa\npreview"]) {
      expect(() => resolverSchema({ url: URL_LOCAL, schemaExplicito: schema })).toThrow(
        "O schema da conexão PostgreSQL é inválido.",
      );
    }
  });

  it("valida a URL mesmo quando o schema explícito está definido", () => {
    expect(() =>
      resolverSchema({ url: "credencial-invalida", schemaExplicito: "preview" }),
    ).toThrow("A URL de conexão PostgreSQL é inválida.");
  });

  it("recusa parâmetros sem separador antes de resolver o schema", () => {
    expect(() =>
      resolverSchema({ url: "postgresql://qa:senha@localhost:5432/qa&schema=preview" }),
    ).toThrow("A URL de conexão PostgreSQL tem parâmetros sem o separador ?.");
  });
});

describe("identificador PostgreSQL", () => {
  it("delimita o nome completo e escapa aspas sem criar outro identificador", () => {
    expect(identificadorPostgres("preview")).toBe('"preview"');
    expect(identificadorPostgres('QA", public; --')).toBe('"QA"", public; --"');
  });

  it.each(["", "qa\0preview", "a".repeat(64)])("rejeita nome inválido: %j", (nome) => {
    expect(() => identificadorPostgres(nome)).toThrow();
  });
});

describe("seleção de schema para scripts", () => {
  it("confere existência e acesso antes de selecionar apenas o schema solicitado", async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce({ rows: [{ uso: true }] })
      .mockResolvedValue({
        rows: [],
      });
    const schema = "QA, public; --";

    await selecionarSchema({ query }, conexaoComSchema(schema));

    expect(query).toHaveBeenCalledTimes(2);
    expect(query.mock.calls[0]?.[0]).toContain("pg_catalog.has_schema_privilege");
    expect(query.mock.calls[0]?.[1]).toEqual([schema]);
    expect(query.mock.calls[1]).toEqual([
      "select pg_catalog.set_config('search_path', $1, false)",
      ['"QA, public; --"'],
    ]);
  });

  it("usa o schema explícito da plataforma quando informado", async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce({ rows: [{ uso: true }] })
      .mockResolvedValue({ rows: [] });

    await selecionarSchema({ query }, conexaoComSchema("preview"), "preview_pr_12");

    expect(query.mock.calls[1]).toEqual([
      "select pg_catalog.set_config('search_path', $1, false)",
      ['"preview_pr_12"'],
    ]);
  });

  it("falha sem alterar search_path quando o schema não existe", async () => {
    const query = vi.fn().mockResolvedValue({ rows: [] });

    await expect(
      selecionarSchema({ query }, conexaoComSchema("inexistente")),
    ).rejects.toMatchObject({
      code: "3F000",
      message: "O schema configurado não existe. Crie o schema antes de continuar.",
    });
    expect(query).toHaveBeenCalledTimes(1);
  });

  it("falha sem usar public quando a conexão não tem USAGE", async () => {
    const query = vi.fn().mockResolvedValue({ rows: [{ uso: false }] });

    await expect(selecionarSchema({ query }, conexaoComSchema("restrito"))).rejects.toMatchObject({
      code: "42501",
    });
    expect(query).toHaveBeenCalledTimes(1);
  });

  it("não executa SQL se a configuração do schema for inválida", async () => {
    const query = vi.fn();

    await expect(selecionarSchema({ query }, conexaoComSchema(""))).rejects.toThrow();
    expect(query).not.toHaveBeenCalled();
  });
});
