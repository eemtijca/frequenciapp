"use client";

// Diálogo para escolher os alunos de uma prova específica, agrupados por turma e com busca por nome.
import { useMemo, useState } from "react";
import Box from "@mui/material/Box";
import Checkbox from "@mui/material/Checkbox";
import FormControlLabel from "@mui/material/FormControlLabel";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { normalizar, type Aluno, type Turma } from "@/domain/frequencia";
import { LIMITE_PARTICIPANTES_PROVA } from "@/domain/provas-especificas";
import { useAcaoUnica } from "@/lib/use-acao-unica";
import { Botao } from "@/components/ui/mui/botao";
import { BarraBusca } from "@/components/ui/mui/barra-busca";
import { DialogoPadrao } from "@/components/layout/dialogo-padrao";
import { TOKENS_LAYOUT } from "@/theme/layout";

interface Props {
  aberto: boolean;
  alunos: Aluno[];
  turmas: Turma[];
  /** Alunos já inscritos na prova. */
  inscritos: readonly string[];
  onFechar: () => void;
  onSalvar: (alunoIds: string[]) => Promise<void>;
}

interface GrupoDeTurma {
  turma: Turma;
  alunos: Aluno[];
}

export function DialogoAlunosProva({
  aberto,
  alunos,
  turmas,
  inscritos,
  onFechar,
  onSalvar,
}: Props) {
  const [marcados, setMarcados] = useState(() => new Set(inscritos));
  const [busca, setBusca] = useState("");

  // Só aluno ativo e sem desistência entra; quem já está inscrito continua visível para poder sair.
  const elegiveis = useMemo(() => {
    const jaInscritos = new Set(inscritos);
    return alunos.filter(
      (aluno) => (aluno.ativo && !aluno.desistenteEm) || jaInscritos.has(aluno.id),
    );
  }, [alunos, inscritos]);

  const grupos = useMemo<GrupoDeTurma[]>(() => {
    const termo = normalizar(busca);
    const porTurma = new Map<string, Aluno[]>();
    for (const aluno of elegiveis) {
      if (termo !== "" && !normalizar(aluno.nome).includes(termo)) continue;
      porTurma.set(aluno.turmaId, [...(porTurma.get(aluno.turmaId) ?? []), aluno]);
    }
    return turmas
      .filter((turma) => porTurma.has(turma.id))
      .sort((a, b) => a.rotulo.localeCompare(b.rotulo, "pt-BR"))
      .map((turma) => ({
        turma,
        alunos: (porTurma.get(turma.id) ?? []).sort(
          (a, b) => a.ordem - b.ordem || a.nome.localeCompare(b.nome, "pt-BR"),
        ),
      }));
  }, [elegiveis, turmas, busca]);

  function alternar(ids: string[], marcar: boolean) {
    setMarcados((atuais) => {
      const proximos = new Set(atuais);
      for (const id of ids) {
        if (marcar) proximos.add(id);
        else proximos.delete(id);
      }
      return proximos;
    });
  }

  const excedeu = marcados.size > LIMITE_PARTICIPANTES_PROVA;
  const { executando, executar } = useAcaoUnica(async () => {
    await onSalvar([...marcados]);
  });

  return (
    <DialogoPadrao
      aberto={aberto}
      onFechar={() => {
        if (!executando) onFechar();
      }}
      titulo="Alunos da prova"
      descricao="Escolha os alunos que farão a prova. Quem já tem presença ou ausência marcada mantém a marca."
      tamanho="grande"
      acoes={
        <>
          <Typography
            variant="body2"
            color="text.secondary"
            sx={{ mr: "auto", pl: 1 }}
            role="status"
          >
            {marcados.size === 1 ? "1 aluno escolhido" : `${marcados.size} alunos escolhidos`}
          </Typography>
          <Botao variante="texto" type="button" disabled={executando} onClick={onFechar}>
            Cancelar
          </Botao>
          <Botao
            variante="principal"
            type="button"
            carregando={executando}
            disabled={executando || excedeu}
            onClick={() => void executar()}
          >
            Salvar alunos
          </Botao>
        </>
      }
    >
      <BarraBusca
        id="busca-alunos-prova"
        valor={busca}
        onValor={setBusca}
        placeholder="Buscar aluno"
      />
      {grupos.length === 0 ? (
        <Typography variant="body2" color="text.secondary">
          {elegiveis.length === 0 ? "Nenhum aluno ativo cadastrado." : "Nenhum aluno encontrado."}
        </Typography>
      ) : (
        <Stack spacing={2}>
          {grupos.map(({ turma, alunos: doGrupo }) => {
            const ids = doGrupo.map((aluno) => aluno.id);
            const quantos = ids.filter((id) => marcados.has(id)).length;
            return (
              <Box key={turma.id} component="section" aria-label={turma.rotulo}>
                <FormControlLabel
                  sx={{ minHeight: TOKENS_LAYOUT.alvoToque, m: 0, fontWeight: 600 }}
                  control={
                    <Checkbox
                      checked={quantos === ids.length}
                      indeterminate={quantos > 0 && quantos < ids.length}
                      slotProps={{ input: { "aria-label": `Toda a turma ${turma.rotulo}` } }}
                      onChange={(evento) => alternar(ids, evento.target.checked)}
                    />
                  }
                  label={`${turma.rotulo} (${quantos} de ${ids.length})`}
                />
                <Stack sx={{ pl: 3 }}>
                  {doGrupo.map((aluno) => (
                    <FormControlLabel
                      key={aluno.id}
                      sx={{
                        minHeight: TOKENS_LAYOUT.alvoToque,
                        m: 0,
                        "& .MuiFormControlLabel-label": { overflowWrap: "anywhere" },
                      }}
                      control={
                        <Checkbox
                          checked={marcados.has(aluno.id)}
                          onChange={(evento) => alternar([aluno.id], evento.target.checked)}
                        />
                      }
                      label={aluno.nome}
                    />
                  ))}
                </Stack>
              </Box>
            );
          })}
        </Stack>
      )}
    </DialogoPadrao>
  );
}
