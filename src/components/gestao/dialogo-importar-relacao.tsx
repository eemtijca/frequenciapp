"use client";

// Importação das relações de turma: cola o texto ou escolhe os arquivos,
// confere a prévia do que muda e só então aplica.
import { useMemo, useRef, useState } from "react";
import { FileUp, LoaderCircle } from "lucide-react";
import { avisarErro, avisarSucesso } from "@/lib/avisos";
import { useAcaoUnica } from "@/lib/use-acao-unica";
import { pedir, corpoJson, ErroApi } from "@/lib/api-cliente";
import type { Turma } from "@/domain/frequencia";
import type { ItemDoPlano, PlanoDeImportacao } from "@/domain/importacao-alunos";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { AvisoCompacto } from "@/components/ui/tela-estado";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface Props {
  aberto: boolean;
  onAbrir: (aberto: boolean) => void;
  turmas: Turma[];
  onImportado: () => Promise<void>;
}

interface Resposta {
  plano: PlanoDeImportacao;
  aplicado: { criados: number; atualizados: number; desativados: number } | null;
}

function plural(valor: number, singular: string, varios: string): string {
  return `${valor} ${valor === 1 ? singular : varios}`;
}

export default function DialogoImportarRelacao({ aberto, onAbrir, turmas, onImportado }: Props) {
  const [texto, setTexto] = useState("");
  const [plano, setPlano] = useState<PlanoDeImportacao | null>(null);
  const [conferido, setConferido] = useState("");
  const [erro, setErro] = useState("");
  const arquivos = useRef<HTMLInputElement>(null);

  const rotulo = useMemo(() => {
    const mapa = new Map(turmas.map((turma) => [turma.id, turma.rotulo]));
    return (id: string) => mapa.get(id) ?? "";
  }, [turmas]);

  function trocarTexto(valor: string) {
    setTexto(valor);
    setPlano(null);
    setErro("");
  }

  async function lerArquivos(lista: FileList | null) {
    if (!lista || lista.length === 0) return;
    const conteudos = await Promise.all([...lista].map((arquivo) => arquivo.text()));
    trocarTexto(
      [texto.trim(), ...conteudos.map((conteudo) => conteudo.trim())].filter(Boolean).join("\n\n"),
    );
    if (arquivos.current) arquivos.current.value = "";
  }

  const { executando: conferindo, executar: conferir } = useAcaoUnica(async () => {
    setErro("");
    try {
      const resposta = await pedir<Resposta>("/api/alunos/importacao", corpoJson({ texto }));
      setPlano(resposta.plano);
      setConferido(texto);
    } catch (excecao) {
      setErro(
        excecao instanceof ErroApi ? excecao.message : "Não foi possível conferir a relação.",
      );
    }
  });

  const { executando: aplicando, executar: aplicar } = useAcaoUnica(async () => {
    try {
      const resposta = await pedir<Resposta>(
        "/api/alunos/importacao",
        corpoJson({ texto: conferido, aplicar: true }),
      );
      const feito = resposta.aplicado;
      avisarSucesso(
        "Relação importada.",
        feito
          ? `${plural(feito.criados, "novo", "novos")}, ${plural(feito.atualizados, "atualizado", "atualizados")} e ${plural(feito.desativados, "desativado", "desativados")}. A Chamada já segue a relação.`
          : undefined,
      );
      onAbrir(false);
      setTexto("");
      setPlano(null);
      await onImportado();
    } catch (excecao) {
      avisarErro(excecao, { contexto: "Não foi possível importar a relação." });
    }
  });

  const grupos = useMemo(() => {
    const itens = plano?.itens ?? [];
    const com = (mudanca: ItemDoPlano["mudancas"][number]) =>
      itens.filter((item) => item.mudancas.includes(mudanca));
    return [
      { titulo: "Novos no cadastro", itens: itens.filter((item) => item.alunoId === null) },
      { titulo: "Mudam de turma atual", itens: com("turma") },
      { titulo: "Mudam de turma original", itens: com("origem") },
      { titulo: "Voltam a ficar ativos", itens: com("reativar") },
      {
        titulo: "Sem mudança além da ordem",
        itens: itens.filter(
          (item) => item.alunoId !== null && item.mudancas.every((mudanca) => mudanca === "ordem"),
        ),
      },
    ];
  }, [plano]);

  const podeAplicar =
    plano !== null && plano.bloqueios.length === 0 && conferido === texto && !conferindo;

  return (
    <Dialog open={aberto} onOpenChange={onAbrir}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Importar relação das turmas</DialogTitle>
          <DialogDescription>
            Cada relação começa pela linha RELAÇÃO ATUAL com a turma, e cada aluno traz a turma
            original. A Chamada passa a seguir a relação na ordem dela, e o histórico de cada aluno
            é mantido.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between gap-2">
            <Label htmlFor="texto-relacao">Relações</Label>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-9 rounded-lg"
              onClick={() => arquivos.current?.click()}
            >
              <FileUp size={16} />
              Escolher arquivos
            </Button>
            <input
              ref={arquivos}
              type="file"
              accept=".txt,text/plain"
              multiple
              hidden
              onChange={(evento) => void lerArquivos(evento.target.files)}
            />
          </div>
          <textarea
            id="texto-relacao"
            value={texto}
            onChange={(evento) => trocarTexto(evento.target.value)}
            rows={8}
            spellCheck={false}
            className="border-input bg-background focus-visible:ring-ring/50 focus-visible:border-ring min-h-40 w-full rounded-lg border px-3 py-2 font-mono text-xs outline-none focus-visible:ring-[3px]"
            placeholder="Cole aqui as relações de uma ou mais turmas."
          />
        </div>

        {erro && <AvisoCompacto variante="dados_invalidos" descricao={erro} tamanho="linha" />}

        {plano && (
          <div className="flex flex-col gap-3" aria-live="polite">
            {plano.bloqueios.length > 0 && (
              <AvisoCompacto
                variante="dados_invalidos"
                titulo="Corrija antes de aplicar"
                descricao={plano.bloqueios.join(" ")}
                tamanho="linha"
              />
            )}
            {plano.avisos.length > 0 && (
              <AvisoCompacto
                variante="conflito"
                titulo="Confira"
                descricao={plano.avisos.join(" ")}
                tamanho="linha"
              />
            )}
            <ul className="grid gap-2 sm:grid-cols-3" aria-label="Alunos por turma">
              {plano.turmas.map((turma) => (
                <li key={turma.turmaId} className="bg-card rounded-lg border px-3 py-2">
                  <p className="text-sm font-medium">{turma.rotulo}</p>
                  <p className="text-muted-foreground numerais-tabulares text-xs">
                    {plural(turma.alunos, "aluno", "alunos")}
                  </p>
                </li>
              ))}
            </ul>
            <div className="divide-y rounded-lg border">
              {grupos.map((grupo) => (
                <details key={grupo.titulo} className="group px-3 py-2">
                  <summary className="flex cursor-pointer items-center justify-between gap-2 text-sm">
                    {grupo.titulo}
                    <span className="numerais-tabulares text-muted-foreground">
                      {grupo.itens.length}
                    </span>
                  </summary>
                  <ul className="text-muted-foreground mt-2 space-y-1 text-xs">
                    {grupo.itens.map((item) => (
                      <li key={`${item.alunoId ?? item.nome}-${item.turmaId}`}>
                        {item.nome}: {rotulo(item.turmaId)}, origem {rotulo(item.turmaOriginalId)}
                      </li>
                    ))}
                  </ul>
                </details>
              ))}
              <details className="px-3 py-2">
                <summary className="flex cursor-pointer items-center justify-between gap-2 text-sm">
                  Desativados por não estarem na relação
                  <span className="numerais-tabulares text-muted-foreground">
                    {plano.desativar.length}
                  </span>
                </summary>
                <ul className="text-muted-foreground mt-2 space-y-1 text-xs">
                  {plano.desativar.map((aluno) => (
                    <li key={aluno.alunoId}>
                      {aluno.nome}: {rotulo(aluno.turmaId)}
                    </li>
                  ))}
                </ul>
              </details>
            </div>
          </div>
        )}

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onAbrir(false)}>
            Cancelar
          </Button>
          <Button
            type="button"
            variant={podeAplicar ? "outline" : "default"}
            disabled={texto.trim() === "" || conferindo || aplicando}
            onClick={() => void conferir()}
          >
            {conferindo && <LoaderCircle size={16} className="animate-spin" />}
            Conferir
          </Button>
          <Button type="button" disabled={!podeAplicar || aplicando} onClick={() => void aplicar()}>
            {aplicando && <LoaderCircle size={16} className="animate-spin" />}
            Aplicar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
