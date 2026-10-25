"use client";

// Limpeza das abas antigas de backup, com prévia, senha e proteção contra toque duplo.
import { useState } from "react";
import { pedir, corpoJson } from "@/lib/api-cliente";
import { avisarErro, avisarInfo, avisarSucesso } from "@/lib/avisos";
import { FRASE_MODO_COMPLETO } from "@/domain/planilha";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CampoSenha } from "@/components/ui/campo-senha";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { useAcoesPorChave } from "@/lib/use-acao-unica";

type Previa = { copias: string[]; planoHash: string };

export function LimparCopiasPlanilha({
  urlBase,
  onMudou,
  acoes,
}: {
  urlBase: string;
  onMudou: () => Promise<void> | void;
  acoes: ReturnType<typeof useAcoesPorChave>;
}) {
  const [previa, setPrevia] = useState<Previa | null>(null);
  const [senha, setSenha] = useState("");
  const [frase, setFrase] = useState("");
  const ocupado = acoes.chaveAtiva !== null;
  function fechar() {
    setPrevia(null);
    setSenha("");
    setFrase("");
  }
  async function conferir() {
    await acoes.executar("limpar-copias", async () => {
      try {
        const dados = await pedir<{ previa: Previa }>(`${urlBase}/limpar-copias`, corpoJson({}));
        if (!dados.previa.copias.length) avisarInfo("Nenhuma aba de backup para remover.");
        else setPrevia(dados.previa);
      } catch (erro) {
        avisarErro(erro, { contexto: "Não foi possível conferir as abas de backup." });
      }
    });
  }
  async function remover() {
    if (!previa) return;
    await acoes.executar("limpar-copias", async () => {
      try {
        const dados = await pedir<{ removidas: number }>(
          `${urlBase}/limpar-copias`,
          corpoJson({ planoHash: previa.planoHash, senha, frase }),
        );
        fechar();
        avisarSucesso(`${dados.removidas} abas de backup removidas.`);
        await onMudou();
      } catch (erro) {
        fechar();
        avisarErro(erro, { contexto: "Confira a planilha antes de tentar a limpeza novamente." });
      }
    });
  }
  return (
    <>
      <Button type="button" variant="outline" disabled={ocupado} onClick={() => void conferir()}>
        {acoes.chaveAtiva === "limpar-copias" ? "Conferindo..." : "Remover abas de backup"}
      </Button>
      <Dialog
        open={previa !== null}
        onOpenChange={(aberto) => {
          if (!aberto && !ocupado) fechar();
        }}
      >
        <DialogContent className="max-w-md" aria-describedby={`${urlBase}-limpar-aviso`}>
          <DialogHeader>
            <DialogTitle>Remover abas de backup</DialogTitle>
          </DialogHeader>
          <p id={`${urlBase}-limpar-aviso`} className="text-sm">
            {previa?.copias.length} cópias antigas serão apagadas definitivamente. As abas das
            turmas serão preservadas. Essas cópias deixarão de estar disponíveis para restauração.
          </p>
          <ul
            className="max-h-32 overflow-auto text-xs"
            aria-label="Abas de backup que serão removidas"
          >
            {previa?.copias.map((nome) => (
              <li key={nome} className="break-all">
                {nome}
              </li>
            ))}
          </ul>
          <Label htmlFor={`${urlBase}-limpar-frase`}>Digite {FRASE_MODO_COMPLETO}</Label>
          <Input
            id={`${urlBase}-limpar-frase`}
            value={frase}
            onChange={(e) => setFrase(e.target.value)}
            disabled={ocupado}
            autoComplete="off"
          />
          <Label htmlFor={`${urlBase}-limpar-senha`}>Senha do administrador</Label>
          <CampoSenha
            id={`${urlBase}-limpar-senha`}
            value={senha}
            onChange={(e) => setSenha(e.target.value)}
            disabled={ocupado}
            autoComplete="current-password"
          />
          <DialogFooter>
            <Button type="button" variant="outline" disabled={ocupado} onClick={fechar}>
              Cancelar
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={ocupado || !senha || frase.trim().toUpperCase() !== FRASE_MODO_COMPLETO}
              onClick={() => void remover()}
            >
              {ocupado ? "Removendo..." : "Remover cópias"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
