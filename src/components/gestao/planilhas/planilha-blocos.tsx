"use client";

// Controles compartilhados de edição temporária e ações de risco das planilhas.
import { useState } from "react";
import ArchiveRoundedIcon from "@mui/icons-material/ArchiveRounded";
import DeleteOutlineRoundedIcon from "@mui/icons-material/DeleteOutlineRounded";
import HistoryRoundedIcon from "@mui/icons-material/HistoryRounded";
import LinkOffRoundedIcon from "@mui/icons-material/LinkOffRounded";
import LockOpenRoundedIcon from "@mui/icons-material/LockOpenRounded";
import LockRoundedIcon from "@mui/icons-material/LockRounded";
import WarningAmberRoundedIcon from "@mui/icons-material/WarningAmberRounded";
import Box from "@mui/material/Box";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { corpoJson, pedir } from "@/lib/api-cliente";
import { useAvisosDaSessao } from "@/lib/avisos";
import { useAcoesPorChave } from "@/lib/use-acao-unica";
import { useMinutoCorrente } from "@/lib/use-relogio";
import { DURACOES_MODO_COMPLETO, FRASE_MODO_COMPLETO } from "@/domain/planilha";
import { Acordeao } from "@/components/ui/mui/acordeao";
import { AlertaCompacto } from "@/components/ui/mui/tela-estado";
import { Botao } from "@/components/ui/mui/botao";
import { Campo } from "@/components/ui/mui/campo";
import { CampoSenha } from "@/components/ui/mui/campo-senha";
import { CampoTexto } from "@/components/ui/mui/text-field";
import { Dialogo } from "@/components/ui/mui/dialogo";
import { DialogoConfirmacao } from "@/components/ui/mui/dialogo-confirmacao";
import { GrupoOpcoes } from "@/components/ui/mui/grupo-opcoes";
import { LimparCopiasPlanilha } from "./dialogo-limpar-copias";

