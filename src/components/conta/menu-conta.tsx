"use client";

// Menu flutuante da conta: perfil, notificações, senha, Sobre e saída.
import { useRef, useState } from "react";
import { Bell, ChevronUp, Info, KeyRound, LogOut } from "lucide-react";
import type { Identidade } from "@/domain/usuarios";
import { rotuloDePapel } from "@/domain/usuarios";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { SeletorTema } from "@/components/ui/seletor-tema";

export type AcaoConta = "notificacoes" | "senha" | "sobre" | "sair";

interface Props {
  usuario: Identidade;
  movel: boolean;
  saindo: boolean;
  onAcao: (acao: AcaoConta, gatilho: HTMLButtonElement | null) => void;
}

function Item({
  icone: Icone,
  rotulo,
  onClick,
  disabled,
}: {
  icone: typeof Bell;
  rotulo: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      disabled={disabled}
      onClick={onClick}
      className="pressionavel focus-visible:ring-ring/50 hover:bg-secondary flex min-h-11 w-full items-center gap-2.5 rounded-xl px-2.5 text-left text-sm font-medium transition-colors focus-visible:ring-2 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50"
    >
      <Icone size={17} className="text-muted-foreground shrink-0" aria-hidden="true" />
      <span className="min-w-0 truncate">{rotulo}</span>
    </button>
  );
}

export function MenuConta({ usuario, movel, saindo, onAcao }: Props) {
  const [aberto, setAberto] = useState(false);
  const conteudoRef = useRef<HTMLDivElement>(null);
  const gatilhoRef = useRef<HTMLButtonElement | null>(null);

  function acionar(acao: AcaoConta) {
    setAberto(false);
    onAcao(acao, gatilhoRef.current);
  }

  return (
    <Popover open={aberto} onOpenChange={setAberto}>
      <PopoverTrigger asChild>
        <button
          ref={gatilhoRef}
          type="button"
          aria-haspopup="menu"
          aria-label={`Conta de ${usuario.nome}`}
          className="pressionavel focus-visible:ring-ring/50 hover:bg-secondary flex min-h-12 w-full items-center gap-2.5 rounded-2xl px-2 py-1.5 text-left transition-colors focus-visible:ring-2 focus-visible:outline-none"
        >
          <span className="selecionado flex size-10 shrink-0 items-center justify-center rounded-full">
            <span className="text-sm font-semibold" aria-hidden="true">
              {usuario.nome.slice(0, 1).toUpperCase()}
            </span>
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-medium">{usuario.nome}</span>
            <span className="text-muted-foreground block truncate text-xs">
              {rotuloDePapel(usuario.papel)}
            </span>
          </span>
          <ChevronUp size={16} className="text-muted-foreground shrink-0" aria-hidden="true" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        side="top"
        align="start"
        collisionPadding={8}
        className="w-[min(17rem,calc(100vw-1.5rem))] p-1.5"
        onOpenAutoFocus={(evento) => {
          evento.preventDefault();
          conteudoRef.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus();
        }}
      >
        <div
          ref={conteudoRef}
          role="menu"
          aria-label="Conta"
          className="flex flex-col gap-0.5"
          onKeyDown={(evento) => {
            if (evento.key !== "ArrowDown" && evento.key !== "ArrowUp") return;
            const itens = [
              ...(conteudoRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? []),
            ];
            if (itens.length === 0) return;
            evento.preventDefault();
            const atual = itens.indexOf(document.activeElement as HTMLElement);
            const delta = evento.key === "ArrowDown" ? 1 : -1;
            const proximo = (atual + delta + itens.length) % itens.length;
            itens[proximo]?.focus();
          }}
        >
          <div className="text-muted-foreground truncate border-b px-2.5 py-2 text-xs">
            {movel ? "Conta" : usuario.email}
          </div>
          {!movel && (
            <div className="flex items-center justify-between gap-2 px-2.5 py-1.5">
              <span className="text-sm font-medium">Tema</span>
              <SeletorTema />
            </div>
          )}
          <Item icone={Bell} rotulo="Notificações" onClick={() => acionar("notificacoes")} />
          <Item icone={KeyRound} rotulo="Trocar senha" onClick={() => acionar("senha")} />
          <Item icone={Info} rotulo="Sobre" onClick={() => acionar("sobre")} />
          <div className="border-t pt-0.5">
            <Item
              icone={LogOut}
              rotulo={saindo ? "Saindo..." : "Sair da conta"}
              onClick={() => acionar("sair")}
              disabled={saindo}
            />
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
