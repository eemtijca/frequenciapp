"use client";

// Calendário anual de feriados no rascunho das configurações, com
// sincronização externa imediata e remoção confirmada.
import { useState } from "react";
import AddRoundedIcon from "@mui/icons-material/AddRounded";
import CalendarMonthRoundedIcon from "@mui/icons-material/CalendarMonthRounded";
import DeleteOutlineRoundedIcon from "@mui/icons-material/DeleteOutlineRounded";
import HelpOutlineRoundedIcon from "@mui/icons-material/HelpOutlineRounded";
import Box from "@mui/material/Box";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { ehAnoLetivoValido, type Feriado } from "@/domain/calendario-letivo";
import { ehDiaValido, rotuloData } from "@/domain/frequencia";
import { avisarSucesso } from "@/lib/avisos";
import { Acordeao } from "@/components/ui/mui/acordeao";
import { AlertaCompacto } from "@/components/ui/mui/tela-estado";
import { Botao, BotaoIcone } from "@/components/ui/mui/botao";
import { Campo } from "@/components/ui/mui/campo";
import { CampoTexto } from "@/components/ui/mui/text-field";
import { DialogoConfirmacao } from "@/components/ui/mui/dialogo-confirmacao";
import { SeletorAno } from "@/components/ui/mui/seletor-ano";
import { Selo } from "@/components/ui/mui/selo";
import { SeletorPeriodo } from "@/components/ui/seletor-periodo";
import ControleSincronizarFeriados from "@/components/gestao/configuracoes/controle-sincronizar-feriados";

interface Props {
  feriados: Feriado[];
  diaCorrente: string;
  onAdicionar: (feriado: Feriado) => void;
  onRemover: (dia: string) => void;
  onSincronizar: () => Promise<void>;
}

