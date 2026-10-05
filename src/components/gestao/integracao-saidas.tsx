"use client";

// Card da planilha de saídas: etapas de conexão, aba do registro e envio,
// modo completo e zona de risco. Restrito à administração.
import { OrganizarPlanilha } from "@/components/gestao/dialogo-organizar-planilha";
import { useCallback, useEffect, useState } from "react";
import { DoorOpen, LoaderCircle, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { corpoAlteracao, corpoJson, ErroApi, pedir } from "@/lib/api-cliente";
import { avisarErro, avisarSucesso } from "@/lib/avisos";
import { estadoDeErro } from "@/lib/estado-http";
import { useAcoesPorChave } from "@/lib/use-acao-unica";
import { AvisoCompacto, type VarianteEstado } from "@/components/ui/tela-estado";
import { CABECALHO_SAIDAS, type AbaSaidaEsquema } from "@/domain/planilha-saidas";
import { rotuloInstante, rotuloUltimoEnvio } from "@/domain/planilha";
import { rotuloData } from "@/domain/frequencia";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Selecionar } from "@/components/ui/selecionar";
import { Selo } from "@/components/ui/selo";
import { SecaoRecolhivel } from "@/components/ui/secao-recolhivel";
import { EtapaPlanilha } from "@/components/gestao/planilha-etapa";
import { SeletorPlanilhaGoogle } from "@/components/gestao/seletor-planilha-google";
import { BlocoModoCompletoPlanilha, BlocoRiscoPlanilha } from "@/components/gestao/planilha-blocos";

