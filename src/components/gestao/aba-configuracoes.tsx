"use client";

// Configurações de recursos, catálogo de justificativas e cópia de segurança
// em JSON. Restrita à administração, com auditoria no servidor.
import { useRef, useState } from "react";
import { Check, Download, LoaderCircle, Pencil, Plus, Trash2, Upload, X } from "lucide-react";
import { toast } from "sonner";
import { avisarErro, avisarSucesso } from "@/lib/avisos";
import { estadoDeErro } from "@/lib/estado-http";
import { useAcoesPorChave } from "@/lib/use-acao-unica";
import { AvisoCompacto, type VarianteEstado } from "@/components/ui/tela-estado";
import type { Configuracoes, JustificativaConfigurada } from "@/domain/frequencia";
import { corpoAlteracao, corpoJson, ErroApi, pedir } from "@/lib/api-cliente";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import IntegracaoPlanilha from "@/components/gestao/integracao-planilha";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

interface Props {
  configuracoes: Configuracoes;
  justificativas: JustificativaConfigurada[];
  turmas: { id: string; rotulo: string }[];
  diaCorrente: string;
  onMudanca: (configuracoes: Configuracoes) => void;
  onJustificativasMudaram: () => Promise<void>;
}

interface ResultadoImportacao {
  adicionadas: number;
  identicas: number;
  conflitos: number;
}

const LIMITE_ARQUIVO = 25 * 1024 * 1024;

