"use client";

// Aba de diretores de turma: cadastro com as turmas de origem acompanhadas,
// emissão da palavra-chave (mostrada uma única vez), revogação com motivo e
// situação da conta. Só leitura de estatísticas para o diretor (ADR-021).
import { useEffect, useMemo, useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import {
  Ban,
  Copy,
  KeyRound,
  LoaderCircle,
  Pencil,
  Plus,
  Power,
  UserRoundCheck,
} from "lucide-react";
import { toast } from "sonner";
import { avisarErro, avisarSucesso } from "@/lib/avisos";
import { estadoDeErro } from "@/lib/estado-http";
import { useAcaoUnica, useAcoesPorChave } from "@/lib/use-acao-unica";
import { AvisoCompacto, type VarianteEstado } from "@/components/ui/tela-estado";
import { normalizar, rotuloData, rotuloDiaSemana, type Turma } from "@/domain/frequencia";
import {
  ROTULOS_ESTADO_CREDENCIAL,
  problemaDeIdentificador,
  type DiretorDTO,
  type EstadoCredencial,
} from "@/domain/diretores";
import { pedir, corpoJson, corpoAlteracao, ErroApi } from "@/lib/api-cliente";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { BarraBusca } from "@/components/ui/barra-busca";
import { Label } from "@/components/ui/label";
import { SeletorPeriodo } from "@/components/ui/seletor-periodo";
import { Selo, type VarianteSelo } from "@/components/ui/selo";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

interface Props {
  turmas: Turma[];
  diaCorrente: string;
}

interface Formulario {
  nome: string;
  identificador: string;
  turmaIds: string[];
  inicio: string;
}

const VAZIO: Formulario = { nome: "", identificador: "", turmaIds: [], inicio: "" };

const VARIANTE_ESTADO: Record<EstadoCredencial, VarianteSelo> = {
  sem_palavra: "neutro",
  emitida: "neutro",
  em_uso: "sucesso",
  expirada: "atencao",
  revogada: "perigo",
};

function dataCurta(iso: string | null): string {
  return iso ? new Date(iso).toLocaleDateString("pt-BR") : "";
}

export default function AbaDiretores({ turmas, diaCorrente }: Props) {
  const [diretores, setDiretores] = useState<DiretorDTO[] | null>(null);
  const semMovimento = useReducedMotion() ?? false;
  const [dialogoAberto, setDialogoAberto] = useState(false);
  const [emEdicao, setEmEdicao] = useState<DiretorDTO | null>(null);
  const [formulario, setFormulario] = useState<Formulario>(VAZIO);
  const [inicioBase, setInicioBase] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState("");
  const [erroVariante, setErroVariante] = useState<VarianteEstado>("dados_invalidos");
  const [emitirAlvo, setEmitirAlvo] = useState<DiretorDTO | null>(null);
  const [palavraEmitida, setPalavraEmitida] = useState<{
    diretor: DiretorDTO;
    palavraChave: string;
  } | null>(null);
  const [revogarAlvo, setRevogarAlvo] = useState<DiretorDTO | null>(null);
  const [motivo, setMotivo] = useState("");
  const [busca, setBusca] = useState("");

  const { executando: carregando, executar: recarregar } = useAcaoUnica(async () => {
    try {
      const dados = await pedir<{ diretores: DiretorDTO[] }>("/api/diretores");
      setDiretores(dados.diretores);
    } catch (excecao) {
      toast.error(
        excecao instanceof ErroApi ? excecao.message : "Não foi possível carregar os diretores.",
      );
      setDiretores([]);
    }
  });
  const { chaveAtiva, executar: executarPorChave } = useAcoesPorChave();

  useEffect(() => {
    void recarregar();
  }, [recarregar]);

  const turmasOrdenadas = useMemo(
    () => turmas.slice().sort((a, b) => a.rotulo.localeCompare(b.rotulo, "pt-BR")),
    [turmas],
  );
  const termo = normalizar(busca);
  const filtrados = (diretores ?? []).filter(
    (diretor) =>
      termo === "" ||
      normalizar(
        `${diretor.nome} ${diretor.identificador} ${diretor.turmas.map((t) => t.turma).join(" ")}`,
      ).includes(termo),
  );
  const problemaIdentificador =
    emEdicao === null && formulario.identificador.trim() !== ""
      ? problemaDeIdentificador(formulario.identificador.trim().toLowerCase())
      : null;

  function abrirNovo() {
    setEmEdicao(null);
    setFormulario({ ...VAZIO, inicio: diaCorrente });
    setInicioBase(diaCorrente);
    setErro("");
    setDialogoAberto(true);
  }

  function abrirEdicao(diretor: DiretorDTO) {
    setEmEdicao(diretor);
    const maisAntigo = diretor.turmas.map((vinculo) => vinculo.inicio).sort()[0] ?? diaCorrente;
    setInicioBase(maisAntigo);
    setFormulario({
      nome: diretor.nome,
      identificador: diretor.identificador,
      turmaIds: diretor.turmas.map((vinculo) => vinculo.turmaId),
      inicio: maisAntigo,
    });
    setErro("");
    setDialogoAberto(true);
  }

  function alternarTurma(turmaId: string, marcada: boolean) {
    setFormulario((atual) => ({
      ...atual,
      turmaIds: marcada
        ? [...atual.turmaIds, turmaId]
        : atual.turmaIds.filter((id) => id !== turmaId),
    }));
  }

  async function submeter() {
    if (enviando) return;
    setEnviando(true);
    setErro("");
    try {
      if (emEdicao) {
        await pedir<{ diretor: DiretorDTO }>(
          `/api/diretores/${emEdicao.id}`,
          corpoAlteracao("PATCH", {
            nome: formulario.nome,
            turmaIds: formulario.turmaIds,
            ...(formulario.inicio && formulario.inicio !== inicioBase
              ? { inicioVinculo: formulario.inicio }
              : {}),
          }),
        );
        avisarSucesso(
          "Diretor atualizado.",
          "Turma retirada deixa de aparecer para o diretor na hora.",
        );
      } else {
        await pedir<{ diretor: DiretorDTO }>(
          "/api/diretores",
          corpoJson({
            nome: formulario.nome,
            identificador: formulario.identificador,
            turmaIds: formulario.turmaIds,
            ...(formulario.inicio ? { inicioVinculo: formulario.inicio } : {}),
          }),
        );
        avisarSucesso(
          "Diretor cadastrado.",
          "Gere a palavra-chave para liberar o primeiro acesso.",
        );
      }
      setDialogoAberto(false);
      await recarregar();
    } catch (excecao) {
      setErro(excecao instanceof ErroApi ? excecao.message : "Não foi possível salvar o diretor.");
      setErroVariante(estadoDeErro(excecao));
      avisarErro(excecao, { contexto: "Não foi possível salvar o diretor." });
    } finally {
      setEnviando(false);
    }
  }

  function emitir(diretor: DiretorDTO) {
    void executarPorChave(`emitir-${diretor.id}`, async () => {
      try {
        const dados = await pedir<{ palavraChave: string; diretor: DiretorDTO }>(
          `/api/diretores/${diretor.id}/palavra-chave`,
          corpoJson({}),
        );
        setPalavraEmitida(dados);
        await recarregar();
      } catch (excecao) {
        avisarErro(excecao, { contexto: "Não foi possível gerar a palavra-chave." });
      } finally {
        setEmitirAlvo(null);
      }
    });
  }

  function revogar(diretor: DiretorDTO) {
    void executarPorChave(`revogar-${diretor.id}`, async () => {
      try {
        await pedir<{ diretor: DiretorDTO }>(
          `/api/diretores/${diretor.id}/revogar`,
          corpoJson({ motivo }),
        );
        avisarSucesso(
          "Palavra-chave revogada.",
          "O acesso caiu na hora. Para liberar de novo, gere outra palavra-chave.",
        );
        setRevogarAlvo(null);
        setMotivo("");
        await recarregar();
      } catch (excecao) {
        avisarErro(excecao, { contexto: "Não foi possível revogar a palavra-chave." });
      }
    });
  }

  function alternarAtivo(diretor: DiretorDTO) {
    void executarPorChave(`ativo-${diretor.id}`, async () => {
      try {
        await pedir<{ diretor: DiretorDTO }>(
          `/api/diretores/${diretor.id}`,
          corpoAlteracao("PATCH", { ativo: !diretor.ativo }),
        );
        avisarSucesso(
          diretor.ativo ? "Diretor desativado." : "Diretor reativado.",
          diretor.ativo
            ? "O acesso é bloqueado na hora; o histórico continua."
            : "O acesso volta com a palavra-chave vigente, se ainda valer.",
        );
        await recarregar();
      } catch (excecao) {
        avisarErro(excecao, { contexto: "Não foi possível alterar a situação do diretor." });
      }
    });
  }

  async function copiarPalavra(palavra: string) {
    try {
      await navigator.clipboard.writeText(palavra);
      toast.success("Palavra-chave copiada.");
    } catch {
      toast.error("Não foi possível copiar. Selecione e copie o texto.");
    }
  }

  const podeRevogar = (diretor: DiretorDTO) =>
    diretor.estado === "emitida" || diretor.estado === "em_uso" || diretor.estado === "expirada";

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-muted-foreground text-sm">
          {diretores === null
            ? "Carregando..."
            : `${diretores.filter((diretor) => diretor.ativo).length} ${
                diretores.filter((diretor) => diretor.ativo).length === 1
                  ? "diretor ativo"
                  : "diretores ativos"
              }`}
        </p>
        <Button size="lg" className="h-11 rounded-lg" onClick={abrirNovo}>
          <Plus size={16} />
          Novo diretor
        </Button>
      </div>

      <p className="bg-secondary/60 text-secondary-foreground rounded-lg border px-4 py-3 text-xs leading-relaxed">
        O diretor de turma só consulta as estatísticas das turmas marcadas aqui, sem editar nada.
        Ele entra com o identificador e a palavra-chave, que aparece uma única vez ao ser gerada e
        precisa ser trocada no primeiro acesso. Entregue a palavra em mãos ou por mensagem direta.
      </p>

      {carregando && diretores === null ? (
        <div className="text-muted-foreground flex min-h-32 items-center justify-center gap-2 text-sm">
          <LoaderCircle size={18} className="animate-spin" aria-hidden="true" />
          Carregando diretores...
        </div>
      ) : (diretores ?? []).length === 0 ? (
        <div className="bg-card flex min-h-44 flex-col items-center justify-center gap-2 rounded-lg border px-6 text-center">
          <UserRoundCheck size={28} className="text-muted-foreground" aria-hidden="true" />
          <p className="font-medium">Nenhum diretor de turma cadastrado</p>
          <p className="text-muted-foreground text-sm">
            Cadastre cada diretor com as turmas que ele acompanha.
          </p>
          <Button variant="outline" className="mt-2" onClick={abrirNovo}>
            <Plus size={16} />
            Cadastrar diretor
          </Button>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          <BarraBusca
            id="busca-diretores"
            valor={busca}
            onValor={setBusca}
            placeholder="Buscar por nome, identificador ou turma"
          />
          {filtrados.length === 0 ? (
            <div className="bg-card flex min-h-40 flex-col items-center justify-center gap-1 rounded-lg border px-6 text-center">
              <p className="font-medium">Nenhum diretor encontrado</p>
              <p className="text-muted-foreground text-sm">Tente outro termo de busca.</p>
            </div>
          ) : (
            <ul className="flex flex-col gap-3">
              {filtrados.map((diretor) => (
                <motion.li
                  key={diretor.id}
                  initial={semMovimento ? false : { opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={semMovimento ? { duration: 0 } : { duration: 0.2 }}
                  className={`bg-card overflow-hidden rounded-lg border ${diretor.ativo ? "" : "opacity-60"}`}
                  data-diretor={diretor.identificador}
                >
                  <div className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center">
                    <div className="min-w-0 flex-1">
                      <p className="flex flex-wrap items-center gap-2 font-medium">
                        <span className="truncate">{diretor.nome}</span>
                        <Selo variante={VARIANTE_ESTADO[diretor.estado]}>
                          {ROTULOS_ESTADO_CREDENCIAL[diretor.estado]}
                        </Selo>
                        {!diretor.ativo && <Selo>desativado</Selo>}
                      </p>
                      <p className="text-muted-foreground numerais-tabulares truncate text-sm">
                        {diretor.identificador}
                      </p>
                      <p className="text-muted-foreground mt-0.5 text-xs">
                        {diretor.turmas.length > 0
                          ? diretor.turmas.map((vinculo) => vinculo.turma).join(", ")
                          : "Sem turma vinculada"}
                        {diretor.expiraEm &&
                        (diretor.estado === "emitida" || diretor.estado === "em_uso")
                          ? ` · palavra válida até ${dataCurta(diretor.expiraEm)}`
                          : ""}
                        {diretor.estado === "revogada" && diretor.motivoRevogacao
                          ? ` · revogada: ${diretor.motivoRevogacao}`
                          : ""}
                      </p>
                    </div>
                    <div className="flex shrink-0 flex-wrap items-center gap-1">
                      <Button
                        variant="outline"
                        className="h-11 rounded-lg"
                        disabled={!diretor.ativo || chaveAtiva === `emitir-${diretor.id}`}
                        onClick={() =>
                          diretor.estado === "sem_palavra"
                            ? emitir(diretor)
                            : setEmitirAlvo(diretor)
                        }
                      >
                        {chaveAtiva === `emitir-${diretor.id}` ? (
                          <LoaderCircle size={16} className="animate-spin" />
                        ) : (
                          <KeyRound size={16} />
                        )}
                        {diretor.estado === "sem_palavra" ? "Gerar palavra-chave" : "Gerar nova"}
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-11"
                        aria-label={`Editar ${diretor.nome}`}
                        onClick={() => abrirEdicao(diretor)}
                      >
                        <Pencil size={16} />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-11"
                        aria-label={
                          diretor.ativo ? `Desativar ${diretor.nome}` : `Reativar ${diretor.nome}`
                        }
                        disabled={chaveAtiva === `ativo-${diretor.id}`}
                        onClick={() => alternarAtivo(diretor)}
                      >
                        <Power size={16} />
                      </Button>
                      {podeRevogar(diretor) && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="text-falta-texto size-11"
                          aria-label={`Revogar a palavra-chave de ${diretor.nome}`}
                          onClick={() => {
                            setMotivo("");
                            setRevogarAlvo(diretor);
                          }}
                        >
                          <Ban size={16} />
                        </Button>
                      )}
                    </div>
                  </div>
                </motion.li>
              ))}
            </ul>
          )}
        </div>
      )}

      <Dialog open={dialogoAberto} onOpenChange={setDialogoAberto}>
        <DialogContent className="max-h-[90dvh] max-w-sm overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {emEdicao ? `Editar ${emEdicao.nome}` : "Novo diretor de turma"}
            </DialogTitle>
          </DialogHeader>
          <form
            className="flex flex-col gap-4"
            onSubmit={(evento) => {
              evento.preventDefault();
              void submeter();
            }}
            noValidate
          >
            <div className="flex flex-col gap-2">
              <Label htmlFor="nome-diretor">Nome</Label>
              <Input
                id="nome-diretor"
                value={formulario.nome}
                required
                maxLength={100}
                autoComplete="off"
                onChange={(evento) =>
                  setFormulario((atual) => ({ ...atual, nome: evento.target.value }))
                }
                placeholder="Nome do professor"
                className="h-11 rounded-lg"
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="identificador-diretor">Identificador de acesso</Label>
              <Input
                id="identificador-diretor"
                value={formulario.identificador}
                required
                maxLength={40}
                autoComplete="off"
                autoCapitalize="none"
                spellCheck={false}
                disabled={emEdicao !== null}
                aria-invalid={problemaIdentificador !== null}
                aria-describedby="dica-identificador"
                onChange={(evento) =>
                  setFormulario((atual) => ({ ...atual, identificador: evento.target.value }))
                }
                placeholder="ex.: 3a-maria"
                className="h-11 rounded-lg"
              />
              <p id="dica-identificador" className="text-muted-foreground text-xs">
                {emEdicao
                  ? "O identificador não muda depois de criado."
                  : (problemaIdentificador ??
                    "Letras minúsculas, números, ponto ou hífen. É o que o diretor digita para entrar.")}
              </p>
            </div>
            <fieldset className="flex flex-col gap-2">
              <legend className="text-sm font-medium">Turmas acompanhadas</legend>
              <p className="text-muted-foreground text-xs">
                Os alunos entram pela turma de origem, como na Grade e na planilha.
              </p>
              {turmasOrdenadas.length === 0 ? (
                <p className="text-muted-foreground text-sm">Cadastre as turmas antes.</p>
              ) : (
                <div className="grid max-h-56 grid-cols-2 gap-1 overflow-y-auto rounded-lg border p-2">
                  {turmasOrdenadas.map((turma) => (
                    <label
                      key={turma.id}
                      className="hover:bg-secondary/60 flex min-h-11 items-center gap-2 rounded-md px-2 text-sm"
                    >
                      <input
                        type="checkbox"
                        checked={formulario.turmaIds.includes(turma.id)}
                        onChange={(evento) => alternarTurma(turma.id, evento.target.checked)}
                        className="size-4 accent-[var(--primary)]"
                      />
                      {turma.rotulo}
                    </label>
                  ))}
                </div>
              )}
            </fieldset>
            <div className="flex flex-col gap-2">
              <Label htmlFor="inicio-diretor">Acompanha desde</Label>
              <SeletorPeriodo
                id="inicio-diretor"
                modo="dia"
                valor={formulario.inicio || diaCorrente}
                max={diaCorrente}
                rotuloAcessivel="Data de início do acompanhamento"
                rotulo={rotuloData(formulario.inicio || diaCorrente)}
                detalhe={rotuloDiaSemana(formulario.inicio || diaCorrente)}
                onValor={(inicio) => setFormulario((atual) => ({ ...atual, inicio }))}
              />
              <p id="dica-inicio-diretor" className="text-muted-foreground text-xs">
                {emEdicao
                  ? "Só antecipa o início das turmas já acompanhadas; turmas novas começam nesta data."
                  : "O diretor vê a turma a partir desta data. Use uma data passada para incluir o histórico de quando já exercia a função."}
              </p>
            </div>
            {erro && <AvisoCompacto variante={erroVariante} descricao={erro} tamanho="linha" />}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setDialogoAberto(false)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={enviando || problemaIdentificador !== null}>
                {enviando && <LoaderCircle size={16} className="animate-spin" />}
                {emEdicao ? "Salvar" : "Cadastrar"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={emitirAlvo !== null}
        onOpenChange={(aberto) => {
          if (!aberto) setEmitirAlvo(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Gerar nova palavra-chave para {emitirAlvo?.nome}?</AlertDialogTitle>
            <AlertDialogDescription>
              A palavra atual deixa de valer na hora e as sessões abertas caem. A nova aparece uma
              única vez.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={() => emitirAlvo && emitir(emitirAlvo)}>
              Gerar nova
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog
        open={palavraEmitida !== null}
        onOpenChange={(aberto) => {
          if (!aberto) setPalavraEmitida(null);
        }}
      >
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Palavra-chave de {palavraEmitida?.diretor.nome}</DialogTitle>
            <DialogDescription>
              Ela aparece só agora. Entregue ao diretor em mãos ou por mensagem direta; no primeiro
              acesso ele troca por uma palavra própria.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-3">
            <div className="bg-secondary/60 flex flex-col gap-1 rounded-lg border px-4 py-3">
              <span className="text-muted-foreground text-xs">Identificador</span>
              <span className="numerais-tabulares font-medium">
                {palavraEmitida?.diretor.identificador}
              </span>
              <span className="text-muted-foreground mt-2 text-xs">Palavra-chave</span>
              <span
                className="numerais-tabulares text-lg font-semibold tracking-wide select-all"
                data-palavra-chave
              >
                {palavraEmitida?.palavraChave}
              </span>
              <span className="text-muted-foreground mt-2 text-xs">
                Válida até {dataCurta(palavraEmitida?.diretor.expiraEm ?? null)}, ou até a troca.
              </span>
            </div>
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => palavraEmitida && void copiarPalavra(palavraEmitida.palavraChave)}
            >
              <Copy size={16} />
              Copiar
            </Button>
            <Button type="button" onClick={() => setPalavraEmitida(null)}>
              Já entreguei
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={revogarAlvo !== null}
        onOpenChange={(aberto) => {
          if (!aberto) setRevogarAlvo(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Revogar a palavra-chave de {revogarAlvo?.nome}?</AlertDialogTitle>
            <AlertDialogDescription>
              O acesso cai na hora, em todos os aparelhos. Use em saída da função, suspeita de
              vazamento ou desligamento. O motivo fica registrado.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="flex flex-col gap-2">
            <Label htmlFor="motivo-revogacao">Motivo</Label>
            <Input
              id="motivo-revogacao"
              value={motivo}
              maxLength={200}
              autoComplete="off"
              onChange={(evento) => setMotivo(evento.target.value)}
              placeholder="ex.: deixou a direção da turma"
              className="h-11 rounded-lg"
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-falta text-falta-foreground hover:bg-falta/90"
              disabled={motivo.trim().length < 3 || chaveAtiva === `revogar-${revogarAlvo?.id}`}
              onClick={(evento) => {
                // Mantém o diálogo aberto até a resposta, para mostrar erro se houver.
                evento.preventDefault();
                if (revogarAlvo) revogar(revogarAlvo);
              }}
            >
              Revogar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