interface IntegracaoSaidasAdmin {
  ativa: boolean;
  contaGoogle: boolean;
  googlePlanilha: { id: string; nome: string | null } | null;
  esquema: {
    planilha: { nome: string; url: string; fuso: string };
    abas: AbaSaidaEsquema[];
    aba: string;
  } | null;
  esquemaEm: string | null;
  modo: "conservador" | "completo";
  modoCompletoAte: string | null;
  envioAutomatico: boolean;
  atualizadoEm: string;
  fuso: string;
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

export default function IntegracaoSaidas({
  onAbrirSaidas,
  abertoInicial = false,
}: {
  onAbrirSaidas?: () => void;
  abertoInicial?: boolean;
}) {
  const [integracao, setIntegracao] = useState<IntegracaoSaidasAdmin | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [aberto, setAberto] = useState(abertoInicial);
  const [erro, setErro] = useState("");
  const [erroVariante, setErroVariante] = useState<VarianteEstado>("indisponivel");
  const [salvando, setSalvando] = useState(false);
  const [lendo, setLendo] = useState(false);
  const [abas, setAbas] = useState<AbaSaidaEsquema[]>([]);
  const [planilha, setPlanilha] = useState<{
    nome: string;
    url: string;
    fuso: string;
  } | null>(null);
  const [abaSelecionada, setAbaSelecionada] = useState("");
  const [novaAba, setNovaAba] = useState(NOME_ABA_PADRAO);
  const [editandoEstrutura, setEditandoEstrutura] = useState(false);
  const { chaveAtiva, executar: executarPorChave } = useAcoesPorChave();

  const carregar = useCallback(async () => {
    try {
      const dados = await pedir<{ integracao: IntegracaoSaidasAdmin }>("/api/planilha-saidas");
      setIntegracao(dados.integracao);
      if (dados.integracao.esquema) {
        setPlanilha({
          nome: dados.integracao.esquema.planilha.nome,
          url: dados.integracao.esquema.planilha.url,
          fuso: dados.integracao.esquema.planilha.fuso,
        });
        setAbas(dados.integracao.esquema.abas ?? []);
        setAbaSelecionada(dados.integracao.esquema.aba);
      } else {
        setPlanilha(null);
        setAbas([]);
        setAbaSelecionada("");
        setEditandoEstrutura(true);
      }
      setErro("");
    } catch (excecao) {
      setErro(excecao instanceof ErroApi ? excecao.message : "Não foi possível ler a integração.");
      setErroVariante(estadoDeErro(excecao));
      setAberto(true);
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
  const conectada = Boolean(integracao?.contaGoogle && integracao.googlePlanilha);
  const podeEnviar = Boolean(integracao?.ativa && conectada);
  const estruturaSalva = Boolean(integracao?.esquema);
  const estruturaEmEdicao = !estruturaSalva || editandoEstrutura;
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

  async function alternarEnvioAutomatico(valor: boolean) {
    await executarPorChave("alternar-envio-automatico-saidas", async () => {
      setSalvando(true);
      try {
        const dados = await pedir<{ integracao: IntegracaoSaidasAdmin }>(
          "/api/planilha-saidas",
          corpoAlteracao("PATCH", { envioAutomatico: valor }),
        );
        setIntegracao(dados.integracao);
        toast.success(valor ? "Envio ao registrar ligado." : "Envio ao registrar desligado.");
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
          planilha: { nome: string; url: string; fuso: string };
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
          descricao: "Confira a conexão Google, e tente de novo em instantes.",
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
        setEditandoEstrutura(false);
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

  if (carregando) {
    return (
      <section
        data-secao="planilha-saidas"
        aria-label="Planilha de saídas"
        className="bg-card flex flex-col gap-4 rounded-lg border p-4"
      >
        <h2 className="font-medium">Planilha de saídas</h2>
        <p className="text-muted-foreground text-sm">Conferindo a integração...</p>
      </section>
    );
  }

  return (
    <SecaoRecolhivel
      dataSecao="planilha-saidas"
      titulo="Planilha de saídas"
      icone={DoorOpen}
      aberto={aberto}
      onAbertoChange={setAberto}
      resumo={
        <>
          <Selo variante={integracao?.ativa ? "sucesso" : "neutro"}>
            {integracao?.ativa ? "Ligada" : "Desligada"}
          </Selo>
          <Selo variante={conectada ? "sucesso" : "atencao"}>
            {conectada ? "Google conectado" : "Sem conexão"}
          </Selo>
          <Selo variante={estruturaSalva ? "sucesso" : "neutro"}>
            {estruturaSalva ? `Aba ${integracao?.esquema?.aba}` : "Estrutura pendente"}
          </Selo>
          {completoAtivo && <Selo variante="atencao">Modo completo</Selo>}
          <Selo>
            {integracao
              ? rotuloUltimoEnvio(integracao.sincronizacoes, integracao.fuso)
              : "Sem envios"}
          </Selo>
          {integracao?.ultimoErro && <Selo variante="perigo">Último envio com erro</Selo>}
        </>
      }
      acoes={
        <Switch
          checked={integracao?.ativa ?? false}
          disabled={salvando || !conectada}
          onCheckedChange={(valor) => void alternarAtiva(valor)}
          aria-label="Integração de saídas ativa"
        />
      }
    >
      <EtapaPlanilha numero={1} titulo="Conexão" estado={conectada ? "concluida" : "atual"}>
        <SeletorPlanilhaGoogle
          finalidade="SAIDAS"
          conectado={integracao?.contaGoogle ?? false}
          planilha={integracao?.googlePlanilha ?? null}
          onAtualizar={carregar}
        />
      </EtapaPlanilha>

      <EtapaPlanilha
        numero={2}
        titulo="Aba do registro"
        estado={estruturaSalva ? "concluida" : podeEnviar ? "atual" : "pendente"}
        resumo={
          estruturaSalva && !estruturaEmEdicao
            ? `Salva em ${rotuloInstante(integracao?.esquemaEm, integracao?.fuso ?? "")}`
            : podeEnviar
              ? "Escolha a aba para as saídas."
              : "Conecte e ative a integração."
        }
        acoes={
          estruturaEmEdicao ? (
            <Button
              type="button"
              variant="outline"
              className="h-10"
              onClick={() => void lerEstrutura()}
              disabled={lendo || !podeEnviar}
              title={podeEnviar ? undefined : "Conecte e ligue a integração antes de ler."}
            >
              {lendo ? (
                <LoaderCircle size={16} className="animate-spin" />
              ) : (
                <RotateCcw size={16} />
              )}
              Conferir estrutura
            </Button>
          ) : (
            <Button
              type="button"
              variant="outline"
              className="h-10"
              onClick={() => setEditandoEstrutura(true)}
            >
              Revisar estrutura
            </Button>
          )
        }
      >
        {estruturaEmEdicao ? (
          <>
            {planilha && (
              <p className="text-muted-foreground text-xs">
                {planilha.nome} · fuso {planilha.fuso}
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
            <div className="flex flex-col gap-2 border-t pt-3 sm:flex-row sm:items-end">
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
          </>
        ) : null}
      </EtapaPlanilha>

      {(abaSelecionada || integracao?.esquema?.aba) && (
        <div className="flex flex-col gap-2 rounded-lg border p-3">
          <div>
            <OrganizarPlanilha
              rota="/api/planilha-saidas/organizar"
              aba={abaSelecionada || integracao?.esquema?.aba || ""}
              disabled={!podeEnviar}
            />
          </div>
        </div>
      )}

      <EtapaPlanilha
        numero={3}
        titulo="Envio pela vista Saídas"
        estado={estruturaSalva ? "atual" : "pendente"}
        resumo={estruturaSalva ? "Envio mensal com prévia." : "Salve a estrutura antes de enviar."}
      >
        <div className="flex flex-wrap items-center gap-2">
          {onAbrirSaidas && (
            <Button
              type="button"
              className="h-11"
              disabled={!estruturaSalva}
              title={estruturaSalva ? undefined : "Salve a estrutura antes de enviar."}
              onClick={onAbrirSaidas}
            >
              Abrir a vista Saídas
            </Button>
          )}
        </div>
        <div className="flex items-start justify-between gap-3 rounded-lg border p-3">
          <div className="min-w-0">
            <p className="text-sm font-medium">Enviar ao registrar</p>
            <p className="text-muted-foreground text-xs">
              Cada saída e cada entrada registrada segue para a planilha sozinha, só acrescentando
              linhas. O que pedir revisão fica para o envio manual.
            </p>
          </div>
          <Switch
            checked={integracao?.envioAutomatico ?? false}
            disabled={salvando || !podeEnviar || !estruturaSalva}
            onCheckedChange={(valor) => void alternarEnvioAutomatico(valor)}
            aria-label="Enviar ao registrar saídas e entradas"
          />
        </div>
        <div className="flex flex-col gap-1 text-xs">
          {integracao?.ultimoErro && (
            <p className="text-falta-texto">
              {integracao.ultimoErro.resultado === "PARCIAL" ? "Envio parcial" : "Falha"}:{" "}
              {integracao.ultimoErro.erro ?? "sem detalhe"}
            </p>
          )}
          {integracao && integracao.sincronizacoes.length > 0 ? (
            <ul className="text-muted-foreground flex flex-col gap-0.5">
              {integracao.sincronizacoes.slice(0, 5).map((item) => (
                <li key={item.id}>
                  {rotuloData(item.de)} a {rotuloData(item.ate)} · {item.modalidade.toLowerCase()} ·{" "}
                  {item.linhasCriadas} linhas criadas · {item.substituidas} corrigidas ·{" "}
                  {item.removidasLinhas} removidas · {item.resultado.toLowerCase()}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-muted-foreground">Nenhum envio registrado.</p>
          )}
        </div>
      </EtapaPlanilha>

      <BlocoModoCompletoPlanilha
        idPrefixo="planilha-saidas"
        urlBase="/api/planilha-saidas"
        ativo={completoAtivo}
        ate={integracao?.modoCompletoAte ?? null}
        onMudou={carregar}
      />

      <BlocoRiscoPlanilha
        idPrefixo="planilha-saidas"
        urlBase="/api/planilha-saidas"
        copiasDe={
          integracao?.esquema?.aba
            ? [integracao.esquema.aba]
            : abas.filter((aba) => !aba.oculta).map((aba) => aba.nome)
        }
        abasCriadas={abas.filter((aba) => aba.criada).map((aba) => aba.nome)}
        onMudou={carregar}
      />

      {erro && <AvisoCompacto variante={erroVariante} descricao={erro} tamanho="linha" />}
    </SecaoRecolhivel>
  );
}
