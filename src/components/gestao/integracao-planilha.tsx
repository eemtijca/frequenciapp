"use client";

// Card da integração com Google Planilhas: conexão, estrutura, envio,
// modo completo com prazo e cópias de segurança. Restrito à administração.
import { useCallback, useEffect, useState } from "react";
import { Check, ClipboardCopy, FileSpreadsheet, LoaderCircle, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { corpoAlteracao, corpoJson, ErroApi, pedir } from "@/lib/api-cliente";
import { DURACOES_MODO_COMPLETO, FRASE_MODO_COMPLETO, type AbaEsquema } from "@/domain/planilha";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Selecionar } from "@/components/ui/selecionar";
import { CampoSenha } from "@/components/ui/campo-senha";
import {
  Dialog,
  DialogContent,
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
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

interface Sugestao {
  aba: string;
  turmaOriginalId: string | null;
  confianca: "alta" | "media" | "baixa";
}

interface IntegracaoAdmin {
  ativa: boolean;
  endpoint: string | null;
  token: string | null;
  temToken: boolean;
  versaoScript: string | null;
  esquema: {
    planilha: { nome: string; url: string; fuso: string; versao: number };
    mapa: MapaAba[];
    abas: AbaEsquema[];
  } | null;
  esquemaEm: string | null;
  modo: "conservador" | "completo";
  modoCompletoAte: string | null;
  sincronizacoes: {
    id: string;
    de: string;
    ate: string;
    modalidade: string;
    preenchidas: number;
    resultado: string;
    criadoEm: string;
  }[];
}

interface MapaAba {
  aba: string;
  turmaOriginalId: string;
}

export default function IntegracaoPlanilha({
  turmas,
}: {
  turmas: { id: string; rotulo: string }[];
}) {
  const [integracao, setIntegracao] = useState<IntegracaoAdmin | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [endpoint, setEndpoint] = useState("");
  const [testando, setTestando] = useState(false);
  const [teste, setTeste] = useState<{ nome: string; abas: number } | null>(null);
  const [lendo, setLendo] = useState(false);
  const [sugestoes, setSugestoes] = useState<Sugestao[]>([]);
  const [abas, setAbas] = useState<AbaEsquema[]>([]);
  const [planilha, setPlanilha] = useState<{
    nome: string;
    url: string;
    fuso: string;
    versao: number;
  } | null>(null);
  const [mapa, setMapa] = useState<Record<string, string>>({});
  const [senhaAberta, setSenhaAberta] = useState<null | "gerar" | "revelar">(null);
  const [senha, setSenha] = useState("");
  const [tokenVisivel, setTokenVisivel] = useState<string | null>(null);
  const [enviandoSenha, setEnviandoSenha] = useState(false);
  const [destrave, setDestrave] = useState(false);
  const [frase, setFrase] = useState("");
  const [duracao, setDuracao] = useState(15);
  const [destravando, setDestravando] = useState(false);
  const [copias, setCopias] = useState<
    { aba: string; itens: { nome: string; criadaEm: string }[] }[]
  >([]);
  const [restaurar, setRestaurar] = useState<{ aba: string; copia: string } | null>(null);

  const carregar = useCallback(async () => {
    try {
      const dados = await pedir<{ integracao: IntegracaoAdmin }>("/api/planilha");
      setIntegracao(dados.integracao);
      setEndpoint(dados.integracao.endpoint ?? "");
      if (dados.integracao.esquema) {
        setPlanilha({
          nome: dados.integracao.esquema.planilha.nome,
          url: dados.integracao.esquema.planilha.url,
          fuso: dados.integracao.esquema.planilha.fuso,
          versao: dados.integracao.esquema.planilha.versao,
        });
        setAbas(dados.integracao.esquema.abas ?? []);
        setMapa(
          Object.fromEntries(
            (dados.integracao.esquema.mapa ?? []).map((item) => [item.aba, item.turmaOriginalId]),
          ),
        );
      }
      setErro("");
    } catch (excecao) {
      setErro(excecao instanceof ErroApi ? excecao.message : "Não foi possível ler a integração.");
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  const completoAtivo =
    integracao?.modo === "completo" &&
    integracao.modoCompletoAte !== null &&
    new Date(integracao.modoCompletoAte).getTime() > Date.now();

  async function alternarAtiva(valor: boolean) {
    setSalvando(true);
    try {
      const dados = await pedir<{ integracao: IntegracaoAdmin }>(
        "/api/planilha",
        corpoAlteracao("PATCH", { ativa: valor }),
      );
      setIntegracao(dados.integracao);
      toast.success(valor ? "Integração ativada." : "Integração desativada.");
    } catch (excecao) {
      toast.error(excecao instanceof ErroApi ? excecao.message : "Não foi possível salvar.");
    } finally {
      setSalvando(false);
    }
  }

  async function salvarEndpoint() {
    setSalvando(true);
    try {
      const dados = await pedir<{ integracao: IntegracaoAdmin }>(
        "/api/planilha",
        corpoAlteracao("PATCH", { endpoint }),
      );
      setIntegracao(dados.integracao);
      toast.success("Endereço salvo.");
    } catch (excecao) {
      toast.error(excecao instanceof ErroApi ? excecao.message : "Endereço inválido.");
    } finally {
      setSalvando(false);
    }
  }

  async function testar() {
    setTestando(true);
    setTeste(null);
    try {
      const dados = await pedir<{ ping: { planilha: { nome: string }; abas: unknown[] } }>(
        "/api/planilha/testar",
        corpoJson({ endpoint }),
      );
      setTeste({ nome: dados.ping.planilha.nome, abas: dados.ping.abas.length });
      toast.success("Conexão confirmada.");
    } catch (excecao) {
      toast.error(excecao instanceof ErroApi ? excecao.message : "Não foi possível conectar.");
    } finally {
      setTestando(false);
    }
  }

  async function lerEstrutura() {
    setLendo(true);
    try {
      const dados = await pedir<{
        planilha: { nome: string; url: string; fuso: string; versao: number };
        abas: AbaEsquema[];
        sugestoes: Sugestao[];
      }>("/api/planilha/estrutura", corpoJson({}));
      setAbas(dados.abas);
      setSugestoes(dados.sugestoes);
      setPlanilha(dados.planilha);
      setMapa((atual) => {
        const proximo = { ...atual };
        for (const sugestao of dados.sugestoes) {
          if (!proximo[sugestao.aba] && sugestao.turmaOriginalId) {
            proximo[sugestao.aba] = sugestao.turmaOriginalId;
          }
        }
        return proximo;
      });
      toast.success(`${dados.abas.length} ${dados.abas.length === 1 ? "aba lida" : "abas lidas"}.`);
    } catch (excecao) {
      toast.error(
        excecao instanceof ErroApi ? excecao.message : "Não foi possível ler a planilha.",
      );
    } finally {
      setLendo(false);
    }
  }

  async function salvarMapa() {
    if (!planilha) return;
    const itens: MapaAba[] = Object.entries(mapa)
      .filter(([, turmaId]) => turmaId !== "")
      .map(([aba, turmaOriginalId]) => ({ aba, turmaOriginalId }));
    if (itens.length === 0) {
      toast.error("Escolha ao menos uma aba.");
      return;
    }
    setSalvando(true);
    try {
      const dados = await pedir<{ integracao: IntegracaoAdmin }>(
        "/api/planilha/mapa",
        corpoJson({ planilha, abas, mapa: itens }),
      );
      setIntegracao(dados.integracao);
      toast.success("Estrutura salva.");
    } catch (excecao) {
      toast.error(excecao instanceof ErroApi ? excecao.message : "Não foi possível salvar o mapa.");
    } finally {
      setSalvando(false);
    }
  }

  async function enviarSenha() {
    if (!senhaAberta) return;
    setEnviandoSenha(true);
    try {
      const dados = await pedir<{ token: string }>(
        "/api/planilha/token",
        corpoJson({ acao: senhaAberta, senha }),
      );
      setTokenVisivel(dados.token);
      setSenha("");
      if (senhaAberta === "gerar") toast.success("Token gerado. Atualize o Script Property.");
      await carregar();
    } catch (excecao) {
      toast.error(excecao instanceof ErroApi ? excecao.message : "Senha incorreta.");
    } finally {
      setEnviandoSenha(false);
    }
  }

  async function destravar() {
    setDestravando(true);
    try {
      await pedir(
        "/api/planilha/modo-completo",
        corpoJson({ frase, senha, duracaoMinutos: duracao }),
      );
      setFrase("");
      setSenha("");
      setDestrave(false);
      toast.success("Modo completo ativo.");
      await carregar();
    } catch (excecao) {
      toast.error(excecao instanceof ErroApi ? excecao.message : "Não foi possível destravar.");
    } finally {
      setDestravando(false);
    }
  }

  async function voltarConservador() {
    try {
      await pedir("/api/planilha/modo-conservador", corpoJson({}));
      toast.success("Modo conservador restaurado.");
      await carregar();
    } catch (excecao) {
      toast.error(excecao instanceof ErroApi ? excecao.message : "Não foi possível encerrar.");
    }
  }

  async function carregarCopias() {
    if (!integracao?.esquema) return;
    try {
      const lista: { aba: string; itens: { nome: string; criadaEm: string }[] }[] = [];
      for (const item of integracao.esquema.mapa) {
        const dados = await pedir<{ copias: { nome: string; criadaEm: string }[] }>(
          `/api/planilha/copias?aba=${encodeURIComponent(item.aba)}`,
        );
        lista.push({ aba: item.aba, itens: dados.copias });
      }
      setCopias(lista);
    } catch (excecao) {
      toast.error(excecao instanceof ErroApi ? excecao.message : "Não foi possível listar cópias.");
    }
  }

  async function confirmarRestaurar() {
    if (!restaurar) return;
    try {
      await pedir(
        "/api/planilha/restaurar",
        corpoJson({ aba: restaurar.aba, copia: restaurar.copia, frase, senha }),
      );
      setRestaurar(null);
      setFrase("");
      setSenha("");
      toast.success("Cópia restaurada. Confira a estrutura de novo.");
      await carregar();
    } catch (excecao) {
      toast.error(excecao instanceof ErroApi ? excecao.message : "Não foi possível restaurar.");
    }
  }

  async function desconectar() {
    try {
      await pedir("/api/planilha/desconectar", corpoJson({}));
      setAbas([]);
      setMapa({});
      setPlanilha(null);
      setTokenVisivel(null);
      toast.success("Integração desconectada. A planilha não foi alterada.");
      await carregar();
    } catch (excecao) {
      toast.error(excecao instanceof ErroApi ? excecao.message : "Não foi possível desconectar.");
    }
  }

  if (carregando) {
    return (
      <div className="bg-card flex flex-col gap-4 rounded-lg border p-4">
        <h2 className="font-medium">Google Planilhas</h2>
        <p className="text-muted-foreground text-sm">Conferindo a integração...</p>
      </div>
    );
  }

  return (
    <div className="bg-card flex flex-col gap-4 rounded-lg border p-4">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h2 className="flex items-center gap-2 font-medium">
            <FileSpreadsheet size={16} aria-hidden="true" />
            Google Planilhas
          </h2>
          <p className="text-muted-foreground text-sm">
            A frequência por turma de origem é gravada na planilha. No modo conservador apenas
            células vazias são preenchidas; nada existente é alterado.
          </p>
        </div>
        <Switch
          checked={integracao?.ativa ?? false}
          disabled={salvando || !integracao?.temToken}
          onCheckedChange={(valor) => void alternarAtiva(valor)}
          aria-label="Integração ativa"
        />
      </div>

      {completoAtivo && integracao?.modoCompletoAte && (
        <div className="bg-falta-fraca text-falta-texto flex flex-wrap items-center justify-between gap-2 rounded-lg px-3 py-2 text-xs">
          <span>
            Modo completo ativo até{" "}
            {new Date(integracao.modoCompletoAte).toLocaleTimeString("pt-BR", {
              hour: "2-digit",
              minute: "2-digit",
            })}
          </span>
          <Button
            size="sm"
            variant="ghost"
            className="h-8"
            onClick={() => void voltarConservador()}
          >
            Voltar ao conservador
          </Button>
        </div>
      )}

      <div className="flex flex-col gap-3 rounded-lg border p-3">
        <p className="text-xs font-medium">1. Token do aplicativo</p>
        <div className="flex flex-wrap items-center gap-2">
          <Input
            readOnly
            value={tokenVisivel ?? integracao?.token ?? "Nenhum token gerado"}
            className="h-11 flex-1"
          />
          {tokenVisivel && (
            <Button
              type="button"
              variant="outline"
              className="h-11"
              onClick={() => {
                void navigator.clipboard.writeText(tokenVisivel);
                toast.success("Token copiado.");
              }}
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
        <p className="text-muted-foreground text-xs leading-relaxed">
          Cole o token em Configurações do projeto, Propriedades do script, no Apps Script, com o
          nome FREQUENCIAPP_TOKEN. O código está em gas/Codigo.gs no repositório.
        </p>
      </div>

      <div className="flex flex-col gap-3 rounded-lg border p-3">
        <p className="text-xs font-medium">2. Endereço do aplicativo da Web</p>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
          <div className="flex min-w-0 flex-1 flex-col gap-1.5">
            <Label htmlFor="planilha-endpoint">URL /exec</Label>
            <Input
              id="planilha-endpoint"
              value={endpoint}
              onChange={(evento) => setEndpoint(evento.target.value)}
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
            Salvar
          </Button>
          <Button
            type="button"
            className="h-11"
            onClick={() => void testar()}
            disabled={testando || !endpoint}
          >
            {testando ? <LoaderCircle size={16} className="animate-spin" /> : <Check size={16} />}
            Testar conexão
          </Button>
        </div>
        {teste && (
          <p className="text-muted-foreground text-xs">
            Conectado a {teste.nome} · {teste.abas} {teste.abas === 1 ? "aba" : "abas"}
          </p>
        )}
      </div>

      <div className="flex flex-col gap-3 rounded-lg border p-3">
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs font-medium">3. Estrutura e mapa por turma de origem</p>
          <Button
            type="button"
            variant="outline"
            className="h-10"
            onClick={() => void lerEstrutura()}
            disabled={lendo}
          >
            {lendo ? <LoaderCircle size={16} className="animate-spin" /> : <RotateCcw size={16} />}
            Conferir estrutura
          </Button>
        </div>
        {planilha && (
          <p className="text-muted-foreground text-xs">
            {planilha.nome} · fuso {planilha.fuso} · versão do script {planilha.versao}
          </p>
        )}
        {abas.length > 0 && (
          <div className="flex flex-col gap-2">
            {abas.map((aba) => (
              <div
                key={aba.nome}
                className="flex flex-col gap-1.5 sm:flex-row sm:items-center sm:gap-3"
              >
                <span className="min-w-0 flex-1 truncate text-sm">{aba.nome}</span>
                <span className="text-muted-foreground shrink-0 text-xs">
                  cabeçalho {aba.cabecalho} ·{" "}
                  {aba.colunas.filter((coluna) => coluna.tipo === "dia").length} dias
                </span>
                <div className="w-full sm:w-56">
                  <Selecionar
                    id={`mapa-${aba.nome}`}
                    value={mapa[aba.nome] ?? ""}
                    onValueChange={(valor) => setMapa((atual) => ({ ...atual, [aba.nome]: valor }))}
                    placeholder="Ignorar aba"
                    ariaLabel={`Turma de origem da aba ${aba.nome}`}
                    opcoes={turmas.map((turma) => ({ valor: turma.id, rotulo: turma.rotulo }))}
                  />
                </div>
              </div>
            ))}
            <Button
              type="button"
              className="h-11 self-start"
              onClick={() => void salvarMapa()}
              disabled={salvando}
            >
              Salvar estrutura
            </Button>
          </div>
        )}
        {sugestoes.length > 0 && (
          <p className="text-muted-foreground text-xs">
            Sugestões preenchidas pelo nome das abas. Ajuste antes de salvar.
          </p>
        )}
      </div>

      <div className="flex flex-col gap-3 rounded-lg border p-3">
        <p className="text-xs font-medium">4. Modo completo</p>
        <p className="text-muted-foreground text-xs leading-relaxed">
          Permite atualizar divergências, limpar células e remover o que a integração criou. Antes
          de cada operação destrutiva o script guarda uma cópia oculta da aba.
        </p>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            className="h-11"
            onClick={() => setDestrave(true)}
          >
            Liberar modo completo
          </Button>
          <Button
            type="button"
            variant="ghost"
            className="h-11"
            onClick={() => void carregarCopias()}
          >
            Cópias de segurança
          </Button>
        </div>
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

      <div className="flex flex-col gap-2 rounded-lg border p-3">
        <p className="text-xs font-medium">Últimos envios</p>
        {integracao && integracao.sincronizacoes.length > 0 ? (
          <ul className="text-muted-foreground flex flex-col gap-1 text-xs">
            {integracao.sincronizacoes.slice(0, 5).map((item) => (
              <li key={item.id}>
                {item.de} a {item.ate} · {item.modalidade.toLowerCase()} · {item.preenchidas}{" "}
                células · {item.resultado.toLowerCase()}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-muted-foreground text-xs">Nenhum envio registrado.</p>
        )}
      </div>

      <AlertDialog>
        <AlertDialogTrigger asChild>
          <Button type="button" variant="ghost" className="text-falta-texto h-11 self-start">
            Desconectar
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
              <Label htmlFor="senha-planilha">Senha do administrador</Label>
              <CampoSenha
                id="senha-planilha"
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

      <Dialog open={destrave} onOpenChange={setDestrave}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Liberar modo completo</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-3">
            <p className="bg-falta-fraca text-falta-texto rounded-lg px-3 py-2 text-xs leading-relaxed">
              Permite substituir, limpar e remover dados na planilha. Cópias de segurança são
              criadas antes de cada operação destrutiva.
            </p>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="frase-destrave">Digite {FRASE_MODO_COMPLETO}</Label>
              <Input
                id="frase-destrave"
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
                    className="aria-[checked=true]:bg-background aria-[checked=true]:text-foreground text-muted-foreground min-h-10 rounded-md px-1 text-xs font-medium aria-[checked=true]:shadow-sm"
                  >
                    {minutos} min
                  </button>
                ))}
              </div>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="senha-destrave">Senha do administrador</Label>
              <CampoSenha
                id="senha-destrave"
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

      <Dialog open={restaurar !== null} onOpenChange={(aberto) => !aberto && setRestaurar(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Restaurar cópia</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-3">
            <p className="bg-falta-fraca text-falta-texto rounded-lg px-3 py-2 text-xs leading-relaxed">
              A aba {restaurar?.aba} será trocada pela cópia {restaurar?.copia}. A versão atual é
              guardada antes. Depois, confira a estrutura de novo.
            </p>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="frase-restaurar">Digite {FRASE_MODO_COMPLETO}</Label>
              <Input
                id="frase-restaurar"
                value={frase}
                onChange={(evento) => setFrase(evento.target.value)}
                autoComplete="off"
                className="h-11"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="senha-restaurar">Senha do administrador</Label>
              <CampoSenha
                id="senha-restaurar"
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
              disabled={frase.trim().toUpperCase() !== FRASE_MODO_COMPLETO || senha === ""}
            >
              Restaurar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {erro && (
        <p role="alert" className="bg-falta-fraca text-falta-texto rounded-lg px-3 py-2 text-sm">
          {erro}
        </p>
      )}
    </div>
  );
}
