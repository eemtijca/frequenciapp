// Identifica os destinos da Gestão e agrupa as seções da gaveta de Configurações.
export const CADASTROS_GESTAO = {
  series: "Séries",
  turmas: "Turmas",
  alunos: "Alunos",
  equipe: "Equipe",
  diretores: "Diretores",
} as const;

export type CadastroGestao = keyof typeof CADASTROS_GESTAO;
export type DestinoGestao = CadastroGestao | "configuracoes";

export const CATEGORIAS_CONFIGURACOES = [
  {
    valor: "escola",
    rotulo: "Escola",
    secoes: [
      { valor: "geral", rotulo: "Geral" },
      { valor: "frequencia", rotulo: "Frequência" },
      { valor: "calendario", rotulo: "Calendário" },
      { valor: "cadastros", rotulo: "Cadastros" },
    ],
  },
  {
    valor: "horarios",
    rotulo: "Horários",
    secoes: [
      { valor: "aulas", rotulo: "Aulas" },
      { valor: "almoco", rotulo: "Almoço" },
      { valor: "provas", rotulo: "Provas" },
    ],
  },
  { valor: "planilhas", rotulo: "Planilhas" },
  {
    valor: "acesso",
    rotulo: "Acesso e avisos",
    secoes: [
      { valor: "diretores", rotulo: "Diretores" },
      { valor: "notificacoes", rotulo: "Notificações" },
      { valor: "bi", rotulo: "FrequenciBI" },
    ],
  },
  { valor: "dados", rotulo: "Dados" },
] as const;

type Categoria = (typeof CATEGORIAS_CONFIGURACOES)[number];
export type CategoriaConfiguracoes = Categoria["valor"];
type Secao = Extract<Categoria, { secoes: readonly unknown[] }>["secoes"][number];
export type DestinoConfiguracoes =
  Secao["valor"] | Exclude<Categoria, { secoes: unknown }>["valor"];

export function categoriaDe(destino: DestinoConfiguracoes): Categoria {
  return (
    CATEGORIAS_CONFIGURACOES.find((categoria) =>
      "secoes" in categoria
        ? categoria.secoes.some(({ valor }) => valor === destino)
        : categoria.valor === destino,
    ) ?? CATEGORIAS_CONFIGURACOES[0]
  );
}
