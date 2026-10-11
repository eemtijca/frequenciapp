"use client";

// Chaves do FrequenciBI: escopo visual, confirmação com senha e segredo exibido uma vez.
import { useEffect, useRef, useState } from "react";
import { KeyRound, Copy, Plus, Pencil, RotateCw, Ban, Trash2, RefreshCw } from "lucide-react";
import type { Serie, Turma } from "@/domain/frequencia";
import { RECURSOS_BI, ROTULOS_RECURSOS_BI, type ChaveBi, type EscopoBi } from "@/domain/bi";
import { pedir, corpoJson } from "@/lib/api-cliente";
import { avisarErro, avisarSucesso } from "@/lib/avisos";
import { useAcaoUnica } from "@/lib/use-acao-unica";
import { SecaoRecolhivel } from "@/components/ui/secao-recolhivel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CampoSenha } from "@/components/ui/campo-senha";
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
function dataLocal(valor: string | null) {
  if (!valor) return "";
  const d = new Date(valor);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
}
export default function SecaoChavesBi({ series, turmas }: { series: Serie[]; turmas: Turma[] }) {
  const [aberto, setAberto] = useState(false);
  const [chaves, setChaves] = useState<ChaveBi[] | null>(null);
  const [erro, setErro] = useState("");
  const [busca, setBusca] = useState("");
  const [ordem, setOrdem] = useState("recentes");
  const [acao, setAcao] = useState<Acao | null>(null);
  const [chave, setChave] = useState<ChaveBi | null>(null);
  const [rotulo, setRotulo] = useState("");
  const [validade, setValidade] = useState("");
  const [escopo, setEscopo] = useState<EscopoBi>({});
  const [senha, setSenha] = useState("");
  const [segredo, setSegredo] = useState("");
  const foco = useRef<HTMLElement | null>(null);
  const { executar: carregar, executando: carregando } = useAcaoUnica(async () => {
    setErro("");
    try {
      setChaves((await pedir<{ chaves: ChaveBi[] }>("/api/bi/chaves")).chaves);
    } catch (e) {
      setErro("Não foi possível atualizar as chaves. Tente novamente.");
      avisarErro(e, { contexto: "Não foi possível concluir a ação nas chaves." });
    }
  });
  useEffect(() => {
    if (aberto && chaves === null) void carregar();
  }, [aberto, chaves, carregar]);
  function preparar(a: Acao, c: ChaveBi | null = null) {
    foco.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setAcao(a);
    setChave(c);
    setRotulo(c?.rotulo ?? "");
    setValidade(dataLocal(c?.expiraEm ?? null));
    setEscopo(c?.escopo ?? {});
    setSenha("");
  }
  const { executar: confirmar, executando: salvando } = useAcaoUnica(async () => {
    if (!acao) return;
    try {
      const corpo = {
        acao,
        senha,
        ...(chave ? { id: chave.id } : {}),
        ...(acao === "criar" || acao === "editar"
          ? { rotulo, expiraEm: validade ? new Date(validade).toISOString() : null, escopo }
          : {}),
      };
      const resultado = await pedir<{ segredo?: string }>("/api/bi/chaves", corpoJson(corpo));
      setSenha("");
      setAcao(null);
      setChave(null);
      if (resultado.segredo) setSegredo(resultado.segredo);
      avisarSucesso("Ação concluída.");
      // Falha de atualização não repete a mutação nem perde o segredo recém-gerado.
      await carregar();
    } catch (e) {
      avisarErro(e, { contexto: "Não foi possível concluir a ação nas chaves." });
    }
  });
  const cadastro = acao === "criar" || acao === "editar";
  const visiveis = (chaves ?? [])
    .filter((c) => c.rotulo.toLocaleLowerCase("pt-BR").includes(busca.toLocaleLowerCase("pt-BR")))
    .sort((a, b) =>
      ordem === "nome"
        ? a.rotulo.localeCompare(b.rotulo, "pt-BR")
        : ordem === "uso"
          ? b.usos - a.usos
          : b.criadaEm.localeCompare(a.criadaEm),
    );
  function alternar(campo: "series" | "turmas" | "recursos", valor: string, marcada: boolean) {
    const atuais = escopo[campo] ?? [];
    const lista = marcada ? [...atuais, valor] : atuais.filter((v) => v !== valor);
    setEscopo((e) => ({ ...e, [campo]: lista.length ? lista : undefined }));
  }
  return (
    <SecaoRecolhivel
      titulo="FrequenciBI"
      descricao="Chaves de leitura dos dados escolares."
      icone={KeyRound}
      aberto={aberto}
      onAbertoChange={setAberto}
      dataSecao="config-chaves-bi"
      resumo={
        chaves ? <Selo>{chaves.filter((c) => c.estado === "ativa").length} ativas</Selo> : undefined
      }
    >
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => preparar("criar")} disabled={salvando}>
            <Plus size={16} />
            Criar chave
          </Button>
          <Button
            variant="outline"
            onClick={() => void carregar()}
            disabled={carregando || salvando}
            aria-label="Atualizar chaves"
          >
            <RefreshCw size={16} />
          </Button>
          <Button
            variant="outline"
            onClick={() => preparar("revogar-todas")}
            disabled={salvando || !chaves?.some((c) => c.estado === "ativa")}
          >
            <Ban size={16} />
            Revogar todas
          </Button>
          <Button
            variant="outline"
            onClick={() => preparar("limpar")}
            disabled={salvando || !chaves?.some((c) => c.estado !== "ativa")}
          >
            <Trash2 size={16} />
            Limpar histórico
          </Button>
        </div>
        <p className="text-muted-foreground text-sm">
          Uma chave permite consultar dados pessoais. Entregue apenas à equipe autorizada.
        </p>
        <div className="flex flex-wrap gap-2">
          <Input
            aria-label="Buscar chave"
            placeholder="Buscar chave"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            className="min-w-0 flex-1"
          />
          <select
            aria-label="Ordenar chaves"
            value={ordem}
            onChange={(e) => setOrdem(e.target.value)}
            className="controle-vidro min-h-11 rounded-xl px-3 text-sm"
          >
            <option value="recentes">Mais recentes</option>
            <option value="nome">Nome</option>
            <option value="uso">Mais usadas</option>
          </select>
        </div>
        {erro && (
          <p role="alert" className="text-falta-texto text-sm">
            {erro}
          </p>
        )}
        {carregando && <p role="status">Carregando chaves...</p>}
        {!carregando && !erro && visiveis.length === 0 && (
          <p className="text-muted-foreground text-sm">Nenhuma chave encontrada.</p>
        )}
        {visiveis.map((c) => (
          <article key={c.id} className="controle-vidro flex flex-col gap-3 p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="min-w-0 font-semibold break-words">{c.rotulo}</h3>
              <Selo>{c.estado}</Selo>
            </div>
            <dl className="text-muted-foreground grid grid-cols-2 gap-2 text-xs">
              <div>
                <dt>Criação</dt>
                <dd>{new Date(c.criadaEm).toLocaleDateString("pt-BR")}</dd>
              </div>
              <div>
                <dt>Validade</dt>
                <dd>{c.expiraEm ? new Date(c.expiraEm).toLocaleString("pt-BR") : "Sem prazo"}</dd>
              </div>
              <div>
                <dt>Primeiro uso</dt>
                <dd>
                  {c.primeiroUsoEm ? new Date(c.primeiroUsoEm).toLocaleString("pt-BR") : "Sem uso"}
                </dd>
              </div>
              <div>
                <dt>Último uso</dt>
                <dd>
                  {c.ultimoUsoEm ? new Date(c.ultimoUsoEm).toLocaleString("pt-BR") : "Sem uso"}
                </dd>
              </div>
            </dl>
            <div className="flex flex-wrap gap-2">
              <Selo>{c.usos} consultas</Selo>
              <Selo>
                {c.escopo.recursos ? `${c.escopo.recursos.length} bases` : "Todas as bases"}
              </Selo>
              <Selo>
                {c.escopo.turmas ? `${c.escopo.turmas.length} turmas` : "Todas as turmas"}
              </Selo>
              {c.inativa && c.estado === "ativa" && <Selo>Revisar: sem uso há 90 dias</Selo>}
            </div>
            {c.estado === "ativa" && (
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" size="sm" onClick={() => preparar("editar", c)}>
                  <Pencil size={15} />
                  Editar
                </Button>
                <Button variant="outline" size="sm" onClick={() => preparar("rotacionar", c)}>
                  <RotateCw size={15} />
                  Substituir
                </Button>
                <Button variant="outline" size="sm" onClick={() => preparar("revogar", c)}>
                  <Ban size={15} />
                  Revogar
                </Button>
              </div>
            )}
          </article>
        ))}
      </div>
      <Dialog
        open={acao !== null}
        onOpenChange={(v) => {
          if (!v && !salvando) {
            setAcao(null);
            setSenha("");
          }
        }}
      >
        <DialogContent
          onCloseAutoFocus={(e) => {
            e.preventDefault();
            foco.current?.focus();
          }}
        >
          <DialogHeader>
            <DialogTitle>{acao ? TITULOS[acao] : "Chave"}</DialogTitle>
            <DialogDescription>
              {cadastro
                ? "Sem seleção, o escopo inclui todas as séries, turmas e bases."
                : acao === "rotacionar"
                  ? "A chave anterior deixa de funcionar. Entregue a substituta à pessoa autorizada."
                  : acao === "limpar"
                    ? "Remove chaves revogadas e expiradas. A auditoria permanece."
                    : "O acesso será encerrado. Dados já baixados não podem ser apagados remotamente."}
            </DialogDescription>
          </DialogHeader>
          <form
            className="flex flex-col gap-4"
            onSubmit={(e) => {
              e.preventDefault();
              void confirmar();
            }}
          >
            <fieldset disabled={salvando} className="flex min-w-0 flex-col gap-3">
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
                    <Label htmlFor="bi-validade">Validade opcional</Label>
                    <Input
                      id="bi-validade"
                      type="datetime-local"
                      value={validade}
                      onChange={(e) => setValidade(e.target.value)}
                    />
                  </div>
                  <details className="controle-vidro p-3">
                    <summary className="cursor-pointer font-medium">Escopo</summary>
                    <div className="mt-3 grid gap-3">
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
                        <Label htmlFor="bi-escopo-inicio">Desde</Label>
                        <Input
                          id="bi-escopo-inicio"
                          type="date"
                          value={escopo.inicio ?? ""}
                          onChange={(e) =>
                            setEscopo((s) => ({ ...s, inicio: e.target.value || undefined }))
                          }
                        />
                        <Label htmlFor="bi-escopo-fim">Até</Label>
                        <Input
                          id="bi-escopo-fim"
                          type="date"
                          value={escopo.fim ?? ""}
                          onChange={(e) =>
                            setEscopo((s) => ({ ...s, fim: e.target.value || undefined }))
                          }
                        />
                      </div>
                    </div>
                  </details>
                </>
              )}
              {chave && <p className="text-sm font-medium">{chave.rotulo}</p>}
              <div className="grid gap-2">
                <Label htmlFor="bi-senha">Senha do administrador</Label>
                <CampoSenha
                  id="bi-senha"
                  autoComplete="current-password"
                  value={senha}
                  onChange={(e) => setSenha(e.target.value)}
                  required
                />
              </div>
            </fieldset>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setAcao(null);
                  setSenha("");
                }}
                disabled={salvando}
              >
                Cancelar
              </Button>
              <Button type="submit" disabled={salvando || !senha}>
                {salvando ? "Confirmando..." : "Confirmar"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
      <Dialog
        open={Boolean(segredo)}
        onOpenChange={(v) => {
          if (!v) setSegredo("");
        }}
      >
        <DialogContent
          onCloseAutoFocus={(e) => {
            e.preventDefault();
            foco.current?.focus();
          }}
        >
          <DialogHeader>
            <DialogTitle>Guarde a chave</DialogTitle>
            <DialogDescription>
              Ela aparece apenas agora e dá acesso a dados pessoais. Não a inclua em links.
            </DialogDescription>
          </DialogHeader>
          <Input
            aria-label="Chave gerada"
            readOnly
            value={segredo}
            autoComplete="off"
            className="font-mono text-xs"
          />
          <Button
            variant="outline"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(segredo);
                avisarSucesso("Chave copiada.");
              } catch (e) {
                avisarErro(e, {
                  contexto: "Não foi possível copiar. Selecione a chave e copie manualmente.",
                });
              }
            }}
          >
            <Copy size={16} />
            Copiar chave
          </Button>
          <DialogFooter>
            <Button onClick={() => setSegredo("")}>Já guardei</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </SecaoRecolhivel>
  );
}
