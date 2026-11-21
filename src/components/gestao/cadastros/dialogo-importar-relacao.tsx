"use client";

// Importação da relação de alunos em CSV: escolhe ou cola o arquivo, confere
// o schema na hora, vê a prévia do que muda no cadastro e só então aplica.
import { useMemo, useRef, useState } from "react";
import CheckCircleRoundedIcon from "@mui/icons-material/CheckCircleRounded";
import FileUploadRoundedIcon from "@mui/icons-material/FileUploadRounded";
import Box from "@mui/material/Box";
import OutlinedInput from "@mui/material/OutlinedInput";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { Acordeao } from "@/components/ui/mui/acordeao";
import { Alerta } from "@/components/ui/mui/alerta";
import { AlertaCompacto } from "@/components/ui/mui/tela-estado";
import { Botao } from "@/components/ui/mui/botao";
import { Campo } from "@/components/ui/mui/campo";
import { Dialogo } from "@/components/ui/mui/dialogo";
import { avisarErro, avisarSucesso } from "@/lib/avisos";
import { useAcaoUnica } from "@/lib/use-acao-unica";
import { pedir, corpoJson, ErroApi } from "@/lib/api-cliente";
import { FAMILIA_MONO } from "@/theme/tipografia";
import type { Turma } from "@/domain/frequencia";
import {
  AJUDA_COLUNAS_RELACAO,
  CABECALHO_RELACAO,
  COLUNAS_RELACAO,
  lerRelacaoCsv,
  type ItemDoPlano,
  type PlanoDeImportacao,
} from "@/domain/importacao-alunos";

interface Props {
  aberto: boolean;
  onAbrir: (aberto: boolean) => void;
  turmas: Turma[];
  onImportado: () => Promise<void>;
}

interface Resposta {
  plano: PlanoDeImportacao;
  aplicado: { criados: number; atualizados: number; desativados: number } | null;
}

const ERROS_VISIVEIS = 8;

function plural(valor: number, singular: string, varios: string): string {
  return `${valor} ${valor === 1 ? singular : varios}`;
}

/** Lista de problemas em destaque, com as primeiras linhas e o total restante. */
function ListaDeProblemas({ titulo, itens }: { titulo: string; itens: string[] }) {
  const visiveis = itens.slice(0, ERROS_VISIVEIS);
  return (
    <Alerta severity="error" titulo={titulo}>
      <Box component="ul" sx={{ margin: 0, paddingLeft: 2 }}>
        {visiveis.map((item) => (
          <li key={item}>
            <Typography component="span" variant="body2">
              {item}
            </Typography>
          </li>
        ))}
      </Box>
      {itens.length > visiveis.length ? (
        <Typography variant="body2" sx={{ mt: 0.5 }}>
          E mais {plural(itens.length - visiveis.length, "problema", "problemas")}.
        </Typography>
      ) : null}
    </Alerta>
  );
}

