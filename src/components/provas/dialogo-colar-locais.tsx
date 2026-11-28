"use client";

// Cola uma lista nome e local e casa com os alunos já inscritos na prova, antes de gravar.
import { useId, useMemo, useState } from "react";
import Box from "@mui/material/Box";
import OutlinedInput from "@mui/material/OutlinedInput";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import {
  casarLocaisColados,
  LIMITE_TEXTO_LOCAIS_COLADOS,
  type CasamentoDeLocais,
} from "@/domain/provas-especificas";
import { useAcaoUnica } from "@/lib/use-acao-unica";
import { Botao } from "@/components/ui/mui/botao";
import { Campo } from "@/components/ui/mui/campo";
import { Alerta } from "@/components/ui/mui/alerta";
import { DialogoPadrao } from "@/components/layout/dialogo-padrao";
import { FAMILIA_MONO } from "@/theme/tipografia";

interface Props {
  aberto: boolean;
  alunos: readonly { alunoId: string; nome: string }[];
  onFechar: () => void;
  onAplicar: (casados: CasamentoDeLocais["casados"]) => Promise<void>;
}

const LINHAS_VISIVEIS = 8;

function contar(quantidade: number, singular: string, plural: string): string {
  return `${quantidade} ${quantidade === 1 ? singular : plural}`;
}

export function DialogoColarLocais({ aberto, alunos, onFechar, onAplicar }: Props) {
  const base = useId();
  const [texto, setTexto] = useState("");
  const casamento = useMemo(
    () => (texto.trim() === "" ? null : casarLocaisColados(texto, alunos)),
    [texto, alunos],
  );
  const casados = casamento?.casados ?? [];
  const recusados = casamento?.recusados ?? [];
  const recusadosVisiveis = recusados.slice(0, LINHAS_VISIVEIS);
  const casadosVisiveis = casados.slice(0, LINHAS_VISIVEIS);

  const { executando, executar } = useAcaoUnica(async () => {
    if (casados.length === 0) return;
    await onAplicar(casados);
  });

  return (
    <DialogoPadrao
      aberto={aberto}
      onFechar={() => {
        if (!executando) onFechar();
      }}
      titulo="Colar locais"
      descricao="Uma linha por aluno, com o nome e o local separados por tabulação, ponto e vírgula ou barra vertical. O nome precisa ser o do aluno já inscrito nesta prova. Linha sem par, nome repetido ou local divergente não é gravada."
      tamanho="grande"
      acoes={
        <>
          <Botao variante="texto" type="button" disabled={executando} onClick={onFechar}>
            Cancelar
          </Botao>
          <Botao
            variante="principal"
            type="button"
            carregando={executando}
            disabled={executando || casados.length === 0}
            onClick={() => void executar()}
          >
            {casados.length === 0
              ? "Aplicar locais"
              : `Aplicar ${contar(casados.length, "local", "locais")}`}
          </Botao>
        </>
      }
    >
      <Stack spacing={2}>
        <Campo
          id={`${base}-lista`}
          rotulo="Lista de locais"
          descricao="Ex.: Ana Souza;Campus Betânia"
        >
          <OutlinedInput
            id={`${base}-lista`}
            value={texto}
            onChange={(evento) => setTexto(evento.target.value)}
            multiline
            minRows={6}
            maxRows={14}
            fullWidth
            disabled={executando}
            placeholder={"Ana Souza;Campus Betânia\nBruno Lima;Campus Junco - CCH"}
            slotProps={{
              input: {
                "aria-label": "Lista de locais",
                maxLength: LIMITE_TEXTO_LOCAIS_COLADOS,
                style: { fontFamily: FAMILIA_MONO },
              },
            }}
          />
        </Campo>
        {casamento ? (
          <Stack spacing={1.5}>
            <Typography variant="body2" role="status">
              {casados.length === 0
                ? "Nenhum aluno da prova foi encontrado na lista."
                : `${contar(casados.length, "aluno da prova encontrado", "alunos da prova encontrados")} na lista.`}
            </Typography>
            {casadosVisiveis.length > 0 ? (
              <Box component="ul" sx={{ m: 0, pl: 2.5 }}>
                {casadosVisiveis.map((item) => (
                  <Typography key={item.alunoId} component="li" variant="body2">
                    {item.nome}: {item.local}
                  </Typography>
                ))}
              </Box>
            ) : null}
            {casados.length > casadosVisiveis.length ? (
              <Typography variant="body2" color="text.secondary">
                E mais {contar(casados.length - casadosVisiveis.length, "aluno", "alunos")}.
              </Typography>
            ) : null}
            {recusados.length > 0 ? (
              <Alerta
                severity="warning"
                titulo={contar(recusados.length, "linha de fora", "linhas de fora")}
              >
                <Box component="ul" sx={{ m: 0, pl: 2 }}>
                  {recusadosVisiveis.map((item) => (
                    <li key={`${item.linha}-${item.nome}`}>
                      <Typography component="span" variant="body2">
                        {item.nome === ""
                          ? `Linha ${item.linha}: ${item.motivo}`
                          : `Linha ${item.linha}, ${item.nome}: ${item.motivo}`}
                      </Typography>
                    </li>
                  ))}
                </Box>
                {recusados.length > recusadosVisiveis.length ? (
                  <Typography variant="body2" sx={{ mt: 0.5 }}>
                    E mais {contar(recusados.length - recusadosVisiveis.length, "linha", "linhas")}.
                  </Typography>
                ) : null}
              </Alerta>
            ) : null}
          </Stack>
        ) : null}
      </Stack>
    </DialogoPadrao>
  );
}
