"use client";

// Card da planilha de frequência: etapas de conexão, estrutura e envio, modo
// completo e zona de risco. Restrito à administração.
import { OrganizarPlanilha } from "@/components/gestao/dialogo-organizar-planilha";
import { useCallback, useEffect, useState } from "react";
import { FileSpreadsheet, LoaderCircle, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { corpoAlteracao, corpoJson, ErroApi, pedir } from "@/lib/api-cliente";
import { avisarErro, avisarSucesso } from "@/lib/avisos";
import { estadoDeErro } from "@/lib/estado-http";
import { useAcoesPorChave } from "@/lib/use-acao-unica";
import { AvisoCompacto, type VarianteEstado } from "@/components/ui/tela-estado";
import { rotuloInstante, type AbaEsquema } from "@/domain/planilha";
import { diasDoMes, rotuloData, rotuloMes } from "@/domain/frequencia";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Selecionar } from "@/components/ui/selecionar";
import { SeletorPeriodo } from "@/components/ui/seletor-periodo";
import { Selo } from "@/components/ui/selo";
import { SecaoRecolhivel } from "@/components/ui/secao-recolhivel";
import { EtapaPlanilha } from "@/components/gestao/planilha-etapa";
import { BlocoModoCompletoPlanilha, BlocoRiscoPlanilha } from "@/components/gestao/planilha-blocos";
import DialogoEnvio from "@/components/grade/dialogo-envio";
import { SeletorPlanilhaGoogle } from "@/components/gestao/seletor-planilha-google";

interface Sugestao {
  aba: string;
  turmaOriginalId: string | null;
  confianca: "alta" | "media" | "baixa";
}

