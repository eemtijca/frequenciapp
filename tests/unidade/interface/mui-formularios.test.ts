// Componentes de formulário e seleção da Fase 2.3: contrato, marcação acessível,
// medidas do tema, filtro sem acento e conversão de horário.
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ThemeProvider } from "@mui/material/styles";
import { LocalizationProvider } from "@mui/x-date-pickers/LocalizationProvider";
import { AdapterDayjs } from "@mui/x-date-pickers/AdapterDayjs";
import { ptBR } from "@mui/x-date-pickers/locales";
import dayjs from "dayjs";
import { describe, expect, it } from "vitest";
import { tema } from "@/theme/tema";
import { TOKENS_LAYOUT } from "@/theme/layout";
import { Campo } from "@/components/ui/mui/campo";
import { CampoTexto } from "@/components/ui/mui/text-field";
import { CampoSenha } from "@/components/ui/mui/campo-senha";
import { Selecionar } from "@/components/ui/mui/selecionar";
import { filtrarOpcoes, SelecionarBuscavel } from "@/components/ui/mui/selecionar-buscavel";
import { ANO_MAXIMO, ANO_MINIMO, gerarAnos, SeletorAno } from "@/components/ui/mui/seletor-ano";
import { deHorario, paraHorario, SeletorHorario } from "@/components/ui/mui/seletor-horario";
import { Interruptor } from "@/components/ui/mui/interruptor";

const DIRETORIO = fileURLToPath(new URL("../../../src/components/ui/mui/", import.meta.url));

const OPCOES = [
  { valor: "ana", rotulo: "Ana" },
  { valor: "alvaro", rotulo: "Álvaro" },
  { valor: "joao", rotulo: "João" },
  { valor: "primeiro", rotulo: "1º ano" },
];

function criar<P extends object>(
  componente: (props: P) => ReactNode,
  props: Omit<NoInfer<P>, "children">,
  ...filhos: ReactNode[]
): ReactNode {
  return createElement(componente, props as P, ...filhos);
}

function renderizar(elemento: ReactNode): string {
  return renderToStaticMarkup(
    createElement(
      ThemeProvider,
      { theme: tema },
      createElement(
        LocalizationProvider,
        {
          dateAdapter: AdapterDayjs,
          adapterLocale: "pt-br",
          localeText: ptBR.components.MuiLocalizationProvider.defaultProps.localeText,
        },
        elemento,
      ),
    ),
  );
}

function fonte(nome: string): string {
  return readFileSync(path.join(DIRETORIO, nome), "utf8");
}

function fontes(): { nome: string; texto: string }[] {
  return readdirSync(DIRETORIO)
    .filter((nome) => nome.endsWith(".tsx"))
    .sort()
    .map((nome) => ({ nome, texto: fonte(nome) }));
}

describe("Campo e CampoTexto", () => {
  const html = renderizar(
    criar(
      Campo,
      {
        id: "email",
        rotulo: "E-mail",
        descricao: "Use o e-mail da escola",
        erro: "Informe o e-mail",
        contador: "12/60",
      },
      createElement(CampoTexto, {
        valor: "ana@escola.exemplo",
        onValor: () => {},
        tipo: "email",
        disabled: true,
      }),
    ),
  );

  it("associa rótulo, contador, descrição e erro ao campo", () => {
    expect(html).toContain('for="email"');
    expect(html).toContain("E-mail");
    expect(html).toContain("12/60");
    expect(html).toContain('id="email-descricao"');
    expect(html).toContain('id="email-erro"');
    expect(html).toContain('role="alert"');
    expect(html).toContain('aria-describedby="email-descricao email-erro"');
    expect(html).toContain('aria-invalid="true"');
  });

  it("renderiza o campo controlado com 56 dp, raio 12 e contorno de foco", () => {
    expect(html).toContain("MuiOutlinedInput-root");
    expect(html).toContain('value="ana@escola.exemplo"');
    expect(html).toContain('type="email"');
    expect(html).toContain('disabled=""');
    expect(html).toContain("min-height:56px");
    expect(html).toContain("border-radius:12px");
    expect(html).toContain("outline:3px solid");
  });

  it("aceita o tamanho pequeno de 40 dp", () => {
    const pequeno = renderizar(
      createElement(CampoTexto, {
        id: "apelido",
        valor: "",
        onValor: () => {},
        tamanho: "pequeno",
      }),
    );
    expect(pequeno).toContain("min-height:40px");
  });

  it("injeta aria-describedby em um filho nativo", () => {
    const comFilhoNativo = renderizar(
      criar(
        Campo,
        { id: "apelido", rotulo: "Apelido", descricao: "Como aparece na chamada" },
        createElement("input", { id: "apelido", defaultValue: "Ana" }),
      ),
    );
    expect(comFilhoNativo).toContain('aria-describedby="apelido-descricao"');
    expect(comFilhoNativo).toContain('id="apelido-descricao"');
  });
});

