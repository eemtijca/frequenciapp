"use client";

// Diálogo institucional curto: privacidade, projeto e licença.
import { useRef } from "react";
import { ShieldCheck } from "lucide-react";
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

const REPOSITORIO = "https://github.com/eemtijca/frequenciapp";

export default function DialogoSobre({ aberto, onAbrir, onDevolverFoco }: Props) {
  const focoAnterior = useRef<HTMLElement | null>(null);
  return (
    <Dialog open={aberto} onOpenChange={onAbrir}>
      <DialogContent
        className="max-w-lg"
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
          <div className="flex items-center gap-3">
            <Logotipo tamanho={40} />
            <div>
              <DialogTitle>Sobre o FrequenciApp</DialogTitle>
              <DialogDescription>EEMTI José Cláudio de Araújo</DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="flex flex-col gap-4 text-sm">
          <section aria-labelledby="sobre-privacidade" className="superficie-vidro space-y-2 p-4">
            <h2 id="sobre-privacidade" className="flex items-center gap-2 font-medium">
              <ShieldCheck aria-hidden="true" className="text-primary size-5 shrink-0" />
              Privacidade
            </h2>
            <p>Dados de alunos restritos à equipe da escola. Tratamento conforme a LGPD.</p>
            <a
              href={`${REPOSITORIO}/blob/main/docs/lgpd.md`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary inline-flex min-h-11 items-center underline-offset-4 hover:underline"
            >
              Como os dados são tratados
            </a>
          </section>

          <section aria-labelledby="sobre-projeto" className="space-y-2">
            <h2 id="sobre-projeto" className="font-medium">
              Projeto
            </h2>
            <p className="text-muted-foreground">Código aberto mantido pela equipe da escola.</p>
            <p>
              <a
                href={REPOSITORIO}
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary underline-offset-4 hover:underline"
              >
                Repositório no GitHub
              </a>
            </p>
            <p className="text-muted-foreground">
              Desenvolvido por{" "}
              {DESENVOLVEDORES.map(({ nome, url }, indice) => (
                <span key={url}>
                  {indice > 0 ? " e " : ""}
                  <a
                    href={url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-foreground underline-offset-4 hover:underline"
                  >
                    {nome}
                  </a>
                </span>
              ))}
              .
            </p>
          </section>

          <section aria-labelledby="sobre-licenca" className="space-y-2">
            <h2 id="sobre-licenca" className="font-medium">
              Licença
            </h2>
            <p className="text-muted-foreground">
              MIT. O texto completo está no arquivo LICENSE do repositório.
            </p>
          </section>
        </div>
      </DialogContent>
    </Dialog>
  );
}
