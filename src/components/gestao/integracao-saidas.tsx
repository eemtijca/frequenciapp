"use client";

// Card da planilha de saídas: conexão, aba única de registro, modo completo e
// cópias de segurança. Restrito à administração.
import { useCallback, useEffect, useState } from "react";
import { FileSpreadsheet, LoaderCircle, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { corpoAlteracao, corpoJson, ErroApi, pedir } from "@/lib/api-cliente";
import { avisarErro, avisarSucesso } from "@/lib/avisos";
import { estadoDeErro } from "@/lib/estado-http";
import { useAcoesPorChave } from "@/lib/use-acao-unica";
import { AvisoCompacto, type VarianteEstado } from "@/components/ui/tela-estado";
import { CABECALHO_SAIDAS, type AbaSaidaEsquema } from "@/domain/planilha-saidas";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Selecionar } from "@/components/ui/selecionar";
import {
  BlocoConexaoPlanilha,
  BlocoModoCompletoPlanilha,
} from "@/components/gestao/planilha-blocos";
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

interface IntegracaoSaidasAdmin {
  ativa: boolean;
  endpoint: string | null;
  token: string | null;
  temToken: boolean;
  versaoScript: string | null;
  esquema: {
    planilha: { nome: string; url: string; fuso: string; versao: number };
    abas: AbaSaidaEsquema[];
    aba: string;
  } | null;
  esquemaEm: string | null;
  modo: "conservador" | "completo";
  modoCompletoAte: string | null;
  atualizadoEm: string;
  ultimoErro: { erro: string | null; resultado: string; criadoEm: string } | null;
  sincronizacoes: {
    id: string;
    de: string;
    ate: string;
    modalidade: string;
    linhasCriadas: number;
    preenchidas: number;
    substituidas: number;
    removidasLinhas: number;
    resultado: string;
    criadoEm: string;
  }[];
}

const NOME_ABA_PADRAO = "Saiu mais cedo";