describe("CampoSenha", () => {
  const html = renderizar(
    criar(
      Campo,
      { id: "senha", rotulo: "Senha" },
      createElement(CampoSenha, { valor: "segredo", onValor: () => {} }),
    ),
  );

  it("começa oculto e expõe o botão com rótulo alternado", () => {
    expect(html).toContain('type="password"');
    expect(html).toContain('aria-label="Mostrar senha"');
    expect(html).toContain('aria-pressed="false"');
    expect(html).toContain('aria-controls="senha"');
    expect(html).toContain('type="button"');
    expect(html).toContain('aria-hidden="true"');
  });

  it("reserva 48 dp para o botão de mostrar e ocultar", () => {
    expect(fonte("campo-senha.tsx")).toContain("TOKENS_LAYOUT.alvoToque");
    expect(html).toContain("width:48px");
    expect(html).toContain("height:48px");
  });
});

describe("Selecionar", () => {
  const html = renderizar(
    criar(
      Campo,
      { id: "turma", rotulo: "Turma", descricao: "Turma atual" },
      createElement(Selecionar, {
        valor: "",
        onValor: () => {},
        opcoes: [{ valor: "1", rotulo: "1A" }],
        ariaLabel: "Turma do aluno",
      }),
    ),
  );

  it("usa o Select do MUI com rótulo, placeholder e descrição", () => {
    expect(html).toContain('role="combobox"');
    expect(html).toContain('aria-haspopup="listbox"');
    expect(html).toContain('aria-expanded="false"');
    expect(html).toContain('aria-label="Turma do aluno"');
    expect(html).toContain('aria-describedby="turma-descricao"');
    expect(html).not.toContain('aria-labelledby="turma-rotulo"');
    expect(html).toContain("Selecione");
    expect(html).toContain("MuiSelect-select");
    expect(html).toContain("MuiSelect-icon");
    expect(html).toContain("min-height:56px");
  });

  it("usa o rótulo visível do Campo quando não há ariaLabel", () => {
    const semAriaLabel = renderizar(
      criar(
        Campo,
        { id: "serie", rotulo: "Série" },
        createElement(Selecionar, { valor: "", onValor: () => {}, opcoes: [] }),
      ),
    );
    expect(semAriaLabel).toContain('aria-labelledby="serie-rotulo"');
    expect(semAriaLabel).toContain('id="serie-rotulo"');
  });

  it("delega a busca ao SelecionarBuscavel quando pedido", () => {
    const buscavel = renderizar(
      createElement(Selecionar, {
        id: "aluno",
        valor: "",
        onValor: () => {},
        opcoes: OPCOES,
        buscavel: true,
        ariaLabel: "Aluno",
      }),
    );
    expect(buscavel).toContain("MuiAutocomplete-root");
    expect(buscavel).toContain('role="combobox"');
  });
});

describe("SelecionarBuscavel", () => {
  it("filtra sem acento e sem diferenciar maiúsculas", () => {
    expect(filtrarOpcoes(OPCOES, "ALVARO").map((opcao) => opcao.rotulo)).toEqual(["Álvaro"]);
    expect(filtrarOpcoes(OPCOES, "joao").map((opcao) => opcao.rotulo)).toEqual(["João"]);
    expect(filtrarOpcoes(OPCOES, "1o").map((opcao) => opcao.rotulo)).toEqual(["1º ano"]);
    expect(filtrarOpcoes(OPCOES, "")).toHaveLength(OPCOES.length);
  });

  const html = renderizar(
    criar(
      Campo,
      { id: "aluno", rotulo: "Aluno", descricao: "Nome completo" },
      createElement(SelecionarBuscavel, { valor: "", onValor: () => {}, opcoes: OPCOES }),
    ),
  );

  it("expõe combobox, nome acessível e descrição", () => {
    expect(html).toContain('id="aluno"');
    expect(html).toContain('role="combobox"');
    expect(html).toContain('aria-label="Aluno"');
    expect(html).toContain('aria-describedby="aluno-descricao"');
    expect(html).toContain('aria-autocomplete="list"');
    expect(html).toContain('aria-expanded="false"');
    expect(html).toContain("MuiAutocomplete-input");
  });

  it("recebe o estado de erro do Campo", () => {
    const comErro = renderizar(
      criar(
        Campo,
        { id: "aluno", rotulo: "Aluno", erro: "Escolha um aluno" },
        createElement(SelecionarBuscavel, { valor: "", onValor: () => {}, opcoes: OPCOES }),
      ),
    );
    expect(comErro).toContain('aria-invalid="true"');
    expect(comErro).toContain('aria-describedby="aluno-erro"');
  });

  it("limpa a busca ao reabrir e mantém a digitação no próprio campo", () => {
    const texto = fonte("selecionar-buscavel.tsx");
    expect(texto).toContain("filterOptions");
    expect(texto).toContain("inputValue={texto}");
    expect(texto).toContain("onInputChange");
    expect(texto).toContain("setEdicao({ chave: chaveSelecionada, texto: novo })");
    expect(texto).toContain("clearOnBlur={false}");
    expect(texto).toContain("openOnFocus");
    expect(texto).toContain("selectOnFocus");
  });
});