export default function AbaConfiguracoes({
  configuracoes,
  justificativas,
  turmas,
  diaCorrente,
  onMudanca,
  onJustificativasMudaram,
}: Props) {
  const [salvando, setSalvando] = useState<"frequenciaPorAula" | "saidaAntecipada" | null>(null);
  const [erro, setErro] = useState("");
  const [erroVariante, setErroVariante] = useState<VarianteEstado>("dados_invalidos");
  const [baixando, setBaixando] = useState(false);
  const [importando, setImportando] = useState(false);
  const [resultado, setResultado] = useState<ResultadoImportacao | null>(null);
  const arquivoRef = useRef<HTMLInputElement | null>(null);

  const [novaCodigo, setNovaCodigo] = useState("");
  const [novaRotulo, setNovaRotulo] = useState("");
  const [editando, setEditando] = useState<string | null>(null);
  const [rotuloEdicao, setRotuloEdicao] = useState("");
  const [erroJustificativa, setErroJustificativa] = useState("");
  const [erroJustificativaVariante, setErroJustificativaVariante] =
    useState<VarianteEstado>("dados_invalidos");
  const [enviandoJustificativa, setEnviandoJustificativa] = useState(false);
  const [excluirAlvo, setExcluirAlvo] = useState<JustificativaConfigurada | null>(null);
  const { executar: executarPorChave } = useAcoesPorChave();

  async function alternar(chave: "frequenciaPorAula" | "saidaAntecipada", valor: boolean) {
    await executarPorChave(`recurso-${chave}`, async () => {
      setSalvando(chave);
      setErro("");
      try {
        const dados = await pedir<{ configuracoes: Configuracoes }>(
          "/api/configuracoes",
          corpoAlteracao("PATCH", { [chave]: valor }),
        );
        onMudanca(dados.configuracoes);
        toast.success(
          chave === "frequenciaPorAula"
            ? valor
              ? "Chamada por aula ativada."
              : "Chamada por aula desativada."
            : valor
              ? "Saída antecipada ativada."
              : "Saída antecipada desativada.",
        );
      } catch (excecao) {
        setErro(
          excecao instanceof ErroApi ? excecao.message : "Não foi possível salvar a configuração.",
        );
        setErroVariante(estadoDeErro(excecao));
        avisarErro(excecao, { contexto: "Não foi possível salvar a configuração." });
      } finally {
        setSalvando(null);
      }
    });
  }

  async function criarJustificativa() {
    await executarPorChave("justificativa-nova", async () => {
      if (enviandoJustificativa) return;
      setEnviandoJustificativa(true);
      setErroJustificativa("");
      try {
        await pedir<{ justificativa: JustificativaConfigurada }>(
          "/api/justificativas",
          corpoJson({ codigo: novaCodigo, rotulo: novaRotulo }),
        );
        setNovaCodigo("");
        setNovaRotulo("");
        await onJustificativasMudaram();
        avisarSucesso(
          "Justificativa adicionada.",
          "Ela já aparece no seletor da Chamada e das Saídas.",
        );
      } catch (excecao) {
        setErroJustificativa(
          excecao instanceof ErroApi
            ? excecao.message
            : "Não foi possível adicionar a justificativa.",
        );
        setErroJustificativaVariante(estadoDeErro(excecao));
        avisarErro(excecao, { contexto: "Não foi possível adicionar a justificativa." });
      } finally {
        setEnviandoJustificativa(false);
      }
    });
  }

  async function salvarRotulo(codigo: string) {
    await executarPorChave(`justificativa-rotulo-${codigo}`, async () => {
      if (enviandoJustificativa) return;
      setEnviandoJustificativa(true);
      setErroJustificativa("");
      try {
        await pedir<{ justificativa: JustificativaConfigurada }>(
          `/api/justificativas/${encodeURIComponent(codigo)}`,
          corpoAlteracao("PATCH", { rotulo: rotuloEdicao }),
        );
        setEditando(null);
        setRotuloEdicao("");
        await onJustificativasMudaram();
        avisarSucesso("Justificativa atualizada.", "O seletor da Chamada já mostra o rótulo novo.");
      } catch (excecao) {
        setErroJustificativa(
          excecao instanceof ErroApi
            ? excecao.message
            : "Não foi possível atualizar a justificativa.",
        );
        setErroJustificativaVariante(estadoDeErro(excecao));
        avisarErro(excecao, { contexto: "Não foi possível atualizar a justificativa." });
      } finally {
        setEnviandoJustificativa(false);
      }
    });
  }

  async function alternarAtivo(item: JustificativaConfigurada) {
    await executarPorChave(`justificativa-${item.codigo}`, async () => {
      setErroJustificativa("");
      try {
        await pedir<{ justificativa: JustificativaConfigurada }>(
          `/api/justificativas/${encodeURIComponent(item.codigo)}`,
          corpoAlteracao("PATCH", { ativo: !item.ativo }),
        );
        await onJustificativasMudaram();
        avisarSucesso(
          item.ativo ? "Justificativa desativada." : "Justificativa reativada.",
          item.ativo
            ? "O histórico que usa o código continua intacto."
            : "Ela volta a aparecer no seletor da Chamada.",
        );
      } catch (excecao) {
        setErroJustificativa(
          excecao instanceof ErroApi ? excecao.message : "Não foi possível alterar a situação.",
        );
        setErroJustificativaVariante(estadoDeErro(excecao));
        avisarErro(excecao, { contexto: "Não foi possível alterar a situação." });
      }
    });
  }

  async function removerJustificativa(item: JustificativaConfigurada) {
    await executarPorChave(`justificativa-excluir-${item.codigo}`, async () => {
      setErroJustificativa("");
      try {
        await pedir<{ ok: boolean }>(`/api/justificativas/${encodeURIComponent(item.codigo)}`, {
          method: "DELETE",
        });
        await onJustificativasMudaram();
        toast.success("Justificativa excluída.");
      } catch (excecao) {
        setErroJustificativa(
          excecao instanceof ErroApi
            ? excecao.message
            : "Não foi possível excluir a justificativa.",
        );
        setErroJustificativaVariante(estadoDeErro(excecao));
        avisarErro(excecao, { contexto: "Não foi possível excluir a justificativa." });
      } finally {
        setExcluirAlvo(null);
      }
    });
  }

  async function baixarCopia() {
    const aviso = "backup-baixar";
    await executarPorChave(aviso, async () => {
      setBaixando(true);
      setErro("");
      toast.loading("Baixando a cópia de segurança...", { id: aviso });
      try {
        const dados = await pedir<unknown>("/api/backup");
        const conteudo = JSON.stringify(dados, null, 2);
        const blob = new Blob([conteudo], { type: "application/json;charset=utf-8" });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = `frequenciapp-copia-${diaCorrente}.json`;
        document.body.append(link);
        link.click();
        link.remove();
        setTimeout(() => URL.revokeObjectURL(url), 60000);
        avisarSucesso(
          "Cópia preparada. Confira o download no navegador.",
          "Guarde o arquivo em lugar seguro: é com ele que os dados voltam, se precisar.",
          aviso,
        );
      } catch (excecao) {
        setErro(excecao instanceof ErroApi ? excecao.message : "Não foi possível gerar a cópia.");
        setErroVariante(estadoDeErro(excecao));
        avisarErro(excecao, { contexto: "Não foi possível gerar a cópia.", id: aviso });
      } finally {
        setBaixando(false);
      }
    });
  }

  async function importar(arquivo: File) {
    const aviso = "backup-importar";
    await executarPorChave(aviso, async () => {
      setImportando(true);
      setErro("");
      setResultado(null);
      toast.loading("Importando a cópia de segurança...", { id: aviso });
      try {
        if (arquivo.size > LIMITE_ARQUIVO) {
          throw new Error("A cópia é muito grande. Use um arquivo de até 25 MB.");
        }
        let corpo: unknown;
        try {
          corpo = JSON.parse(await arquivo.text());
        } catch {
          throw new Error("Não foi possível ler a cópia. Selecione o arquivo JSON correto.");
        }
        const dados = await pedir<ResultadoImportacao>("/api/backup", corpoJson(corpo));
        setResultado(dados);
        avisarSucesso(
          "Importação concluída.",
          "Confira o resumo na tela antes de continuar.",
          aviso,
        );
      } catch (excecao) {
        const mensagem = excecao instanceof ErroApi ? excecao.message : (excecao as Error).message;
        setErro(mensagem);
        setErroVariante("dados_invalidos");
        toast.error(mensagem, {
          id: aviso,
          description: "Confira o arquivo e tente de novo.",
          duration: 8000,
        });
      } finally {
        setImportando(false);
        if (arquivoRef.current) arquivoRef.current.value = "";
      }
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="bg-card flex flex-col gap-4 rounded-lg border p-4">
        <div>
          <h2 className="font-medium">Recursos</h2>
          <p className="text-muted-foreground text-sm">
            O que estiver desligado continua preservado nos dados e pode ser religado depois.
          </p>
        </div>

        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <Label htmlFor="config-frequencia-aula">Chamada por aula</Label>
            <p className="text-muted-foreground text-xs leading-relaxed">
              Com o recurso ligado, a Chamada registra falta por aula, a Grade mostra a marca S e a
              gestão de aulas volta a valer. Desligado, a chamada é única por dia.
            </p>
          </div>
          <Switch
            id="config-frequencia-aula"
            checked={configuracoes.frequenciaPorAula}
            disabled={salvando !== null}
            onCheckedChange={(valor) => void alternar("frequenciaPorAula", valor)}
          />
        </div>

        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <Label htmlFor="config-saida-antecipada">Saída antecipada</Label>
            <p className="text-muted-foreground text-xs leading-relaxed">
              Mostra a área Saídas, com registro, saídas do dia e relatório semanal. Desligado, os
              registros existentes continuam preservados nos relatórios.
            </p>
          </div>
          <Switch
            id="config-saida-antecipada"
            checked={configuracoes.saidaAntecipada}
            disabled={salvando !== null}
            onCheckedChange={(valor) => void alternar("saidaAntecipada", valor)}
          />
        </div>

        {erro && <AvisoCompacto variante={erroVariante} descricao={erro} tamanho="linha" />}
      </div>

      <IntegracaoPlanilha turmas={turmas} diaCorrente={diaCorrente} />

      <div className="bg-card flex flex-col gap-4 rounded-lg border p-4">
        <div>
          <h2 className="font-medium">Justificativas</h2>
          <p className="text-muted-foreground text-sm">
            Valem para a falta justificada e para a saída antecipada. O código é fixo depois de
            criado, porque o histórico guarda o código; o rótulo e a situação podem mudar. A lista
            aparece em ordem alfabética.
          </p>
        </div>

        <div className="flex flex-col gap-3 rounded-lg border p-3 sm:flex-row sm:items-end">
          <div className="flex flex-col gap-1.5 sm:w-32">
            <Label htmlFor="justificativa-codigo">Código</Label>
            <Input
              id="justificativa-codigo"
              value={novaCodigo}
              maxLength={10}
              disabled={enviandoJustificativa}
              onChange={(evento) => setNovaCodigo(evento.target.value)}
              placeholder="Ex.: At"
              className="h-11"
            />
          </div>
          <div className="flex min-w-0 flex-1 flex-col gap-1.5">
            <Label htmlFor="justificativa-rotulo">Rótulo</Label>
            <Input
              id="justificativa-rotulo"
              value={novaRotulo}
              maxLength={60}
              disabled={enviandoJustificativa}
              onChange={(evento) => setNovaRotulo(evento.target.value)}
              placeholder="Ex.: Atestado"
              className="h-11"
            />
          </div>
          <Button
            type="button"
            className="h-11 rounded-lg sm:w-auto"
            onClick={() => void criarJustificativa()}
            disabled={enviandoJustificativa || novaCodigo.trim() === "" || novaRotulo.trim() === ""}
          >
            {enviandoJustificativa ? (
              <LoaderCircle size={16} className="animate-spin" />
            ) : (
              <Plus size={16} />
            )}
            Adicionar
          </Button>
        </div>

        {erroJustificativa && (
          <AvisoCompacto
            variante={erroJustificativaVariante}
            descricao={erroJustificativa}
            tamanho="linha"
          />
        )}

        <ul className="divide-y overflow-hidden rounded-lg border">
          {justificativas.map((item) => (
            <li
              key={item.codigo}
              className={`flex min-h-14 items-center gap-3 px-3 py-2 last:overflow-hidden last:rounded-b-[calc(var(--radius)-1px)] ${
                item.ativo ? "" : "opacity-60"
              }`}
            >
              <span className="bg-secondary text-secondary-foreground numerais-tabulares w-12 shrink-0 rounded-md px-1.5 py-1 text-center text-xs font-semibold">
                {item.codigo}
              </span>
              {editando === item.codigo ? (
                <>
                  <Input
                    value={rotuloEdicao}
                    maxLength={60}
                    aria-label={`Rótulo de ${item.codigo}`}
                    onChange={(evento) => setRotuloEdicao(evento.target.value)}
                    className="h-10 min-w-0 flex-1"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="size-10 shrink-0"
                    aria-label={`Salvar rótulo de ${item.codigo}`}
                    onClick={() => void salvarRotulo(item.codigo)}
                    disabled={enviandoJustificativa || rotuloEdicao.trim().length < 2}
                  >
                    <Check size={16} />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="size-10 shrink-0"
                    aria-label={`Cancelar edição de ${item.codigo}`}
                    onClick={() => {
                      setEditando(null);
                      setRotuloEdicao("");
                    }}
                  >
                    <X size={16} />
                  </Button>
                </>
              ) : (
                <>
                  <span className="min-w-0 flex-1 truncate text-sm">
                    {item.rotulo}
                    {item.ativo ? "" : " · desativada"}
                  </span>
                  <Switch
                    checked={item.ativo}
                    aria-label={`${item.ativo ? "Desativar" : "Reativar"} ${item.codigo}`}
                    onCheckedChange={() => void alternarAtivo(item)}
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="size-10 shrink-0"
                    aria-label={`Editar rótulo de ${item.codigo}`}
                    onClick={() => {
                      setEditando(item.codigo);
                      setRotuloEdicao(item.rotulo);
                    }}
                  >
                    <Pencil size={16} />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="text-falta-texto size-10 shrink-0"
                    aria-label={`Excluir ${item.codigo}`}
                    onClick={() => setExcluirAlvo(item)}
                  >
                    <Trash2 size={16} />
                  </Button>
                </>
              )}
            </li>
          ))}
        </ul>

        <AlertDialog
          open={excluirAlvo !== null}
          onOpenChange={(aberto) => {
            if (!aberto) setExcluirAlvo(null);
          }}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Excluir a justificativa {excluirAlvo?.codigo}?</AlertDialogTitle>
              <AlertDialogDescription>
                A exclusão só é possível quando não há faltas nem saídas usando o código. Com
                histórico, o caminho é desativar.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancelar</AlertDialogCancel>
              <AlertDialogAction
                className="bg-falta text-falta-foreground hover:bg-falta/90"
                onClick={() => excluirAlvo && void removerJustificativa(excluirAlvo)}
              >
                Excluir
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>

      <div className="bg-card flex flex-col gap-3 rounded-lg border p-4">
        <div>
          <h2 className="font-medium">Cópia de segurança</h2>
          <p className="text-muted-foreground text-sm">
            A cópia reúne séries, turmas, aulas, alunos, chamadas, saídas, justificativas e
            configurações em um arquivo JSON. A importação adiciona o que falta e nunca sobrescreve
            o que já existe.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            className="h-11 rounded-lg"
            onClick={() => void baixarCopia()}
            disabled={baixando || importando}
          >
            {baixando ? (
              <LoaderCircle size={16} className="animate-spin" />
            ) : (
              <Download size={16} />
            )}
            Baixar cópia
          </Button>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button
                type="button"
                variant="outline"
                className="h-11 rounded-lg"
                disabled={importando}
              >
                {importando ? (
                  <LoaderCircle size={16} className="animate-spin" />
                ) : (
                  <Upload size={16} />
                )}
                Importar cópia
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Importar cópia?</AlertDialogTitle>
                <AlertDialogDescription>
                  O arquivo é mesclado ao banco: registros que já existem são mantidos e apenas os
                  que faltam são adicionados. Confira o resultado depois da importação.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancelar</AlertDialogCancel>
                <AlertDialogAction onClick={() => arquivoRef.current?.click()}>
                  Escolher arquivo
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
          <input
            ref={arquivoRef}
            type="file"
            accept=".json,application/json"
            hidden
            onChange={(evento) => {
              const arquivo = evento.target.files?.[0];
              if (arquivo) void importar(arquivo);
            }}
          />
        </div>
        {resultado && (
          <p role="status" className="bg-secondary/60 rounded-lg px-4 py-3 text-sm">
            {resultado.adicionadas}{" "}
            {resultado.adicionadas === 1 ? "registro adicionado" : "registros adicionados"},{" "}
            {resultado.identicas} {resultado.identicas === 1 ? "já era igual" : "já eram iguais"} e{" "}
            {resultado.conflitos}{" "}
            {resultado.conflitos === 1 ? "conflito mantido" : "conflitos mantidos"}.
          </p>
        )}
      </div>
    </div>
  );
}
