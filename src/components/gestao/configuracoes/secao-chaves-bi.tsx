"use client";

// Chaves do FrequenciBI no rascunho: escopo visual e ações que só valem
// depois da confirmação do lote. O segredo aparece uma única vez no salvamento.
import { useState } from "react";
import BlockRoundedIcon from "@mui/icons-material/BlockRounded";
import CheckRoundedIcon from "@mui/icons-material/CheckRounded";
import DeleteOutlineRoundedIcon from "@mui/icons-material/DeleteOutlineRounded";
import EditRoundedIcon from "@mui/icons-material/EditRounded";
import HistoryRoundedIcon from "@mui/icons-material/HistoryRounded";
import KeyRoundedIcon from "@mui/icons-material/KeyRounded";
import RestartAltRoundedIcon from "@mui/icons-material/RestartAltRounded";
import ShieldRoundedIcon from "@mui/icons-material/ShieldRounded";
import Box from "@mui/material/Box";
import Checkbox from "@mui/material/Checkbox";
import FormControlLabel from "@mui/material/FormControlLabel";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import type { Serie, Turma } from "@/domain/frequencia";
import type { ChaveBiDesejada } from "@/domain/configuracoes";
import { RECURSOS_BI, ROTULOS_RECURSOS_BI, type EscopoBi } from "@/domain/bi";
import { avisarSucesso } from "@/lib/avisos";
import { Acordeao } from "@/components/ui/mui/acordeao";
import { AlertaCompacto } from "@/components/ui/mui/tela-estado";
import { Botao } from "@/components/ui/mui/botao";
import { Campo } from "@/components/ui/mui/campo";
import { CampoTexto } from "@/components/ui/mui/text-field";
import { Dialogo } from "@/components/ui/mui/dialogo";
import { Selecionar } from "@/components/ui/mui/selecionar";
import { SeletorHorario } from "@/components/ui/mui/seletor-horario";
import { Selo } from "@/components/ui/mui/selo";
import SecaoConfiguracao from "./secao-configuracao";
import { SeletorPeriodo } from "@/components/ui/seletor-periodo";

type Acao = "criar" | "editar" | "rotacionar" | "revogar" | "revogar-todas" | "limpar";
const TITULOS: Record<Acao, string> = {
  criar: "Criar chave",
  editar: "Editar chave",
  rotacionar: "Substituir chave",
  revogar: "Revogar chave",
  "revogar-todas": "Revogar todas as chaves",
  limpar: "Limpar histórico de chaves",
};

function diaLocal(valor: string | null) {
  if (!valor) return "";
  const d = new Date(valor);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}

function horaLocal(valor: string | null) {
  if (!valor) return "23:59";
  const d = new Date(valor);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(11, 16);
}

function rotuloDia(valor: string) {
  return valor ? valor.split("-").reverse().join("/") : "Sem prazo";
}

function contar(quantidade: number, singular: string, plural: string) {
  return `${quantidade} ${quantidade === 1 ? singular : plural}`;
}

function resumoDoEscopo(escopo: EscopoBi) {
  return [
    escopo.series?.length ? contar(escopo.series.length, "série", "séries") : "Todas as séries",
    escopo.turmas?.length ? contar(escopo.turmas.length, "turma", "turmas") : "Todas as turmas",
    escopo.recursos?.length ? contar(escopo.recursos.length, "base", "bases") : "Todas as bases",
  ].join(" · ");
}

function estaRevogada(chave: ChaveBiDesejada): boolean {
  return chave.revogada === true || chave.estado === "revogada";
}

const CARTAO = {
  display: "flex",
  flexDirection: "column",
  gap: 2,
  padding: 2,
  border: 1,
  borderColor: "divider",
  borderRadius: 2,
  minWidth: 0,
} as const;

