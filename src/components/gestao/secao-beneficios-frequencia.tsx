"use client";

// Benefícios e frequência mínima: a administração cria, edita, desativa e remove as regras que alimentam o alerta da Chamada.
import { useEffect, useState } from "react";
import { LoaderCircle, Pencil, Percent, Plus, Power, Trash2 } from "lucide-react";
import {
  PERCENTUAL_MINIMO_MAIOR,
  PERCENTUAL_MINIMO_MENOR,
  AULAS_POR_DIA_MAXIMO,
  type RegraFrequenciaBeneficio,
} from "@/domain/beneficios-frequencia";
import { corpoAlteracao, corpoJson, ErroApi, pedir } from "@/lib/api-cliente";
import { avisarErro, avisarSucesso } from "@/lib/avisos";
import { avisarBeneficiosMudaram } from "@/lib/eventos-beneficios";
import { useAcaoUnica, useAcoesPorChave } from "@/lib/use-acao-unica";
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
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SecaoRecolhivel } from "@/components/ui/secao-recolhivel";
import { Selo } from "@/components/ui/selo";
import { Switch } from "@/components/ui/switch";
import { AvisoCompacto } from "@/components/ui/tela-estado";

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

export default function SecaoBeneficiosFrequencia() {
  const [aberto, setAberto] = useState(false);
  const [beneficios, setBeneficios] = useState<RegraFrequenciaBeneficio[] | null>(null);
  const [erroLeitura, setErroLeitura] = useState("");
  const [formulario, setFormulario] = useState<Formulario | null>(null);
  const [erroFormulario, setErroFormulario] = useState("");
  const [paraExcluir, setParaExcluir] = useState<RegraFrequenciaBeneficio | null>(null);
  const { chaveAtiva, executar: executarLinha } = useAcoesPorChave();

  const { executar: carregar, executando: carregando } = useAcaoUnica(async () => {
    setErroLeitura("");
    try {
      setBeneficios(
        (await pedir<{ beneficios: RegraFrequenciaBeneficio[] }>("/api/beneficios-frequencia"))
          .beneficios,
      );
    } catch (excecao) {
      setErroLeitura("Não foi possível carregar os benefícios. Tente novamente.");
      avisarErro(excecao, { contexto: "Não foi possível carregar os benefícios." });
    }
  });
  useEffect(() => {
    if (aberto && beneficios === null) void carregar();
  }, [aberto, beneficios, carregar]);

  const { executar: salvar, executando: salvando } = useAcaoUnica(async () => {
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
    const corpo = {
      nome: formulario.nome.trim(),
      percentualMinimoFrequencia: percentual,
      aulasPorDia,
      faltasJustificadasContam: formulario.justificadasContam,
      ativo: formulario.ativo,
    };
    try {
      if (formulario.id) {
        await pedir(`/api/beneficios-frequencia/${formulario.id}`, corpoAlteracao("PATCH", corpo));
      } else {
        await pedir("/api/beneficios-frequencia", corpoJson(corpo));
      }
      avisarSucesso(formulario.id ? "Benefício atualizado." : "Benefício criado.");
      avisarBeneficiosMudaram();
      setFormulario(null);
      await carregar();
    } catch (excecao) {
      setErroFormulario(
        excecao instanceof ErroApi ? excecao.message : "Não foi possível salvar o benefício.",
      );
      avisarErro(excecao, { contexto: "Não foi possível salvar o benefício." });
    }
  });

  function alternarSituacao(beneficio: RegraFrequenciaBeneficio) {
    void executarLinha(`situacao-${beneficio.id}`, async () => {
      try {
        await pedir(
          `/api/beneficios-frequencia/${beneficio.id}`,
          corpoAlteracao("PATCH", { ativo: !beneficio.ativo }),
        );
        avisarSucesso(beneficio.ativo ? "Benefício desativado." : "Benefício ativado.");
        avisarBeneficiosMudaram();
        await carregar();
      } catch (excecao) {
        avisarErro(excecao, { contexto: "Não foi possível alterar a situação do benefício." });
      }
    });
  }

  function confirmarExclusao() {
    const alvo = paraExcluir;
    if (!alvo) return;
    setParaExcluir(null);
    void executarLinha(`excluir-${alvo.id}`, async () => {
      try {
        await pedir(`/api/beneficios-frequencia/${alvo.id}`, corpoAlteracao("DELETE"));
        avisarSucesso("Benefício excluído.");
        avisarBeneficiosMudaram();
        await carregar();
      } catch (excecao) {
        avisarErro(excecao, { contexto: "Não foi possível excluir o benefício." });
      }
    });
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

  const ativos = beneficios?.filter((beneficio) => beneficio.ativo).length ?? 0;

  return (
    <SecaoRecolhivel
      titulo="Benefícios e frequência mínima"
      descricao="Regras que acendem o alerta de faltas na Chamada."
      icone={Percent}
      aberto={aberto}
      onAbertoChange={setAberto}
      dataSecao="config-beneficios"
      resumo={
        beneficios ? (
          <Selo>
            {ativos} {ativos === 1 ? "ativo" : "ativos"}
          </Selo>
        ) : undefined
      }
    >
      <p className="text-muted-foreground text-sm">
        Cada benefício tem o percentual mínimo de frequência das aulas do mês. Quando as faltas de
        um aluno passam do que esse percentual permite, a Chamada mostra um alerta com o nome do
        benefício.
      </p>
      <div className="flex flex-wrap gap-2">
        <Button type="button" onClick={() => abrirFormulario(null)} disabled={salvando}>
          <Plus size={16} aria-hidden="true" />
          Novo benefício
        </Button>
      </div>
      {erroLeitura && (
        <AvisoCompacto variante="indisponivel" descricao={erroLeitura} tamanho="linha" />
      )}
      {beneficios === null ? (
        carregando && (
          <p role="status" className="text-muted-foreground flex items-center gap-2 text-sm">
            <LoaderCircle
              size={16}
              className="animate-spin motion-reduce:animate-none"
              aria-hidden="true"
            />
            Carregando benefícios...
          </p>
        )
      ) : beneficios.length === 0 ? (
        <p className="text-muted-foreground text-sm">
          Nenhum benefício cadastrado. Sem benefício ativo, a Chamada não mostra alerta de faltas.
        </p>
      ) : (
        <ul aria-label="Benefícios" className="flex flex-col divide-y rounded-2xl border">
          {beneficios.map((beneficio) => (
            <li key={beneficio.id} className="flex flex-col gap-2 px-3 py-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="min-w-0 text-sm font-medium break-words">{beneficio.nome}</span>
                <Selo variante={beneficio.ativo ? "sucesso" : "neutro"}>
                  {beneficio.ativo ? "Ativo" : "Inativo"}
                </Selo>
              </div>
              <p className="text-muted-foreground text-xs">
                Mínimo de {beneficio.percentualMinimoFrequencia}% de frequência. Faltas justificadas{" "}
                {beneficio.faltasJustificadasContam ? "contam" : "não contam"}.
              </p>
              <p className="text-muted-foreground text-xs">
                {beneficio.aulasPorDia === null
                  ? "Projeção pela grade da turma."
                  : `Projeção de ${beneficio.aulasPorDia} aulas por dia.`}
              </p>
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  aria-label={`Editar ${beneficio.nome}`}
                  disabled={chaveAtiva !== null}
                  onClick={() => abrirFormulario(beneficio)}
                >
                  <Pencil size={14} aria-hidden="true" />
                  Editar
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  aria-label={`${beneficio.ativo ? "Desativar" : "Ativar"} ${beneficio.nome}`}
                  disabled={chaveAtiva !== null}
                  onClick={() => alternarSituacao(beneficio)}
                >
                  <Power size={14} aria-hidden="true" />
                  {beneficio.ativo ? "Desativar" : "Ativar"}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  aria-label={`Excluir ${beneficio.nome}`}
                  disabled={chaveAtiva !== null}
                  onClick={() => setParaExcluir(beneficio)}
                >
                  <Trash2 size={14} aria-hidden="true" />
                  Excluir
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <Dialog
        open={formulario !== null}
        onOpenChange={(valor) => {
          if (!valor && !salvando) setFormulario(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{formulario?.id ? "Editar benefício" : "Novo benefício"}</DialogTitle>
            <DialogDescription>
              O alerta usa as aulas do mês e só conta as faltas que a regra manda contar.
            </DialogDescription>
          </DialogHeader>
          {formulario && (
            <form
              className="flex flex-col gap-4"
              aria-busy={salvando}
              noValidate
              onSubmit={(evento) => {
                evento.preventDefault();
                void salvar();
              }}
            >
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="beneficio-nome">Nome do benefício</Label>
                <Input
                  id="beneficio-nome"
                  value={formulario.nome}
                  maxLength={60}
                  disabled={salvando}
                  onChange={(evento) => setFormulario({ ...formulario, nome: evento.target.value })}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="beneficio-percentual">Frequência mínima, em %</Label>
                <Input
                  id="beneficio-percentual"
                  type="number"
                  inputMode="numeric"
                  min={PERCENTUAL_MINIMO_MENOR}
                  max={PERCENTUAL_MINIMO_MAIOR}
                  step={1}
                  value={formulario.percentual}
                  disabled={salvando}
                  onChange={(evento) =>
                    setFormulario({ ...formulario, percentual: evento.target.value })
                  }
                  className="numerais-tabulares"
                />
                <p className="text-muted-foreground text-xs">
                  Percentual das aulas do mês em que o aluno precisa estar presente.
                </p>
              </div>
              <div className="flex items-start justify-between gap-4">
                <div className="flex w-full flex-col gap-1.5">
                  <Label htmlFor="beneficio-aulas-dia">Aulas por dia</Label>
                  <Input
                    id="beneficio-aulas-dia"
                    type="number"
                    inputMode="numeric"
                    min={1}
                    max={AULAS_POR_DIA_MAXIMO}
                    step={1}
                    value={formulario.aulasPorDia}
                    placeholder="Usar grade da turma"
                    disabled={salvando}
                    aria-describedby="beneficio-aulas-dia-ajuda"
                    onChange={(evento) =>
                      setFormulario({ ...formulario, aulasPorDia: evento.target.value })
                    }
                    className="numerais-tabulares"
                  />
                  <p id="beneficio-aulas-dia-ajuda" className="text-muted-foreground text-xs">
                    Vazio usa a grade da turma. Chamadas salvas mantêm as aulas registradas.
                  </p>
                </div>
              </div>
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <Label htmlFor="beneficio-justificadas">Faltas justificadas contam</Label>
                  <p className="text-muted-foreground text-xs leading-relaxed">
                    Desligado, só as faltas sem justificativa entram na conta do limite.
                  </p>
                </div>
                <Switch
                  id="beneficio-justificadas"
                  checked={formulario.justificadasContam}
                  disabled={salvando}
                  onCheckedChange={(valor) =>
                    setFormulario({ ...formulario, justificadasContam: valor })
                  }
                />
              </div>
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <Label htmlFor="beneficio-ativo">Benefício ativo</Label>
                  <p className="text-muted-foreground text-xs leading-relaxed">
                    Inativo, o benefício deixa de gerar alerta na Chamada.
                  </p>
                </div>
                <Switch
                  id="beneficio-ativo"
                  checked={formulario.ativo}
                  disabled={salvando}
                  onCheckedChange={(valor) => setFormulario({ ...formulario, ativo: valor })}
                />
              </div>
              {erroFormulario && (
                <AvisoCompacto
                  variante="dados_invalidos"
                  descricao={erroFormulario}
                  tamanho="linha"
                />
              )}
              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  disabled={salvando}
                  onClick={() => setFormulario(null)}
                >
                  Cancelar
                </Button>
                <Button type="submit" disabled={salvando}>
                  {salvando && (
                    <LoaderCircle
                      size={16}
                      aria-hidden="true"
                      className="animate-spin motion-reduce:animate-none"
                    />
                  )}
                  Salvar
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={paraExcluir !== null}
        onOpenChange={(valor) => {
          if (!valor) setParaExcluir(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir benefício?</AlertDialogTitle>
            <AlertDialogDescription>
              {paraExcluir ? `${paraExcluir.nome}. ` : ""}A Chamada deixa de mostrar alertas desse
              benefício. As frequências salvas não mudam. Para manter a regra e só pausar o alerta,
              desative em vez de excluir.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={confirmarExclusao}>
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </SecaoRecolhivel>
  );
}