interface IntegracaoAdmin {
  ativa: boolean;
  envioAutomatico: boolean;
  googleConectado: boolean;
  googlePlanilha: { id: string; nome: string | null } | null;
  esquema: {
    planilha: { nome: string; url: string; fuso: string };
    mapa: MapaAba[];
    abas: AbaEsquema[];
  } | null;
  esquemaEm: string | null;
  modo: "conservador" | "completo";
  modoCompletoAte: string | null;
  fuso: string;
  alteradasDepois: number;
  ultimoErro: {
    erro: string | null;
    resultado: string;
    criadoEm: string;
    turma: string | null;
  } | null;
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
  diaCorrente,
  abertoInicial = false,
}: {
  turmas: { id: string; rotulo: string }[];
  diaCorrente: string;
  abertoInicial?: boolean;
}) {
  const [integracao, setIntegracao] = useState<IntegracaoAdmin | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [aberto, setAberto] = useState(abertoInicial);
  const [erro, setErro] = useState("");
  const [erroVariante, setErroVariante] = useState<VarianteEstado>("indisponivel");
  const [salvando, setSalvando] = useState(false);
  const [lendo, setLendo] = useState(false);
  const [sugestoes, setSugestoes] = useState<Sugestao[]>([]);
  const [abas, setAbas] = useState<AbaEsquema[]>([]);
  const [planilha, setPlanilha] = useState<{
    nome: string;
    url: string;
    fuso: string;
  } | null>(null);
  const [mapa, setMapa] = useState<Record<string, string>>({});
  const [editandoEstrutura, setEditandoEstrutura] = useState(false);
  const { chaveAtiva, executar: executarPorChave } = useAcoesPorChave();
  const [mesEnvio, setMesEnvio] = useState(diaCorrente.slice(0, 7));
  const [envioAberto, setEnvioAberto] = useState(false);
  const [abaApresentacao, setAbaApresentacao] = useState("");
  const acoesOrganizacao = useAcoesPorChave();
  const abasMapeadas = [...new Set((integracao?.esquema?.mapa ?? []).map((item) => item.aba))];
  const todasTurmas = abaApresentacao === "todas";
  const abaOrganizar = abaApresentacao.startsWith("aba:") ? abaApresentacao.slice(4) : "";

  const carregar = useCallback(async () => {
    try {
      const dados = await pedir<{ integracao: IntegracaoAdmin }>("/api/planilha");
      setIntegracao(dados.integracao);
      if (dados.integracao.esquema) {
        setPlanilha({
          nome: dados.integracao.esquema.planilha.nome,
          url: dados.integracao.esquema.planilha.url,
          fuso: dados.integracao.esquema.planilha.fuso,
        });
        setAbas(dados.integracao.esquema.abas ?? []);
        setMapa(
          Object.fromEntries(
            (dados.integracao.esquema.mapa ?? []).map((item) => [item.aba, item.turmaOriginalId]),
          ),
        );
      } else {
        setPlanilha(null);
        setAbas([]);
        setMapa({});
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
  const conectada = Boolean(integracao?.googleConectado && integracao.googlePlanilha);
  const podeEnviar = Boolean(integracao?.ativa && conectada);
  const estruturaSalva = Boolean(integracao?.esquema);
  const estruturaEmEdicao = !estruturaSalva || editandoEstrutura;
  const temMapa = Object.values(mapa).some((turmaId) => turmaId !== "");
  const turmasSemAba = turmas.filter((turma) => !Object.values(mapa).includes(turma.id));
  const diasEnvio = diasDoMes(mesEnvio);

  async function alternarAtiva(valor: boolean) {
    await executarPorChave("alternar-ativa", async () => {
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
    });
  }

  async function alternarEnvioAutomatico(valor: boolean) {
    await executarPorChave("alternar-envio-automatico", async () => {
      setSalvando(true);
      try {
        const dados = await pedir<{ integracao: IntegracaoAdmin }>(
          "/api/planilha",
          corpoAlteracao("PATCH", { envioAutomatico: valor }),
        );
        setIntegracao(dados.integracao);
        toast.success(valor ? "Envio ao salvar ligado." : "Envio ao salvar desligado.");
      } catch (excecao) {
        toast.error(excecao instanceof ErroApi ? excecao.message : "Não foi possível salvar.");
      } finally {
        setSalvando(false);
      }
    });
  }

  async function lerEstrutura() {
    const aviso = "planilha-estrutura";
    await executarPorChave(aviso, async () => {
      setLendo(true);
      toast.loading("Lendo as abas da planilha...", { id: aviso });
      try {
        const dados = await pedir<{
          planilha: { nome: string; url: string; fuso: string };
          abas: AbaEsquema[];
          sugestoes: Sugestao[];
        }>("/api/planilha/estrutura", corpoJson({}));
        setAbas(dados.abas);
        setSugestoes(dados.sugestoes);
        setPlanilha(dados.planilha);
        const idsValidos = new Set(turmas.map((turma) => turma.id));
        setMapa((atual) => {
          const proximo = { ...atual };
          for (const sugestao of dados.sugestoes) {
            const atualDaAba = proximo[sugestao.aba];
            const invalido = atualDaAba !== undefined && !idsValidos.has(atualDaAba);
            if ((atualDaAba === undefined || invalido) && sugestao.turmaOriginalId) {
              proximo[sugestao.aba] = sugestao.turmaOriginalId;
            }
          }
          return proximo;
        });
        avisarSucesso(
          `${dados.abas.length} ${dados.abas.length === 1 ? "aba lida" : "abas lidas"}.`,
          "Confira o mapa de turmas antes de salvar.",
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
    const itens: MapaAba[] = Object.entries(mapa)
      .filter(([, turmaId]) => turmaId !== "")
      .map(([aba, turmaOriginalId]) => ({ aba, turmaOriginalId }));
    if (itens.length === 0) {
      toast.error("Escolha ao menos uma aba.");
      return;
    }
    setSalvando(true);
    const aviso = "planilha-mapa";
    toast.loading("Salvando a estrutura...", { id: aviso });
    await executarPorChave(aviso, async () => {
      try {
        const dados = await pedir<{ integracao: IntegracaoAdmin }>(
          "/api/planilha/mapa",
          corpoJson({ planilha, abas, mapa: itens }),
        );
        setIntegracao(dados.integracao);
        setEditandoEstrutura(false);
        avisarSucesso(
          "Estrutura salva.",
          "Agora a Grade pode enviar as faltas para esta planilha.",
          aviso,
        );
      } catch (excecao) {
        avisarErro(excecao, {
          contexto: "Não foi possível salvar o mapa.",
          descricao: "Confira o mapa de turmas e tente de novo em instantes.",
          id: aviso,
        });
      } finally {
        setSalvando(false);
      }
    });
  }

  async function criarAba(nome: string) {
    await executarPorChave(`criar-aba-${nome}`, async () => {
      try {
        await pedir("/api/planilha/criar-aba", corpoJson({ nome }));
        avisarSucesso(
          "Aba criada. Use Conferir estrutura para mapear.",
          "A nova aba recebe a estrutura no próximo envio.",
        );
      } catch (excecao) {
        toast.error(excecao instanceof ErroApi ? excecao.message : "Não foi possível criar a aba.");
      }
    });
  }

  if (carregando) {
    return (
      <section
        data-secao="planilha-frequencia"
        aria-label="Planilha de frequência"
        className="superficie-vidro flex flex-col gap-4 p-4"
      >
        <h2 className="font-medium">Planilha de frequência</h2>
        <p className="text-muted-foreground text-sm">Conferindo a integração...</p>
      </section>
    );
  }

  return (
    <SecaoRecolhivel
      dataSecao="planilha-frequencia"
      titulo="Planilha de frequência"
      icone={FileSpreadsheet}
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
            {estruturaSalva
              ? `Estrutura · ${integracao?.esquema?.mapa.length ?? 0} abas`
              : "Estrutura pendente"}
          </Selo>
          {completoAtivo && <Selo variante="atencao">Modo completo</Selo>}
          {(integracao?.alteradasDepois ?? 0) > 0 && (
            <Selo>{integracao?.alteradasDepois} chamadas alteradas</Selo>
          )}
          {integracao?.ultimoErro && <Selo variante="perigo">Último envio com erro</Selo>}
        </>
      }
      acoes={
        <Switch
          checked={integracao?.ativa ?? false}
          disabled={salvando || !conectada}
          onCheckedChange={(valor) => void alternarAtiva(valor)}
          aria-label="Integração ativa"
        />
      }
    >
      <EtapaPlanilha numero={1} titulo="Conexão" estado={conectada ? "concluida" : "atual"}>
        <SeletorPlanilhaGoogle
          conectado={integracao?.googleConectado ?? false}
          planilha={integracao?.googlePlanilha ?? null}
          onAtualizar={carregar}
        />
      </EtapaPlanilha>

      <EtapaPlanilha
        numero={2}
        titulo="Estrutura e mapa por turma de origem"
        estado={estruturaSalva ? "concluida" : podeEnviar ? "atual" : "pendente"}
        resumo={
          estruturaSalva && !estruturaEmEdicao
            ? `Salva em ${rotuloInstante(integracao?.esquemaEm, integracao?.fuso ?? "")}`
            : podeEnviar
              ? "Vincule as abas às turmas de origem."
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
                        onValueChange={(valor) =>
                          setMapa((atual) => ({ ...atual, [aba.nome]: valor }))
                        }
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
                  disabled={salvando || !temMapa}
                >
                  Salvar estrutura
                </Button>
              </div>
            )}
            {planilha && turmasSemAba.length > 0 && (
              <div className="flex flex-col gap-1 text-xs">
                <span className="text-muted-foreground">Turmas sem aba mapeada:</span>
                {turmasSemAba.map((turma) => (
                  <div key={turma.id} className="flex items-center justify-between gap-2">
                    <span className="min-w-0 truncate">{turma.rotulo}</span>
                    <Button
                      type="button"
                      variant="ghost"
                      className="h-8"
                      onClick={() => void criarAba(turma.rotulo)}
                      disabled={chaveAtiva === `criar-aba-${turma.rotulo}`}
                    >
                      {chaveAtiva === `criar-aba-${turma.rotulo}` ? "Criando..." : "Criar aba"}
                    </Button>
                  </div>
                ))}
              </div>
            )}
            {sugestoes.length > 0 && (
              <p className="text-muted-foreground text-xs">
                Confira os vínculos sugeridos antes de salvar.
              </p>
            )}
          </>
        ) : null}
      </EtapaPlanilha>

      {conectada && abas.some((aba) => !aba.oculta) && (
        <div className="superficie-vidro flex flex-col gap-2 p-3">
          <Selecionar
            id="frequencia-apresentacao"
            value={abaApresentacao}
            onValueChange={setAbaApresentacao}
            placeholder="Escolha a aba para organizar"
            ariaLabel="Aba para organizar a apresentação"
            disabled={acoesOrganizacao.chaveAtiva !== null}
            opcoes={[
              ...(abasMapeadas.length ? [{ valor: "todas", rotulo: "Todas as turmas" }] : []),
              ...abas
                .filter((aba) => !aba.oculta)
                .map((aba) => ({ valor: `aba:${aba.nome}`, rotulo: aba.nome })),
            ]}
          />
          <div className="flex flex-wrap items-center gap-2">
            <OrganizarPlanilha
              rota="/api/planilha/organizar"
              aba={abaOrganizar}
              todasTurmas={todasTurmas}
              abas={abasMapeadas}
              acoes={acoesOrganizacao}
              disabled={!podeEnviar}
            />
            <OrganizarPlanilha
              rota="/api/planilha/organizar"
              aba={abaOrganizar}
              todasTurmas={todasTurmas}
              abas={abasMapeadas}
              acoes={acoesOrganizacao}
              disabled={!podeEnviar}
              ajustarCabecalho
              onAtualizar={carregar}
            />
          </div>
        </div>
      )}

      <EtapaPlanilha
        numero={3}
        titulo="Envio"
        estado={estruturaSalva ? "atual" : "pendente"}
        resumo={
          estruturaSalva
            ? "Envia alterações com prévia. O mês vale para o período inteiro."
            : "Salve a estrutura antes de enviar."
        }
      >
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
          <div className="w-full sm:w-64">
            <SeletorPeriodo
              id="planilha-mes-envio"
              modo="mes"
              valor={mesEnvio}
              max={diaCorrente.slice(0, 7)}
              rotuloAcessivel="Mês do envio para a planilha"
              rotulo={rotuloMes(mesEnvio)}
              onValor={setMesEnvio}
            />
          </div>
          <Button
            type="button"
            className="h-11"
            disabled={!estruturaSalva}
            title={estruturaSalva ? undefined : "Salve a estrutura antes de enviar."}
            onClick={() => setEnvioAberto(true)}
          >
            Enviar todas as turmas
          </Button>
        </div>
        <div className="superficie-vidro mt-3 flex items-start justify-between gap-3 p-3">
          <div className="min-w-0">
            <p className="text-sm font-medium">Enviar ao salvar a chamada</p>
            <p className="text-muted-foreground text-xs">
              Preenche células vazias. Pendências seguem para o envio manual.
            </p>
          </div>
          <Switch
            checked={integracao?.envioAutomatico ?? false}
            disabled={salvando || !podeEnviar || !estruturaSalva}
            onCheckedChange={(valor) => void alternarEnvioAutomatico(valor)}
            aria-label="Enviar ao salvar a chamada"
          />
        </div>

        <div className="flex flex-col gap-1 text-xs">
          <p className="text-muted-foreground">
            {integracao?.alteradasDepois ?? 0}{" "}
            {integracao?.alteradasDepois === 1
              ? "chamada pendente de envio"
              : "chamadas pendentes de envio"}
          </p>
          {integracao?.ultimoErro && (
            <p className="text-falta-texto">
              {integracao.ultimoErro.resultado === "PARCIAL" ? "Envio parcial" : "Falha"}
              {integracao.ultimoErro.turma ? ` em ${integracao.ultimoErro.turma}` : ""}:{" "}
              {integracao.ultimoErro.erro ?? "sem detalhe"}
            </p>
          )}
          {integracao && integracao.sincronizacoes.length > 0 && (
            <ul className="text-muted-foreground flex flex-col gap-0.5">
              {integracao.sincronizacoes.slice(0, 5).map((item) => (
                <li key={item.id}>
                  {rotuloData(item.de)} a {rotuloData(item.ate)} · {item.modalidade.toLowerCase()} ·{" "}
                  {item.preenchidas} células · {item.resultado.toLowerCase()}
                </li>
              ))}
            </ul>
          )}
        </div>
      </EtapaPlanilha>

      <BlocoModoCompletoPlanilha
        idPrefixo="planilha"
        urlBase="/api/planilha"
        ativo={completoAtivo}
        ate={integracao?.modoCompletoAte ?? null}
        onMudou={carregar}
      />

      <BlocoRiscoPlanilha
        idPrefixo="planilha"
        urlBase="/api/planilha"
        copiasDe={(integracao?.esquema?.mapa ?? []).map((item) => item.aba)}
        abasCriadas={(integracao?.esquema?.abas ?? [])
          .filter((aba) => aba.criada)
          .map((aba) => aba.nome)}
        onMudou={carregar}
      />

      <DialogoEnvio
        aberto={envioAberto}
        onAbrir={setEnvioAberto}
        rotulo="todas as turmas"
        de={diasEnvio[0] ?? diaCorrente}
        ate={diasEnvio[diasEnvio.length - 1] ?? diaCorrente}
        modoCompleto={completoAtivo}
        todas
        aoConcluir={() => {
          void carregar();
        }}
      />

      {erro && <AvisoCompacto variante={erroVariante} descricao={erro} tamanho="linha" />}
    </SecaoRecolhivel>
  );
}
