"use client";

// Confirmação explícita de um registro de saída ou entrada antes de gravar.
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

interface Item {
  rotulo: string;
  valor: string;
}

interface Props {
  aberto: boolean;
  onAbrir: (aberto: boolean) => void;
  titulo: string;
  descricao: string;
  rotuloConfirmar: string;
  itens: Item[];
  onConfirmar: () => void;
}

export function DialogoConfirmarMovimentacao({
  aberto,
  onAbrir,
  titulo,
  descricao,
  rotuloConfirmar,
  itens,
  onConfirmar,
}: Props) {
  return (
    <AlertDialog open={aberto} onOpenChange={onAbrir}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{titulo}</AlertDialogTitle>
          <AlertDialogDescription>{descricao}</AlertDialogDescription>
        </AlertDialogHeader>
        <dl className="flex flex-col gap-2 text-sm">
          {itens
            .filter((item) => item.valor)
            .map((item) => (
              <div
                key={item.rotulo}
                className="grid grid-cols-[minmax(0,7rem)_minmax(0,1fr)] gap-2"
              >
                <dt className="text-muted-foreground">{item.rotulo}</dt>
                <dd className="min-w-0 break-words">{item.valor}</dd>
              </div>
            ))}
        </dl>
        <AlertDialogFooter>
          <AlertDialogCancel>Revisar</AlertDialogCancel>
          <AlertDialogAction className="min-h-11" onClick={onConfirmar}>
            {rotuloConfirmar}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
