"use client";

// Chaves do FrequenciBI no rascunho: escopo visual e ações que só valem
// depois da confirmação do lote. O segredo aparece uma única vez no salvamento.
import { useRef, useState } from "react";
import * as Collapsible from "@radix-ui/react-collapsible";
import {
  Ban,
  Check,
  ChevronDown,
  History,
  ShieldCheck,
  KeyRound,
  ListFilter,
  Pencil,
  Plus,
  RotateCw,
  Trash2,
} from "lucide-react";
import type { Serie, Turma } from "@/domain/frequencia";
import type { ChaveBiDesejada } from "@/domain/configuracoes";
import { RECURSOS_BI, ROTULOS_RECURSOS_BI, type EscopoBi } from "@/domain/bi";
import { avisarSucesso } from "@/lib/avisos";
import { SecaoRecolhivel } from "@/components/ui/secao-recolhivel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Selecionar } from "@/components/ui/selecionar";
import { SeletorHorario } from "@/components/ui/seletor-horario";
import { SeletorPeriodo } from "@/components/ui/seletor-periodo";
import { Selo } from "@/components/ui/selo";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";

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
  const [aberto, setAberto] = useState(false);
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
  const foco = useRef<HTMLElement | null>(null);

  function preparar(a: Acao, c: ChaveBiDesejada | null = null) {
    foco.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
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
    <SecaoRecolhivel
      titulo="FrequenciBI"
      icone={KeyRound}
      aberto={aberto}
      onAbertoChange={setAberto}
      dataSecao="config-chaves-bi"
      resumo={<Selo>{contar(ativas, "ativa", "ativas")}</Selo>}
    >
      <div className="flex flex-col gap-4">
        <div className="grid grid-cols-3 gap-2">
          <Button
            className="h-auto min-h-20 min-w-0 flex-col gap-2 rounded-xl px-2 py-3 text-xs whitespace-normal sm:text-sm"
            onClick={() => preparar("criar")}
          >
            <Plus size={20} aria-hidden="true" />
            Criar chave
          </Button>
          <Button
            variant="outline"
            className="h-auto min-h-20 min-w-0 flex-col gap-2 rounded-xl px-2 py-3 text-xs whitespace-normal sm:text-sm"
            onClick={() => preparar("revogar-todas")}
            disabled={!chaves.some((c) => c.estado === "ativa" && !estaRevogada(c))}
          >
            <Ban size={20} aria-hidden="true" />
            Revogar todas
          </Button>
          <Button
            variant="outline"
            className="h-auto min-h-20 min-w-0 flex-col gap-2 rounded-xl px-2 py-3 text-xs whitespace-normal sm:text-sm"
            onClick={() => preparar("limpar")}
            disabled={!naoAtivas}
          >
            <Trash2 size={20} aria-hidden="true" />
            Limpar histórico
          </Button>
        </div>
        <p className="text-muted-foreground flex items-start gap-2 text-xs">
          <ShieldCheck size={16} aria-hidden="true" className="shrink-0" />
          Chaves acessam dados pessoais. Compartilhe apenas com a equipe autorizada.
        </p>
        <div className="flex flex-wrap gap-2">
          <Input
            aria-label="Buscar chave"
            placeholder="Buscar chave"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            className="h-11 min-w-0 flex-1 basis-44"
          />
          <Selecionar
            ariaLabel="Ordenar chaves"
            value={ordem}
            onValueChange={setOrdem}
            opcoes={[
              { valor: "recentes", rotulo: "Mais recentes" },
              { valor: "nome", rotulo: "Nome" },
              { valor: "uso", rotulo: "Mais usadas" },
            ]}
            className="h-11 w-full sm:w-44"
          />
        </div>
        {erro && (
          <p role="alert" className="text-falta-texto text-sm">
            {erro}
          </p>
        )}
        {visiveis.length === 0 && (
          <p className="text-muted-foreground text-sm">Nenhuma chave encontrada.</p>
        )}
        {visiveis.map((c) => {
          const nova = c.id.startsWith("novo-");
          const revogada = estaRevogada(c);
          const acionavel = c.estado === "ativa" && !revogada;
          return (
            <article key={c.id} className="controle flex flex-col gap-3 p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="min-w-0 font-semibold break-words">{c.rotulo}</h3>
                <div className="flex flex-wrap gap-1.5">
                  <Selo>{c.estado}</Selo>
                  {nova && <Selo>Nova</Selo>}
                  {c.rotacionar && <Selo variante="atencao">Substituir ao salvar</Selo>}
                </div>
              </div>
              <p className="text-muted-foreground text-xs wrap-anywhere">
                {resumoDoEscopo(c.escopo)}
              </p>
              <div className="flex flex-wrap gap-2">
                <Selo>{c.usos} consultas</Selo>
                <Selo>
                  {c.expiraEm
                    ? `Até ${new Date(c.expiraEm).toLocaleDateString("pt-BR")}`
                    : "Sem prazo"}
                </Selo>
                {c.inativa && c.estado === "ativa" && <Selo>Revisar: sem uso há 90 dias</Selo>}
              </div>
              <details className="text-muted-foreground text-xs">
                <summary className="flex min-h-11 cursor-pointer items-center gap-2 font-medium">
                  <History size={16} aria-hidden="true" /> Detalhes da chave
                </summary>
                <dl className="grid grid-cols-2 gap-3 pt-2">
                  <div>
                    <dt>Criação</dt>
                    <dd>{new Date(c.criadaEm).toLocaleDateString("pt-BR")}</dd>
                  </div>
                  <div>
                    <dt>Validade</dt>
                    <dd>
                      {c.expiraEm ? new Date(c.expiraEm).toLocaleString("pt-BR") : "Sem prazo"}
                    </dd>
                  </div>
                  <div>
                    <dt>Primeiro uso</dt>
                    <dd>
                      {c.primeiroUsoEm
                        ? new Date(c.primeiroUsoEm).toLocaleString("pt-BR")
                        : "Sem uso"}
                    </dd>
                  </div>
                  <div>
                    <dt>Último uso</dt>
                    <dd>
                      {c.ultimoUsoEm ? new Date(c.ultimoUsoEm).toLocaleString("pt-BR") : "Sem uso"}
                    </dd>
                  </div>
                </dl>
              </details>
              {acionavel && (
                <div className="flex flex-wrap gap-2">
                  <Button
                    variant="outline"
                    className="h-11 min-w-0"
                    onClick={() => preparar("editar", c)}
                  >
                    <Pencil size={16} aria-hidden="true" />
                    Editar
                  </Button>
                  {!nova &&
                    (c.rotacionar ? (
                      <Button
                        variant="outline"
                        className="h-auto min-h-11 whitespace-normal"
                        onClick={() => desfazerRotacao(c)}
                      >
                        <RotateCw size={16} aria-hidden="true" />
                        Desfazer substituição
                      </Button>
                    ) : (
                      <Button
                        variant="outline"
                        className="h-11 min-w-0"
                        onClick={() => preparar("rotacionar", c)}
                      >
                        <RotateCw size={16} aria-hidden="true" />
                        Substituir
                      </Button>
                    ))}
                  <Button
                    variant="outline"
                    className="text-falta-texto h-11 min-w-0"
                    onClick={() => preparar("revogar", c)}
                  >
                    <Ban size={16} aria-hidden="true" />
                    Revogar
                  </Button>
                </div>
              )}
              {c.revogada && (
                <div>
                  <Button
                    variant="outline"
                    className="h-auto min-h-11 whitespace-normal"
                    onClick={() => desfazerRevogacao(c)}
                  >
                    <Ban size={16} aria-hidden="true" />
                    Desfazer revogação
                  </Button>
                </div>
              )}
            </article>
          );
        })}
      </div>
      <Dialog
        open={acao !== null}
        onOpenChange={(v) => {
          if (!v) {
            setAcao(null);
            setChave(null);
          }
        }}
      >
        <DialogContent
          className="max-h-[90dvh] overflow-y-auto"
          onCloseAutoFocus={(e) => {
            e.preventDefault();
            foco.current?.focus();
          }}
        >
          <DialogHeader>
            <DialogTitle>{acao ? TITULOS[acao] : "Chave"}</DialogTitle>
            <DialogDescription>
              {cadastro
                ? "Sem seleção, o acesso inclui todas as séries, turmas e bases. Salve as configurações para aplicar."
                : acao === "rotacionar"
                  ? "A chave anterior deixa de funcionar ao salvar. O novo segredo aparece uma única vez."
                  : acao === "limpar"
                    ? "Remove do rascunho as chaves revogadas e expiradas. A auditoria permanece."
                    : "O acesso será encerrado ao salvar. Dados já baixados não podem ser apagados remotamente."}
            </DialogDescription>
          </DialogHeader>
          <form
            className="flex flex-col gap-4"
            onSubmit={(e) => {
              e.preventDefault();
              confirmar();
            }}
          >
            <fieldset className="flex min-w-0 flex-col gap-3">
              {cadastro && (
                <>
                  <div className="grid gap-2">
                    <Label htmlFor="bi-rotulo">Rótulo</Label>
                    <Input
                      id="bi-rotulo"
                      value={rotulo}
                      onChange={(e) => setRotulo(e.target.value)}
                      maxLength={80}
                      required
                    />
                  </div>
                  <div className="grid gap-2">
                    <div className="flex min-h-8 items-center justify-between gap-2">
                      <span className="text-sm font-medium">Validade opcional</span>
                      {validadeDia && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="-mr-2"
                          onClick={() => {
                            setValidadeDia("");
                            setValidadeHora("23:59");
                          }}
                        >
                          Sem prazo
                        </Button>
                      )}
                    </div>
                    <div className="grid grid-cols-[minmax(0,1fr)_7rem] gap-2 sm:grid-cols-[minmax(0,1fr)_8rem]">
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
                    </div>
                    <p className="text-muted-foreground text-xs">
                      Sem data, a chave não expira. O horário usa o fuso deste dispositivo.
                    </p>
                  </div>
                  <Collapsible.Root
                    open={escopoAberto}
                    onOpenChange={setEscopoAberto}
                    className="controle overflow-hidden"
                  >
                    <Collapsible.Trigger
                      type="button"
                      className="pressionavel focus-visible:ring-ring/50 flex min-h-14 w-full items-center gap-3 px-3 py-2 text-left outline-none focus-visible:ring-[3px]"
                    >
                      <span className="bg-secondary/60 text-secondary-foreground flex size-9 shrink-0 items-center justify-center rounded-full">
                        <ListFilter size={16} aria-hidden="true" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-semibold">Escopo</span>
                        <span className="text-muted-foreground line-clamp-1 text-xs">
                          {resumoEscopo}
                        </span>
                      </span>
                      <ChevronDown
                        size={16}
                        aria-hidden="true"
                        className={`text-muted-foreground shrink-0 transition-transform motion-reduce:transition-none ${
                          escopoAberto ? "rotate-180" : ""
                        }`}
                      />
                    </Collapsible.Trigger>
                    <Collapsible.Content
                      role="region"
                      aria-label="Escopo da chave"
                      className="border-t p-3"
                    >
                      <div className="grid gap-3">
                        <fieldset className="grid gap-2">
                          <legend className="mb-2 text-sm font-medium">Séries</legend>
                          {series.map((s) => (
                            <label key={s.id} className="flex min-h-11 items-center gap-2 text-sm">
                              <input
                                type="checkbox"
                                checked={escopo.series?.includes(s.id) ?? false}
                                onChange={(e) => alternar("series", s.id, e.target.checked)}
                              />
                              {s.nome}
                            </label>
                          ))}
                        </fieldset>
                        <fieldset className="grid gap-2">
                          <legend className="mb-2 text-sm font-medium">Turmas</legend>
                          {turmas.map((t) => (
                            <label key={t.id} className="flex min-h-11 items-center gap-2 text-sm">
                              <input
                                type="checkbox"
                                checked={escopo.turmas?.includes(t.id) ?? false}
                                onChange={(e) => alternar("turmas", t.id, e.target.checked)}
                              />
                              {t.rotulo}
                            </label>
                          ))}
                        </fieldset>
                        <fieldset className="grid gap-2">
                          <legend className="mb-2 text-sm font-medium">Bases</legend>
                          {RECURSOS_BI.map((r) => (
                            <label key={r} className="flex min-h-11 items-center gap-2 text-sm">
                              <input
                                type="checkbox"
                                checked={escopo.recursos?.includes(r) ?? false}
                                onChange={(e) => alternar("recursos", r, e.target.checked)}
                              />
                              {ROTULOS_RECURSOS_BI[r]}
                            </label>
                          ))}
                        </fieldset>
                        <div className="grid gap-2">
                          <Label>Desde</Label>
                          {escopo.inicio ? (
                            <div className="flex items-center gap-2">
                              <div className="min-w-0 flex-1">
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
                              </div>
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                onClick={() => setEscopo((s) => ({ ...s, inicio: undefined }))}
                              >
                                Limpar
                              </Button>
                            </div>
                          ) : (
                            <Button
                              type="button"
                              variant="outline"
                              className="justify-start"
                              onClick={() => setEscopo((s) => ({ ...s, inicio: hoje }))}
                            >
                              Definir data inicial
                            </Button>
                          )}
                          <Label>Até</Label>
                          {escopo.fim ? (
                            <div className="flex items-center gap-2">
                              <div className="min-w-0 flex-1">
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
                              </div>
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                onClick={() => setEscopo((s) => ({ ...s, fim: undefined }))}
                              >
                                Limpar
                              </Button>
                            </div>
                          ) : (
                            <Button
                              type="button"
                              variant="outline"
                              className="justify-start"
                              onClick={() => setEscopo((s) => ({ ...s, fim: hoje }))}
                            >
                              Definir data final
                            </Button>
                          )}
                        </div>
                      </div>
                    </Collapsible.Content>
                  </Collapsible.Root>
                </>
              )}
              {chave && <p className="text-sm font-medium">{chave.rotulo}</p>}
              {erro && (
                <p role="alert" className="text-falta-texto text-sm">
                  {erro}
                </p>
              )}
            </fieldset>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setAcao(null);
                  setChave(null);
                }}
              >
                Cancelar
              </Button>
              <Button type="submit">
                <Check size={16} aria-hidden="true" /> Aplicar ao rascunho
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </SecaoRecolhivel>
  );
}
