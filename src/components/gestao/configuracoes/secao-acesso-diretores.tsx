"use client";

// Parâmetros de acesso no rascunho: validade da palavra-chave, sessão do
// diretor, limites de tentativa, o que o diretor vê e o limite de risco.
import { useState } from "react";
import { ShieldCheck } from "lucide-react";
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

const CAMPOS = Object.keys(FAIXAS_PARAMETROS) as ParametroNumerico[];

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
      descricao="Limites de entrada valem para todos os perfis."
      icone={ShieldCheck}
      aberto={aberto}
      onAbertoChange={setAberto}
      resumo={
        <>
          <Selo>Palavra por {parametros.validadePalavraDias} dias</Selo>
          <Selo>
            Vê{" "}
            {parametros.categoriasDiretor
              .map((categoria) => ROTULOS_CATEGORIA_DIRETOR[categoria].toLowerCase())
              .join(", ")}
          </Selo>
        </>
      }
    >
      <form
        className="flex flex-col gap-4"
        onSubmit={(evento) => evento.preventDefault()}
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
                  value={textos[campo] ?? String(parametros[campo])}
                  onChange={(evento) => alterarNumero(campo, evento.target.value)}
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
        </fieldset>
        {erro && <AvisoCompacto variante="dados_invalidos" descricao={erro} tamanho="linha" />}
        <p className="text-muted-foreground text-xs">
          As alterações entram no rascunho e valem ao salvar as configurações.
        </p>
      </form>
    </SecaoRecolhivel>
  );
}