describe("SeletorAno", () => {
  it("gera o intervalo de 1900 a 2199", () => {
    const anos = gerarAnos();
    expect(anos).toHaveLength(300);
    expect(anos[0]).toBe(1900);
    expect(anos.at(-1)).toBe(2199);
    expect(gerarAnos(2022, 2020)).toEqual([2020, 2021, 2022]);
  });

  it("renderiza o ano com nome acessível e busca", () => {
    const html = renderizar(
      createElement(SeletorAno, {
        id: "ano",
        valor: "2026",
        rotuloAcessivel: "Ano letivo",
        onValor: () => {},
      }),
    );
    expect(html).toContain('id="ano"');
    expect(html).toContain('value="2026"');
    expect(html).toContain('role="combobox"');
    expect(html).toContain('aria-label="Ano letivo"');
    expect(html).toContain("MuiAutocomplete-input");
  });

  it("fixa os limites do plano e usa 56 dp", () => {
    expect(ANO_MINIMO).toBe(1900);
    expect(ANO_MAXIMO).toBe(2199);
    const texto = fonte("seletor-ano.tsx");
    expect(texto).toContain("TOKENS_LAYOUT.campo.medio");
    expect(texto).toContain("TOKENS_LAYOUT.campo.foco");
  });
});

describe("SeletorHorario", () => {
  it("converte HH:mm de ida e volta e recusa horários inválidos", () => {
    expect(paraHorario("00:00")?.format("HH:mm")).toBe("00:00");
    expect(paraHorario("08:30")?.format("HH:mm")).toBe("08:30");
    expect(paraHorario("23:59")?.format("HH:mm")).toBe("23:59");
    expect(paraHorario("8:30")).toBeNull();
    expect(paraHorario("24:00")).toBeNull();
    expect(paraHorario("12:60")).toBeNull();
    expect(paraHorario("")).toBeNull();
    expect(deHorario(null)).toBe("");
    expect(deHorario(dayjs("data-invalida"))).toBe("");
    expect(deHorario(paraHorario("08:30"))).toBe("08:30");
  });

  it("renderiza o TimePicker com 24 horas, pt-BR e descrição", () => {
    const html = renderizar(
      criar(
        Campo,
        { id: "horario", rotulo: "Horário da aula", descricao: "Formato de 24 horas" },
        createElement(SeletorHorario, {
          valor: "08:30",
          rotuloAcessivel: "Horário",
          onValor: () => {},
        }),
      ),
    );
    expect(html).toContain('id="horario"');
    expect(html).toContain('value="08:30"');
    expect(html).toContain('aria-describedby="horario-descricao"');
    expect(html).toContain("MuiPickersTextField-root");
    expect(html).toContain("MuiPickersOutlinedInput-root");
    expect(html).toContain('aria-labelledby="horario-label"');
    expect(html).toContain('id="horario-label"');
    expect(html).toContain("Horário");
  });

  it("recebe o estado de erro do Campo", () => {
    const html = renderizar(
      criar(
        Campo,
        { id: "horario", rotulo: "Horário da aula", erro: "Informe um horário" },
        createElement(SeletorHorario, {
          valor: "",
          rotuloAcessivel: "Horário",
          onValor: () => {},
        }),
      ),
    );
    expect(html).toContain('aria-invalid="true"');
    expect(html).toContain('aria-describedby="horario-erro"');
  });

  it("fixa 24 horas, formato HH:mm, passo de um minuto e alvo de 48 dp", () => {
    const texto = fonte("seletor-horario.tsx");
    expect(texto).toContain('const FORMATO_HORARIO = "HH:mm"');
    expect(texto).toContain("ampm={false}");
    expect(texto).toContain("timeSteps={{ minutes: 1 }}");
    expect(texto).toContain("TOKENS_LAYOUT.alvoToque");
    expect(texto).toContain("TOKENS_LAYOUT.campo.foco");
  });
});

