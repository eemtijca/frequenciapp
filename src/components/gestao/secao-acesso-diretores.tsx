"use client";

// Parâmetros de acesso: validade da palavra-chave, sessão do diretor, limites
// de tentativa de entrada, o que o diretor vê e o limite de risco. Editáveis
// pela administração, dentro das faixas do domínio (ADR-021).
import { useEffect, useState } from "react";
import { LoaderCircle, ShieldCheck } from "lucide-react";
import { avisarErro, avisarSucesso } from "@/lib/avisos";
import { estadoDeErro } from "@/lib/estado-http";
import { useAcaoUnica } from "@/lib/use-acao-unica";
import { corpoAlteracao, ErroApi, pedir } from "@/lib/api-cliente";
import {
  CATEGORIAS_DIRETOR,
  FAIXAS_PARAMETROS,
  ROTULOS_CATEGORIA_DIRETOR,
  type CategoriaDiretor,
  type ParametroNumerico,
  type ParametrosAcesso,
} from "@/domain/diretores";
import { AvisoCompacto, type VarianteEstado } from "@/components/ui/tela-estado";
import { SecaoRecolhivel } from "@/components/ui/secao-recolhivel";
import { Selo } from "@/components/ui/selo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const CAMPOS = Object.keys(FAIXAS_PARAMETROS) as ParametroNumerico[];

type Rascunho = Record<ParametroNumerico, string> & { categoriasDiretor: CategoriaDiretor[] };

function paraRascunho(parametros: ParametrosAcesso): Rascunho {
  const numeros = Object.fromEntries(
    CAMPOS.map((campo) => [campo, String(parametros[campo])]),
  ) as Record<ParametroNumerico, string>;
  return { ...numeros, categoriasDiretor: parametros.categoriasDiretor };
}

export default function SecaoAcessoDiretores() {
  const [aberto, setAberto] = useState(false);
  const [parametros, setParametros] = useState<ParametrosAcesso | null>(null);
  const [rascunho, setRascunho] = useState<Rascunho | null>(null);
  const [erro, setErro] = useState("");
  const [erroVariante, setErroVariante] = useState<VarianteEstado>("dados_invalidos");

  const { executando: carregando, executar: carregar } = useAcaoUnica(async () => {
    try {
      const dados = await pedir<{ parametros: ParametrosAcesso }>("/api/parametros-acesso");
      setParametros(dados.parametros);
      setRascunho(paraRascunho(dados.parametros));
    } catch (excecao) {
      avisarErro(excecao, { contexto: "Não foi possível carregar os parâmetros de acesso." });
    }
  });

  useEffect(() => {
    if (aberto && parametros === null) void carregar();
  }, [aberto, parametros, carregar]);

  const { executando: salvando, executar: salvar } = useAcaoUnica(async () => {
    if (!rascunho) return;
    setErro("");
    try {
      const corpo = {
        ...Object.fromEntries(CAMPOS.map((campo) => [campo, Number(rascunho[campo])])),
        categoriasDiretor: rascunho.categoriasDiretor,
      };
      const dados = await pedir<{ parametros: ParametrosAcesso }>(
        "/api/parametros-acesso",
        corpoAlteracao("PATCH", corpo),
      );
      setParametros(dados.parametros);
      setRascunho(paraRascunho(dados.parametros));
      avisarSucesso(
        "Parâmetros de acesso salvos.",
        "Validade e sessão valem para as próximas palavras-chave e entradas.",
      );
    } catch (excecao) {
      setErro(
        excecao instanceof ErroApi ? excecao.message : "Não foi possível salvar os parâmetros.",
      );
      setErroVariante(estadoDeErro(excecao));
      avisarErro(excecao, { contexto: "Não foi possível salvar os parâmetros." });
    }
  });

  function alternarCategoria(categoria: CategoriaDiretor, marcada: boolean) {
    setRascunho((atual) =>
      atual
        ? {
            ...atual,
            categoriasDiretor: CATEGORIAS_DIRETOR.filter((item) =>
              item === categoria ? marcada : atual.categoriasDiretor.includes(item),
            ),
          }
        : atual,
    );
  }

  return (
    <SecaoRecolhivel
      dataSecao="config-acesso-diretores"
      titulo="Acesso dos diretores de turma"
      descricao="Limites de entrada valem para todos os perfis."
      icone={ShieldCheck}
      aberto={aberto}
      onAbertoChange={setAberto}
      resumo={
        parametros ? (
          <>
            <Selo>Palavra por {parametros.validadePalavraDias} dias</Selo>
            <Selo>
              Vê{" "}
              {parametros.categoriasDiretor
                .map((categoria) => ROTULOS_CATEGORIA_DIRETOR[categoria].toLowerCase())
                .join(", ")}
            </Selo>
          </>
        ) : undefined
      }
    >
      {carregando || !rascunho ? (
        <div className="text-muted-foreground flex min-h-24 items-center justify-center gap-2 text-sm">
          <LoaderCircle size={18} className="animate-spin" aria-hidden="true" />
          Carregando parâmetros...
        </div>
      ) : (
        <form
          className="flex flex-col gap-4"
          onSubmit={(evento) => {
            evento.preventDefault();
            void salvar();
          }}
          noValidate
        >
          <div className="grid gap-3 sm:grid-cols-2">
            {CAMPOS.map((campo) => {
              const faixa = FAIXAS_PARAMETROS[campo];
              return (
                <div key={campo} className="flex flex-col gap-1.5">
                  <Label htmlFor={`parametro-${campo}`}>{faixa.rotulo}</Label>
                  <Input
                    id={`parametro-${campo}`}
                    type="number"
                    inputMode="numeric"
                    min={faixa.minimo}
                    max={faixa.maximo}
                    value={rascunho[campo]}
                    onChange={(evento) =>
                      setRascunho((atual) =>
                        atual ? { ...atual, [campo]: evento.target.value } : atual,
                      )
                    }
                    className="h-11"
                  />
                  <p className="text-muted-foreground text-xs">
                    {faixa.unidade}, de {faixa.minimo} a {faixa.maximo}
                  </p>
                </div>
              );
            })}
          </div>
          <fieldset className="flex flex-col gap-2">
            <legend className="text-sm font-medium">O que o diretor vê</legend>
            <div className="flex flex-wrap gap-x-4 gap-y-1">
              {CATEGORIAS_DIRETOR.map((categoria) => (
                <label key={categoria} className="flex min-h-11 items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={rascunho.categoriasDiretor.includes(categoria)}
                    disabled={categoria === "faltas"}
                    onChange={(evento) => alternarCategoria(categoria, evento.target.checked)}
                    className="size-4 accent-[var(--primary)]"
                  />
                  {ROTULOS_CATEGORIA_DIRETOR[categoria]}
                </label>
              ))}
            </div>
            <p className="text-muted-foreground text-xs">
              Faltas sempre visíveis. Libere dados sensíveis apenas quando necessário.
            </p>
          </fieldset>
          {erro && <AvisoCompacto variante={erroVariante} descricao={erro} tamanho="linha" />}
          <div>
            <Button type="submit" className="h-11" disabled={salvando}>
              {salvando && <LoaderCircle size={16} className="animate-spin" />}
              Salvar parâmetros
            </Button>
          </div>
        </form>
      )}
    </SecaoRecolhivel>
  );
}
