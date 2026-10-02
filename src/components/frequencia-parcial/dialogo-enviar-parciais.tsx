"use client";

// Conferência do período e das novas linhas antes do envio à terceira planilha.
import { Fragment, useState } from "react";
import { LoaderCircle } from "lucide-react";
import type { Turma } from "@/domain/frequencia";
import type { planejarParciais } from "@/domain/planilha-parcial";
import { CABECALHO_PARCIAL } from "@/domain/planilha-parcial";
import { pedir, corpoJson } from "@/lib/api-cliente";
import { avisarSucesso, mensagemAmigavel } from "@/lib/avisos";
import { useAcaoUnica } from "@/lib/use-acao-unica";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Selecionar } from "@/components/ui/selecionar";
import { SeletorPeriodo } from "@/components/ui/seletor-periodo";
import { Switch } from "@/components/ui/switch";
import { AvisoCompacto } from "@/components/ui/tela-estado";

type Previa = ReturnType<typeof planejarParciais> & { novas: number; atualizacoes: number };

function valorDaLinha(
  linha: { celulas: { coluna: number; valor: string }[]; anteriores: string[] },
  coluna: number,
): string {
  return (
    linha.celulas.find((celula) => celula.coluna === coluna)?.valor ??
    linha.anteriores[coluna - 1] ??
    ""
  );
}

function valorParaConferencia(valor: string): string {
  return valor || "Vazio";
}

interface Props {
  aberto: boolean;
  turmas: Turma[];
  diaCorrente: string;
  diaInicial: string;
  turmaInicial: string;
  planilhaNome: string | null;
  onFechar: () => void;
}