export default function SecaoCalendarioLetivo({
  feriados,
  diaCorrente,
  onAdicionar,
  onRemover,
  onSincronizar,
}: Props) {
  const [aberto, setAberto] = useState(false);
  const [ano, setAno] = useState(diaCorrente.slice(0, 4));
  const [dia, setDia] = useState(diaCorrente);
  const [nome, setNome] = useState("");
  const [paraRemover, setParaRemover] = useState<Feriado | null>(null);
  const [erro, setErro] = useState("");
  const [sincronizando, setSincronizando] = useState(false);
  const anoValido = /^\d{4}$/.test(ano) && ehAnoLetivoValido(Number(ano));
  const feriadosDoAno = anoValido
    ? feriados
        .filter((feriado) => feriado.dia.startsWith(`${ano}-`))
        .sort((a, b) => a.dia.localeCompare(b.dia))
    : [];

  function mudarAno(proximo: string) {
    setAno(proximo);
    if (!/^\d{4}$/.test(proximo) || !ehAnoLetivoValido(Number(proximo))) return;
    const mesmaData = `${proximo}-${dia.slice(5)}`;
    setDia(ehDiaValido(mesmaData) ? mesmaData : `${proximo}-02-28`);
  }

  function escolherDia(proximo: string) {
    if (!ehDiaValido(proximo) || !ehAnoLetivoValido(Number(proximo.slice(0, 4)))) {
      setErro("Informe uma data entre 1900 e 2199.");
      return;
    }
    setErro("");
    setDia(proximo);
    setAno(proximo.slice(0, 4));
  }

  function adicionar() {
    setErro("");
    if (!anoValido || !ehDiaValido(dia) || !nome.trim()) {
      setErro("Confira o ano, a data e o nome do feriado.");
      return;
    }
    if (feriados.some((feriado) => feriado.dia === dia)) {
      setErro("Já existe um feriado nesta data. Remova o atual para trocar o nome.");
      return;
    }
    onAdicionar({ dia, nome: nome.trim() });
    setNome("");
    avisarSucesso("Feriado adicionado ao rascunho.", "Salve as configurações para aplicar.");
  }

  function remover() {
    if (!paraRemover) return;
    onRemover(paraRemover.dia);
    setParaRemover(null);
    setErro("");
    avisarSucesso("Feriado removido do rascunho.", "Salve as configurações para aplicar.");
  }

  const bloqueado = sincronizando;
  const revisaoFeriados = feriadosDoAno.map((feriado) => feriado.dia).join("|");

  return (
    <Box data-secao="config-calendario">
      <Acordeao
        titulo="Calendário letivo"
        resumo={
          <Selo>
            {anoValido
              ? `${ano} · ${feriadosDoAno.length} ${
                  feriadosDoAno.length === 1 ? "feriado" : "feriados"
                }`
              : "Selecione o ano"}
          </Selo>
        }
        aberto={aberto}
        onChange={setAberto}
      >
        <Stack spacing={2}>
          <Stack
            direction={{ xs: "column", sm: "row" }}
            spacing={2}
            sx={{ alignItems: { sm: "flex-end" }, flexWrap: "wrap" }}
          >
            <Box sx={{ flex: 1, minWidth: 0, maxWidth: { sm: 220 } }}>
              <Campo id="calendario-letivo-ano" rotulo="Ano do calendário">
                <SeletorAno
                  id="calendario-letivo-ano"
                  valor={ano}
                  min={1900}
                  max={2199}
                  disabled={bloqueado}
                  rotuloAcessivel="Ano do calendário"
                  onValor={mudarAno}
                />
              </Campo>
            </Box>
            <Selo>Todas as turmas</Selo>
          </Stack>

          <ControleSincronizarFeriados
            ano={ano}
            anoValido={anoValido}
            revisao={revisaoFeriados}
            desabilitado={bloqueado}
            onExecutandoChange={setSincronizando}
            onAtualizar={onSincronizar}
          />

          <Box
            component="form"
            aria-label="Adicionar feriado ao calendário"
            onSubmit={(evento) => {
              evento.preventDefault();
              if (!bloqueado) adicionar();
            }}
            noValidate
            sx={{
              display: "grid",
              gap: 2,
              padding: 2,
              border: 1,
              borderColor: "divider",
              borderRadius: 2,
              gridTemplateColumns: { xs: "1fr", sm: "12rem minmax(0, 1fr)" },
            }}
          >
            <Campo id="calendario-feriado-data" rotulo="Data do feriado">
              <SeletorPeriodo
                id="calendario-feriado-data"
                modo="dia"
                valor={dia}
                max="2199-12-31"
                mostrarSelo={false}
                rotuloAcessivel="Data do feriado"
                rotulo={rotuloData(dia)}
                disabled={bloqueado || !anoValido}
                onValor={escolherDia}
              />
            </Campo>
            <Campo id="calendario-feriado-nome" rotulo="Nome do feriado">
              <CampoTexto
                id="calendario-feriado-nome"
                valor={nome}
                onValor={setNome}
                maxLength={120}
                required
                disabled={bloqueado}
              />
            </Campo>
            <Botao
              type="submit"
              variante="primario"
              disabled={bloqueado || !anoValido || !nome.trim()}
              icone={<AddRoundedIcon />}
              sx={{ gridColumn: { sm: "1 / -1" }, justifySelf: { sm: "end" } }}
            >
              Adicionar feriado
            </Botao>
          </Box>

          {erro ? (
            <AlertaCompacto variante="dados_invalidos" descricao={erro} tamanho="linha" />
          ) : null}

          {anoValido ? (
            feriadosDoAno.length ? (
              <Box
                component="ul"
                aria-label={`Feriados de ${ano}`}
                sx={{
                  display: "flex",
                  flexDirection: "column",
                  margin: 0,
                  padding: 0,
                  listStyle: "none",
                  border: 1,
                  borderColor: "divider",
                  borderRadius: 2,
                }}
              >
                {feriadosDoAno.map((feriado) => (
                  <Stack
                    component="li"
                    key={feriado.dia}
                    direction="row"
                    spacing={1}
                    sx={{
                      alignItems: "center",
                      paddingX: 2,
                      paddingY: 1,
                      borderBottom: 1,
                      borderColor: "divider",
                      "&:last-of-type": { borderBottom: 0 },
                    }}
                  >
                    <Box sx={{ flex: 1, minWidth: 0 }}>
                      <Typography
                        variant="body2"
                        sx={{ fontWeight: 600, overflowWrap: "anywhere" }}
                      >
                        {feriado.nome}
                      </Typography>
                      <Box
                        component="time"
                        dateTime={feriado.dia}
                        sx={{
                          display: "block",
                          typography: "caption",
                          color: "text.secondary",
                          fontVariantNumeric: "tabular-nums",
                        }}
                      >
                        {rotuloData(feriado.dia)}
                      </Box>
                    </Box>
                    <BotaoIcone
                      rotulo={`Remover feriado ${feriado.nome}`}
                      variante="destrutivo"
                      disabled={bloqueado}
                      icone={<DeleteOutlineRoundedIcon />}
                      onClick={() => {
                        setErro("");
                        setParaRemover(feriado);
                      }}
                    />
                  </Stack>
                ))}
              </Box>
            ) : (
              <Typography variant="body2" sx={{ color: "text.secondary" }}>
                Nenhum feriado em {ano}.
              </Typography>
            )
          ) : null}

          <Acordeao
            titulo="Ajuda"
            nivelTitulo="h4"
            resumo={
              <Typography
                component="span"
                variant="body2"
                sx={{ display: "flex", alignItems: "center", gap: 1 }}
              >
                <HelpOutlineRoundedIcon fontSize="inherit" aria-hidden="true" />
                Como os feriados afetam a chamada
              </Typography>
            }
          >
            <Stack spacing={1} sx={{ color: "text.secondary" }}>
              <Typography variant="body2">
                Feriados e recessos suspendem a chamada em todas as turmas.
              </Typography>
              <Typography variant="body2">
                Datas adicionadas ou removidas manualmente valem ao salvar as configurações.
              </Typography>
            </Stack>
          </Acordeao>

          <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
            <CalendarMonthRoundedIcon fontSize="small" aria-hidden="true" />
            <Typography variant="caption" sx={{ color: "text.secondary" }}>
              Os feriados são compartilhados por todas as turmas da escola.
            </Typography>
          </Box>
        </Stack>
      </Acordeao>

      <DialogoConfirmacao
        aberto={paraRemover !== null}
        titulo="Remover feriado?"
        descricao={
          paraRemover
            ? `${paraRemover.nome} (${rotuloData(paraRemover.dia)}). A data voltará a seguir a grade semanal. As frequências salvas serão preservadas.`
            : "A data voltará a seguir a grade semanal. As frequências salvas serão preservadas."
        }
        rotuloConfirmar="Remover"
        destrutivo
        onConfirmar={remover}
        onCancelar={() => setParaRemover(null)}
      />
    </Box>
  );
}
