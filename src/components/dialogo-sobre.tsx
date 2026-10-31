"use client";

// Diálogo institucional: privacidade, projeto e licença em cartões, com folha no celular.
import { useRef } from "react";
import { Check, ExternalLink, GitBranch, Scale, ShieldCheck } from "lucide-react";
import pacote from "../../package.json";
import { Logotipo } from "@/components/ui/logotipo";
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

const SALVAGUARDAS = [
  "Acesso por conta e permissão.",
  "Registro de operações administrativas.",
  "Integrações opcionais sob controle da gestão.",
];

const REPOSITORIO = "https://github.com/eemtijca/frequenciapp";
const TITULO_CARTAO = "flex items-center gap-2 text-base font-semibold";
const ACAO =
  "controle pressionavel flex min-h-11 w-full items-center justify-between gap-3 px-3 py-2 text-sm font-medium underline-offset-4 hover:underline";
const CHIP =
  "controle pressionavel inline-flex min-h-11 items-center gap-1.5 px-3 text-sm font-medium";

export default function DialogoSobre({ aberto, onAbrir, onDevolverFoco }: Props) {
  const focoAnterior = useRef<HTMLElement | null>(null);
  return (
    <Dialog open={aberto} onOpenChange={onAbrir}>
      <DialogContent
        folha
        className="flex max-h-[90dvh] flex-col gap-0 overflow-hidden p-0 sm:max-w-xl"
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
        <DialogHeader className="bg-secondary/40 border-b px-5 py-4 pr-16 text-left sm:px-6 sm:pr-16">
          <div className="flex items-center gap-3">
            <Logotipo tamanho={48} />
            <div className="min-w-0">
              <DialogTitle className="text-lg sm:text-xl">Sobre o FrequenciApp</DialogTitle>
              <DialogDescription>EEMTI José Cláudio de Araújo</DialogDescription>
              <p className="text-muted-foreground mt-0.5 text-xs">
                Chamada, movimentações e indicadores da escola.
              </p>
            </div>
          </div>
        </DialogHeader>

        <div className="flex flex-1 flex-col gap-4 overflow-y-auto overscroll-contain px-5 py-5 text-sm sm:px-6">
          <section
            aria-labelledby="sobre-privacidade"
            className="superficie border-primary/30 space-y-3 p-4 sm:p-5"
          >
            <h2 id="sobre-privacidade" className={TITULO_CARTAO}>
              <ShieldCheck aria-hidden="true" className="text-primary size-5 shrink-0" />
              Privacidade e LGPD
            </h2>
            <p className="leading-relaxed">
              Dados de alunos restritos à equipe da escola, com tratamento conforme a LGPD.
            </p>
            <ul className="text-muted-foreground flex flex-col gap-2 leading-relaxed">
              {SALVAGUARDAS.map((texto) => (
                <li key={texto} className="flex items-start gap-2">
                  <Check size={15} aria-hidden="true" className="text-primary mt-0.5 shrink-0" />
                  <span>{texto}</span>
                </li>
              ))}
            </ul>
            <p className="text-muted-foreground text-xs leading-relaxed">
              Solicitações de dados: gestão da escola.
            </p>
            <a
              href={`${REPOSITORIO}/blob/main/docs/lgpd.md`}
              target="_blank"
              rel="noopener noreferrer"
              className={`${ACAO} text-primary`}
            >
              Como os dados são tratados
              <ExternalLink size={14} aria-hidden="true" className="shrink-0" />
            </a>
          </section>

          <section aria-labelledby="sobre-projeto" className="superficie space-y-3 p-4 sm:p-5">
            <h2 id="sobre-projeto" className={TITULO_CARTAO}>
              <GitBranch aria-hidden="true" className="text-primary size-5 shrink-0" />
              Projeto
            </h2>
            <p className="text-muted-foreground leading-relaxed">
              Código aberto mantido pela equipe da escola.
            </p>
            <a
              href={REPOSITORIO}
              target="_blank"
              rel="noopener noreferrer"
              className={`${ACAO} text-primary`}
            >
              Repositório no GitHub
              <ExternalLink size={14} aria-hidden="true" className="shrink-0" />
            </a>
            <div className="space-y-2">
              <p className="text-muted-foreground text-xs font-medium">Desenvolvedores</p>
              <div className="flex flex-wrap gap-2">
                {DESENVOLVEDORES.map(({ nome, url }) => (
                  <a
                    key={url}
                    href={url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={`${CHIP} text-foreground`}
                  >
                    {nome}
                    <ExternalLink
                      size={13}
                      aria-hidden="true"
                      className="text-muted-foreground shrink-0"
                    />
                  </a>
                ))}
              </div>
            </div>
          </section>

          <section aria-labelledby="sobre-licenca" className="superficie space-y-3 p-4 sm:p-5">
            <h2 id="sobre-licenca" className={TITULO_CARTAO}>
              <Scale aria-hidden="true" className="text-primary size-5 shrink-0" />
              Licença
            </h2>
            <p className="text-muted-foreground flex flex-wrap items-center gap-2 leading-relaxed">
              <span className="border-border bg-secondary/60 inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium">
                MIT
              </span>
              Texto completo no repositório.
            </p>
            <a
              href={`${REPOSITORIO}/blob/main/LICENSE`}
              target="_blank"
              rel="noopener noreferrer"
              className={`${ACAO} text-primary`}
            >
              Ler a licença
              <ExternalLink size={14} aria-hidden="true" className="shrink-0" />
            </a>
          </section>

          <footer className="text-muted-foreground flex flex-wrap items-center justify-between gap-2 border-t pt-4 text-xs">
            <span>Versão {pacote.version}</span>
            <span>Código aberto</span>
          </footer>
        </div>
      </DialogContent>
    </Dialog>
  );
}