export default function DialogoImportarRelacao({ aberto, onAbrir, turmas, onImportado }: Props) {
  const [texto, setTexto] = useState("");
  const [arquivo, setArquivo] = useState("");
  const [erroArquivo, setErroArquivo] = useState("");
  const [plano, setPlano] = useState<PlanoDeImportacao | null>(null);
  const [conferido, setConferido] = useState("");
  const [erro, setErro] = useState("");
  const seletor = useRef<HTMLInputElement>(null);

  const rotulo = useMemo(() => {
    const mapa = new Map(turmas.map((turma) => [turma.id, turma.rotulo]));
    return (id: string) => mapa.get(id) ?? "";
  }, [turmas]);

  // O schema é conferido na hora, antes de ir ao servidor.
  const leitura = useMemo(() => (texto.trim() ? lerRelacaoCsv(texto) : null), [texto]);
  const alunosLidos = leitura?.relacoes.reduce((soma, item) => soma + item.alunos.length, 0) ?? 0;
  const foraDoPadrao = Boolean(erroArquivo) || (leitura !== null && leitura.erros.length > 0);

  function trocarTexto(valor: string) {
    setTexto(valor);
    setPlano(null);
    setErro("");
  }

  async function lerArquivo(lista: FileList | null) {
    const escolhido = lista?.[0];
    if (seletor.current) seletor.current.value = "";
    if (!escolhido) return;
    setArquivo(escolhido.name);
    if (!/\.csv$/i.test(escolhido.name)) {
      setErroArquivo(`${escolhido.name} não é um arquivo CSV. Salve a relação como .csv.`);
      trocarTexto("");
      return;
    }
    setErroArquivo("");
    trocarTexto(await escolhido.text());
  }

  const { executando: conferindo, executar: conferir } = useAcaoUnica(async () => {
    setErro("");
    try {
      const resposta = await pedir<Resposta>("/api/alunos/importacao", corpoJson({ csv: texto }));
      setPlano(resposta.plano);
      setConferido(texto);
    } catch (excecao) {
      setErro(
        excecao instanceof ErroApi ? excecao.message : "Não foi possível conferir a relação.",
      );
    }
  });

  const { executando: aplicando, executar: aplicar } = useAcaoUnica(async () => {
    try {
      const resposta = await pedir<Resposta>(
        "/api/alunos/importacao",
        corpoJson({ csv: conferido, aplicar: true }),
      );
      const feito = resposta.aplicado;
      avisarSucesso(
        "Relação importada.",
        feito
          ? `${plural(feito.criados, "novo", "novos")}, ${plural(feito.atualizados, "atualizado", "atualizados")} e ${plural(feito.desativados, "desativado", "desativados")}. A Chamada já segue a relação.`
          : undefined,
      );
      onAbrir(false);
      setTexto("");
      setArquivo("");
      setPlano(null);
      await onImportado();
    } catch (excecao) {
      avisarErro(excecao, { contexto: "Não foi possível importar a relação." });
    }
  });

  const grupos = useMemo(() => {
    const itens = plano?.itens ?? [];
    const com = (mudanca: ItemDoPlano["mudancas"][number]) =>
      itens.filter((item) => item.mudancas.includes(mudanca));
    return [
      { titulo: "Novos no cadastro", itens: itens.filter((item) => item.alunoId === null) },
      { titulo: "Mudam de turma atual", itens: com("turma") },
      { titulo: "Mudam de turma original", itens: com("origem") },
      { titulo: "Voltam a ficar ativos", itens: com("reativar") },
      {
        titulo: "Sem mudança além da ordem",
        itens: itens.filter(
          (item) => item.alunoId !== null && item.mudancas.every((mudanca) => mudanca === "ordem"),
        ),
      },
    ];
  }, [plano]);

  const podeAplicar =
    plano !== null && plano.bloqueios.length === 0 && conferido === texto && !conferindo;

  return (
    <Dialogo
      aberto={aberto}
      onFechar={() => onAbrir(false)}
      titulo="Importar relação em CSV"
      descricao="Uma linha por aluno, com o cabeçalho abaixo. A Chamada passa a seguir a relação na ordem do arquivo, e o histórico de cada aluno é mantido. Use Exportar relação para baixar um arquivo já no padrão."
      tamanho="grande"
      acoes={
        <>
          <Botao variante="texto" onClick={() => onAbrir(false)}>
            Cancelar
          </Botao>
          <Botao
            variante="contorno"
            carregando={conferindo}
            disabled={!leitura || foraDoPadrao || aplicando}
            onClick={() => void conferir()}
          >
            Conferir
          </Botao>
          <Botao
            variante="secundario"
            carregando={aplicando}
            disabled={!podeAplicar}
            onClick={() => void aplicar()}
          >
            Aplicar
          </Botao>
        </>
      }
    >
      <Stack spacing={2}>
        <Box sx={{ backgroundColor: "action.hover", borderRadius: 1, p: 2 }}>
          <Typography
            component="code"
            variant="body2"
            sx={{ display: "block", fontFamily: FAMILIA_MONO, overflowWrap: "anywhere" }}
          >
            {CABECALHO_RELACAO}
          </Typography>
          <Acordeao titulo="Como montar o arquivo">
            <Box component="ul" sx={{ margin: 0, paddingLeft: 2 }}>
              {COLUNAS_RELACAO.map((coluna) => (
                <li key={coluna}>
                  <Typography component="span" variant="body2">
                    <Box component="span" sx={{ fontFamily: FAMILIA_MONO }}>
                      {coluna}
                    </Box>
                    : {AJUDA_COLUNAS_RELACAO[coluna]}.
                  </Typography>
                </li>
              ))}
              <li>
                <Typography component="span" variant="body2">
                  Separador ponto e vírgula, codificação UTF-8. Alunos ativos das turmas do arquivo
                  que não estiverem nele são desativados, sem perder o histórico.
                </Typography>
              </li>
            </Box>
          </Acordeao>
        </Box>

        <Stack spacing={1}>
          <Stack direction="row" spacing={1} sx={{ justifyContent: "flex-end" }}>
            <Botao
              variante="contorno"
              tamanho="pequeno"
              icone={<FileUploadRoundedIcon />}
              onClick={() => seletor.current?.click()}
            >
              Escolher .csv
            </Botao>
            <input
              ref={seletor}
              type="file"
              accept=".csv,text/csv"
              hidden
              onChange={(evento) => void lerArquivo(evento.target.files)}
            />
          </Stack>
          <Campo id="texto-relacao" rotulo="Conteúdo do CSV">
            <OutlinedInput
              id="texto-relacao"
              multiline
              minRows={7}
              fullWidth
              value={texto}
              onChange={(evento) => {
                setErroArquivo("");
                setArquivo("");
                trocarTexto(evento.target.value);
              }}
              placeholder={`${CABECALHO_RELACAO}\n3º ano A;1;Nome do aluno;3º ano B`}
              slotProps={{
                input: {
                  "aria-invalid": foraDoPadrao || undefined,
                  "aria-describedby": "situacao-relacao",
                  spellCheck: false,
                },
              }}
              sx={{
                alignItems: "flex-start",
                fontFamily: FAMILIA_MONO,
                fontSize: "0.8125rem",
              }}
            />
          </Campo>
          <Box id="situacao-relacao">
            {erroArquivo ? (
              <ListaDeProblemas titulo="Arquivo fora do padrão" itens={[erroArquivo]} />
            ) : leitura && leitura.erros.length > 0 ? (
              <ListaDeProblemas
                titulo={`${arquivo || "O CSV"} está fora do padrão`}
                itens={leitura.erros}
              />
            ) : leitura ? (
              <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
                <CheckCircleRoundedIcon fontSize="small" color="primary" aria-hidden="true" />
                <Typography variant="body2" color="primary">
                  {arquivo ? `${arquivo}: ` : ""}
                  {plural(alunosLidos, "aluno", "alunos")} em{" "}
                  {plural(leitura.relacoes.length, "turma", "turmas")}, no padrão. Toque em
                  Conferir.
                </Typography>
              </Stack>
            ) : null}
          </Box>
        </Stack>

        {erro ? (
          <AlertaCompacto variante="dados_invalidos" descricao={erro} tamanho="linha" />
        ) : null}

        {plano ? (
          <Stack spacing={2} aria-live="polite">
            {plano.bloqueios.length > 0 ? (
              <ListaDeProblemas titulo="Corrija antes de aplicar" itens={plano.bloqueios} />
            ) : null}
            {plano.avisos.length > 0 ? (
              <AlertaCompacto
                variante="conflito"
                titulo="Confira"
                descricao={plano.avisos.join(" ")}
                tamanho="linha"
              />
            ) : null}
            <Box
              component="ul"
              aria-label="Alunos por turma"
              sx={{
                display: "flex",
                flexWrap: "wrap",
                gap: 1,
                margin: 0,
                padding: 0,
                listStyle: "none",
              }}
            >
              {plano.turmas.map((turma) => (
                <Box
                  component="li"
                  key={turma.turmaId}
                  sx={(tema) => ({
                    flex: "1 1 160px",
                    p: 1.5,
                    border: `1px solid ${tema.vars.palette.divider}`,
                    borderRadius: 1,
                  })}
                >
                  <Typography variant="body2" sx={{ fontWeight: 600 }}>
                    {turma.rotulo}
                  </Typography>
                  <Typography
                    variant="caption"
                    sx={{ color: "text.secondary", fontVariantNumeric: "tabular-nums" }}
                  >
                    {plural(turma.alunos, "aluno", "alunos")}
                  </Typography>
                </Box>
              ))}
            </Box>
            <Box>
              {grupos.map((grupo) => (
                <Acordeao
                  key={grupo.titulo}
                  titulo={grupo.titulo}
                  resumo={`${grupo.itens.length}`}
                  nivelTitulo="h4"
                >
                  {grupo.itens.length === 0 ? (
                    <Typography variant="body2" sx={{ color: "text.secondary" }}>
                      Nenhum aluno neste grupo.
                    </Typography>
                  ) : (
                    <Box component="ul" sx={{ margin: 0, paddingLeft: 2 }}>
                      {grupo.itens.map((item) => (
                        <li key={`${item.alunoId ?? item.nome}-${item.turmaId}`}>
                          <Typography variant="caption" sx={{ color: "text.secondary" }}>
                            {item.nome}: {rotulo(item.turmaId)}, origem{" "}
                            {rotulo(item.turmaOriginalId)}
                          </Typography>
                        </li>
                      ))}
                    </Box>
                  )}
                </Acordeao>
              ))}
              <Acordeao
                titulo="Desativados por não estarem na relação"
                resumo={`${plano.desativar.length}`}
                nivelTitulo="h4"
              >
                {plano.desativar.length === 0 ? (
                  <Typography variant="body2" sx={{ color: "text.secondary" }}>
                    Nenhum aluno será desativado.
                  </Typography>
                ) : (
                  <Box component="ul" sx={{ margin: 0, paddingLeft: 2 }}>
                    {plano.desativar.map((aluno) => (
                      <li key={aluno.alunoId}>
                        <Typography variant="caption" sx={{ color: "text.secondary" }}>
                          {aluno.nome}: {rotulo(aluno.turmaId)}
                        </Typography>
                      </li>
                    ))}
                  </Box>
                )}
              </Acordeao>
            </Box>
          </Stack>
        ) : null}
      </Stack>
    </Dialogo>
  );
}
