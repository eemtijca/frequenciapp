"use client";

// Benefícios e frequência mínima no rascunho: a administração cria, edita,
// desativa e remove as regras que alimentam o alerta da Chamada.
import { useState } from "react";
import AddRoundedIcon from "@mui/icons-material/AddRounded";
import CheckRoundedIcon from "@mui/icons-material/CheckRounded";
import DeleteOutlineRoundedIcon from "@mui/icons-material/DeleteOutlineRounded";
import EditRoundedIcon from "@mui/icons-material/EditRounded";
import HelpOutlineRoundedIcon from "@mui/icons-material/HelpOutlineRounded";
import PowerSettingsNewRoundedIcon from "@mui/icons-material/PowerSettingsNewRounded";
import CloseRoundedIcon from "@mui/icons-material/CloseRounded";
import Box from "@mui/material/Box";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import {
  AULAS_POR_DIA_MAXIMO,
  PERCENTUAL_MINIMO_MAIOR,
  PERCENTUAL_MINIMO_MENOR,
  type RegraFrequenciaBeneficio,
} from "@/domain/beneficios-frequencia";
import { avisarSucesso } from "@/lib/avisos";
import { Acordeao } from "@/components/ui/mui/acordeao";
import { AlertaCompacto } from "@/components/ui/mui/tela-estado";
import { Botao } from "@/components/ui/mui/botao";
import { Campo } from "@/components/ui/mui/campo";
import { CampoTexto } from "@/components/ui/mui/text-field";
import { Dialogo } from "@/components/ui/mui/dialogo";
import { DialogoConfirmacao } from "@/components/ui/mui/dialogo-confirmacao";
import { Interruptor } from "@/components/ui/mui/interruptor";
import { Selo } from "@/components/ui/mui/selo";

interface Formulario {
  /** Nulo ao criar um benefício novo. */
  id: string | null;
  nome: string;
  percentual: string;
  aulasPorDia: string;
  justificadasContam: boolean;
  ativo: boolean;
}

const FORMULARIO_NOVO: Formulario = {
  id: null,
  nome: "",
  percentual: "",
  aulasPorDia: "9",
  justificadasContam: false,
  ativo: true,
};

function percentualValido(texto: string): number | null {
  if (!/^\d{1,3}$/.test(texto.trim())) return null;
  const valor = Number(texto);
  return valor >= PERCENTUAL_MINIMO_MENOR && valor <= PERCENTUAL_MINIMO_MAIOR ? valor : null;
}

const CARTAO_BENEFICIO = {
  display: "flex",
  flexDirection: "column",
  gap: 2,
  padding: 2,
  border: 1,
  borderColor: "divider",
  borderRadius: 2,
  minWidth: 0,
} as const;

