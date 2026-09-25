"use client";

// Configurações de recursos da escola e cópia de segurança em JSON.
// Restrita à administração, com auditoria no servidor.
import { useRef, useState } from "react";
import { Download, LoaderCircle, Upload } from "lucide-react";
import { toast } from "sonner";
import type { Configuracoes } from "@/domain/frequencia";
import { corpoAlteracao, corpoJson, ErroApi, pedir } from "@/lib/api-cliente";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
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

interface Props {
  configuracoes: Configuracoes;
  diaCorrente: string;
  onMudanca: (configuracoes: Configuracoes) => void;
}

interface ResultadoImportacao {
  adicionadas: number;
  identicas: number;
  conflitos: number;
}

const LIMITE_ARQUIVO = 25 * 1024 * 1024;

export default function AbaConfiguracoes({ configuracoes, diaCorrente, onMudanca }: Props) {
  const [salvando, setSalvando] = useState<"frequenciaPorAula" | "saidaAntecipada" | null>(null);
  const [erro, setErro] = useState("");
  const [baixando, setBaixando] = useState(false);
  const [importando, setImportando] = useState(false);
  const [resultado, setResultado] = useState<ResultadoImportacao | null>(null);
  const arquivoRef = useRef<HTMLInputElement | null>(null);

  async function alternar(chave: "frequenciaPorAula" | "saidaAntecipada", valor: boolean) {
    setSalvando(chave);
    setErro("");
    try {
      const dados = await pedir<{ configuracoes: Configuracoes }>(
        "/api/configuracoes",
        corpoAlteracao("PATCH", { [chave]: valor }),
      );
      onMudanca(dados.configuracoes);
      toast.success(
        chave === "frequenciaPorAula"
          ? valor
            ? "Chamada por aula ativada."
            : "Chamada por aula desativada."
          : valor
            ? "Saída antecipada ativada."
            : "Saída antecipada desativada.",
      );
    } catch (excecao) {
      setErro(
        excecao instanceof ErroApi ? excecao.message : "Não foi possível salvar a configuração.",
      );
    } finally {
      setSalvando(null);
    }
  }

  async function baixarCopia() {
    setBaixando(true);
    setErro("");
    try {
      const dados = await pedir<unknown>("/api/backup");
      const conteudo = JSON.stringify(dados, null, 2);
      const blob = new Blob([conteudo], { type: "application/json;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `frequenciapp-copia-${diaCorrente}.json`;
      document.body.append(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 60000);
      toast.success("Cópia preparada. Confira o download no navegador.");
    } catch (excecao) {
      setErro(excecao instanceof ErroApi ? excecao.message : "Não foi possível gerar a cópia.");
    } finally {
      setBaixando(false);
    }
  }

  async function importar(arquivo: File) {
    setImportando(true);
    setErro("");
    setResultado(null);
    try {
      if (arquivo.size > LIMITE_ARQUIVO) {
        throw new Error("A cópia é muito grande. Use um arquivo de até 25 MB.");
      }
      let corpo: unknown;
      try {
        corpo = JSON.parse(await arquivo.text());
      } catch {
        throw new Error("Não foi possível ler a cópia. Selecione o arquivo JSON correto.");
      }
      const dados = await pedir<ResultadoImportacao>("/api/backup", corpoJson(corpo));
      setResultado(dados);
      toast.success("Importação concluída.");
    } catch (excecao) {
      setErro(excecao instanceof ErroApi ? excecao.message : (excecao as Error).message);
    } finally {
      setImportando(false);
      if (arquivoRef.current) arquivoRef.current.value = "";
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="bg-card flex flex-col gap-4 rounded-lg border p-4">
        <div>
          <h2 className="font-medium">Recursos</h2>
          <p className="text-muted-foreground text-sm">
            O que estiver desligado continua preservado nos dados e pode ser religado depois.
          </p>
        </div>

        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <Label htmlFor="config-frequencia-aula">Chamada por aula</Label>
            <p className="text-muted-foreground text-xs leading-relaxed">
              Com o recurso ligado, a Chamada registra falta por aula, a Grade mostra a marca S e a
              gestão de aulas volta a valer. Desligado, a chamada é única por dia.
            </p>
          </div>
          <Switch
            id="config-frequencia-aula"
            checked={configuracoes.frequenciaPorAula}
            disabled={salvando !== null}
            onCheckedChange={(valor) => void alternar("frequenciaPorAula", valor)}
          />
        </div>

        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <Label htmlFor="config-saida-antecipada">Saída antecipada</Label>
            <p className="text-muted-foreground text-xs leading-relaxed">
              Mostra a área Saiu mais cedo, com registro, saídas do dia e relatório semanal.
              Desligado, os registros existentes continuam preservados nos relatórios.
            </p>
          </div>
          <Switch
            id="config-saida-antecipada"
            checked={configuracoes.saidaAntecipada}
            disabled={salvando !== null}
            onCheckedChange={(valor) => void alternar("saidaAntecipada", valor)}
          />
        </div>

        {erro && (
          <p role="alert" className="bg-falta-fraca text-falta-texto rounded-lg px-4 py-3 text-sm">
            {erro}
          </p>
        )}
      </div>

      <div className="bg-card flex flex-col gap-3 rounded-lg border p-4">
        <div>
          <h2 className="font-medium">Cópia de segurança</h2>
          <p className="text-muted-foreground text-sm">
            A cópia reúne séries, turmas, aulas, alunos, frequências e saídas em um arquivo JSON. A
            importação adiciona o que falta e nunca sobrescreve o que já existe.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            className="h-11 rounded-lg"
            onClick={() => void baixarCopia()}
            disabled={baixando || importando}
          >
            {baixando ? (
              <LoaderCircle size={16} className="animate-spin" />
            ) : (
              <Download size={16} />
            )}
            Baixar cópia
          </Button>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button
                type="button"
                variant="outline"
                className="h-11 rounded-lg"
                disabled={importando}
              >
                {importando ? (
                  <LoaderCircle size={16} className="animate-spin" />
                ) : (
                  <Upload size={16} />
                )}
                Importar cópia
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Importar cópia?</AlertDialogTitle>
                <AlertDialogDescription>
                  O arquivo é mesclado ao banco: registros que já existem são mantidos e apenas os
                  que faltam são adicionados. Confira o resultado depois da importação.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancelar</AlertDialogCancel>
                <AlertDialogAction onClick={() => arquivoRef.current?.click()}>
                  Escolher arquivo
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
          <input
            ref={arquivoRef}
            type="file"
            accept=".json,application/json"
            hidden
            onChange={(evento) => {
              const arquivo = evento.target.files?.[0];
              if (arquivo) void importar(arquivo);
            }}
          />
        </div>
        {resultado && (
          <p role="status" className="bg-secondary/60 rounded-lg px-4 py-3 text-sm">
            {resultado.adicionadas}{" "}
            {resultado.adicionadas === 1 ? "registro adicionado" : "registros adicionados"},{" "}
            {resultado.identicas} {resultado.identicas === 1 ? "já era igual" : "já eram iguais"} e{" "}
            {resultado.conflitos}{" "}
            {resultado.conflitos === 1 ? "conflito mantido" : "conflitos mantidos"}.
          </p>
        )}
      </div>
    </div>
  );
}
