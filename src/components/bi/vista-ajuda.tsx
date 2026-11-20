// Guia e dicionário de métricas: fórmulas, limites históricos e proteção do retrato local.
import Box from "@mui/material/Box";
import Grid from "@mui/material/Grid";
import Typography from "@mui/material/Typography";
import { Acordeao } from "@/components/ui/mui/acordeao";
import { Botao } from "@/components/ui/mui/botao";
import { SecaoConteudo } from "@/components/layout/secao-conteudo";
import { ROTULOS_RECURSOS_BI, type RecursoBi } from "@/domain/bi";
import type { DadosBi } from "@/domain/bi-analise";
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
    <Grid container spacing={2}>
      <Grid size={{ xs: 12, lg: 6 }}>
        <SecaoConteudo titulo="Usar o FrequenciBI">
          <Box component="ol" sx={{ m: 0, pl: 3 }}>
            <Typography component="li" variant="body2" sx={{ mb: 1.5 }}>
              Peça uma chave à Gestão. Ela permite consultar dados pessoais; use apenas em
              dispositivo autorizado.
            </Typography>
            <Typography component="li" variant="body2" sx={{ mb: 1.5 }}>
              Aplique um período. Os conjuntos são baixados completos, por páginas, somente quando
              necessários.
            </Typography>
            <Typography component="li" variant="body2" sx={{ mb: 1.5 }}>
              No Explorador, escolha a base, a dimensão, a medida e o gráfico. Salve uma visão ou
              adicione ao painel.
            </Typography>
            <Typography component="li" variant="body2" sx={{ mb: 1.5 }}>
              Na tabela do gráfico, filtre uma série, turma ou aluno. Use Aprofundar para descer da
              série à turma e ao aluno.
            </Typography>
            <Typography component="li" variant="body2" sx={{ mb: 1.5 }}>
              No painel, arraste o puxador para mover ou redimensionar. As setas do teclado e os
              botões também funcionam.
            </Typography>
            <Typography component="li" variant="body2" sx={{ mb: 1.5 }}>
              Configurações exportadas incluem notas e preferências locais, mas nunca a chave ou as
              bases baixadas.
            </Typography>
            <Typography component="li" variant="body2">
              Compartilhar copia só filtros; quem recebe precisa da própria chave. Apresentação e
              impressão mantêm o recorte.
            </Typography>
          </Box>
          <Acordeao titulo="Offline e privacidade">
            <Typography variant="body2" sx={{ color: "text.secondary" }}>
              O cache permite consultar recortes já baixados, com a data do retrato visível. Sem
              rede, não é possível conferir uma revogação recente. Ao reconectar, a chave é
              conferida; uma recusa remove os dados ligados a ela. Limpar tudo remove chave,
              preferências e dados locais. Exportações exigem guarda segura e confirmação.
            </Typography>
          </Acordeao>
        </SecaoConteudo>
      </Grid>
      <Grid size={{ xs: 12, lg: 6 }}>
        <SecaoConteudo titulo="Dicionário de dados">
          {METRICAS.map(([nome, descricao]) => (
            <Acordeao key={nome} titulo={nome} nivelTitulo="h3">
              <Typography variant="body2" sx={{ color: "text.secondary" }}>
                {descricao}
              </Typography>
            </Acordeao>
          ))}
        </SecaoConteudo>
      </Grid>
      <Grid size={12}>
        <SecaoConteudo titulo="Dados de apoio e cadastros">
          <Typography variant="body2" sx={{ color: "text.secondary" }}>
            Catálogos e cadastros refletem o estado atual; datas do filtro se aplicam aos eventos e
            feriados.
          </Typography>
          <Box sx={{ display: "flex", flexWrap: "wrap", gap: 1 }}>
            {recursos.map((r) => (
              <Botao
                key={r}
                variante="contorno"
                tamanho="pequeno"
                sx={{ height: 48 }}
                onClick={() => onCarregar(r)}
              >
                {ROTULOS_RECURSOS_BI[r]}
                {dados[r] ? `: ${dados[r]?.length}` : ""}
              </Botao>
            ))}
          </Box>
        </SecaoConteudo>
      </Grid>
    </Grid>
  );
}
