// Guia e dicionário de métricas: fórmulas, limites históricos e proteção do retrato local.
import { ROTULOS_RECURSOS_BI, type RecursoBi } from "@/domain/bi";
import type { DadosBi } from "@/domain/bi-analise";
import { Button } from "@/components/ui/button";
const METRICAS = [
  [
    "Alunos registrados",
    "Soma dos alunos considerados em cada chamada salva. Um aluno em vários dias conta várias vezes; desistência e histórico seguem o relatório interno.",
  ],
  ["Alunos ativos", "Cadastro atual: ativo e sem desistência. Não reconstrói matrículas antigas."],
  [
    "Presentes, faltas e justificadas",
    "Marca consolidada por aluno e dia, com presença implícita. Faltas por aula são outra base e não equivalem a faltas por dia. A Lista deriva os mesmos totais das marcas P, F, FJ e S, permitindo taxas por aluno; Sem marca não entra no denominador.",
  ],
  [
    "Ausências e infrequência",
    "Ausências = faltas + justificadas. Infrequência = soma das ausências / soma dos registrados × 100. Sem registrados, o valor fica sem base de cálculo.",
  ],
  [
    "Presença parcial e taxa de presença",
    "Marca S da chamada consolidada. Taxa de presença = soma dos presentes / soma dos registrados × 100; presença parcial é contada separadamente.",
  ],
  [
    "Dias com chamada e cobertura",
    "Dias distintos com chamada salva. Cobertura do recorte = turmas-dia salvas / turmas-dia esperadas, usando o cadastro atual, feriados e dias com chamada. É uma estimativa, pois não existe histórico completo de matrículas ou de sábados liberados.",
  ],
  [
    "Saídas e entradas",
    "Contagem de registros, não de alunos únicos. Saídas usam a turma atual do aluno; entradas preservam a turma gravada no evento.",
  ],
  [
    "Chamada Parcial",
    "Contagem por tipo e turno. Aulas soma apenas as aulas explicitamente armazenadas; registros de dia inteiro ou turno sem aulas enumeradas não ganham uma quantidade estimada.",
  ],
  [
    "Confirmação Seduc",
    "Confirmados têm RS marcado; pendentes são os demais registros. Taxa = confirmados / registros × 100. A lista da chamada e os registros parciais são conjuntos diferentes; a soma de pendências não representa alunos distintos.",
  ],
  [
    "Aulas e faltas por aula",
    "Na base Faltas, cada linha é uma falta em uma aula. Na base Parcial, a dimensão Aula expande apenas as aulas enumeradas. Disciplinas das faltas usam o horário cadastrado; alterações posteriores do horário podem mudar essa atribuição.",
  ],
  [
    "Autoria e situação",
    "Autoria é o nome de quem atualizou ou criou. Situação é o cadastro atual, mesmo em eventos históricos. Nomes atuais de alunos e turmas podem mudar; parciais preservam os nomes gravados.",
  ],
  [
    "Comparações e limiares",
    "Período anterior tem a mesma quantidade de dias; ano anterior ajusta 29 de fevereiro para 28. Variações de taxas são pontos percentuais. Limiar destaca valores no patamar ou acima; não significa avaliação automática de qualidade.",
  ],
];
export function VistaAjudaBi({
  dados,
  recursos,
  onCarregar,
}: {
  dados: DadosBi;
  recursos: RecursoBi[];
  onCarregar: (r: RecursoBi) => void;
}) {
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <section className="superficie-vidro p-5">
        <h2 className="mb-3 text-lg font-semibold">Usar o FrequenciBI</h2>
        <ol className="list-decimal space-y-3 pl-5 text-sm">
          <li>
            Peça uma chave à Gestão. Ela permite consultar dados pessoais; use apenas em dispositivo
            autorizado.
          </li>
          <li>
            Aplique um período. Os conjuntos são baixados completos, por páginas, somente quando
            necessários.
          </li>
          <li>
            No Explorador, escolha a base, a dimensão, a medida e o gráfico. Salve uma visão ou
            adicione ao painel.
          </li>
          <li>
            Na tabela do gráfico, filtre uma série, turma ou aluno. Use Aprofundar para descer da
            série à turma e ao aluno.
          </li>
          <li>
            No painel, arraste o puxador para mover ou redimensionar. As setas do teclado e os
            botões também funcionam.
          </li>
          <li>
            Configurações exportadas incluem notas e preferências locais, mas nunca a chave ou as
            bases baixadas.
          </li>
          <li>
            Compartilhar copia só filtros; quem recebe precisa da própria chave. Apresentação e
            impressão mantêm o recorte.
          </li>
        </ol>
        <details className="mt-4">
          <summary className="cursor-pointer font-medium">Offline e privacidade</summary>
          <p className="text-muted-foreground mt-2 text-sm">
            O cache permite consultar recortes já baixados, com a data do retrato visível. Sem rede,
            não é possível conferir uma revogação recente. Ao reconectar, a chave é conferida; uma
            recusa remove os dados ligados a ela. Limpar tudo remove chave, preferências e dados
            locais. Exportações exigem guarda segura e confirmação.
          </p>
        </details>
      </section>
      <section className="superficie-vidro p-5">
        <h2 className="mb-3 text-lg font-semibold">Dicionário de dados</h2>
        <div className="space-y-2">
          {METRICAS.map(([nome, descricao]) => (
            <details key={nome} className="border-border border-b py-2">
              <summary className="cursor-pointer text-sm font-medium">{nome}</summary>
              <p className="text-muted-foreground mt-2 text-sm">{descricao}</p>
            </details>
          ))}
        </div>
      </section>
      <section className="superficie-vidro p-5 lg:col-span-2">
        <h2 className="mb-3 text-lg font-semibold">Dados de apoio e cadastros</h2>
        <p className="text-muted-foreground mb-3 text-sm">
          Catálogos e cadastros refletem o estado atual; datas do filtro se aplicam aos eventos e
          feriados.
        </p>
        <div className="flex flex-wrap gap-2">
          {recursos.map((r) => (
            <Button key={r} size="sm" variant="outline" onClick={() => onCarregar(r)}>
              {ROTULOS_RECURSOS_BI[r]}
              {dados[r] ? `: ${dados[r]?.length}` : ""}
            </Button>
          ))}
        </div>
      </section>
    </div>
  );
}
