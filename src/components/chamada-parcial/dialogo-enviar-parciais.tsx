"use client";

// Conferência do período e das novas linhas antes do envio à terceira planilha.
// A prévia usa tabelas MUI com cabeçalhos de linha e legenda acessível.
import { Fragment, useState } from "react";
import Box from "@mui/material/Box";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableHead from "@mui/material/TableHead";
import TableRow from "@mui/material/TableRow";
import Typography from "@mui/material/Typography";
import type { Turma } from "@/domain/frequencia";
import type { planejarParciais } from "@/domain/planilha-parcial";
import { CABECALHO_PARCIAL } from "@/domain/planilha-parcial";
import { pedir, corpoJson } from "@/lib/api-cliente";
import { avisarSucesso, mensagemAmigavel } from "@/lib/avisos";
import { useAcaoUnica } from "@/lib/use-acao-unica";
import { AlertaCompacto } from "@/components/ui/mui/tela-estado";
import { Botao } from "@/components/ui/mui/botao";
import { Campo } from "@/components/ui/mui/campo";
import { Dialogo } from "@/components/ui/mui/dialogo";
import { Interruptor } from "@/components/ui/mui/interruptor";
import { Selecionar } from "@/components/ui/mui/selecionar";
import { SeletorPeriodo } from "@/components/ui/seletor-periodo";

type Previa = ReturnType<typeof planejarParciais> & { novas: number; atualizacoes: number };

const TEXTO_OCULTO = {
  position: "absolute",
  width: 1,
  height: 1,
  padding: 0,
  margin: -1,
  overflow: "hidden",
  clip: "rect(0, 0, 0, 0)",
  whiteSpace: "nowrap",
  border: 0,
} as const;

function valorDaLinha(
  linha: { celulas: { coluna: number; valor: string }[]; anteriores: string[] },
  coluna: number,
): string {
  return (
    linha.celulas.find((celula) => celula.coluna === coluna)?.valor ??
    linha.anteriores[coluna - 1] ??
    ""
  );
}

function valorParaConferencia(valor: string): string {
  return valor || "Vazio";
}

function dataCurta(dia: string): string {
  return dia.split("-").reverse().join("/");
}

interface Props {
  aberto: boolean;
  turmas: Turma[];
  diaCorrente: string;
  diaInicial: string;
  turmaInicial: string;
  planilhaNome: string | null;
  onFechar: () => void;
}