export default function SecaoBeneficiosFrequencia({
  beneficios,
  onMudar,
}: {
  beneficios: RegraFrequenciaBeneficio[];
  onMudar: (lista: RegraFrequenciaBeneficio[]) => void;
}) {
  const [aberto, setAberto] = useState(false);
  const [formulario, setFormulario] = useState<Formulario | null>(null);
  const [erroFormulario, setErroFormulario] = useState("");
  const [paraExcluir, setParaExcluir] = useState<RegraFrequenciaBeneficio | null>(null);

  function salvar() {
    if (!formulario) return;
    const percentual = percentualValido(formulario.percentual);
    const textoAulas = formulario.aulasPorDia.trim();
    const aulasPorDia = textoAulas === "" ? null : Number(textoAulas);
    if (formulario.nome.trim().length < 2) {
      setErroFormulario("Informe o nome do benefício, com ao menos 2 caracteres.");
      return;
    }
    if (percentual === null) {
      setErroFormulario(
        `Informe o percentual mínimo de frequência, um número inteiro de ${PERCENTUAL_MINIMO_MENOR} a ${PERCENTUAL_MINIMO_MAIOR}.`,
      );
      return;
    }
    if (
      aulasPorDia !== null &&
      (!/^\d+$/.test(textoAulas) || aulasPorDia < 1 || aulasPorDia > AULAS_POR_DIA_MAXIMO)
    ) {
      setErroFormulario(`Informe de 1 a ${AULAS_POR_DIA_MAXIMO} aulas por dia ou deixe vazio.`);
      return;
    }
    setErroFormulario("");
    const dados = {
      nome: formulario.nome.trim(),
      percentualMinimoFrequencia: percentual,
      aulasPorDia,
      faltasJustificadasContam: formulario.justificadasContam,
      ativo: formulario.ativo,
    };
    if (formulario.id) {
      onMudar(beneficios.map((item) => (item.id === formulario.id ? { ...item, ...dados } : item)));
      avisarSucesso("Benefício atualizado no rascunho.", "Salve as configurações para aplicar.");
    } else {
      onMudar([...beneficios, { id: `novo-${crypto.randomUUID()}`, ...dados }]);
      avisarSucesso("Benefício adicionado ao rascunho.", "Salve as configurações para aplicar.");
    }
    setFormulario(null);
  }

  function alternarSituacao(beneficio: RegraFrequenciaBeneficio) {
    onMudar(
      beneficios.map((item) =>
        item.id === beneficio.id ? { ...item, ativo: !beneficio.ativo } : item,
      ),
    );
    avisarSucesso(
      beneficio.ativo ? "Benefício desativado no rascunho." : "Benefício ativado no rascunho.",
      "Salve as configurações para aplicar.",
    );
  }

  function confirmarExclusao() {
    if (!paraExcluir) return;
    onMudar(beneficios.filter((item) => item.id !== paraExcluir.id));
    setParaExcluir(null);
    avisarSucesso("Benefício removido do rascunho.", "Salve as configurações para aplicar.");
  }

  function abrirFormulario(beneficio: RegraFrequenciaBeneficio | null) {
    setErroFormulario("");
    setFormulario(
      beneficio
        ? {
            id: beneficio.id,
            nome: beneficio.nome,
            percentual: String(beneficio.percentualMinimoFrequencia),
            aulasPorDia: beneficio.aulasPorDia === null ? "" : String(beneficio.aulasPorDia),
            justificadasContam: beneficio.faltasJustificadasContam,
            ativo: beneficio.ativo,
          }
        : FORMULARIO_NOVO,
    );
  }

  const ativos = beneficios.filter((beneficio) => beneficio.ativo).length;

  return (
    <Box data-secao="config-beneficios">
      <Acordeao
        titulo="Benefícios e frequência mínima"
        resumo={<Selo>{`${ativos} ${ativos === 1 ? "ativo" : "ativos"}`}</Selo>}
        aberto={aberto}
        onChange={setAberto}
      >
        <Box
          role="region"
          aria-label="Benefícios e frequência mínima"
          sx={{ display: "flex", flexDirection: "column", gap: 2 }}
        >
          <Box sx={{ display: "flex", flexWrap: "wrap", gap: 1 }}>
            <Botao
              variante="primario"
              type="button"
              icone={<AddRoundedIcon />}
              onClick={() => abrirFormulario(null)}
            >
              Novo benefício
            </Botao>
          </Box>
          {beneficios.length === 0 ? (
            <Typography variant="body2" sx={{ color: "text.secondary" }}>
              Nenhum benefício cadastrado.
            </Typography>
          ) : (
            <Box
              component="ul"
              aria-label="Benefícios"
              sx={{
                display: "flex",
                flexDirection: "column",
                gap: 2,
                margin: 0,
                padding: 0,
                listStyle: "none",
              }}
            >
              {beneficios.map((beneficio) => (
                <Box component="li" key={beneficio.id} sx={CARTAO_BENEFICIO}>
                  <Stack
                    direction="row"
                    spacing={1}
                    sx={{ flexWrap: "wrap", alignItems: "center" }}
                  >
                    <Typography
                      variant="body2"
                      sx={{ fontWeight: 600, overflowWrap: "anywhere", minWidth: 0 }}
                    >
                      {beneficio.nome}
                    </Typography>
                    <Selo tom={beneficio.ativo ? "sucesso" : "neutro"}>
                      {beneficio.ativo ? "Ativo" : "Inativo"}
                    </Selo>
                    {beneficio.id.startsWith("novo-") ? <Selo>Novo</Selo> : null}
                  </Stack>
                  <Stack
                    direction="row"
                    spacing={1}
                    sx={{ flexWrap: "wrap", alignItems: "center" }}
                  >
                    <Selo>Mínimo de {beneficio.percentualMinimoFrequencia}% de frequência</Selo>
                    <Typography variant="caption" sx={{ color: "text.secondary" }}>
                      Faltas justificadas{" "}
                      {beneficio.faltasJustificadasContam ? "contam" : "não contam"}.
                    </Typography>
                  </Stack>
                  <Typography variant="caption" sx={{ color: "text.secondary" }}>
                    {beneficio.aulasPorDia === null
                      ? "Projeção pela grade da turma."
                      : `Projeção de ${beneficio.aulasPorDia} aulas por dia.`}
                  </Typography>
                  <Box
                    sx={{
                      display: "grid",
                      gap: 1,
                      gridTemplateColumns: { xs: "1fr", sm: "repeat(3, minmax(0, 1fr))" },
                    }}
                  >
                    <Botao
                      type="button"
                      variante="contorno"
                      tamanho="pequeno"
                      icone={<EditRoundedIcon />}
                      aria-label={`Editar ${beneficio.nome}`}
                      onClick={() => abrirFormulario(beneficio)}
                    >
                      Editar
                    </Botao>
                    <Botao
                      type="button"
                      variante="contorno"
                      tamanho="pequeno"
                      icone={<PowerSettingsNewRoundedIcon />}
                      aria-label={`${beneficio.ativo ? "Desativar" : "Ativar"} ${beneficio.nome}`}
                      onClick={() => alternarSituacao(beneficio)}
                    >
                      {beneficio.ativo ? "Desativar" : "Ativar"}
                    </Botao>
                    <Botao
                      type="button"
                      variante="texto"
                      tamanho="pequeno"
                      icone={<DeleteOutlineRoundedIcon />}
                      aria-label={`Excluir ${beneficio.nome}`}
                      onClick={() => setParaExcluir(beneficio)}
                    >
                      Excluir
                    </Botao>
                  </Box>
                </Box>
              ))}
            </Box>
          )}

          <Acordeao
            titulo="Como funcionam os alertas"
            nivelTitulo="h4"
            resumo={
              <Typography
                component="span"
                variant="body2"
                sx={{ display: "flex", alignItems: "center", gap: 1 }}
              >
                <HelpOutlineRoundedIcon fontSize="inherit" aria-hidden="true" />
                Mínimo de frequência por mês
              </Typography>
            }
          >
            <Typography variant="body2" sx={{ color: "text.secondary" }}>
              O mínimo de frequência vale para as aulas do mês. Quando as faltas ultrapassam o
              limite, a Chamada mostra o nome do benefício. Regras inativas não geram alertas.
            </Typography>
          </Acordeao>
        </Box>
      </Acordeao>

      <Dialogo
        aberto={formulario !== null}
        onFechar={() => setFormulario(null)}
        titulo={formulario?.id ? "Editar benefício" : "Novo benefício"}
        descricao="Defina o mínimo de frequência e as faltas consideradas."
        tamanho="medio"
      >
        {formulario ? (
          <Box
            component="form"
            noValidate
            onSubmit={(evento) => {
              evento.preventDefault();
              salvar();
            }}
            sx={{ display: "flex", flexDirection: "column", gap: 2 }}
          >
            <Campo id="beneficio-nome" rotulo="Nome do benefício">
              <CampoTexto
                id="beneficio-nome"
                valor={formulario.nome}
                onValor={(valor) => setFormulario({ ...formulario, nome: valor })}
                maxLength={60}
              />
            </Campo>
            <Campo
              id="beneficio-percentual"
              rotulo="Frequência mínima, em %"
              descricao="Presença nas aulas do mês."
            >
              <CampoTexto
                id="beneficio-percentual"
                valor={formulario.percentual}
                onValor={(valor) => setFormulario({ ...formulario, percentual: valor })}
                inputMode="numeric"
                maxLength={3}
              />
            </Campo>
            <Campo
              id="beneficio-aulas-dia"
              rotulo="Aulas por dia"
              descricao="Vazio usa a grade. Chamadas salvas mantêm as aulas registradas."
            >
              <CampoTexto
                id="beneficio-aulas-dia"
                valor={formulario.aulasPorDia}
                onValor={(valor) => setFormulario({ ...formulario, aulasPorDia: valor })}
                placeholder="Usar grade da turma"
                inputMode="numeric"
              />
            </Campo>
            <Interruptor
              id="beneficio-justificadas"
              rotulo="Faltas justificadas contam"
              checked={formulario.justificadasContam}
              onChange={(valor) => setFormulario({ ...formulario, justificadasContam: valor })}
            />
            <Interruptor
              id="beneficio-ativo"
              rotulo="Benefício ativo"
              checked={formulario.ativo}
              onChange={(valor) => setFormulario({ ...formulario, ativo: valor })}
            />
            {erroFormulario ? (
              <AlertaCompacto
                variante="dados_invalidos"
                descricao={erroFormulario}
                tamanho="linha"
              />
            ) : null}
            <Stack
              direction="row"
              spacing={2}
              sx={{ justifyContent: "flex-end", flexWrap: "wrap" }}
            >
              <Botao
                type="button"
                variante="contorno"
                icone={<CloseRoundedIcon />}
                onClick={() => setFormulario(null)}
              >
                Cancelar
              </Botao>
              <Botao
                type="submit"
                variante="secundario"
                icone={<CheckRoundedIcon />}
                disabled={formulario.nome.trim().length < 2 || formulario.percentual.trim() === ""}
              >
                Aplicar ao rascunho
              </Botao>
            </Stack>
          </Box>
        ) : null}
      </Dialogo>

      <DialogoConfirmacao
        aberto={paraExcluir !== null}
        titulo="Excluir benefício?"
        descricao={
          paraExcluir
            ? `${paraExcluir.nome}. Ao salvar as configurações, a regra e seus alertas serão removidos. As frequências salvas permanecem.`
            : "Ao salvar as configurações, a regra e seus alertas serão removidos. As frequências salvas permanecem."
        }
        rotuloConfirmar="Excluir"
        destrutivo
        onConfirmar={confirmarExclusao}
        onCancelar={() => setParaExcluir(null)}
      />
    </Box>
  );
}
