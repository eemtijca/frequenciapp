"use client";

// Blocos compartilhados dos cards de Google Planilhas: conexão em etapa
// recolhível, modo completo com prazo e zona de risco com cópias.
import { useState } from "react";
import { ClipboardCopy, LoaderCircle, Lock, TriangleAlert } from "lucide-react";
import { toast } from "sonner";
import { corpoAlteracao, corpoJson, ErroApi, pedir } from "@/lib/api-cliente";
import { avisarErro, avisarSucesso } from "@/lib/avisos";
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

interface IntegracaoConexao {
  token: string | null;
  temToken: boolean;
  versaoScript: string | null;
  endpoint: string | null;
}

interface ResultadoPing {
  nome: string;
  abas: number;
  avisos: string[];
}

function ResultadoTeste({ teste }: { teste: ResultadoPing }) {
  return (
    <div className="flex flex-col gap-1">
      <p className="text-muted-foreground text-xs">
        Conectado a {teste.nome} · {teste.abas} {teste.abas === 1 ? "aba" : "abas"}
      </p>
      {teste.avisos.map((aviso) => (
        <p key={aviso} className="text-falta-texto text-xs">
          {aviso}
        </p>
      ))}
    </div>
  );
}

/** Token do aplicativo e endereço do Web App, com teste de conexão. */
export function BlocoConexaoPlanilha({
  idPrefixo,
  urlBase,
  endpoint,
  integracao,
  onEndpoint,
  onAtualizar,
}: {
  idPrefixo: string;
  urlBase: string;
  endpoint: string;
  integracao: IntegracaoConexao | null;
  onEndpoint: (valor: string) => void;
  onAtualizar: () => Promise<void> | void;
}) {
  const [salvando, setSalvando] = useState(false);
  const [testando, setTestando] = useState(false);
  const [teste, setTeste] = useState<ResultadoPing | null>(null);
  const [editando, setEditando] = useState(false);
  const [senhaAberta, setSenhaAberta] = useState<null | "gerar" | "revelar">(null);
  const [senha, setSenha] = useState("");
  const [tokenVisivel, setTokenVisivel] = useState<string | null>(null);
  const [enviandoSenha, setEnviandoSenha] = useState(false);
  const { chaveAtiva, executar: executarPorChave } = useAcoesPorChave();

  const conectada = Boolean(integracao?.temToken && integracao.endpoint);
  const resumida = conectada && !editando;

  async function salvarEndpoint() {
    await executarPorChave("salvar-endpoint", async () => {
      setSalvando(true);
      try {
        await pedir(urlBase, corpoAlteracao("PATCH", { endpoint }));
        toast.success("Endereço salvo.");
        await onAtualizar();
      } catch (excecao) {
        toast.error(excecao instanceof ErroApi ? excecao.message : "Endereço inválido.");
      } finally {
        setSalvando(false);
      }
    });
  }

  async function testar() {
    const aviso = "planilha-testar";
    await executarPorChave(aviso, async () => {
      setTestando(true);
      setTeste(null);
      toast.loading("Testando a conexão com a planilha...", { id: aviso });
      try {
        const dados = await pedir<{
          ping: { planilha: { nome: string }; abas: unknown[]; avisos?: string[] };
        }>(`${urlBase}/testar`, corpoJson({ endpoint }));
        setTeste({
          nome: dados.ping.planilha.nome,
          abas: dados.ping.abas.length,
          avisos: dados.ping.avisos ?? [],
        });
        setEditando(false);
        avisarSucesso("Conexão confirmada.", undefined, aviso);
        await onAtualizar();
      } catch (excecao) {
        avisarErro(excecao, {
          contexto: "Não foi possível conectar.",
          descricao: "Confira o endereço e a internet, e tente de novo em instantes.",
          id: aviso,
        });
      } finally {
        setTestando(false);
      }
    });
  }

  async function enviarSenha() {
    if (!senhaAberta) return;
    await executarPorChave("enviar-senha", async () => {
      setEnviandoSenha(true);
      try {
        const dados = await pedir<{ token: string }>(
          `${urlBase}/token`,
          corpoJson({ acao: senhaAberta, senha }),
        );
        setTokenVisivel(dados.token);
        setSenha("");
        setSenhaAberta(null);
        if (senhaAberta === "gerar") {
          avisarSucesso(
            "Token gerado. Atualize o Script Property.",
            "Copie o código e cole nas configurações do Apps Script da planilha.",
          );
        } else {
          avisarSucesso(
            "Token revelado.",
            "Copie e cole no Apps Script da planilha para a integração funcionar.",
          );
        }
        await onAtualizar();
      } catch (excecao) {
        toast.error(excecao instanceof ErroApi ? excecao.message : "Senha incorreta.");
      } finally {
        setEnviandoSenha(false);
      }
    });
  }

  async function copiarToken() {
    if (!tokenVisivel) return;
    await executarPorChave("copiar-token", async () => {
      try {
        await navigator.clipboard.writeText(tokenVisivel);
        avisarSucesso("Token copiado.", "Cole nas configurações do Apps Script da planilha.");
      } catch {
        avisarErro(null, {
          contexto: "Não foi possível copiar o token.",
          descricao: "Selecione o código e copie manualmente.",
          tentarDeNovo: () => void copiarToken(),
        });
      }
    });
  }

  if (resumida) {
    return (
      <div className="flex flex-col gap-2">
        <div className="bg-secondary/40 flex flex-wrap items-center justify-between gap-2 rounded-lg px-3 py-2">
          <span className="min-w-0 text-xs">
            <span className="block truncate">
              {integracao?.versaoScript
                ? `Conectada · script na versão ${integracao.versaoScript}`
                : "Conexão salva"}
            </span>
            <span className="text-muted-foreground block truncate">{endpoint}</span>
          </span>
          <span className="flex shrink-0 flex-wrap gap-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-9"
              onClick={() => void testar()}
              disabled={testando}
            >
              {testando && <LoaderCircle size={14} className="animate-spin" />}
              Testar conexão
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-9"
              onClick={() => setEditando(true)}
            >
              Editar conexão
            </Button>
          </span>
        </div>
        {teste && <ResultadoTeste teste={teste} />}
      </div>
    );
  }

  return (
    <>
      <div className="flex flex-col gap-3 rounded-lg border p-3">
        <p className="text-xs font-medium">Token do aplicativo</p>
        <div className="flex flex-wrap items-center gap-2">
          <Input
            readOnly
            value={tokenVisivel ?? integracao?.token ?? "Nenhum token gerado"}
            className="h-11 min-w-0 flex-1"
          />
          {tokenVisivel && (
            <Button
              type="button"
              variant="outline"
              className="h-11"
              onClick={() => void copiarToken()}
            >
              <ClipboardCopy size={16} />
              Copiar
            </Button>
          )}
          <Button
            type="button"
            variant="outline"
            className="h-11"
            onClick={() => setSenhaAberta("revelar")}
          >
            Revelar
          </Button>
          <Button
            type="button"
            variant="outline"
            className="h-11"
            onClick={() => setSenhaAberta("gerar")}
          >
            Gerar novo
          </Button>
        </div>
        <details className="text-muted-foreground text-xs">
          <summary className="cursor-pointer">Ajuda para conectar</summary>
          <p className="mt-2 leading-relaxed">
            No Apps Script, salve o token nas Propriedades do script como FREQUENCIAPP_TOKEN. Use
            gas/Codigo.gs do repositório e informe a URL /exec da implantação.
          </p>
        </details>
      </div>

      <div className="flex flex-col gap-3 rounded-lg border p-3">
        <p className="text-xs font-medium">Endereço do aplicativo da Web</p>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
          <div className="flex min-w-0 flex-1 flex-col gap-1.5">
            <Label htmlFor={`${idPrefixo}-endpoint`}>URL /exec</Label>
            <Input
              id={`${idPrefixo}-endpoint`}
              value={endpoint}
              onChange={(evento) => onEndpoint(evento.target.value)}
              placeholder="https://script.google.com/macros/s/.../exec"
              className="h-11"
            />
          </div>
          <Button
            type="button"
            variant="outline"
            className="h-11"
            onClick={() => void salvarEndpoint()}
            disabled={salvando}
          >
            {chaveAtiva === "salvar-endpoint" ? "Salvando..." : "Salvar"}
          </Button>
          <Button
            type="button"
            className="h-11"
            onClick={() => void testar()}
            disabled={testando || !endpoint}
          >
            {testando && <LoaderCircle size={16} className="animate-spin" />}
            Testar conexão
          </Button>
        </div>
        {teste && <ResultadoTeste teste={teste} />}
      </div>

      {conectada && (
        <Button
          type="button"
          variant="ghost"
          className="h-10 self-start"
          onClick={() => setEditando(false)}
        >
          Fechar edição
        </Button>
      )}

      <Dialog
        open={senhaAberta !== null}
        onOpenChange={(aberto) => !aberto && setSenhaAberta(null)}
      >
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>
              {senhaAberta === "gerar" ? "Gerar novo token" : "Revelar o token"}
            </DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-3">
            {senhaAberta === "gerar" && (
              <p className="bg-falta-fraca text-falta-texto rounded-lg px-3 py-2 text-xs">
                O token atual deixa de funcionar. Atualize o Script Property no Apps Script logo
                depois.
              </p>
            )}
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={`${idPrefixo}-senha`}>Senha do administrador</Label>
              <CampoSenha
                id={`${idPrefixo}-senha`}
                value={senha}
                onChange={(evento) => setSenha(evento.target.value)}
                className="h-11"
                autoComplete="current-password"
              />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setSenhaAberta(null)}>
              Cancelar
            </Button>
            <Button
              type="button"
              onClick={() => void enviarSenha()}
              disabled={enviandoSenha || senha === ""}
            >
              {enviandoSenha && <LoaderCircle size={16} className="animate-spin" />}
              Confirmar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

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