export default function SecaoChavesBi({
  series,
  turmas,
  chaves,
  onMudar,
}: {
  series: Serie[];
  turmas: Turma[];
  chaves: ChaveBiDesejada[];
  onMudar: (chaves: ChaveBiDesejada[]) => void;
}) {
  const [erro, setErro] = useState("");
  const [busca, setBusca] = useState("");
  const [ordem, setOrdem] = useState("recentes");
  const [acao, setAcao] = useState<Acao | null>(null);
  const [chave, setChave] = useState<ChaveBiDesejada | null>(null);
  const [rotulo, setRotulo] = useState("");
  const [validadeDia, setValidadeDia] = useState("");
  const [validadeHora, setValidadeHora] = useState("23:59");
  const [escopo, setEscopo] = useState<EscopoBi>({});
  const [escopoAberto, setEscopoAberto] = useState(false);
  const hoje = diaLocal(new Date().toISOString());

  function preparar(a: Acao, c: ChaveBiDesejada | null = null) {
    setErro("");
    setAcao(a);
    setChave(c);
    setRotulo(c?.rotulo ?? "");
    setValidadeDia(diaLocal(c?.expiraEm ?? null));
    setValidadeHora(horaLocal(c?.expiraEm ?? null));
    setEscopo(c?.escopo ?? {});
    setEscopoAberto(
      Boolean(
        c?.escopo?.series?.length || c?.escopo?.turmas?.length || c?.escopo?.recursos?.length,
      ),
    );
  }

  function confirmar() {
    if (!acao) return;
    if ((acao === "criar" || acao === "editar") && rotulo.trim().length < 2) {
      setErro("Informe o rótulo da chave, com ao menos 2 caracteres.");
      return;
    }
    const escolhida = validadeDia ? new Date(`${validadeDia}T${validadeHora || "23:59"}:00`) : null;
    if ((acao === "criar" || acao === "editar") && escolhida && escolhida <= new Date()) {
      setErro("A validade precisa ser uma data futura.");
      return;
    }
    const expiraEm = escolhida?.toISOString() ?? null;
    setErro("");
    const agora = new Date().toISOString();
    let lista = chaves;
    if (acao === "criar") {
      lista = [
        ...chaves,
        {
          id: `novo-${crypto.randomUUID()}`,
          rotulo: rotulo.trim(),
          criadaEm: agora,
          expiraEm,
          revogadaEm: null,
          primeiroUsoEm: null,
          ultimoUsoEm: null,
          usos: 0,
          escopo,
          estado: "ativa",
          inativa: false,
        },
      ];
    } else if (acao === "editar" && chave) {
      lista = chaves.map((item) =>
        item.id === chave.id ? { ...item, rotulo: rotulo.trim(), escopo, expiraEm } : item,
      );
    } else if (acao === "rotacionar" && chave) {
      lista = chaves.map((item) => (item.id === chave.id ? { ...item, rotacionar: true } : item));
    } else if (acao === "revogar" && chave) {
      lista = chaves.map((item) =>
        item.id === chave.id
          ? { ...item, revogada: true, revogadaEm: agora, estado: "revogada" as const }
          : item,
      );
    } else if (acao === "revogar-todas") {
      lista = chaves.map((item) =>
        item.estado === "ativa" && !estaRevogada(item)
          ? { ...item, revogada: true, revogadaEm: agora, estado: "revogada" as const }
          : item,
      );
    } else if (acao === "limpar") {
      lista = chaves.filter((item) => item.estado === "ativa" && !estaRevogada(item));
    }
    onMudar(lista);
    setAcao(null);
    setChave(null);
    setRotulo("");
    setValidadeDia("");
    setValidadeHora("23:59");
    setEscopo({});
    setEscopoAberto(false);
    avisarSucesso("Alteração aplicada ao rascunho.", "Salve as configurações para concluir.");
  }

  const cadastro = acao === "criar" || acao === "editar";
  const visiveis = chaves
    .filter((c) => c.rotulo.toLocaleLowerCase("pt-BR").includes(busca.toLocaleLowerCase("pt-BR")))
    .sort((a, b) =>
      ordem === "nome"
        ? a.rotulo.localeCompare(b.rotulo, "pt-BR")
        : ordem === "uso"
          ? b.usos - a.usos
          : b.criadaEm.localeCompare(a.criadaEm),
    );
  const ativas = chaves.filter((c) => c.estado === "ativa" && !estaRevogada(c)).length;
  const naoAtivas = chaves.some((c) => c.estado !== "ativa" || estaRevogada(c));
  const resumoEscopo = resumoDoEscopo(escopo);

  function alternar(campo: "series" | "turmas" | "recursos", valor: string, marcada: boolean) {
    const atuais = escopo[campo] ?? [];
    const lista = marcada ? [...atuais, valor] : atuais.filter((v) => v !== valor);
    setEscopo((e) => ({ ...e, [campo]: lista.length ? lista : undefined }));
  }

  function desfazerRevogacao(alvo: ChaveBiDesejada) {
    onMudar(
      chaves.map((item) =>
        item.id === alvo.id
          ? { ...item, revogada: false, revogadaEm: null, estado: "ativa" as const }
          : item,
      ),
    );
  }

  function desfazerRotacao(alvo: ChaveBiDesejada) {
    onMudar(chaves.map((item) => (item.id === alvo.id ? { ...item, rotacionar: false } : item)));
  }

  return (
    <SecaoConfiguracao
      id="config-chaves-bi"
      titulo="FrequenciBI"
      descricao="A criação, a substituição e a revogação de chaves entram no rascunho. Salvar exige a senha do administrador."
      resumo={<Selo>{contar(ativas, "ativa", "ativas")}</Selo>}
    >
      <Stack spacing={2}>
        <Box
          sx={{
            display: "grid",
            gap: 1,
            gridTemplateColumns: { xs: "1fr", sm: "repeat(3, minmax(0, 1fr))" },
          }}
        >
          <Botao variante="primario" icone={<KeyRoundedIcon />} onClick={() => preparar("criar")}>
            Criar chave
          </Botao>
          <Botao
            variante="contorno"
            icone={<BlockRoundedIcon />}
            onClick={() => preparar("revogar-todas")}
            disabled={!chaves.some((c) => c.estado === "ativa" && !estaRevogada(c))}
          >
            Revogar todas
          </Botao>
          <Botao
            variante="contorno"
            icone={<DeleteOutlineRoundedIcon />}
            onClick={() => preparar("limpar")}
            disabled={!naoAtivas}
          >
            Limpar histórico
          </Botao>
        </Box>
        <Stack direction="row" spacing={1} sx={{ alignItems: "flex-start" }}>
          <ShieldRoundedIcon fontSize="small" aria-hidden="true" sx={{ flexShrink: 0 }} />
          <Typography variant="caption" sx={{ color: "text.secondary" }}>
            Chaves acessam dados pessoais. Compartilhe apenas com a equipe autorizada.
          </Typography>
        </Stack>
        <Stack direction={{ xs: "column", sm: "row" }} spacing={1} sx={{ flexWrap: "wrap" }}>
          <Box sx={{ flex: 1, minWidth: { sm: 200 } }}>
            <CampoTexto
              id="config-bi-busca"
              valor={busca}
              onValor={setBusca}
              placeholder="Buscar chave"
              ariaLabel="Buscar chave"
              tamanho="pequeno"
            />
          </Box>
          <Box sx={{ minWidth: 0, width: { sm: 180 } }}>
            <Selecionar
              ariaLabel="Ordenar chaves"
              valor={ordem}
              onValor={setOrdem}
              opcoes={[
                { valor: "recentes", rotulo: "Mais recentes" },
                { valor: "nome", rotulo: "Nome" },
                { valor: "uso", rotulo: "Mais usadas" },
              ]}
            />
          </Box>
        </Stack>
        {erro ? (
          <AlertaCompacto variante="dados_invalidos" descricao={erro} tamanho="linha" />
        ) : null}
        {visiveis.length === 0 ? (
          <Typography variant="body2" sx={{ color: "text.secondary" }}>
            Nenhuma chave encontrada.
          </Typography>
        ) : null}
        {visiveis.map((c) => {
          const nova = c.id.startsWith("novo-");
          const revogada = estaRevogada(c);
          const acionavel = c.estado === "ativa" && !revogada;
          return (
            <Box component="article" key={c.id} sx={CARTAO}>
              <Stack
                direction="row"
                spacing={1}
                sx={{ flexWrap: "wrap", alignItems: "center", justifyContent: "space-between" }}
              >
                <Typography
                  component="h3"
                  variant="subtitle1"
                  sx={{ minWidth: 0, fontWeight: 600, overflowWrap: "anywhere" }}
                >
                  {c.rotulo}
                </Typography>
                <Stack direction="row" spacing={1} sx={{ flexWrap: "wrap" }}>
                  <Selo>{c.estado}</Selo>
                  {nova ? <Selo>Nova</Selo> : null}
                  {c.rotacionar ? <Selo tom="atencao">Substituir ao salvar</Selo> : null}
                </Stack>
              </Stack>
              <Typography
                variant="caption"
                sx={{ color: "text.secondary", overflowWrap: "anywhere" }}
              >
                {resumoDoEscopo(c.escopo)}
              </Typography>
              <Stack direction="row" spacing={1} sx={{ flexWrap: "wrap" }}>
                <Selo>{c.usos} consultas</Selo>
                <Selo>
                  {c.expiraEm
                    ? `Até ${new Date(c.expiraEm).toLocaleDateString("pt-BR")}`
                    : "Sem prazo"}
                </Selo>
                {c.inativa && c.estado === "ativa" ? (
                  <Selo>Revisar: sem uso há 90 dias</Selo>
                ) : null}
              </Stack>
              <Acordeao
                titulo="Detalhes da chave"
                nivelTitulo="h4"
                resumo={
                  <Typography
                    component="span"
                    variant="body2"
                    sx={{ display: "flex", alignItems: "center", gap: 1 }}
                  >
                    <HistoryRoundedIcon fontSize="inherit" aria-hidden="true" />
                    Datas e usos registrados
                  </Typography>
                }
              >
                <Box
                  component="dl"
                  sx={{
                    display: "grid",
                    gap: 2,
                    gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr" },
                    margin: 0,
                  }}
                >
                  <Box>
                    <Typography component="dt" variant="caption" sx={{ color: "text.secondary" }}>
                      Criação
                    </Typography>
                    <Typography component="dd" variant="body2" sx={{ margin: 0 }}>
                      {new Date(c.criadaEm).toLocaleDateString("pt-BR")}
                    </Typography>
                  </Box>
                  <Box>
                    <Typography component="dt" variant="caption" sx={{ color: "text.secondary" }}>
                      Validade
                    </Typography>
                    <Typography component="dd" variant="body2" sx={{ margin: 0 }}>
                      {c.expiraEm ? new Date(c.expiraEm).toLocaleString("pt-BR") : "Sem prazo"}
                    </Typography>
                  </Box>
                  <Box>
                    <Typography component="dt" variant="caption" sx={{ color: "text.secondary" }}>
                      Primeiro uso
                    </Typography>
                    <Typography component="dd" variant="body2" sx={{ margin: 0 }}>
                      {c.primeiroUsoEm
                        ? new Date(c.primeiroUsoEm).toLocaleString("pt-BR")
                        : "Sem uso"}
                    </Typography>
                  </Box>
                  <Box>
                    <Typography component="dt" variant="caption" sx={{ color: "text.secondary" }}>
                      Último uso
                    </Typography>
                    <Typography component="dd" variant="body2" sx={{ margin: 0 }}>
                      {c.ultimoUsoEm ? new Date(c.ultimoUsoEm).toLocaleString("pt-BR") : "Sem uso"}
                    </Typography>
                  </Box>
                </Box>
              </Acordeao>
              {acionavel ? (
                <Stack direction="row" spacing={1} sx={{ flexWrap: "wrap" }}>
                  <Botao
                    variante="contorno"
                    tamanho="pequeno"
                    icone={<EditRoundedIcon />}
                    onClick={() => preparar("editar", c)}
                  >
                    Editar
                  </Botao>
                  {!nova ? (
                    c.rotacionar ? (
                      <Botao
                        variante="contorno"
                        tamanho="pequeno"
                        icone={<RestartAltRoundedIcon />}
                        onClick={() => desfazerRotacao(c)}
                      >
                        Desfazer substituição
                      </Botao>
                    ) : (
                      <Botao
                        variante="contorno"
                        tamanho="pequeno"
                        icone={<RestartAltRoundedIcon />}
                        onClick={() => preparar("rotacionar", c)}
                      >
                        Substituir
                      </Botao>
                    )
                  ) : null}
                  <Botao
                    variante="destrutivo"
                    tamanho="pequeno"
                    icone={<BlockRoundedIcon />}
                    onClick={() => preparar("revogar", c)}
                  >
                    Revogar
                  </Botao>
                </Stack>
              ) : null}
              {c.revogada ? (
                <Box>
                  <Botao
                    variante="contorno"
                    tamanho="pequeno"
                    icone={<BlockRoundedIcon />}
                    onClick={() => desfazerRevogacao(c)}
                  >
                    Desfazer revogação
                  </Botao>
                </Box>
              ) : null}
            </Box>
          );
        })}
      </Stack>

      <Dialogo
        aberto={acao !== null}
        onFechar={() => {
          setAcao(null);
          setChave(null);
        }}
        titulo={acao ? TITULOS[acao] : "Chave"}
        descricao={
          cadastro
            ? "Sem seleção, o acesso inclui todas as séries, turmas e bases. Salve as configurações para aplicar."
            : acao === "rotacionar"
              ? "A chave anterior deixa de funcionar ao salvar. O novo segredo aparece uma única vez."
              : acao === "limpar"
                ? "Remove do rascunho as chaves revogadas e expiradas. A auditoria permanece."
                : "O acesso será encerrado ao salvar. Dados já baixados não podem ser apagados remotamente."
        }
        tamanho="grande"
      >
        <Box
          component="form"
          onSubmit={(evento) => {
            evento.preventDefault();
            confirmar();
          }}
          sx={{ display: "flex", flexDirection: "column", gap: 2 }}
        >
          {cadastro ? (
            <>
              <Campo id="bi-rotulo" rotulo="Rótulo">
                <CampoTexto
                  id="bi-rotulo"
                  valor={rotulo}
                  onValor={setRotulo}
                  maxLength={80}
                  required
                />
              </Campo>
              <Box>
                <Stack
                  direction="row"
                  spacing={1}
                  sx={{ alignItems: "center", justifyContent: "space-between", marginBottom: 1 }}
                >
                  <Typography variant="body2" sx={{ fontWeight: 600 }}>
                    Validade opcional
                  </Typography>
                  {validadeDia ? (
                    <Botao
                      type="button"
                      variante="texto"
                      tamanho="pequeno"
                      onClick={() => {
                        setValidadeDia("");
                        setValidadeHora("23:59");
                      }}
                    >
                      Sem prazo
                    </Botao>
                  ) : null}
                </Stack>
                <Box
                  sx={{
                    display: "grid",
                    gap: 1,
                    gridTemplateColumns: { xs: "minmax(0, 1fr) 7rem", sm: "minmax(0, 1fr) 8rem" },
                  }}
                >
                  <SeletorPeriodo
                    id="bi-validade"
                    modo="dia"
                    valor={validadeDia}
                    atual={hoje}
                    min={hoje}
                    max="2199-12-31"
                    rotulo={rotuloDia(validadeDia)}
                    rotuloAcessivel="Data de validade da chave"
                    onValor={setValidadeDia}
                  />
                  <SeletorHorario
                    id="bi-validade-hora"
                    valor={validadeHora}
                    disabled={!validadeDia}
                    rotuloAcessivel="Hora de validade da chave"
                    onValor={setValidadeHora}
                  />
                </Box>
                <Typography variant="caption" sx={{ color: "text.secondary" }}>
                  Sem data, a chave não expira. O horário usa o fuso deste dispositivo.
                </Typography>
              </Box>
              <Acordeao
                titulo="Escopo"
                nivelTitulo="h4"
                resumo={<Typography variant="body2">{resumoEscopo}</Typography>}
                aberto={escopoAberto}
                onChange={setEscopoAberto}
              >
                <Box
                  role="region"
                  aria-label="Escopo da chave"
                  sx={{ display: "flex", flexDirection: "column", gap: 2 }}
                >
                  <Box component="fieldset" sx={{ border: 0, padding: 0, margin: 0 }}>
                    <Typography component="legend" variant="subtitle2" sx={{ marginBottom: 1 }}>
                      Séries
                    </Typography>
                    <Box sx={{ display: "flex", flexDirection: "column" }}>
                      {series.map((s) => (
                        <FormControlLabel
                          key={s.id}
                          control={
                            <Checkbox
                              checked={escopo.series?.includes(s.id) ?? false}
                              onChange={(e) => alternar("series", s.id, e.target.checked)}
                            />
                          }
                          label={s.nome}
                          sx={{ minHeight: 48, margin: 0 }}
                        />
                      ))}
                    </Box>
                  </Box>
                  <Box component="fieldset" sx={{ border: 0, padding: 0, margin: 0 }}>
                    <Typography component="legend" variant="subtitle2" sx={{ marginBottom: 1 }}>
                      Turmas
                    </Typography>
                    <Box sx={{ display: "flex", flexDirection: "column" }}>
                      {turmas.map((t) => (
                        <FormControlLabel
                          key={t.id}
                          control={
                            <Checkbox
                              checked={escopo.turmas?.includes(t.id) ?? false}
                              onChange={(e) => alternar("turmas", t.id, e.target.checked)}
                            />
                          }
                          label={t.rotulo}
                          sx={{ minHeight: 48, margin: 0 }}
                        />
                      ))}
                    </Box>
                  </Box>
                  <Box component="fieldset" sx={{ border: 0, padding: 0, margin: 0 }}>
                    <Typography component="legend" variant="subtitle2" sx={{ marginBottom: 1 }}>
                      Bases
                    </Typography>
                    <Box sx={{ display: "flex", flexDirection: "column" }}>
                      {RECURSOS_BI.map((r) => (
                        <FormControlLabel
                          key={r}
                          control={
                            <Checkbox
                              checked={escopo.recursos?.includes(r) ?? false}
                              onChange={(e) => alternar("recursos", r, e.target.checked)}
                            />
                          }
                          label={ROTULOS_RECURSOS_BI[r]}
                          sx={{ minHeight: 48, margin: 0 }}
                        />
                      ))}
                    </Box>
                  </Box>
                  <Box sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
                    <Typography variant="body2" sx={{ fontWeight: 600 }}>
                      Desde
                    </Typography>
                    {escopo.inicio ? (
                      <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
                        <Box sx={{ flex: 1, minWidth: 0 }}>
                          <SeletorPeriodo
                            id="bi-escopo-inicio"
                            modo="dia"
                            valor={escopo.inicio}
                            max={escopo.fim || "2199-12-31"}
                            rotulo={escopo.inicio.split("-").reverse().join("/")}
                            rotuloAcessivel="Início do escopo da chave"
                            onValor={(valor) =>
                              setEscopo((s) => ({ ...s, inicio: valor || undefined }))
                            }
                          />
                        </Box>
                        <Botao
                          type="button"
                          variante="texto"
                          tamanho="pequeno"
                          onClick={() => setEscopo((s) => ({ ...s, inicio: undefined }))}
                        >
                          Limpar
                        </Botao>
                      </Stack>
                    ) : (
                      <Botao
                        type="button"
                        variante="contorno"
                        tamanho="pequeno"
                        sx={{ alignSelf: "flex-start" }}
                        onClick={() => setEscopo((s) => ({ ...s, inicio: hoje }))}
                      >
                        Definir data inicial
                      </Botao>
                    )}
                    <Typography variant="body2" sx={{ fontWeight: 600 }}>
                      Até
                    </Typography>
                    {escopo.fim ? (
                      <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
                        <Box sx={{ flex: 1, minWidth: 0 }}>
                          <SeletorPeriodo
                            id="bi-escopo-fim"
                            modo="dia"
                            valor={escopo.fim}
                            min={escopo.inicio}
                            max="2199-12-31"
                            rotulo={escopo.fim.split("-").reverse().join("/")}
                            rotuloAcessivel="Fim do escopo da chave"
                            onValor={(valor) =>
                              setEscopo((s) => ({ ...s, fim: valor || undefined }))
                            }
                          />
                        </Box>
                        <Botao
                          type="button"
                          variante="texto"
                          tamanho="pequeno"
                          onClick={() => setEscopo((s) => ({ ...s, fim: undefined }))}
                        >
                          Limpar
                        </Botao>
                      </Stack>
                    ) : (
                      <Botao
                        type="button"
                        variante="contorno"
                        tamanho="pequeno"
                        sx={{ alignSelf: "flex-start" }}
                        onClick={() => setEscopo((s) => ({ ...s, fim: hoje }))}
                      >
                        Definir data final
                      </Botao>
                    )}
                  </Box>
                </Box>
              </Acordeao>
            </>
          ) : null}
          {chave ? (
            <Typography variant="body2" sx={{ fontWeight: 600 }}>
              {chave.rotulo}
            </Typography>
          ) : null}
          {erro ? (
            <AlertaCompacto variante="dados_invalidos" descricao={erro} tamanho="linha" />
          ) : null}
          <Stack direction="row" spacing={2} sx={{ justifyContent: "flex-end", flexWrap: "wrap" }}>
            <Botao
              type="button"
              variante="contorno"
              onClick={() => {
                setAcao(null);
                setChave(null);
              }}
            >
              Cancelar
            </Botao>
            <Botao type="submit" variante="secundario" icone={<CheckRoundedIcon />}>
              Aplicar ao rascunho
            </Botao>
          </Stack>
        </Box>
      </Dialogo>
    </SecaoConfiguracao>
  );
}
