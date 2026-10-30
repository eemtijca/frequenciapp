"use client";

// Parâmetros de acesso no rascunho: validade da palavra-chave, sessão do
// diretor, limites de tentativa, o que o diretor vê e o limite de risco.
import { useState } from "react";
import { Clock, Eye, LockKeyhole, ShieldCheck } from "lucide-react";
import {
  CATEGORIAS_DIRETOR,
  FAIXAS_PARAMETROS,
  ROTULOS_CATEGORIA_DIRETOR,
  type CategoriaDiretor,
  type ParametroNumerico,
  type ParametrosAcesso,
} from "@/domain/diretores";
import { AvisoCompacto } from "@/components/ui/tela-estado";
import { SecaoRecolhivel } from "@/components/ui/secao-recolhivel";
import { Selo } from "@/components/ui/selo";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const GRUPOS = [
  {
    titulo: "Sessão e validade",
    icone: Clock,
    campos: ["validadePalavraDias", "sessaoDiretorHoras"],
  },
  {
    titulo: "Segurança da entrada",
    icone: LockKeyhole,
    campos: ["tentativasPorOrigem", "tentativasPorLogin", "janelaMinutos"],
  },
] as const;

export default function SecaoAcessoDiretores({
  parametros,
  onMudar,
}: {
  parametros: ParametrosAcesso;
  onMudar: (parametros: ParametrosAcesso) => void;
}) {
  const [aberto, setAberto] = useState(false);
  const [textos, setTextos] = useState<Partial<Record<ParametroNumerico, string>>>({});
  const [erro, setErro] = useState("");
  const [parametrosAnteriores, setParametrosAnteriores] = useState(parametros);

  if (parametrosAnteriores !== parametros) {
    setParametrosAnteriores(parametros);
    setTextos({});
    setErro("");
  }

  function alterarNumero(campo: ParametroNumerico, valor: string) {
    const faixa = FAIXAS_PARAMETROS[campo];
    const numero = Number(valor);
    if (
      valor.trim() === "" ||
      !/^\d+$/.test(valor) ||
      !Number.isInteger(numero) ||
      numero < faixa.minimo ||
      numero > faixa.maximo
    ) {
      setTextos((atual) => ({ ...atual, [campo]: valor }));
      setErro(`${faixa.rotulo}: informe um número inteiro de ${faixa.minimo} a ${faixa.maximo}.`);
      return;
    }
    setTextos((atual) => {
      const proximo = { ...atual };
      delete proximo[campo];
      return proximo;
    });
    setErro("");
    onMudar({ ...parametros, [campo]: numero });
  }

  function alternarCategoria(categoria: CategoriaDiretor, marcada: boolean) {
    const categorias = CATEGORIAS_DIRETOR.filter((item) =>
      item === categoria ? marcada : parametros.categoriasDiretor.includes(item),
    );
    onMudar({ ...parametros, categoriasDiretor: categorias });
  }

  return (
    <SecaoRecolhivel
      dataSecao="config-acesso-diretores"
      titulo="Acesso dos diretores de turma"
      icone={ShieldCheck}
      aberto={aberto}
      onAbertoChange={setAberto}
      resumo={
        <>
          <Selo>Palavra por {parametros.validadePalavraDias} dias</Selo>
          <Selo>
            {parametros.categoriasDiretor.length}{" "}
            {parametros.categoriasDiretor.length === 1
              ? "categoria visível"
              : "categorias visíveis"}
          </Selo>
        </>
      }
    >
      <form
        className="flex flex-col gap-4"
        onSubmit={(evento) => evento.preventDefault()}
        noValidate
      >
        {GRUPOS.map(({ titulo, icone: Icone, campos }) => (
          <fieldset key={titulo} className="rounded-xl border p-3">
            <legend className="flex items-center gap-2 px-1 text-sm font-medium">
              <Icone size={16} aria-hidden="true" /> {titulo}
            </legend>
            {titulo === "Segurança da entrada" && (
              <p className="text-muted-foreground mb-3 text-xs">Limites para todos os perfis.</p>
            )}
            <div className="grid gap-3 sm:grid-cols-2">
              {campos.map((campo) => {
                const faixa = FAIXAS_PARAMETROS[campo];
                return (
                  <div key={campo} className="flex min-w-0 flex-col gap-1.5">
                    <Label htmlFor={`parametro-${campo}`}>{faixa.rotulo}</Label>
                    <Input
                      id={`parametro-${campo}`}
                      type="number"
                      inputMode="numeric"
                      min={faixa.minimo}
                      max={faixa.maximo}
                      value={textos[campo] ?? String(parametros[campo])}
                      onChange={(evento) => alterarNumero(campo, evento.target.value)}
                      aria-describedby={`parametro-${campo}-limites`}
                      className="h-11"
                    />
                    <p id={`parametro-${campo}-limites`} className="text-muted-foreground text-xs">
                      {faixa.unidade} · {faixa.minimo} a {faixa.maximo}
                    </p>
                  </div>
                );
              })}
            </div>
          </fieldset>
        ))}
        <fieldset className="flex flex-col gap-3 rounded-xl border p-3">
          <legend className="flex items-center gap-2 px-1 text-sm font-medium">
            <Eye size={16} aria-hidden="true" /> O que o diretor vê
          </legend>
          <div className="grid gap-2 sm:grid-cols-2">
            {CATEGORIAS_DIRETOR.map((categoria) => (
              <label
                key={categoria}
                className="bg-muted/40 flex min-h-11 items-center gap-2 rounded-lg px-3 py-2 text-sm"
              >
                <input
                  type="checkbox"
                  checked={parametros.categoriasDiretor.includes(categoria)}
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
          <div className="flex flex-col gap-1.5 border-t pt-3">
            <Label htmlFor="parametro-limiteRiscoPercentual">
              {FAIXAS_PARAMETROS.limiteRiscoPercentual.rotulo}
            </Label>
            <Input
              id="parametro-limiteRiscoPercentual"
              type="number"
              inputMode="numeric"
              min={FAIXAS_PARAMETROS.limiteRiscoPercentual.minimo}
              max={FAIXAS_PARAMETROS.limiteRiscoPercentual.maximo}
              value={textos.limiteRiscoPercentual ?? String(parametros.limiteRiscoPercentual)}
              onChange={(evento) => alterarNumero("limiteRiscoPercentual", evento.target.value)}
              aria-describedby="parametro-risco-limites"
              className="h-11 sm:max-w-48"
            />
            <p id="parametro-risco-limites" className="text-muted-foreground text-xs">
              De {FAIXAS_PARAMETROS.limiteRiscoPercentual.minimo} a{" "}
              {FAIXAS_PARAMETROS.limiteRiscoPercentual.maximo}% dos dias com chamada.
            </p>
          </div>
        </fieldset>
        {erro && <AvisoCompacto variante="dados_invalidos" descricao={erro} tamanho="linha" />}
      </form>
    </SecaoRecolhivel>
  );
}