export function DialogoEnviarParciais({
  aberto,
  turmas,
  diaCorrente,
  diaInicial,
  turmaInicial,
  planilhaNome,
  onFechar,
}: Props) {
  const [de, setDe] = useState(`${diaInicial.slice(0, 7)}-01`);
  const [ate, setAte] = useState(diaInicial);
  const [turmaId, setTurmaId] = useState(turmaInicial);
  const [previa, setPrevia] = useState<Previa | null>(null);
  const [erro, setErro] = useState("");
  const [resultadoIncerto, setResultadoIncerto] = useState(false);
  const [atualizarExistentes, setAtualizarExistentes] = useState(false);
  const filtro = { de, ate, atualizarExistentes, ...(turmaId ? { turmaId } : {}) };

  function invalidarPrevia() {
    setPrevia(null);
    setErro("");
  }

  const { executando: conferindo, executar: conferir } = useAcaoUnica(async () => {
    setErro("");
    setPrevia(null);
    try {
      const dados = await pedir<Previa>("/api/planilha-parcial/simular", corpoJson(filtro));
      setPrevia(dados);
      setResultadoIncerto(false);
    } catch (excecao) {
      setErro(mensagemAmigavel(excecao, "Não foi possível conferir a planilha."));
    }
  });

  const { executando: enviando, executar: enviar } = useAcaoUnica(async () => {
    if (!previa || previa.bloqueado || previa.novas + previa.atualizacoes === 0 || resultadoIncerto)
      return;
    setErro("");
    try {
      const dados = await pedir<{ linhasCriadas: number; linhasAtualizadas: number }>(
        "/api/planilha-parcial/enviar",
        corpoJson({ ...filtro, planoHash: previa.planoHash }),
      );
      avisarSucesso(
        "Chamada parcial enviada.",
        `${dados.linhasCriadas} novos registros e ${dados.linhasAtualizadas} atualizados.`,
      );
      onFechar();
    } catch (excecao) {
      setErro(
        mensagemAmigavel(
          excecao,
          "Não foi possível confirmar o envio. Confira a planilha antes de outra tentativa.",
        ),
      );
      // A próxima ação exige uma leitura nova, pois a escrita pode ter sido aplicada.
      setPrevia(null);
      setResultadoIncerto(true);
    }
  });
  const ocupado = conferindo || enviando;

  return (
    <Dialog open={aberto} onOpenChange={(valor) => !valor && !ocupado && onFechar()}>
      <DialogContent folha showCloseButton={!ocupado}>
        <DialogHeader>
          <DialogTitle>Enviar chamada parcial</DialogTitle>
          <DialogDescription>
            {planilhaNome ?? "Planilha Google"} · aba Chamada Parcial
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <Label>De</Label>
            <SeletorPeriodo
              id="parcial-envio-de"
              modo="dia"
              valor={de}
              max={diaCorrente}
              rotulo={de.split("-").reverse().join("/")}
              rotuloAcessivel="Início do envio parcial"
              disabled={ocupado}
              onValor={(valor) => {
                setDe(valor);
                invalidarPrevia();
              }}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Até</Label>
            <SeletorPeriodo
              id="parcial-envio-ate"
              modo="dia"
              valor={ate}
              max={diaCorrente}
              rotulo={ate.split("-").reverse().join("/")}
              rotuloAcessivel="Fim do envio parcial"
              disabled={ocupado}
              onValor={(valor) => {
                setAte(valor);
                invalidarPrevia();
              }}
            />
          </div>
          <div className="flex flex-col gap-1.5 sm:col-span-2">
            <Label htmlFor="parcial-envio-turma">Turma</Label>
            <Selecionar
              id="parcial-envio-turma"
              value={turmaId || "todas"}
              disabled={ocupado}
              onValueChange={(valor) => {
                setTurmaId(valor === "todas" ? "" : valor);
                invalidarPrevia();
              }}
              opcoes={[
                { valor: "todas", rotulo: "Todas as turmas" },
                ...turmas.map((turma) => ({ valor: turma.id, rotulo: turma.rotulo })),
              ]}
            />
          </div>
        </div>
        <div className="flex items-center justify-between gap-3 rounded-lg border p-3">
          <div>
            <Label htmlFor="parcial-envio-atualizar">Atualizar registros já enviados</Label>
            <p className="text-muted-foreground mt-1 text-xs">
              Atualiza as linhas criadas pelo aplicativo e preserva os registros manuais.
            </p>
          </div>
          <Switch
            id="parcial-envio-atualizar"
            checked={atualizarExistentes}
            disabled={ocupado}
            onCheckedChange={(valor) => {
              setAtualizarExistentes(valor);
              invalidarPrevia();
            }}
          />
        </div>
        {de > ate && (
          <p role="alert" className="text-falta-texto text-sm">
            O início deve ser anterior ou igual ao fim do período.
          </p>
        )}
        {erro && (
          <AvisoCompacto
            variante="indisponivel"
            titulo="Envio não confirmado"
            descricao={erro}
            tamanho="linha"
          />
        )}
        {resultadoIncerto && (
          <p className="text-muted-foreground text-sm">
            Confira o resultado na planilha e gere outra prévia.
          </p>
        )}
        {previa && (
          <div className="flex flex-col gap-3 rounded-lg border p-3">
            <p className="text-sm font-medium">
              {previa.novas} novos · {previa.atualizacoes} atualizações · {previa.existentes} já
              enviados
            </p>
            {previa.novas + previa.atualizacoes === 0 && !previa.bloqueado && (
              <p className="text-muted-foreground text-sm">
                Nenhuma alteração para enviar neste período.
              </p>
            )}
            {previa.criar.length + previa.atualizar.length > 0 && (
              <div
                role="region"
                tabIndex={0}
                aria-label="Prévia da chamada parcial"
                className="max-h-56 overflow-auto rounded-lg border"
              >
                <table className="w-full text-sm">
                  <caption className="sr-only">Alterações da chamada parcial</caption>
                  <thead className="bg-secondary">
                    <tr>
                      <th className="px-3 py-2 text-left">Aluno</th>
                      <th className="px-3 py-2 text-left">Data</th>
                      <th className="px-3 py-2 text-left">Presença</th>
                      <th className="px-3 py-2 text-left">Ação</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[
                      ...previa.criar.map((linha) => ({
                        ...linha,
                        acao: "Novo",
                        anteriores: [] as string[],
                      })),
                      ...previa.atualizar.map((linha) => ({ ...linha, acao: "Atualizar" })),
                    ].map((linha) => (
                      <Fragment key={linha.linha}>
                        <tr className="border-t">
                          <td className="px-3 py-2">{linha.nome}</td>
                          <td className="px-3 py-2 whitespace-nowrap">{valorDaLinha(linha, 1)}</td>
                          <td className="px-3 py-2">{valorDaLinha(linha, 4)}</td>
                          <td className="px-3 py-2">{linha.acao}</td>
                        </tr>
                        <tr>
                          <td colSpan={4} className="px-3 pb-3">
                            <table className="w-full table-fixed text-xs">
                              <caption className="sr-only">
                                {linha.acao === "Novo"
                                  ? "Valores do novo registro"
                                  : "Campos alterados"}{" "}
                                de {linha.nome}
                              </caption>
                              <thead className="bg-secondary/50">
                                <tr>
                                  <th className="w-1/3 px-2 py-1.5 text-left">Campo</th>
                                  {linha.acao === "Atualizar" && (
                                    <th className="w-1/3 px-2 py-1.5 text-left">Anterior</th>
                                  )}
                                  <th className="px-2 py-1.5 text-left">Novo valor</th>
                                </tr>
                              </thead>
                              <tbody>
                                {linha.celulas.map((celula) => (
                                  <tr key={celula.coluna} className="border-t">
                                    <th
                                      scope="row"
                                      className="px-2 py-1.5 text-left font-medium break-words"
                                    >
                                      {CABECALHO_PARCIAL[celula.coluna - 1] ??
                                        `Coluna ${celula.coluna}`}
                                    </th>
                                    {linha.acao === "Atualizar" && (
                                      <td className="px-2 py-1.5 break-words">
                                        {valorParaConferencia(
                                          linha.anteriores[celula.coluna - 1] ?? "",
                                        )}
                                      </td>
                                    )}
                                    <td className="px-2 py-1.5 break-words">
                                      {valorParaConferencia(celula.valor)}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </td>
                        </tr>
                      </Fragment>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {previa.novas + previa.atualizacoes > previa.criar.length + previa.atualizar.length && (
              <p className="text-muted-foreground text-xs">
                Exibindo até 20 registros de cada ação.
              </p>
            )}
            {previa.avisos.map((aviso) => (
              <p key={aviso} className="text-muted-foreground text-sm">
                {aviso}
              </p>
            ))}
            {previa.bloqueado && (
              <p role="alert" className="text-falta-texto text-sm">
                Envio bloqueado. Confira as pendências na planilha.
              </p>
            )}
          </div>
        )}
        <p className="text-muted-foreground text-xs">
          O envio à planilha mantém a confirmação na Seduc como uma marcação manual.
        </p>
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={onFechar}
            disabled={ocupado}
            className="h-11"
          >
            Cancelar
          </Button>
          {previa ? (
            <Button
              type="button"
              onClick={() => void enviar()}
              disabled={
                ocupado ||
                previa.bloqueado ||
                previa.novas + previa.atualizacoes === 0 ||
                resultadoIncerto
              }
              className="h-11"
            >
              {enviando && <LoaderCircle size={16} className="animate-spin" />}Confirmar envio
            </Button>
          ) : (
            <Button
              type="button"
              onClick={() => void conferir()}
              disabled={ocupado || de > ate}
              className="h-11"
            >
              {conferindo && <LoaderCircle size={16} className="animate-spin" />}Conferir envio
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
