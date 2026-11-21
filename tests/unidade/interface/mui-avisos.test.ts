// Avisos MUI: fila curta, substituição por id, expiração, remoção e leitura acessível.
import { readFileSync } from "node:fs";
import path from "node:path";
import { createElement, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ThemeProvider } from "@mui/material/styles";
import { beforeEach, describe, expect, it } from "vitest";
import { tema } from "@/theme/tema";
import {
  AvisoAlerta,
  DURACOES_AVISO,
  LIMITE_AVISOS,
  limparAvisos,
  obterAvisos,
  publicarAviso,
  removerAviso,
  type Aviso,
} from "@/components/ui/mui/avisos";

function renderizar(elemento: ReactElement): string {
  return renderToStaticMarkup(createElement(ThemeProvider, { theme: tema }, elemento));
}

function criarAviso(sobrescreve: Partial<Aviso> = {}): Aviso {
  return {
    id: "aviso-teste",
    chave: 1,
    severidade: "error",
    titulo: "Não foi possível salvar.",
    descricao: "A chamada continua na tela.",
    duracao: DURACOES_AVISO.error,
    expiraEm: Date.now() + DURACOES_AVISO.error,
    ...sobrescreve,
  };
}

describe("fila de avisos", () => {
  beforeEach(() => {
    limparAvisos();
  });

  it("mantém no máximo três avisos e descarta o mais antigo", () => {
    publicarAviso({ severidade: "success", titulo: "Primeiro" });
    publicarAviso({ severidade: "info", titulo: "Segundo" });
    publicarAviso({ severidade: "error", titulo: "Terceiro" });
    expect(obterAvisos().map((aviso) => aviso.titulo)).toEqual(["Primeiro", "Segundo", "Terceiro"]);

    publicarAviso({ severidade: "success", titulo: "Quarto" });
    expect(obterAvisos()).toHaveLength(LIMITE_AVISOS);
    expect(obterAvisos().map((aviso) => aviso.titulo)).toEqual(["Segundo", "Terceiro", "Quarto"]);
  });

  it("substitui o aviso repetido pelo id e o move para o fim da fila", () => {
    publicarAviso({ id: "salvar", severidade: "info", titulo: "Salvando" });
    publicarAviso({ id: "outro", severidade: "success", titulo: "Outro" });
    publicarAviso({ id: "salvar", severidade: "success", titulo: "Salvo" });

    expect(obterAvisos()).toHaveLength(2);
    expect(obterAvisos().map((aviso) => aviso.titulo)).toEqual(["Outro", "Salvo"]);
    expect(obterAvisos()[1]?.id).toBe("salvar");
  });

  it("devolve o id gerado e aplica a duração padrão ou informada", () => {
    const gerado = publicarAviso({ severidade: "success", titulo: "Salvo" });
    expect(gerado).toMatch(/^aviso-\d+$/);
    expect(obterAvisos()[0]?.duracao).toBe(DURACOES_AVISO.success);

    publicarAviso({ id: "curto", severidade: "info", titulo: "Curto", duracao: 3000 });
    expect(obterAvisos()[1]?.duracao).toBe(3000);
  });

  it("remove pelo id e não falha quando o aviso já saiu da fila", () => {
    const primeiro = publicarAviso({ severidade: "success", titulo: "Primeiro" });
    publicarAviso({ severidade: "info", titulo: "Segundo" });

    removerAviso(primeiro);
    expect(obterAvisos().map((aviso) => aviso.titulo)).toEqual(["Segundo"]);

    removerAviso("inexistente");
    expect(obterAvisos().map((aviso) => aviso.titulo)).toEqual(["Segundo"]);
  });

  it("esvazia a fila na limpeza explícita", () => {
    publicarAviso({ severidade: "success", titulo: "Primeiro" });
    limparAvisos();
    expect(obterAvisos()).toEqual([]);
  });
});

describe("AvisoAlerta", () => {
  it("usa papel de alerta e leitura assertiva no erro, com repetição", () => {
    const html = renderizar(
      createElement(AvisoAlerta, {
        aviso: criarAviso({ tentarDeNovo: () => undefined }),
        aoFechar: () => undefined,
      }),
    );
    expect(html).toContain('role="alert"');
    expect(html).toContain('aria-live="assertive"');
    expect(html).toContain('aria-atomic="true"');
    expect(html).toContain("Não foi possível salvar.");
    expect(html).toContain("A chamada continua na tela.");
    expect(html).toContain("Tentar novamente");
    expect(html).toContain('aria-label="Fechar aviso"');
  });

  it("usa papel de status e leitura educada no sucesso e na informação", () => {
    for (const severidade of ["success", "info"] as const) {
      const html = renderizar(
        createElement(AvisoAlerta, {
          aviso: criarAviso({ severidade, titulo: "Tudo certo.", descricao: undefined }),
          aoFechar: () => undefined,
        }),
      );
      expect(html).toContain('role="status"');
      expect(html).toContain('aria-live="polite"');
      expect(html).not.toContain("Tentar novamente");
    }
  });
});

describe("restrições estáticas dos avisos", () => {
  const caminho = path.resolve(process.cwd(), "src/components/ui/mui/avisos.tsx");
  const fonte = readFileSync(caminho, "utf8");

  it("mantém cabeçalho e a API pública do provedor", () => {
    const linhas = fonte.split("\n");
    let inicio = linhas[0]?.startsWith('"use client"') ? 1 : 0;
    while (linhas[inicio]?.trim() === "") inicio += 1;
    expect(linhas[inicio]?.trim().startsWith("//"), "o arquivo deve começar com cabeçalho").toBe(
      true,
    );
    expect(fonte).toContain("export function ProvedorAvisos");
    expect(fonte).toContain("export function publicarAviso");
    expect(fonte).toContain("export function removerAviso");
    expect(fonte).toContain("export function limparAvisos");
  });

  it("limita a fila, posiciona acima da barra de ações e não usa o Sonner", () => {
    expect(fonte).toContain("LIMITE_AVISOS = 3");
    expect(fonte).toContain('anchorOrigin={{ vertical: "bottom", horizontal: "right" }}');
    expect(fonte).toContain("DESLOCAMENTO_CELULAR = 84");
    expect(fonte).toContain("aria-live");
    expect(fonte).toContain("Tentar novamente");
    expect(fonte).toContain("Snackbar");
    expect(fonte).toContain("Alert");
    expect(fonte).not.toContain("sonner");
    expect(fonte).not.toContain("className=");
    expect(fonte).not.toContain("@ts-ignore");
    expect(fonte).not.toMatch(/\bany\b/);
  });
});