/** Modo completo com prazo, sem as cópias nem a remoção de aba. */
export function BlocoModoCompletoPlanilha({
  idPrefixo,
  urlBase,
  ativo,
  ate,
  onMudou,
}: {
  idPrefixo: string;
  urlBase: string;
  ativo: boolean;
  ate: string | null;
  onMudou: () => Promise<void> | void;
}) {
  const { avisarErro, avisarSucesso } = useAvisosDaSessao();
  const [destrave, setDestrave] = useState(false);
  const [frase, setFrase] = useState("");
  const [duracao, setDuracao] = useState(15);
  const [destravando, setDestravando] = useState(false);
  const [senha, setSenha] = useState("");
  const { chaveAtiva, executar: executarPorChave } = useAcoesPorChave();
  const minutoCorrente = useMinutoCorrente();

  // O prazo é comparado com o minuto do cliente, nunca com o relógio no render.
  const restanteMinutos =
    ativo && ate && minutoCorrente !== null
      ? Math.max(0, Math.ceil((new Date(ate).getTime() - minutoCorrente * 60_000) / 60_000))
      : null;
  const hora = ate
    ? new Date(ate).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })
    : "";

  async function destravar() {
    await executarPorChave("destravar", async () => {
      setDestravando(true);
      try {
        await pedir(
          `${urlBase}/modo-completo`,
          corpoJson({ frase, senha, duracaoMinutos: duracao }),
        );
        setFrase("");
        setSenha("");
        setDestrave(false);
        avisarSucesso(
          "Modo completo ativo.",
          "As ações destrutivas ficam liberadas pelo prazo escolhido, sem cópia automática.",
        );
        await onMudou();
      } catch (excecao) {
        avisarErro(excecao, { contexto: "Não foi possível destravar." });
      } finally {
        setDestravando(false);
      }
    });
  }

  async function voltarConservador() {
    await executarPorChave("voltar-conservador", async () => {
      try {
        await pedir(`${urlBase}/modo-conservador`, corpoJson({}));
        avisarSucesso(
          "Modo conservador restaurado.",
          "As ações destrutivas voltaram a ficar bloqueadas.",
        );
        await onMudou();
      } catch (excecao) {
        avisarErro(excecao, { contexto: "Não foi possível encerrar." });
      }
    });
  }

  return (
    <>
      <Box
        component="section"
        aria-label="Modo completo"
        sx={(tema) => ({
          display: "flex",
          flexDirection: { xs: "column", sm: "row" },
          alignItems: { sm: "center" },
          justifyContent: "space-between",
          gap: 2,
          padding: 2,
          border: `1px solid ${tema.vars.palette.divider}`,
          borderRadius: 2,
        })}
      >
        <Stack direction="row" spacing={1} sx={{ alignItems: "center", minWidth: 0 }}>
          {ativo ? (
            <LockOpenRoundedIcon aria-hidden="true" />
          ) : (
            <LockRoundedIcon aria-hidden="true" />
          )}
          <Box sx={{ minWidth: 0 }}>
            <Typography variant="body2" sx={{ fontWeight: 600 }}>
              {ativo ? "Modo completo ativo" : "Edição protegida"}
            </Typography>
            <Typography variant="caption" sx={{ color: "text.secondary" }}>
              {ativo
                ? `Até ${hora}${restanteMinutos !== null && restanteMinutos <= 5 ? ` · restam ${restanteMinutos} min` : ""}`
                : "Correções e exclusões exigem liberação."}
            </Typography>
          </Box>
        </Stack>
        <Stack direction="row" spacing={1} sx={{ flexWrap: "wrap" }}>
          <Botao
            type="button"
            variante="contorno"
            onClick={() => setDestrave(true)}
            disabled={chaveAtiva !== null}
            icone={<LockOpenRoundedIcon />}
          >
            {ativo ? "Estender" : "Liberar modo completo"}
          </Botao>
          {ativo ? (
            <Botao
              type="button"
              variante="texto"
              onClick={() => void voltarConservador()}
              disabled={chaveAtiva !== null}
              icone={<LockRoundedIcon />}
            >
              Encerrar modo completo
            </Botao>
          ) : null}
        </Stack>
      </Box>

      <Dialogo
        aberto={destrave}
        onFechar={() => setDestrave(false)}
        titulo="Liberar modo completo"
        tamanho="medio"
      >
        <Stack spacing={2}>
          <AlertaCompacto
            variante="dados_invalidos"
            descricao="Permite substituir, limpar e remover dados na planilha. Não há cópia automática; exporte o arquivo antes de alterações que precisem de recuperação."
            tamanho="linha"
          />
          <Campo id={`${idPrefixo}-frase-destrave`} rotulo={`Digite ${FRASE_MODO_COMPLETO}`}>
            <CampoTexto
              id={`${idPrefixo}-frase-destrave`}
              valor={frase}
              onValor={setFrase}
              autoComplete="off"
            />
          </Campo>
          <Box>
            <Typography variant="body2" sx={{ fontWeight: 600, marginBottom: 1 }}>
              Duração
            </Typography>
            <GrupoOpcoes
              rotulo="Duração do modo completo"
              valor={String(duracao)}
              onValor={(valor) => setDuracao(Number(valor))}
              opcoes={DURACOES_MODO_COMPLETO.map((minutos) => ({
                valor: String(minutos),
                rotulo: `${minutos} min`,
              }))}
            />
          </Box>
          <Campo id={`${idPrefixo}-senha-destrave`} rotulo="Senha do administrador">
            <CampoSenha
              id={`${idPrefixo}-senha-destrave`}
              valor={senha}
              onValor={setSenha}
              autoComplete="current-password"
            />
          </Campo>
          <Stack direction="row" spacing={2} sx={{ justifyContent: "flex-end", flexWrap: "wrap" }}>
            <Botao type="button" variante="contorno" onClick={() => setDestrave(false)}>
              Cancelar
            </Botao>
            <Botao
              type="button"
              variante="secundario"
              onClick={() => void destravar()}
              disabled={frase.trim().toUpperCase() !== FRASE_MODO_COMPLETO || senha === ""}
              carregando={destravando}
            >
              Liberar
            </Botao>
          </Stack>
        </Stack>
      </Dialogo>
    </>
  );
}

