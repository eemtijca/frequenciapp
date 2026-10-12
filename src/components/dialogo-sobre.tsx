"use client";

// Diálogo institucional: projeto, desenvolvimento, repositório e licença.
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
  return (
    <Dialog open={aberto} onOpenChange={onAbrir}>
      <DialogContent
        className="max-w-md"
        onCloseAutoFocus={
          onDevolverFoco
            ? (evento) => {
                evento.preventDefault();
                onDevolverFoco();
              }
            : undefined
        }
      >
        <DialogHeader>
          <DialogTitle>Sobre o FrequenciApp</DialogTitle>
          <DialogDescription>
            Aplicativo de frequência escolar da EEMTI José Cláudio de Araújo: chamada diária,
            saídas, justificativas, relatórios e indicadores.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-4 text-sm">
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