export default function IntegracaoSaidas() {
  const [integracao, setIntegracao] = useState<IntegracaoSaidasAdmin | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState("");
  const [erroVariante, setErroVariante] = useState<VarianteEstado>("indisponivel");
  const [salvando, setSalvando] = useState(false);
  const [endpoint, setEndpoint] = useState("");
  const [lendo, setLendo] = useState(false);
  const [abas, setAbas] = useState<AbaSaidaEsquema[]>([]);
  const [planilha, setPlanilha] = useState<{
    nome: string;
    url: string;
    fuso: string;
    versao: number;
  } | null>(null);
  const [abaSelecionada, setAbaSelecionada] = useState("");
  const [novaAba, setNovaAba] = useState(NOME_ABA_PADRAO);
  const { chaveAtiva, executar: executarPorChave } = useAcoesPorChave();

  const carregar = useCallback(async () => {
    try {
      const dados = await pedir<{ integracao: IntegracaoSaidasAdmin }>("/api/planilha-saidas");
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
        setAbaSelecionada(dados.integracao.esquema.aba);
      }
      setErro("");
    } catch (excecao) {
      setErro(excecao instanceof ErroApi ? excecao.message : "Não foi possível ler a integração.");
      setErroVariante(estadoDeErro(excecao));
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
  const abaEscolhida = abas.find((aba) => aba.nome === abaSelecionada) ?? null;

  async function alternarAtiva(valor: boolean) {
    await executarPorChave("alternar-ativa", async () => {
      setSalvando(true);
      try {
        const dados = await pedir<{ integracao: IntegracaoSaidasAdmin }>(
          "/api/planilha-saidas",
          corpoAlteracao("PATCH", { ativa: valor }),
        );
        setIntegracao(dados.integracao);
        toast.success(valor ? "Integração ativada." : "Integração desativada.");
      } catch (excecao) {
        toast.error(excecao instanceof ErroApi ? excecao.message : "Não foi possível salvar.");
      } finally {
        setSalvando(false);
      }
    });
  }

  async function lerEstrutura() {
    const aviso = "planilha-saidas-estrutura";
    await executarPorChave(aviso, async () => {
      setLendo(true);
      toast.loading("Lendo as abas da planilha...", { id: aviso });
      try {
        const dados = await pedir<{
          planilha: { nome: string; url: string; fuso: string; versao: number };
          abas: AbaSaidaEsquema[];
          sugestao: { aba: string; confianca: "alta" | "media" | "baixa" } | null;
        }>("/api/planilha-saidas/estrutura", corpoJson({}));
        setAbas(dados.abas);
        setPlanilha(dados.planilha);
        setAbaSelecionada((atual) => {
          const existe = dados.abas.some((aba) => aba.nome === atual);
          if (atual !== "" && existe) return atual;
          return dados.sugestao?.aba ?? "";
        });
        avisarSucesso(
          `${dados.abas.length} ${dados.abas.length === 1 ? "aba lida" : "abas lidas"}.`,
          "Confira a aba do registro antes de salvar.",
          aviso,
        );
      } catch (excecao) {
        avisarErro(excecao, {
          contexto: "Não foi possível ler a planilha.",
          descricao: "Confira a conexão e o token, e tente de novo em instantes.",
          tentarDeNovo: () => void lerEstrutura(),
          id: aviso,
        });
      } finally {
        setLendo(false);
      }
    });
  }

  async function salvarMapa() {
    if (!planilha) return;
    if (!abaEscolhida) {
      toast.error("Escolha a aba do registro de saídas.");
      return;
    }
    setSalvando(true);
    const aviso = "planilha-saidas-mapa";
    toast.loading("Salvando a estrutura...", { id: aviso });
    await executarPorChave(aviso, async () => {
      try {
        const dados = await pedir<{ integracao: IntegracaoSaidasAdmin }>(
          "/api/planilha-saidas/mapa",
          corpoJson({ planilha, abas, aba: abaEscolhida.nome }),
        );
        setIntegracao(dados.integracao);
        avisarSucesso(
          "Estrutura salva.",
          "Agora a vista Saídas pode enviar os registros para esta planilha.",
          aviso,
        );
      } catch (excecao) {
        avisarErro(excecao, {
          contexto: "Não foi possível salvar a estrutura.",
          descricao: "Confira a aba escolhida e tente de novo em instantes.",
          id: aviso,
        });
      } finally {
        setSalvando(false);
      }
    });
  }

  async function criarAba() {
    await executarPorChave("criar-aba-saidas", async () => {
      try {
        await pedir(
          "/api/planilha-saidas/criar-aba",
          corpoJson({ nome: novaAba, cabecalho: CABECALHO_SAIDAS }),
        );
        avisarSucesso(
          "Aba criada. Use Conferir estrutura para escolher.",
          "A nova aba recebe as colunas padrão das saídas.",
        );
      } catch (excecao) {
        toast.error(excecao instanceof ErroApi ? excecao.message : "Não foi possível criar a aba.");
      }
    });
  }

  async function desconectar() {
    await executarPorChave("desconectar", async () => {
      try {
        await pedir("/api/planilha-saidas/desconectar", corpoJson({}));
        setAbas([]);
        setPlanilha(null);
        setAbaSelecionada("");
        avisarSucesso(
          "Integração desconectada. A planilha não foi alterada.",
          "Nada foi apagado no Google Planilhas.",
        );
        await carregar();
      } catch (excecao) {
        toast.error(excecao instanceof ErroApi ? excecao.message : "Não foi possível desconectar.");
      }
    });
  }

  if (carregando) {
    return (
      <section
        aria-label="Google Planilhas de saídas"
        className="bg-card flex flex-col gap-4 rounded-lg border p-4"
      >
        <h2 className="font-medium">Google Planilhas de saídas</h2>
        <p className="text-muted-foreground text-sm">Conferindo a integração...</p>
      </section>
    );
  }

  return (
    <section
      aria-label="Google Planilhas de saídas"
      className="bg-card flex flex-col gap-4 rounded-lg border p-4"
    >
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h2 className="flex items-center gap-2 font-medium">
            <FileSpreadsheet size={16} aria-hidden="true" />
            Google Planilhas de saídas
          </h2>
          <p className="text-muted-foreground text-sm">
            As saídas antecipadas são registradas em outra planilha, uma linha por saída. No modo
            conservador apenas células e linhas vazias são preenchidas.
          </p>
        </div>
        <Switch
          checked={integracao?.ativa ?? false}
          disabled={salvando || !integracao?.temToken}
          onCheckedChange={(valor) => void alternarAtiva(valor)}
          aria-label="Integração de saídas ativa"
        />
      </div>

      <BlocoConexaoPlanilha
        idPrefixo="planilha-saidas"
        urlBase="/api/planilha-saidas"
        endpoint={endpoint}
        integracao={integracao}
        onEndpoint={setEndpoint}
        onAtualizar={carregar}
      />

      <div className="flex flex-col gap-3 rounded-lg border p-3">
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs font-medium">3. Aba do registro</p>
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
            <div className="w-full sm:w-72">
              <Selecionar
                id="saidas-aba"
                value={abaSelecionada}
                onValueChange={setAbaSelecionada}
                placeholder="Escolha a aba"
                ariaLabel="Aba do registro de saídas"
                opcoes={abas
                  .filter((aba) => !aba.oculta)
                  .map((aba) => ({ valor: aba.nome, rotulo: aba.nome }))}
              />
            </div>
            {abaEscolhida && (
              <div className="text-muted-foreground flex flex-col gap-1 text-xs">
                <span>
                  Colunas reconhecidas:{" "}
                  {abaEscolhida.colunas
                    .filter((coluna) => coluna.atributo)
                    .map((coluna) => coluna.rotulo || coluna.letra)
                    .join(" · ") || "nenhuma"}
                </span>
                {abaEscolhida.bloqueio && (
                  <span className="text-falta-texto">{abaEscolhida.bloqueio}</span>
                )}
              </div>
            )}
            <Button
              type="button"
              className="h-11 self-start"
              onClick={() => void salvarMapa()}
              disabled={salvando || !abaEscolhida || Boolean(abaEscolhida.bloqueio)}
            >
              Salvar estrutura
            </Button>
          </div>
        )}
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
          <div className="flex min-w-0 flex-1 flex-col gap-1.5">
            <Label htmlFor="saidas-nova-aba">Criar aba com o cabeçalho padrão</Label>
            <Input
              id="saidas-nova-aba"
              value={novaAba}
              onChange={(evento) => setNovaAba(evento.target.value)}
              autoComplete="off"
              className="h-11"
            />
          </div>
          <Button
            type="button"
            variant="outline"
            className="h-11"
            onClick={() => void criarAba()}
            disabled={chaveAtiva === "criar-aba-saidas" || novaAba.trim() === ""}
          >
            {chaveAtiva === "criar-aba-saidas" ? "Criando..." : "Criar aba"}
          </Button>
        </div>
        {integracao?.esquema && (
          <p className="text-muted-foreground text-xs">
            Aba salva: {integracao.esquema.aba} · colunas:{" "}
            {integracao.esquema.abas
              .find((aba) => aba.nome === integracao.esquema?.aba)
              ?.colunas.filter((coluna) => coluna.atributo).length ?? 0}
          </p>
        )}
      </div>

      <BlocoModoCompletoPlanilha
        idPrefixo="planilha-saidas"
        urlBase="/api/planilha-saidas"
        ativo={completoAtivo}
        ate={integracao?.modoCompletoAte ?? null}
        copiasDe={
          integracao?.esquema?.aba
            ? [integracao.esquema.aba]
            : abas.filter((aba) => !aba.oculta).map((aba) => aba.nome)
        }
        abasCriadas={abas.filter((aba) => aba.criada).map((aba) => aba.nome)}
        onMudou={carregar}
      />

      <div className="flex flex-col gap-2 rounded-lg border p-3">
        <p className="text-xs font-medium">Situação</p>
        <p className="text-muted-foreground text-xs">
          {integracao?.modo === "completo"
            ? "Modo completo liberado por prazo. Correções e remoções só atingem linhas criadas pela integração."
            : "Modo conservador: só acrescenta saídas que ainda não estão na planilha."}
        </p>
        {integracao?.ultimoErro && (
          <p className="text-falta-texto text-xs">
            {integracao.ultimoErro.resultado === "PARCIAL" ? "Envio parcial" : "Falha"}:{" "}
            {integracao.ultimoErro.erro ?? "sem detalhe"}
          </p>
        )}
      </div>

      <div className="flex flex-col gap-2 rounded-lg border p-3">
        <p className="text-xs font-medium">Últimos envios</p>
        {integracao && integracao.sincronizacoes.length > 0 ? (
          <ul className="text-muted-foreground flex flex-col gap-1 text-xs">
            {integracao.sincronizacoes.slice(0, 5).map((item) => (
              <li key={item.id}>
                {item.de} a {item.ate} · {item.modalidade.toLowerCase()} · {item.linhasCriadas}{" "}
                linhas criadas · {item.substituidas} corrigidas · {item.removidasLinhas} removidas ·{" "}
                {item.resultado.toLowerCase()}
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
            <AlertDialogTitle>Desconectar a planilha de saídas?</AlertDialogTitle>
            <AlertDialogDescription>
              O token e a estrutura salva são apagados. Nada é removido da planilha.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-falta text-falta-foreground hover:bg-falta/90"
              onClick={() => void desconectar()}
              disabled={chaveAtiva === "desconectar"}
            >
              {chaveAtiva === "desconectar" ? "Desconectando..." : "Desconectar"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {erro && <AvisoCompacto variante={erroVariante} descricao={erro} tamanho="linha" />}
    </section>
  );
}