/** Cópias de segurança, remoção de aba criada e desconexão da integração. */
export function BlocoRiscoPlanilha({
  idPrefixo,
  urlBase,
  copiasDe,
  abasCriadas,
  onMudou,
}: {
  idPrefixo: string;
  urlBase: string;
  copiasDe: string[];
  abasCriadas: string[];
  onMudou: () => Promise<void> | void;
}) {
  const { avisarErro, avisarSucesso } = useAvisosDaSessao();
  const [aberto, setAberto] = useState(false);
  const [copias, setCopias] = useState<
    { aba: string; itens: { nome: string; criadaEm: string }[] }[]
  >([]);
  const [restaurar, setRestaurar] = useState<{ aba: string; copia: string } | null>(null);
  const [abaRemover, setAbaRemover] = useState<string | null>(null);
  const [senha, setSenha] = useState("");
  const [frase, setFrase] = useState("");
  const [confirmarDesconexao, setConfirmarDesconexao] = useState(false);
  const acoes = useAcoesPorChave();
  const { chaveAtiva, executar: executarPorChave } = acoes;

  async function carregarCopias() {
    try {
      const lista: { aba: string; itens: { nome: string; criadaEm: string }[] }[] = [];
      for (const aba of copiasDe) {
        const dados = await pedir<{ copias: { nome: string; criadaEm: string }[] }>(
          `${urlBase}/copias?aba=${encodeURIComponent(aba)}`,
        );
        lista.push({ aba, itens: dados.copias });
      }
      setCopias(lista);
    } catch (excecao) {
      avisarErro(excecao, { contexto: "Não foi possível listar cópias." });
    }
  }

  async function confirmarRestaurar() {
    if (!restaurar) return;
    await executarPorChave("restaurar", async () => {
      try {
        await pedir(
          `${urlBase}/restaurar`,
          corpoJson({ aba: restaurar.aba, copia: restaurar.copia, frase, senha }),
        );
        setRestaurar(null);
        setFrase("");
        setSenha("");
        avisarSucesso(
          "Cópia restaurada. Confira a estrutura de novo.",
          "A versão anterior foi substituída pela cópia escolhida.",
        );
        await onMudou();
      } catch (excecao) {
        avisarErro(excecao, { contexto: "Não foi possível restaurar." });
      }
    });
  }

  async function confirmarRemocaoAba() {
    if (!abaRemover) return;
    await executarPorChave(`remover-aba-${abaRemover}`, async () => {
      try {
        await pedir(`${urlBase}/remover-aba`, corpoJson({ aba: abaRemover, frase, senha }));
        setAbaRemover(null);
        setFrase("");
        setSenha("");
        avisarSucesso("Aba removida.");
        await onMudou();
      } catch (excecao) {
        avisarErro(excecao, { contexto: "Não foi possível remover a aba." });
      }
    });
  }

  async function desconectar() {
    await executarPorChave("desconectar", async () => {
      try {
        await pedir(`${urlBase}/desconectar`, corpoJson({}));
        setCopias([]);
        avisarSucesso(
          "Integração desconectada. A planilha não foi alterada.",
          "Nada foi apagado no Google Planilhas.",
        );
        await onMudou();
      } catch (excecao) {
        avisarErro(excecao, { contexto: "Não foi possível desconectar." });
      }
    });
  }

  return (
    <>
      <Box
        sx={(tema) => ({
          border: `1px solid ${tema.vars.palette.error.main}`,
          borderRadius: 2,
          paddingX: 1,
        })}
      >
        <Acordeao
          titulo="Zona de risco"
          nivelTitulo="h4"
          resumo={<SeloRisco />}
          aberto={aberto}
          onChange={setAberto}
        >
          <Stack spacing={2}>
            <Stack
              direction="row"
              spacing={1}
              sx={{ flexWrap: "wrap", alignItems: "center", justifyContent: "space-between" }}
            >
              <Typography variant="body2" sx={{ fontWeight: 600 }}>
                Cópias antigas
              </Typography>
              <Botao
                type="button"
                variante="contorno"
                onClick={() => void carregarCopias()}
                icone={<ArchiveRoundedIcon />}
              >
                Listar cópias
              </Botao>
            </Stack>
            <LimparCopiasPlanilha
              urlBase={urlBase}
              onMudou={async () => {
                setCopias([]);
                await onMudou();
              }}
              acoes={acoes}
            />
            {copias.map((item) => (
              <Box key={item.aba} sx={{ display: "flex", flexDirection: "column", gap: 0.5 }}>
                <Typography variant="caption" sx={{ fontWeight: 600 }}>
                  {item.aba}
                </Typography>
                {item.itens.length === 0 ? (
                  <Typography variant="caption" sx={{ color: "text.secondary" }}>
                    Nenhuma cópia.
                  </Typography>
                ) : (
                  item.itens.map((copia) => (
                    <Stack
                      key={copia.nome}
                      direction="row"
                      spacing={1}
                      sx={{ alignItems: "center", justifyContent: "space-between" }}
                    >
                      <Typography
                        variant="caption"
                        sx={{
                          color: "text.secondary",
                          minWidth: 0,
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {copia.criadaEm || copia.nome}
                      </Typography>
                      <Botao
                        type="button"
                        variante="texto"
                        tamanho="pequeno"
                        onClick={() => setRestaurar({ aba: item.aba, copia: copia.nome })}
                        icone={<HistoryRoundedIcon />}
                      >
                        Restaurar
                      </Botao>
                    </Stack>
                  ))
                )}
              </Box>
            ))}
            {abasCriadas.length > 0 ? (
              <Stack spacing={1}>
                <Typography variant="body2" sx={{ fontWeight: 600 }}>
                  Abas criadas pela integração
                </Typography>
                {abasCriadas.map((nome) => (
                  <Stack
                    key={nome}
                    direction="row"
                    spacing={1}
                    sx={{ alignItems: "center", justifyContent: "space-between" }}
                  >
                    <Typography
                      variant="caption"
                      sx={{
                        color: "text.secondary",
                        minWidth: 0,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {nome}
                    </Typography>
                    <Botao
                      type="button"
                      variante="texto"
                      tamanho="pequeno"
                      onClick={() => setAbaRemover(nome)}
                      icone={<DeleteOutlineRoundedIcon />}
                      sx={(tema) => ({ color: tema.vars.palette.error.main })}
                    >
                      Remover
                    </Botao>
                  </Stack>
                ))}
              </Stack>
            ) : null}
            <Stack
              direction="row"
              spacing={1}
              sx={{
                flexWrap: "wrap",
                alignItems: "center",
                justifyContent: "space-between",
                borderTop: 1,
                borderColor: "divider",
                paddingTop: 2,
              }}
            >
              <Typography variant="body2" sx={{ fontWeight: 600 }}>
                Desconectar integração
              </Typography>
              <Botao
                type="button"
                variante="contorno"
                disabled={chaveAtiva === "desconectar"}
                carregando={chaveAtiva === "desconectar"}
                onClick={() => setConfirmarDesconexao(true)}
                icone={<LinkOffRoundedIcon />}
              >
                Desconectar
              </Botao>
            </Stack>
          </Stack>
        </Acordeao>
      </Box>

      <Dialogo
        aberto={restaurar !== null}
        onFechar={() => setRestaurar(null)}
        titulo="Restaurar cópia"
        tamanho="medio"
      >
        <Stack spacing={2}>
          <AlertaCompacto
            variante="dados_invalidos"
            descricao={`A aba ${restaurar?.aba ?? ""} será trocada pela cópia ${restaurar?.copia ?? ""}, sem guardar a versão atual. Depois, confira a estrutura de novo.`}
            tamanho="linha"
          />
          <Campo id={`${idPrefixo}-frase-restaurar`} rotulo={`Digite ${FRASE_MODO_COMPLETO}`}>
            <CampoTexto
              id={`${idPrefixo}-frase-restaurar`}
              valor={frase}
              onValor={setFrase}
              autoComplete="off"
            />
          </Campo>
          <Campo id={`${idPrefixo}-senha-restaurar`} rotulo="Senha do administrador">
            <CampoSenha
              id={`${idPrefixo}-senha-restaurar`}
              valor={senha}
              onValor={setSenha}
              autoComplete="current-password"
            />
          </Campo>
          <Stack direction="row" spacing={2} sx={{ justifyContent: "flex-end", flexWrap: "wrap" }}>
            <Botao type="button" variante="contorno" onClick={() => setRestaurar(null)}>
              Cancelar
            </Botao>
            <Botao
              type="button"
              variante="secundario"
              onClick={() => void confirmarRestaurar()}
              disabled={
                frase.trim().toUpperCase() !== FRASE_MODO_COMPLETO ||
                senha === "" ||
                chaveAtiva === "restaurar"
              }
              carregando={chaveAtiva === "restaurar"}
            >
              Restaurar
            </Botao>
          </Stack>
        </Stack>
      </Dialogo>

      <Dialogo
        aberto={abaRemover !== null}
        onFechar={() => setAbaRemover(null)}
        titulo="Remover aba"
        tamanho="medio"
      >
        <Stack spacing={2}>
          <AlertaCompacto
            variante="dados_invalidos"
            descricao={`A aba ${abaRemover ?? ""} foi criada pela integração e será removida definitivamente, sem cópia automática.`}
            tamanho="linha"
          />
          <Campo id={`${idPrefixo}-frase-remover-aba`} rotulo={`Digite ${FRASE_MODO_COMPLETO}`}>
            <CampoTexto
              id={`${idPrefixo}-frase-remover-aba`}
              valor={frase}
              onValor={setFrase}
              autoComplete="off"
            />
          </Campo>
          <Campo id={`${idPrefixo}-senha-remover-aba`} rotulo="Senha do administrador">
            <CampoSenha
              id={`${idPrefixo}-senha-remover-aba`}
              valor={senha}
              onValor={setSenha}
              autoComplete="current-password"
            />
          </Campo>
          <Stack direction="row" spacing={2} sx={{ justifyContent: "flex-end", flexWrap: "wrap" }}>
            <Botao type="button" variante="contorno" onClick={() => setAbaRemover(null)}>
              Cancelar
            </Botao>
            <Botao
              type="button"
              variante="destrutivo"
              onClick={() => void confirmarRemocaoAba()}
              disabled={
                frase.trim().toUpperCase() !== FRASE_MODO_COMPLETO ||
                senha === "" ||
                chaveAtiva === `remover-aba-${abaRemover}`
              }
              carregando={chaveAtiva === `remover-aba-${abaRemover}`}
            >
              Remover aba
            </Botao>
          </Stack>
        </Stack>
      </Dialogo>

      <DialogoConfirmacao
        aberto={confirmarDesconexao}
        titulo="Desconectar a planilha?"
        descricao="A conexão e a configuração serão removidas do app. O arquivo no Google será mantido."
        rotuloConfirmar="Desconectar"
        destrutivo
        operacaoEmAndamento={chaveAtiva === "desconectar"}
        onConfirmar={() => {
          setConfirmarDesconexao(false);
          void desconectar();
        }}
        onCancelar={() => setConfirmarDesconexao(false)}
      />
    </>
  );
}

function SeloRisco() {
  return (
    <Stack direction="row" spacing={0.5} sx={{ alignItems: "center" }}>
      <WarningAmberRoundedIcon fontSize="inherit" color="error" aria-hidden="true" />
      <Typography component="span" variant="body2" sx={{ color: "error" }}>
        Cópias e remoções
      </Typography>
    </Stack>
  );
}
