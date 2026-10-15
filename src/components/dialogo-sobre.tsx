"use client";

// Diálogo institucional: proteção de dados, projeto, desenvolvimento e licença.
import { useRef } from "react";
import { ShieldCheck } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface Props {
  aberto: boolean;
  onAbrir: (aberto: boolean) => void;
  onDevolverFoco?: () => void;
}

const DESENVOLVEDORES = [
  { nome: "Emanuel Lázaro", url: "https://github.com/emanuellcs" },
  { nome: "Prof. Josué Cavalcante", url: "https://github.com/wolf9611" },
];

const REPOSITORIO = "https://github.com/eemtijca/frequenciapp";

export default function DialogoSobre({ aberto, onAbrir, onDevolverFoco }: Props) {
  const focoAnterior = useRef<HTMLElement | null>(null);
  return (
    <Dialog open={aberto} onOpenChange={onAbrir}>
      <DialogContent
        className="max-w-md"
        onOpenAutoFocus={() => {
          focoAnterior.current =
            document.activeElement instanceof HTMLElement ? document.activeElement : null;
        }}
        onCloseAutoFocus={(evento) => {
          if (onDevolverFoco) {
            evento.preventDefault();
            onDevolverFoco();
          } else if (focoAnterior.current?.isConnected) {
            evento.preventDefault();
            focoAnterior.current.focus({ preventScroll: true });
          }
        }}
      >
        <DialogHeader>
          <DialogTitle>Sobre o FrequenciApp</DialogTitle>
          <DialogDescription>
            Aplicativo de frequência escolar da EEMTI José Cláudio de Araújo: chamada diária,
            saídas, justificativas, relatórios e indicadores.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-4 text-sm">
          <section
            aria-labelledby="sobre-protecao-dados"
            className="superficie-vidro space-y-3 p-4"
          >
            <h2 id="sobre-protecao-dados" className="flex items-center gap-2 font-medium">
              <ShieldCheck aria-hidden="true" className="text-primary size-5 shrink-0" />
              Proteção de dados e LGPD
            </h2>
            <p className="leading-relaxed">
              O FrequenciApp adota medidas rigorosas de proteção de dados para apoiar o cumprimento
              da Lei Geral de Proteção de Dados (LGPD).
            </p>
            <p className="leading-relaxed">
              Uso institucional aprovado pela escola, com documento de consentimento assinado e
              verificado por assinatura gov.br.
            </p>
            <ul className="text-muted-foreground list-disc space-y-1 pl-4">
              <li>Acesso restrito por conta e permissão.</li>
              <li>Controle de alterações e registro de operações administrativas.</li>
              <li>Compartilhamento nas integrações sob controle da gestão.</li>
            </ul>
            <p className="text-muted-foreground text-xs leading-relaxed">
              Dúvidas e solicitações de acesso ou correção de dados pessoais devem ser encaminhadas
              à gestão da escola.
            </p>
            <a
              href={`${REPOSITORIO}/blob/main/docs/lgpd.md`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary inline-flex min-h-11 items-center underline-offset-4 hover:underline"
            >
              Como os dados são tratados
            </a>
          </section>
          <div className="flex flex-col gap-1.5">
            <p className="font-medium">Desenvolvimento</p>
            <ul className="flex flex-col gap-1">
              {DESENVOLVEDORES.map(({ nome, url }) => (
                <li key={url}>
                  <a
                    href={url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="underline-offset-4 hover:underline"
                  >
                    {nome}
                  </a>
                </li>
              ))}
            </ul>
          </div>
          <p>
            <a
              href={REPOSITORIO}
              target="_blank"
              rel="noopener noreferrer"
              className="underline-offset-4 hover:underline"
            >
              Repositório do projeto no GitHub
            </a>
          </p>
          <p className="text-muted-foreground text-xs leading-relaxed">
            Código aberto sob a licença MIT, mantido pela equipe do FrequenciApp na EEMTI José
            Cláudio de Araújo.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