describe("Interruptor", () => {
  const html = renderizar(
    createElement(Interruptor, {
      id: "notificacoes",
      checked: true,
      onChange: () => {},
      rotulo: "Notificações",
      descricao: "Avisos por e-mail",
    }),
  );

  it("associa rótulo, estado e descrição", () => {
    expect(html).toContain('role="switch"');
    expect(html).toContain('checked=""');
    expect(html).toContain('aria-describedby="notificacoes-interruptor-descricao"');
    expect(html).toContain("Notificações");
    expect(html).toContain("Avisos por e-mail");
  });

  it("reserva 48 dp para o alvo de toque", () => {
    expect(html).toContain("min-height:48px");
    expect(fonte("interruptor.tsx")).toContain("TOKENS_LAYOUT.alvoToque");
  });
});

describe("guardrails da Fase 2.3", () => {
  const esperados = [
    "campo-senha.tsx",
    "campo.tsx",
    "interruptor.tsx",
    "selecionar-buscavel.tsx",
    "selecionar.tsx",
    "seletor-ano.tsx",
    "seletor-horario.tsx",
    "text-field.tsx",
  ];
  const arquivos = fontes().filter(({ nome }) => esperados.includes(nome));

  it("cria os oito componentes da subetapa", () => {
    expect(arquivos.map(({ nome }) => nome)).toEqual(esperados);
  });

  it("não importa primitivas antigas nem o stack visual removido", () => {
    for (const { nome, texto } of arquivos) {
      expect(texto, nome).not.toContain("@/components/ui/");
      for (const proibido of ["@radix-ui", "lucide-react", "sonner", "next-themes"]) {
        expect(texto, nome).not.toContain(proibido);
      }
    }
  });

  it("não usa any, ts-ignore nem classes utilitárias do Tailwind", () => {
    for (const { nome, texto } of arquivos) {
      expect(texto, nome).not.toMatch(/\bany\b/);
      expect(texto, nome).not.toContain("@ts-ignore");
      expect(texto, nome).not.toContain("@ts-expect-error");
      expect(texto, nome).not.toMatch(/\bclassName=/);
    }
  });

  it("mantém o cabeçalho e as primitivas MUI de cada arquivo", () => {
    for (const { nome, texto } of arquivos) {
      const linhas = texto
        .split("\n")
        .map((linha) => linha.trim())
        .filter(Boolean);
      const inicio = linhas[0] === '"use client";' ? 1 : 0;
      expect(linhas[inicio]?.startsWith("//"), nome).toBe(true);
    }
    expect(fonte("campo.tsx")).toContain("@mui/material/FormControl");
    expect(fonte("campo.tsx")).toContain("@mui/material/FormLabel");
    expect(fonte("campo.tsx")).toContain("@mui/material/FormHelperText");
    expect(fonte("text-field.tsx")).toContain("@mui/material/OutlinedInput");
    expect(fonte("campo-senha.tsx")).toContain("@mui/material/IconButton");
    expect(fonte("selecionar.tsx")).toContain("@mui/material/Select");
    expect(fonte("selecionar.tsx")).toContain("@mui/material/MenuItem");
    expect(fonte("selecionar-buscavel.tsx")).toContain("@mui/material/Autocomplete");
    expect(fonte("seletor-ano.tsx")).toContain("@mui/material/Autocomplete");
    expect(fonte("seletor-horario.tsx")).toContain("@mui/x-date-pickers/TimePicker");
    expect(fonte("interruptor.tsx")).toContain("@mui/material/Switch");
  });

  it("usa os tokens de layout nos tamanhos e alvos de toque", () => {
    expect(TOKENS_LAYOUT.campo).toEqual({ medio: 56, pequeno: 40, raio: 12, foco: 3 });
    expect(fonte("text-field.tsx")).toContain("TOKENS_LAYOUT.campo.medio");
    expect(fonte("text-field.tsx")).toContain("TOKENS_LAYOUT.campo.pequeno");
  });
});
