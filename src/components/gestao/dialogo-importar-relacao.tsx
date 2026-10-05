"use client";

// Importação da relação de alunos em CSV: escolhe ou cola o arquivo, confere
// o schema na hora, vê a prévia do que muda no cadastro e só então aplica.
import { useMemo, useRef, useState } from "react";
import { CircleCheck, FileUp, LoaderCircle, TriangleAlert } from "lucide-react";
import { avisarErro, avisarSucesso } from "@/lib/avisos";
import { useAcaoUnica } from "@/lib/use-acao-unica";
import { pedir, corpoJson, ErroApi } from "@/lib/api-cliente";
import type { Turma } from "@/domain/frequencia";
import {
  AJUDA_COLUNAS_RELACAO,
  CABECALHO_RELACAO,
  COLUNAS_RELACAO,
  lerRelacaoCsv,
  type ItemDoPlano,
  type PlanoDeImportacao,
} from "@/domain/importacao-alunos";
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

const ERROS_VISIVEIS = 8;

function plural(valor: number, singular: string, varios: string): string {
  return `${valor} ${valor === 1 ? singular : varios}`;
}

/** Lista de problemas em destaque, com as primeiras linhas e o total restante. */
function ListaDeProblemas({ titulo, itens }: { titulo: string; itens: string[] }) {
  const visiveis = itens.slice(0, ERROS_VISIVEIS);
  return (
    <div
      role="alert"
      className="border-falta/40 bg-falta-fraca text-falta-texto flex gap-2.5 rounded-lg border px-3 py-2 text-sm"
    >
      <TriangleAlert size={16} className="mt-0.5 shrink-0" aria-hidden="true" />
      <div className="min-w-0">
        <p className="font-medium">{titulo}</p>
        <ul className="mt-1 list-disc space-y-0.5 pl-4 text-xs">
          {visiveis.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
        {itens.length > visiveis.length && (
          <p className="mt-1 text-xs">
            E mais {plural(itens.length - visiveis.length, "problema", "problemas")}.
          </p>
        )}
      </div>
    </div>
  );
}

export default function DialogoImportarRelacao({ aberto, onAbrir, turmas, onImportado }: Props) {
  const [texto, setTexto] = useState("");
  const [arquivo, setArquivo] = useState("");
  const [erroArquivo, setErroArquivo] = useState("");
  const [plano, setPlano] = useState<PlanoDeImportacao | null>(null);
  const [conferido, setConferido] = useState("");
  const [erro, setErro] = useState("");
  const seletor = useRef<HTMLInputElement>(null);

  const rotulo = useMemo(() => {
    const mapa = new Map(turmas.map((turma) => [turma.id, turma.rotulo]));
    return (id: string) => mapa.get(id) ?? "";
  }, [turmas]);

  // O schema é conferido na hora, antes de ir ao servidor.
  const leitura = useMemo(() => (texto.trim() ? lerRelacaoCsv(texto) : null), [texto]);
  const alunosLidos = leitura?.relacoes.reduce((soma, item) => soma + item.alunos.length, 0) ?? 0;
  const foraDoPadrao = Boolean(erroArquivo) || (leitura !== null && leitura.erros.length > 0);

  function trocarTexto(valor: string) {
    setTexto(valor);
    setPlano(null);
    setErro("");
  }

  async function lerArquivo(lista: FileList | null) {
    const escolhido = lista?.[0];
    if (seletor.current) seletor.current.value = "";
    if (!escolhido) return;
    setArquivo(escolhido.name);
    if (!/\.csv$/i.test(escolhido.name)) {
      setErroArquivo(`${escolhido.name} não é um arquivo CSV. Salve a relação como .csv.`);
      trocarTexto("");
      return;
    }
    setErroArquivo("");
    trocarTexto(await escolhido.text());
  }

  const { executando: conferindo, executar: conferir } = useAcaoUnica(async () => {
    setErro("");
    try {
      const resposta = await pedir<Resposta>("/api/alunos/importacao", corpoJson({ csv: texto }));
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
        corpoJson({ csv: conferido, aplicar: true }),
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
      setArquivo("");
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
          <DialogTitle>Importar relação em CSV</DialogTitle>
          <DialogDescription>
            Uma linha por aluno, com o cabeçalho abaixo. A Chamada passa a seguir a relação na ordem
            do arquivo, e o histórico de cada aluno é mantido. Use Exportar relação para baixar um
            arquivo já no padrão.
          </DialogDescription>
        </DialogHeader>

        <div className="bg-secondary/50 flex flex-col gap-2 rounded-lg px-3 py-2 text-xs">
          <code className="font-mono text-[13px] break-all">{CABECALHO_RELACAO}</code>
          <details>
            <summary className="text-muted-foreground cursor-pointer">
              Como montar o arquivo
            </summary>
            <ul className="text-muted-foreground mt-1.5 space-y-1">
              {COLUNAS_RELACAO.map((coluna) => (
                <li key={coluna}>
                  <span className="text-foreground font-mono">{coluna}</span>:{" "}
                  {AJUDA_COLUNAS_RELACAO[coluna]}.
                </li>
              ))}
              <li>
                Separador ponto e vírgula, codificação UTF-8. Alunos ativos das turmas do arquivo
                que não estiverem nele são desativados, sem perder o histórico.
              </li>
            </ul>
          </details>
        </div>

        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <Label htmlFor="texto-relacao" className="whitespace-nowrap">
              Conteúdo do CSV
            </Label>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-9"
              onClick={() => seletor.current?.click()}
            >
              <FileUp size={16} />
              Escolher .csv
            </Button>
            <input
              ref={seletor}
              type="file"
              accept=".csv,text/csv"
              hidden
              onChange={(evento) => void lerArquivo(evento.target.files)}
            />
          </div>
          <textarea
            id="texto-relacao"
            value={texto}
            onChange={(evento) => {
              setErroArquivo("");
              setArquivo("");
              trocarTexto(evento.target.value);
            }}
            rows={7}
            spellCheck={false}
            aria-invalid={foraDoPadrao || undefined}
            aria-describedby="situacao-relacao"
            className="controle-vidro focus-visible:ring-ring/50 focus-visible:border-ring aria-[invalid=true]:border-falta min-h-36 w-full px-3 py-2 font-mono text-xs outline-none focus-visible:ring-[3px]"
            placeholder={`${CABECALHO_RELACAO}\n3º ano A;1;Nome do aluno;3º ano B`}
          />
          <div id="situacao-relacao">
            {erroArquivo ? (
              <ListaDeProblemas titulo="Arquivo fora do padrão" itens={[erroArquivo]} />
            ) : leitura && leitura.erros.length > 0 ? (
              <ListaDeProblemas
                titulo={`${arquivo || "O CSV"} está fora do padrão`}
                itens={leitura.erros}
              />
            ) : leitura ? (
              <p className="text-primary flex items-center gap-1.5 text-xs font-medium">
                <CircleCheck size={14} aria-hidden="true" />
                {arquivo ? `${arquivo}: ` : ""}
                {plural(alunosLidos, "aluno", "alunos")} em{" "}
                {plural(leitura.relacoes.length, "turma", "turmas")}, no padrão. Toque em Conferir.
              </p>
            ) : null}
          </div>
        </div>

        {erro && <AvisoCompacto variante="dados_invalidos" descricao={erro} tamanho="linha" />}

        {plano && (
          <div className="flex flex-col gap-3" aria-live="polite">
            {plano.bloqueios.length > 0 && (
              <ListaDeProblemas titulo="Corrija antes de aplicar" itens={plano.bloqueios} />
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
                <li key={turma.turmaId} className="superficie-vidro px-3 py-2">
                  <p className="text-sm font-medium">{turma.rotulo}</p>
                  <p className="text-muted-foreground numerais-tabulares text-xs">
                    {plural(turma.alunos, "aluno", "alunos")}
                  </p>
                </li>
              ))}
            </ul>
            <div className="superficie-vidro divide-y overflow-hidden">
              {grupos.map((grupo) => (
                <details key={grupo.titulo} className="px-3 py-2">
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
            disabled={!leitura || foraDoPadrao || conferindo || aplicando}
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