export function DialogoEnviarParciais({
  aberto,
  turmas,
  diaCorrente,
  diaInicial,
  turmaInicial,
  planilhaNome,
  onFechar,
}: Props) {
  const [de, setDe] = useState(`${diaInicial.slice(0, 7)}-01`);
  const [ate, setAte] = useState(diaInicial);
  const [turmaId, setTurmaId] = useState(turmaInicial);
  const [previa, setPrevia] = useState<Previa | null>(null);
  const [erro, setErro] = useState("");
  const [resultadoIncerto, setResultadoIncerto] = useState(false);
  const [atualizarExistentes, setAtualizarExistentes] = useState(false);
  const filtro = { de, ate, atualizarExistentes, ...(turmaId ? { turmaId } : {}) };

  function invalidarPrevia() {
    setPrevia(null);
    setErro("");
  }

  const { executando: conferindo, executar: conferir } = useAcaoUnica(async () => {
    setErro("");
    setPrevia(null);
    try {
      const dados = await pedir<Previa>("/api/planilha-parcial/simular", corpoJson(filtro));
      setPrevia(dados);
      setResultadoIncerto(false);
    } catch (excecao) {
      setErro(mensagemAmigavel(excecao, "Não foi possível conferir a planilha."));
    }
  });

  const { executando: enviando, executar: enviar } = useAcaoUnica(async () => {
    if (!previa || previa.bloqueado || previa.novas + previa.atualizacoes === 0 || resultadoIncerto)
      return;
    setErro("");
    try {
      const dados = await pedir<{ linhasCriadas: number; linhasAtualizadas: number }>(
        "/api/planilha-parcial/enviar",
        corpoJson({ ...filtro, planoHash: previa.planoHash }),
      );
      avisarSucesso(
        "Chamada parcial enviada.",
        `${dados.linhasCriadas} novos registros e ${dados.linhasAtualizadas} atualizados.`,
      );
      onFechar();
    } catch (excecao) {
      setErro(
        mensagemAmigavel(
          excecao,
          "Não foi possível confirmar o envio. Confira a planilha antes de outra tentativa.",
        ),
      );
      // A próxima ação exige uma leitura nova, pois a escrita pode ter sido aplicada.
      setPrevia(null);
      setResultadoIncerto(true);
    }
  });
  const ocupado = conferindo || enviando;

  function fechar() {
    if (!ocupado) onFechar();
  }

  const acoes = (
    <>
      <Botao type="button" variante="contorno" onClick={fechar} disabled={ocupado}>
        Cancelar
      </Botao>
      {previa ? (
        <Botao
          type="button"
          variante="secundario"
          onClick={() => void enviar()}
          disabled={
            ocupado ||
            previa.bloqueado ||
            previa.novas + previa.atualizacoes === 0 ||
            resultadoIncerto
          }
          carregando={enviando}
        >
          Confirmar envio
        </Botao>
      ) : (
        <Botao
          type="button"
          variante="secundario"
          onClick={() => void conferir()}
          disabled={ocupado || de > ate}
          carregando={conferindo}
        >
          Conferir envio
        </Botao>
      )}
    </>
  );

  return (
    <Dialogo
      aberto={aberto}
      onFechar={fechar}
      titulo="Enviar chamada parcial"
      descricao={`${planilhaNome ?? "Planilha Google"} · aba Chamada Parcial`}
      acoes={acoes}
      tamanho="grande"
    >
      <Box
        sx={{
          display: "grid",
          gridTemplateColumns: { xs: "minmax(0, 1fr)", sm: "repeat(2, minmax(0, 1fr))" },
          gap: 2,
        }}
      >
        <Campo id="parcial-envio-de" rotulo="De">
          <SeletorPeriodo
            id="parcial-envio-de"
            modo="dia"
            valor={de}
            max={diaCorrente}
            rotulo={dataCurta(de)}
            rotuloAcessivel="Início do envio parcial"
            disabled={ocupado}
            onValor={(valor) => {
              setDe(valor);
              invalidarPrevia();
            }}
          />
        </Campo>
        <Campo id="parcial-envio-ate" rotulo="Até">
          <SeletorPeriodo
            id="parcial-envio-ate"
            modo="dia"
            valor={ate}
            max={diaCorrente}
            rotulo={dataCurta(ate)}
            rotuloAcessivel="Fim do envio parcial"
            disabled={ocupado}
            onValor={(valor) => {
              setAte(valor);
              invalidarPrevia();
            }}
          />
        </Campo>
        <Box sx={{ gridColumn: { xs: "auto", sm: "1 / -1" } }}>
          <Campo id="parcial-envio-turma" rotulo="Turma">
            <Selecionar
              valor={turmaId || "todas"}
              disabled={ocupado}
              onValor={(valor) => {
                setTurmaId(valor === "todas" ? "" : valor);
                invalidarPrevia();
              }}
              opcoes={[
                { valor: "todas", rotulo: "Todas as turmas" },
                ...turmas.map((turma) => ({ valor: turma.id, rotulo: turma.rotulo })),
              ]}
            />
          </Campo>
        </Box>
      </Box>

      <Box sx={{ border: 1, borderColor: "divider", borderRadius: 1, p: 1.5 }}>
        <Interruptor
          id="parcial-envio-atualizar"
          rotulo="Atualizar registros já enviados"
          descricao="Atualiza as linhas criadas pelo aplicativo e preserva os registros manuais."
          checked={atualizarExistentes}
          disabled={ocupado}
          onChange={(valor) => {
            setAtualizarExistentes(valor);
            invalidarPrevia();
          }}
        />
      </Box>

      {de > ate ? (
        <AlertaCompacto
          variante="dados_invalidos"
          descricao="O início deve ser anterior ou igual ao fim do período."
          tamanho="linha"
        />
      ) : null}
      {erro ? (
        <AlertaCompacto
          variante="indisponivel"
          titulo="Envio não confirmado"
          descricao={erro}
          tamanho="linha"
        />
      ) : null}
      {resultadoIncerto ? (
        <Typography variant="body2" sx={{ color: "text.secondary" }}>
          Confira o resultado na planilha e gere outra prévia.
        </Typography>
      ) : null}

      {previa ? (
        <Box
          sx={{
            display: "flex",
            flexDirection: "column",
            gap: 1.5,
            border: 1,
            borderColor: "divider",
            borderRadius: 1,
            p: 1.5,
          }}
        >
          <Typography variant="body2" sx={{ fontWeight: 600 }}>
            {previa.novas} novos · {previa.atualizacoes} atualizações · {previa.existentes} já
            enviados
          </Typography>
          {previa.novas + previa.atualizacoes === 0 && !previa.bloqueado ? (
            <Typography variant="body2" sx={{ color: "text.secondary" }}>
              Nenhuma alteração para enviar neste período.
            </Typography>
          ) : null}
          {previa.criar.length + previa.atualizar.length > 0 ? (
            <Box
              role="region"
              tabIndex={0}
              aria-label="Prévia da chamada parcial"
              sx={{
                maxHeight: 224,
                overflow: "auto",
                border: 1,
                borderColor: "divider",
                borderRadius: 1,
              }}
            >
              <Table size="small">
                <Typography component="caption" sx={TEXTO_OCULTO}>
                  Alterações da chamada parcial
                </Typography>
                <TableHead>
                  <TableRow>
                    <TableCell scope="col">Aluno</TableCell>
                    <TableCell scope="col">Data</TableCell>
                    <TableCell scope="col">Presença</TableCell>
                    <TableCell scope="col">Ação</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {[
                    ...previa.criar.map((linha) => ({
                      ...linha,
                      acao: "Novo",
                      anteriores: [] as string[],
                    })),
                    ...previa.atualizar.map((linha) => ({ ...linha, acao: "Atualizar" })),
                  ].map((linha) => (
                    <Fragment key={linha.linha}>
                      <TableRow>
                        <TableCell sx={{ overflowWrap: "anywhere" }}>{linha.nome}</TableCell>
                        <TableCell sx={{ whiteSpace: "nowrap" }}>
                          {valorDaLinha(linha, 1)}
                        </TableCell>
                        <TableCell>{valorDaLinha(linha, 4)}</TableCell>
                        <TableCell>{linha.acao}</TableCell>
                      </TableRow>
                      <TableRow>
                        <TableCell colSpan={4} sx={{ p: 0 }}>
                          <Table size="small" sx={{ tableLayout: "fixed" }}>
                            <Typography component="caption" sx={TEXTO_OCULTO}>
                              {linha.acao === "Novo"
                                ? "Valores do novo registro"
                                : "Campos alterados"}{" "}
                              de {linha.nome}
                            </Typography>
                            <TableHead>
                              <TableRow>
                                <TableCell scope="col" sx={{ width: "33.33%" }}>
                                  Campo
                                </TableCell>
                                {linha.acao === "Atualizar" ? (
                                  <TableCell scope="col" sx={{ width: "33.33%" }}>
                                    Anterior
                                  </TableCell>
                                ) : null}
                                <TableCell scope="col">Novo valor</TableCell>
                              </TableRow>
                            </TableHead>
                            <TableBody>
                              {linha.celulas
                                .filter((celula) => celula.coluna <= 7)
                                .map((celula) => (
                                  <TableRow key={celula.coluna}>
                                    <TableCell
                                      component="th"
                                      scope="row"
                                      sx={{ fontWeight: 500, overflowWrap: "anywhere" }}
                                    >
                                      {CABECALHO_PARCIAL[celula.coluna - 1] ??
                                        `Coluna ${celula.coluna}`}
                                    </TableCell>
                                    {linha.acao === "Atualizar" ? (
                                      <TableCell sx={{ overflowWrap: "anywhere" }}>
                                        {valorParaConferencia(
                                          linha.anteriores[celula.coluna - 1] ?? "",
                                        )}
                                      </TableCell>
                                    ) : null}
                                    <TableCell sx={{ overflowWrap: "anywhere" }}>
                                      {valorParaConferencia(celula.valor)}
                                    </TableCell>
                                  </TableRow>
                                ))}
                            </TableBody>
                          </Table>
                        </TableCell>
                      </TableRow>
                    </Fragment>
                  ))}
                </TableBody>
              </Table>
            </Box>
          ) : null}
          {previa.novas + previa.atualizacoes > previa.criar.length + previa.atualizar.length ? (
            <Typography variant="caption" sx={{ color: "text.secondary" }}>
              Exibindo até 20 registros de cada ação.
            </Typography>
          ) : null}
          {previa.avisos.map((aviso) => (
            <Typography key={aviso} variant="body2" sx={{ color: "text.secondary" }}>
              {aviso}
            </Typography>
          ))}
          {previa.bloqueado ? (
            <AlertaCompacto
              variante="conflito"
              descricao="Envio bloqueado. Confira as pendências na planilha."
              tamanho="linha"
            />
          ) : null}
        </Box>
      ) : null}

      <Typography variant="caption" sx={{ color: "text.secondary" }}>
        O envio à planilha mantém a confirmação na Seduc como uma marcação manual.
      </Typography>
    </Dialogo>
  );
}
