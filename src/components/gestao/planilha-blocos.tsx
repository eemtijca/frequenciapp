"use client";

// Blocos compartilhados dos cards de Google Planilhas: conexão em etapa
// recolhível, modo completo com prazo e zona de risco com cópias.
import { useState } from "react";
import { LoaderCircle, Lock, TriangleAlert } from "lucide-react";
import { toast } from "sonner";
import { corpoJson, ErroApi, pedir } from "@/lib/api-cliente";
import { avisarSucesso } from "@/lib/avisos";
import { useAcoesPorChave } from "@/lib/use-acao-unica";
import { DURACOES_MODO_COMPLETO, FRASE_MODO_COMPLETO } from "@/domain/planilha";
import { Selo } from "@/components/ui/selo";
import { SecaoRecolhivel } from "@/components/ui/secao-recolhivel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CampoSenha } from "@/components/ui/campo-senha";
import { LimparCopiasPlanilha } from "./dialogo-limpar-copias";
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
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

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
  const [aberto, setAberto] = useState(false);
  const [destrave, setDestrave] = useState(false);
  const [frase, setFrase] = useState("");
  const [duracao, setDuracao] = useState(15);
  const [destravando, setDestravando] = useState(false);
  const [senha, setSenha] = useState("");
  const { executar: executarPorChave } = useAcoesPorChave();

  const restanteMinutos =
    ativo && ate ? Math.max(0, Math.ceil((new Date(ate).getTime() - Date.now()) / 60_000)) : null;
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
        toast.error(excecao instanceof ErroApi ? excecao.message : "Não foi possível destravar.");
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
        toast.error(excecao instanceof ErroApi ? excecao.message : "Não foi possível encerrar.");
      }
    });
  }

  return (
    <>
      <SecaoRecolhivel
        nivel="interna"
        titulo="Modo completo"
        icone={Lock}
        aberto={aberto}
        onAbertoChange={setAberto}
        resumo={
          <Selo variante={ativo ? "atencao" : "neutro"}>
            {ativo ? `Janela aberta até ${hora}` : "Bloqueado"}
          </Selo>
        }
      >
        {ativo && restanteMinutos !== null && (
          <p className="text-muted-foreground text-xs leading-relaxed">
            Expira às {hora}
            {restanteMinutos <= 5 ? ` · restam ${restanteMinutos} min` : ""}.
          </p>
        )}
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            className="h-11"
            onClick={() => setDestrave(true)}
          >
            {ativo ? "Estender" : "Liberar modo completo"}
          </Button>
          {ativo && (
            <Button
              type="button"
              variant="ghost"
              className="h-11"
              onClick={() => void voltarConservador()}
            >
              Voltar ao conservador
            </Button>
          )}
        </div>
      </SecaoRecolhivel>

      <Dialog open={destrave} onOpenChange={setDestrave}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Liberar modo completo</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-3">
            <p className="bg-falta-fraca text-falta-texto rounded-lg px-3 py-2 text-xs leading-relaxed">
              Permite substituir, limpar e remover dados na planilha. Não há cópia automática;
              exporte o arquivo antes de alterações que precisem de recuperação.
            </p>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={`${idPrefixo}-frase-destrave`}>Digite {FRASE_MODO_COMPLETO}</Label>
              <Input
                id={`${idPrefixo}-frase-destrave`}
                value={frase}
                onChange={(evento) => setFrase(evento.target.value)}
                autoComplete="off"
                className="h-11"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <span className="text-sm font-medium">Duração</span>
              <div
                role="radiogroup"
                aria-label="Duração do modo completo"
                className="bg-secondary/60 grid grid-cols-4 gap-1 rounded-lg p-1"
              >
                {DURACOES_MODO_COMPLETO.map((minutos) => (
                  <button
                    key={minutos}
                    type="button"
                    role="radio"
                    aria-checked={duracao === minutos}
                    onClick={() => setDuracao(minutos)}
                    className="aria-[checked=true]:bg-background aria-[checked=true]:text-foreground text-muted-foreground pressionavel min-h-10 rounded-md px-1 text-xs font-medium aria-[checked=true]:shadow-sm"
                  >
                    {minutos} min
                  </button>
                ))}
              </div>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={`${idPrefixo}-senha-destrave`}>Senha do administrador</Label>
              <CampoSenha
                id={`${idPrefixo}-senha-destrave`}
                value={senha}
                onChange={(evento) => setSenha(evento.target.value)}
                className="h-11"
                autoComplete="current-password"
              />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setDestrave(false)}>
              Cancelar
            </Button>
            <Button
              type="button"
              onClick={() => void destravar()}
              disabled={
                destravando || frase.trim().toUpperCase() !== FRASE_MODO_COMPLETO || senha === ""
              }
            >
              {destravando && <LoaderCircle size={16} className="animate-spin" />}
              Liberar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
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
  const [aberto, setAberto] = useState(false);
  const [copias, setCopias] = useState<
    { aba: string; itens: { nome: string; criadaEm: string }[] }[]
  >([]);
  const [restaurar, setRestaurar] = useState<{ aba: string; copia: string } | null>(null);
  const [abaRemover, setAbaRemover] = useState<string | null>(null);
  const [senha, setSenha] = useState("");
  const [frase, setFrase] = useState("");
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
      toast.error(excecao instanceof ErroApi ? excecao.message : "Não foi possível listar cópias.");
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
        toast.error(excecao instanceof ErroApi ? excecao.message : "Não foi possível restaurar.");
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
        toast.success("Aba removida.");
        await onMudou();
      } catch (excecao) {
        toast.error(
          excecao instanceof ErroApi ? excecao.message : "Não foi possível remover a aba.",
        );
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
        toast.error(excecao instanceof ErroApi ? excecao.message : "Não foi possível desconectar.");
      }
    });
  }

  return (
    <>
      <SecaoRecolhivel
        nivel="interna"
        variante="perigo"
        titulo="Zona de risco"
        icone={TriangleAlert}
        aberto={aberto}
        onAbertoChange={setAberto}
        resumo={<Selo variante="perigo">Altera a planilha</Selo>}
      >
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="min-w-0">
              <p className="text-sm font-medium">Cópias antigas</p>
              <p className="text-muted-foreground text-xs leading-relaxed">
                Novas abas de backup não são criadas.
              </p>
            </div>
            <Button
              type="button"
              variant="outline"
              className="h-10"
              onClick={() => void carregarCopias()}
            >
              Listar cópias
            </Button>
          </div>
          <LimparCopiasPlanilha
            urlBase={urlBase}
            onMudou={async () => {
              setCopias([]);
              await onMudou();
            }}
            acoes={acoes}
          />
          {copias.map((item) => (
            <div key={item.aba} className="flex flex-col gap-1 text-xs">
              <span className="font-medium">{item.aba}</span>
              {item.itens.length === 0 ? (
                <span className="text-muted-foreground">Nenhuma cópia.</span>
              ) : (
                item.itens.map((copia) => (
                  <div key={copia.nome} className="flex items-center justify-between gap-2">
                    <span className="text-muted-foreground truncate">
                      {copia.criadaEm || copia.nome}
                    </span>
                    <Button
                      type="button"
                      variant="ghost"
                      className="h-8"
                      onClick={() => setRestaurar({ aba: item.aba, copia: copia.nome })}
                    >
                      Restaurar
                    </Button>
                  </div>
                ))
              )}
            </div>
          ))}
        </div>

        {abasCriadas.length > 0 && (
          <div className="flex flex-col gap-2">
            <p className="text-sm font-medium">Abas criadas pela integração</p>
            {abasCriadas.map((nome) => (
              <div key={nome} className="flex items-center justify-between gap-2 text-xs">
                <span className="text-muted-foreground truncate">{nome}</span>
                <Button
                  type="button"
                  variant="ghost"
                  className="h-8"
                  onClick={() => setAbaRemover(nome)}
                >
                  Remover
                </Button>
              </div>
            ))}
          </div>
        )}

        <div className="flex flex-wrap items-center justify-between gap-2 border-t pt-3">
          <div className="min-w-0">
            <p className="text-sm font-medium">Desconectar integração</p>
          </div>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button
                type="button"
                variant="outline"
                className="border-falta/40 text-falta-texto h-10"
                disabled={chaveAtiva === "desconectar"}
              >
                {chaveAtiva === "desconectar" ? "Desconectando..." : "Desconectar"}
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Desconectar a planilha?</AlertDialogTitle>
                <AlertDialogDescription>
                  O token e a estrutura salva são apagados. Nada é removido da planilha.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancelar</AlertDialogCancel>
                <AlertDialogAction
                  className="bg-falta text-falta-foreground hover:bg-falta/90"
                  onClick={() => void desconectar()}
                >
                  Desconectar
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </SecaoRecolhivel>

      <Dialog open={restaurar !== null} onOpenChange={(aberto) => !aberto && setRestaurar(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Restaurar cópia</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-3">
            <p className="bg-falta-fraca text-falta-texto rounded-lg px-3 py-2 text-xs leading-relaxed">
              A aba {restaurar?.aba} será trocada pela cópia {restaurar?.copia}, sem guardar a
              versão atual. Depois, confira a estrutura de novo.
            </p>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={`${idPrefixo}-frase-restaurar`}>Digite {FRASE_MODO_COMPLETO}</Label>
              <Input
                id={`${idPrefixo}-frase-restaurar`}
                value={frase}
                onChange={(evento) => setFrase(evento.target.value)}
                autoComplete="off"
                className="h-11"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={`${idPrefixo}-senha-restaurar`}>Senha do administrador</Label>
              <CampoSenha
                id={`${idPrefixo}-senha-restaurar`}
                value={senha}
                onChange={(evento) => setSenha(evento.target.value)}
                className="h-11"
                autoComplete="current-password"
              />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setRestaurar(null)}>
              Cancelar
            </Button>
            <Button
              type="button"
              onClick={() => void confirmarRestaurar()}
              disabled={
                frase.trim().toUpperCase() !== FRASE_MODO_COMPLETO ||
                senha === "" ||
                chaveAtiva === "restaurar"
              }
            >
              {chaveAtiva === "restaurar" ? "Restaurando..." : "Restaurar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={abaRemover !== null} onOpenChange={(aberto) => !aberto && setAbaRemover(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Remover aba</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-3">
            <p className="bg-falta-fraca text-falta-texto rounded-lg px-3 py-2 text-xs leading-relaxed">
              A aba {abaRemover} foi criada pela integração e será removida definitivamente, sem
              cópia automática.
            </p>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={`${idPrefixo}-frase-remover-aba`}>Digite {FRASE_MODO_COMPLETO}</Label>
              <Input
                id={`${idPrefixo}-frase-remover-aba`}
                value={frase}
                onChange={(evento) => setFrase(evento.target.value)}
                autoComplete="off"
                className="h-11"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={`${idPrefixo}-senha-remover-aba`}>Senha do administrador</Label>
              <CampoSenha
                id={`${idPrefixo}-senha-remover-aba`}
                value={senha}
                onChange={(evento) => setSenha(evento.target.value)}
                className="h-11"
                autoComplete="current-password"
              />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setAbaRemover(null)}>
              Cancelar
            </Button>
            <Button
              type="button"
              onClick={() => void confirmarRemocaoAba()}
              disabled={
                frase.trim().toUpperCase() !== FRASE_MODO_COMPLETO ||
                senha === "" ||
                chaveAtiva === `remover-aba-${abaRemover}`
              }
            >
              {chaveAtiva === `remover-aba-${abaRemover}` ? "Removendo..." : "Remover aba"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
