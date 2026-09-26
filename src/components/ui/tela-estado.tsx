"use client";

// Telas e avisos de estado: mensagens padronizadas para códigos e situações.
import { useEffect, useRef } from "react";
import Link from "next/link";
import {
  CloudOff,
  FileQuestion,
  Hourglass,
  KeyRound,
  Lock,
  RefreshCw,
  ServerCrash,
  TriangleAlert,
  UserX,
  WifiOff,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type VarianteEstado =
  | "nao_encontrado"
  | "erro_interno"
  | "indisponivel"
  | "dados_invalidos"
  | "sessao_expirada"
  | "sem_permissao"
  | "conta_desativada"
  | "limite"
  | "conflito"
  | "offline";

type Tom = "neutro" | "aviso" | "perigo";

interface Preset {
  icone: typeof FileQuestion;
  titulo: string;
  descricao: string;
  tom: Tom;
}

const PRESETS: Record<VarianteEstado, Preset> = {
  nao_encontrado: {
    icone: FileQuestion,
    titulo: "Página não encontrada",
    descricao: "O endereço pode estar errado ou a página foi movida.",
    tom: "neutro",
  },
  erro_interno: {
    icone: ServerCrash,
    titulo: "Algo saiu do esperado",
    descricao: "Não foi possível carregar a tela. Tente novamente em instantes.",
    tom: "perigo",
  },
  indisponivel: {
    icone: CloudOff,
    titulo: "Serviço indisponível",
    descricao: "Não foi possível falar com os dados da escola. Tente de novo em instantes.",
    tom: "aviso",
  },
  dados_invalidos: {
    icone: TriangleAlert,
    titulo: "Confira os dados",
    descricao: "Ajuste o que foi indicado e tente de novo.",
    tom: "perigo",
  },
  sessao_expirada: {
    icone: KeyRound,
    titulo: "Sessão expirada",
    descricao: "Por segurança, entre novamente para continuar.",
    tom: "aviso",
  },
  sem_permissao: {
    icone: Lock,
    titulo: "Acesso restrito",
    descricao: "Sua conta não tem permissão para esta área.",
    tom: "perigo",
  },
  conta_desativada: {
    icone: UserX,
    titulo: "Conta desativada",
    descricao: "A administração desativou esta conta. Procure a direção da escola.",
    tom: "perigo",
  },
  limite: {
    icone: Hourglass,
    titulo: "Muitas tentativas",
    descricao: "Aguarde alguns minutos antes de tentar de novo.",
    tom: "aviso",
  },
  conflito: {
    icone: RefreshCw,
    titulo: "A chamada foi salva em outro aparelho",
    descricao: "Revise as marcações e salve de novo.",
    tom: "aviso",
  },
  offline: {
    icone: WifiOff,
    titulo: "Sem conexão",
    descricao: "Verifique a internet. As marcações na tela não se perdem.",
    tom: "aviso",
  },
};

const TONS: Record<Tom, string> = {
  neutro: "bg-secondary text-muted-foreground",
  aviso: "bg-accent text-accent-foreground",
  perigo: "bg-falta-fraca text-falta-texto",
};

export interface AcaoEstado {
  rotulo: string;
  onClick?: () => void;
  href?: string;
}

function BotaoAcao({ acao, secundaria }: { acao: AcaoEstado; secundaria?: boolean }) {
  const variante = secundaria ? "outline" : "default";
  if (acao.href) {
    return (
      <Button asChild variant={variante} className="h-11 rounded-lg">
        <Link href={acao.href}>{acao.rotulo}</Link>
      </Button>
    );
  }
  return (
    <Button variant={variante} className="h-11 rounded-lg" onClick={acao.onClick}>
      {acao.rotulo}
    </Button>
  );
}

interface TelaEstadoProps {
  variante: VarianteEstado;
  titulo?: string;
  descricao?: React.ReactNode;
  /** Código HTTP discreto, por exemplo 404 ou 500. */
  codigo?: number;
  /** Referência técnica para o suporte localizar o erro no log. */
  referencia?: string;
  acao?: AcaoEstado;
  acaoSecundaria?: AcaoEstado;
  /** Sem tela cheia, para uso dentro do shell. */
  incorporado?: boolean;
  children?: React.ReactNode;
}

export function TelaEstado({
  variante,
  titulo,
  descricao,
  codigo,
  referencia,
  acao,
  acaoSecundaria,
  incorporado,
  children,
}: TelaEstadoProps) {
  const preset = PRESETS[variante];
  const Icone = preset.icone;
  const tituloRef = useRef<HTMLHeadingElement>(null);
  const papel = preset.tom === "perigo" ? "alert" : "status";

  useEffect(() => {
    if (!incorporado) tituloRef.current?.focus();
  }, [incorporado]);

  const conteudo = (
    <>
      <span
        className={cn("flex size-14 items-center justify-center rounded-xl", TONS[preset.tom])}
        aria-hidden="true"
      >
        <Icone size={26} strokeWidth={1.9} />
      </span>
      {codigo ? (
        <span className="text-muted-foreground mt-3 rounded-md border px-2 py-0.5 font-mono text-[11px] font-semibold">
          Erro {codigo}
        </span>
      ) : null}
      <h1
        ref={tituloRef}
        tabIndex={-1}
        className="mt-3 text-xl font-semibold tracking-tight outline-none"
      >
        {titulo ?? preset.titulo}
      </h1>
      <p className="text-muted-foreground mt-2 max-w-md text-sm leading-relaxed">
        {descricao ?? preset.descricao}
      </p>
      {referencia ? (
        <p className="text-muted-foreground mt-2 font-mono text-[11px]">
          Referência para suporte: {referencia}
        </p>
      ) : null}
      {children ? <div className="mt-5 w-full max-w-md text-left">{children}</div> : null}
      {acao || acaoSecundaria ? (
        <div className="mt-5 flex flex-wrap justify-center gap-2">
          {acao ? <BotaoAcao acao={acao} /> : null}
          {acaoSecundaria ? <BotaoAcao acao={acaoSecundaria} secundaria /> : null}
        </div>
      ) : null}
    </>
  );

  const classes = incorporado
    ? "mx-auto flex max-w-xl flex-col items-center px-4 py-10 text-center"
    : "flex min-h-dvh flex-col items-center justify-center px-6 py-16 text-center";

  if (incorporado) {
    return (
      <div className={classes} role={papel}>
        {conteudo}
      </div>
    );
  }
  return (
    <main className={classes} role={papel}>
      {conteudo}
    </main>
  );
}

interface AvisoCompactoProps {
  variante: VarianteEstado;
  titulo?: string;
  descricao?: React.ReactNode;
  acao?: AcaoEstado;
  /** Bloco com ícone e ações, ou linha para diálogos e formulários. */
  tamanho?: "bloco" | "linha";
  className?: string;
}

export function AvisoCompacto({
  variante,
  titulo,
  descricao,
  acao,
  tamanho = "bloco",
  className,
}: AvisoCompactoProps) {
  const preset = PRESETS[variante];
  const Icone = preset.icone;
  const papel = preset.tom === "perigo" ? "alert" : "status";
  const texto = descricao ?? preset.descricao;

  if (tamanho === "linha") {
    return (
      <div
        role={papel}
        className={cn(
          "flex items-start gap-2.5 rounded-lg px-3 py-2 text-sm",
          TONS[preset.tom],
          className,
        )}
      >
        <Icone size={16} className="mt-0.5 shrink-0" aria-hidden="true" />
        <span className="min-w-0">
          <span className="font-medium">{titulo ?? preset.titulo}</span>
          {texto ? <span className="block text-xs opacity-90">{texto}</span> : null}
        </span>
      </div>
    );
  }

  return (
    <div role={papel} className={cn("bg-card rounded-lg border p-5 text-center", className)}>
      <span
        className={cn(
          "mx-auto flex size-10 items-center justify-center rounded-lg",
          TONS[preset.tom],
        )}
        aria-hidden="true"
      >
        <Icone size={20} strokeWidth={1.9} />
      </span>
      <p className="mt-3 font-medium">{titulo ?? preset.titulo}</p>
      <p className="text-muted-foreground mt-1 text-sm">{texto}</p>
      {acao ? (
        <div className="mt-4 flex justify-center">
          <BotaoAcao acao={acao} />
        </div>
      ) : null}
    </div>
  );
}
