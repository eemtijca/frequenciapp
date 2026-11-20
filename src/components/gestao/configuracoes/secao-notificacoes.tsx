"use client";

// Tipos de aviso oferecidos pela escola e horários de envio no rascunho,
// com as escolhas pessoais preservadas em cada conta.
import { useState } from "react";
import AccessTimeRoundedIcon from "@mui/icons-material/AccessTimeRounded";
import AssignmentLateRoundedIcon from "@mui/icons-material/AssignmentLateRounded";
import FactCheckRoundedIcon from "@mui/icons-material/FactCheckRounded";
import HelpOutlineRoundedIcon from "@mui/icons-material/HelpOutlineRounded";
import PlaylistAddCheckRoundedIcon from "@mui/icons-material/PlaylistAddCheckRounded";
import Box from "@mui/material/Box";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import type { SvgIconComponent } from "@mui/icons-material";
import { Acordeao } from "@/components/ui/mui/acordeao";
import { Campo } from "@/components/ui/mui/campo";
import { Interruptor } from "@/components/ui/mui/interruptor";
import { SeletorHorario } from "@/components/ui/mui/seletor-horario";
import { Selo } from "@/components/ui/mui/selo";
import {
  NOTIFICACOES_PADRAO,
  type ConfiguracaoNotificacoes,
  type TipoDeAviso,
} from "@/domain/notificacoes";

const CAMPOS = [
  {
    tipo: "resumoDiario",
    titulo: "Resumo diário",
    rotulo: "Resumo diário para diretores",
    destinatarios: "Diretores",
    icone: PlaylistAddCheckRoundedIcon,
  },
  {
    tipo: "novasChamadas",
    titulo: "Novas chamadas",
    rotulo: "Novas chamadas para diretores",
    destinatarios: "Diretores",
    icone: FactCheckRoundedIcon,
  },
  {
    tipo: "chamadasPendentes",
    titulo: "Chamadas pendentes",
    rotulo: "Chamadas pendentes para a coordenação",
    destinatarios: "Coordenação e Gestão",
    icone: AssignmentLateRoundedIcon,
  },
] as const satisfies readonly {
  tipo: TipoDeAviso;
  titulo: string;
  rotulo: string;
  destinatarios: string;
  icone: SvgIconComponent;
}[];

function IconeDoAviso({ icone: Icone }: { icone: SvgIconComponent }) {
  return (
    <Box
      aria-hidden="true"
      sx={(tema) => ({
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        flexShrink: 0,
        width: 40,
        height: 40,
        borderRadius: 2,
        color: tema.vars.palette.primary.main,
        backgroundColor: `color-mix(in srgb, ${tema.vars.palette.primary.main} 12%, transparent)`,
      })}
    >
      <Icone fontSize="small" />
    </Box>
  );
}

export default function SecaoNotificacoes({
  configuracao,
  onMudar,
}: {
  configuracao: ConfiguracaoNotificacoes;
  onMudar: (configuracao: ConfiguracaoNotificacoes) => void;
}) {
  const [aberto, setAberto] = useState(false);
  const ativos = CAMPOS.filter(({ tipo }) => configuracao[tipo]).length;

  return (
    <Box data-secao="notificacoes">
      <Acordeao
        titulo="Notificações"
        resumo={<Selo>{`${ativos} ${ativos === 1 ? "aviso ativo" : "avisos ativos"}`}</Selo>}
        aberto={aberto}
        onChange={setAberto}
      >
        <Stack spacing={2}>
          {CAMPOS.map(({ tipo, titulo, rotulo, destinatarios, icone }) => (
            <Box
              key={tipo}
              sx={(tema) => ({
                display: "flex",
                flexDirection: "column",
                gap: 2,
                padding: 2,
                border: `1px solid ${tema.vars.palette.divider}`,
                borderRadius: 2,
              })}
            >
              <Stack direction="row" spacing={2} sx={{ alignItems: "center", minWidth: 0 }}>
                <IconeDoAviso icone={icone} />
                <Box sx={{ minWidth: 0, flex: 1 }}>
                  <Typography variant="subtitle2">{titulo}</Typography>
                  <Typography variant="caption" sx={{ color: "text.secondary" }}>
                    {destinatarios}
                  </Typography>
                </Box>
              </Stack>
              <Interruptor
                id={`aviso-${tipo}`}
                rotulo={rotulo}
                checked={configuracao[tipo]}
                onChange={(valor) => onMudar({ ...configuracao, [tipo]: valor })}
              />
              {tipo === "resumoDiario" ? (
                <Box sx={{ borderTop: 1, borderColor: "divider", paddingTop: 2 }}>
                  <Stack direction="row" spacing={1} sx={{ alignItems: "center", marginBottom: 1 }}>
                    <AccessTimeRoundedIcon fontSize="small" aria-hidden="true" />
                    <Typography variant="body2">Horário do resumo diário</Typography>
                  </Stack>
                  <Campo id="horario-resumo-notificacoes" rotulo="Horário do resumo diário">
                    <SeletorHorario
                      id="horario-resumo-notificacoes"
                      valor={configuracao.horarioResumo ?? NOTIFICACOES_PADRAO.horarioResumo}
                      rotuloAcessivel="Horário do resumo diário"
                      disabled={!configuracao.resumoDiario}
                      onValor={(valor) => onMudar({ ...configuracao, horarioResumo: valor })}
                    />
                  </Campo>
                </Box>
              ) : null}
              {tipo === "chamadasPendentes" ? (
                <Box sx={{ borderTop: 1, borderColor: "divider", paddingTop: 2 }}>
                  <Stack direction="row" spacing={1} sx={{ alignItems: "center", marginBottom: 1 }}>
                    <AccessTimeRoundedIcon fontSize="small" aria-hidden="true" />
                    <Typography variant="body2">Horário do aviso de pendências</Typography>
                  </Stack>
                  <Campo
                    id="horario-pendencias-notificacoes"
                    rotulo="Horário do aviso de pendências"
                  >
                    <SeletorHorario
                      id="horario-pendencias-notificacoes"
                      valor={configuracao.horarioPendencias}
                      rotuloAcessivel="Horário do aviso de pendências"
                      disabled={!configuracao.chamadasPendentes}
                      onValor={(valor) => onMudar({ ...configuracao, horarioPendencias: valor })}
                    />
                  </Campo>
                </Box>
              ) : null}
            </Box>
          ))}
          <Acordeao
            titulo="Sobre os avisos"
            nivelTitulo="h4"
            resumo={
              <Stack direction="row" spacing={0.5} sx={{ alignItems: "center" }}>
                <HelpOutlineRoundedIcon fontSize="inherit" aria-hidden="true" />
                <span>Como os horários são usados</span>
              </Stack>
            }
          >
            <Stack spacing={1} sx={{ color: "text.secondary" }}>
              <Typography variant="body2">Resumo diário nos dias com chamada salva.</Typography>
              <Typography variant="body2">
                Pendências diárias para turmas com aula prevista e alunos ativos.
              </Typography>
              <Typography variant="body2">
                Horários da escola. Ativação na conta, por dispositivo.
              </Typography>
            </Stack>
          </Acordeao>
        </Stack>
      </Acordeao>
    </Box>
  );
}
