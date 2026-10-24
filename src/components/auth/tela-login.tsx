"use client";

// Tela de entrada: marca e recursos no desktop, formulário único no celular.
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { CalendarCheck, DoorOpen, LoaderCircle, WifiOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CampoSenha } from "@/components/ui/campo-senha";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Logotipo } from "@/components/ui/logotipo";
import { SeletorTema } from "@/components/ui/seletor-tema";
import { AvisoCompacto, type VarianteEstado } from "@/components/ui/tela-estado";
import DialogoSobre from "@/components/dialogo-sobre";
import { pedir, corpoJson, ErroApi } from "@/lib/api-cliente";
import { avisarSucesso } from "@/lib/avisos";

const CHAVE_EMAIL = "frequenciapp:email";
const CHAVE_AVISO = "frequenciapp:aviso-entrada";

const DESTAQUES = [
  { Icone: CalendarCheck, texto: "Chamada do dia com saída por aula" },
  { Icone: DoorOpen, texto: "Saídas e entradas registradas na hora" },
  { Icone: WifiOff, texto: "Rascunho local quando a rede falha" },
];

interface Props {
  /** URL do índice para agentes de IA, montada a partir da requisição. */
  urlIndiceAgentes: string;
}

export default function TelaLogin({ urlIndiceAgentes }: Props) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [lembrar, setLembrar] = useState(true);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState("");
  const [erroVariante, setErroVariante] = useState<VarianteEstado | null>(null);
  const [avisoEntrada, setAvisoEntrada] = useState<VarianteEstado | null>(null);
  const [sobreAberto, setSobreAberto] = useState(false);

  // Preenche o e-mail lembrado neste dispositivo, se houver. O armazenamento
  // local só existe no cliente, depois da hidratação, e semear o campo durante
  // a renderização do servidor divergiria a hidratação: exceção registrada no
  // ADR 047.
  useEffect(() => {
    try {
      const salvo = window.localStorage.getItem(CHAVE_EMAIL);
      // eslint-disable-next-line react-hooks/set-state-in-effect -- leitura única do armazenamento local (ADR 047)
      if (salvo) setEmail(salvo);
    } catch {
      // Sem armazenamento local: segue sem lembrar.
    }
  }, []);

  // Aviso deixado pelo shell quando a sessão expira, mostrado uma única vez.
  // Mesma exceção da linha lembrada: consumo único do armazenamento da sessão.
  useEffect(() => {
    try {
      if (window.sessionStorage.getItem(CHAVE_AVISO) === "sessao_expirada") {
        // eslint-disable-next-line react-hooks/set-state-in-effect -- consumo único do armazenamento da sessão (ADR 047)
        setAvisoEntrada("sessao_expirada");
        window.sessionStorage.removeItem(CHAVE_AVISO);
      }
    } catch {
      // Sem armazenamento local: segue sem o aviso.
    }
  }, []);

  async function submeter(evento: React.FormEvent) {
    evento.preventDefault();
    if (enviando) return;
    setEnviando(true);
    setErro("");
    setErroVariante(null);
    try {
      await pedir<{ usuario: { nome: string } }>(
        "/api/auth/entrar",
        corpoJson({ login: email, senha, lembrar }),
      );
      try {
        if (lembrar) window.localStorage.setItem(CHAVE_EMAIL, email.trim().toLowerCase());
        else window.localStorage.removeItem(CHAVE_EMAIL);
      } catch {
        // Sem armazenamento local: o login continua.
      }
      avisarSucesso("Entrada confirmada.");
      router.refresh();
    } catch (excecao) {
      const mensagem =
        excecao instanceof ErroApi ? excecao.message : "Não foi possível entrar. Tente novamente.";
      setErro(mensagem);
      const status = excecao instanceof ErroApi ? excecao.status : 0;
      setErroVariante(status === 403 ? "conta_desativada" : status === 429 ? "limite" : null);
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div
      className="relative flex min-h-dvh flex-col lg:grid lg:grid-cols-2"
      style={{
        paddingTop: "env(safe-area-inset-top)",
        paddingBottom: "env(safe-area-inset-bottom)",
      }}
    >
      <aside className="superficie-vidro hidden flex-col items-center justify-center rounded-none border-0 border-r p-10 lg:flex xl:p-14">
        <div className="flex w-full max-w-md flex-col gap-10">
          <div className="flex flex-col items-center gap-4 text-center">
            <Logotipo tamanho={56} priority />
            <span className="text-xl font-semibold tracking-tight">FrequenciApp</span>
            <h2 className="max-w-sm text-3xl leading-tight font-semibold tracking-tight">
              A frequência da escola em um só lugar.
            </h2>
            <p className="text-muted-foreground max-w-sm text-sm leading-relaxed">
              Chamada, saídas e relatórios da equipe da escola.
            </p>
          </div>
          <ul className="flex flex-col gap-3">
            {DESTAQUES.map(({ Icone, texto }) => (
              <li
                key={texto}
                className="vidro-reflexo text-muted-foreground flex items-center gap-3 rounded-2xl border border-[var(--vidro-borda)] px-4 py-3 text-sm"
              >
                <span className="vidro-selecionado text-primary flex size-9 shrink-0 items-center justify-center rounded-xl">
                  <Icone size={17} aria-hidden="true" />
                </span>
                {texto}
              </li>
            ))}
          </ul>
        </div>
      </aside>

      <main className="flex flex-1 items-center justify-center px-4 py-10 sm:px-10">
        <div className="superficie-vidro flex w-full max-w-sm flex-col gap-6 p-6 sm:max-w-md sm:p-8">
          <div className="relative flex items-start justify-between gap-3">
            <div className="flex w-full min-w-0 flex-col items-center gap-3 text-center lg:w-auto lg:items-start lg:text-left">
              <Logotipo tamanho={48} className="lg:hidden" priority />
              <div>
                <h1 className="text-2xl font-semibold tracking-tight">FrequenciApp</h1>
                <p className="text-muted-foreground mt-1 text-sm">
                  Registro de frequência dos alunos da escola.
                </p>
              </div>
            </div>
            <SeletorTema className="absolute top-0 right-0 shrink-0 lg:static" />
          </div>

          {avisoEntrada ? <AvisoCompacto variante={avisoEntrada} tamanho="linha" /> : null}

          <form onSubmit={submeter} className="flex flex-col gap-5" noValidate>
            <div className="flex flex-col gap-2">
              <Label htmlFor="email">E-mail ou identificador</Label>
              <Input
                id="email"
                type="text"
                name="email"
                autoComplete="username"
                autoCapitalize="none"
                spellCheck={false}
                required
                value={email}
                aria-invalid={erro ? true : undefined}
                aria-describedby={erro ? "erro-entrada" : undefined}
                onChange={(evento) => {
                  setEmail(evento.target.value);
                  if (erro) setErro("");
                }}
                placeholder="pessoa@escola.br ou 3a-maria"
                className="h-12"
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="senha">Senha</Label>
              <CampoSenha
                id="senha"
                name="password"
                autoComplete="current-password"
                required
                value={senha}
                aria-invalid={erro ? true : undefined}
                aria-describedby={erro ? "erro-entrada" : undefined}
                onChange={(evento) => {
                  setSenha(evento.target.value);
                  if (erro) setErro("");
                }}
                placeholder="Sua senha de acesso"
                className="h-12"
              />
            </div>

            <label className="pressionavel flex min-h-11 cursor-pointer items-center gap-3 text-sm">
              <input
                type="checkbox"
                name="lembrar"
                checked={lembrar}
                onChange={(evento) => setLembrar(evento.target.checked)}
                className="accent-primary size-5 shrink-0"
              />
              Manter conectado neste dispositivo
            </label>

            {erro &&
              (erroVariante ? (
                <AvisoCompacto variante={erroVariante} descricao={erro} tamanho="linha" />
              ) : (
                <p
                  id="erro-entrada"
                  role="alert"
                  className="bg-falta-fraca text-falta-texto rounded-2xl px-4 py-3 text-sm"
                >
                  {erro}
                </p>
              ))}

            <Button type="submit" size="lg" className="h-12 text-base" disabled={enviando}>
              {enviando ? <LoaderCircle className="animate-spin" size={18} /> : null}
              {enviando ? "Entrando..." : "Entrar"}
            </Button>
          </form>

          <nav
            aria-label="Projeto e ferramentas"
            className="flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-xs"
          >
            <a
              href="/bi"
              target="_blank"
              rel="noopener noreferrer"
              className="text-muted-foreground hover:text-foreground underline-offset-4 hover:underline"
            >
              FrequenciBI
            </a>
            <a
              href="https://github.com/eemtijca/frequenciapp"
              target="_blank"
              rel="noopener noreferrer"
              className="text-muted-foreground hover:text-foreground underline-offset-4 hover:underline"
            >
              GitHub
            </a>
            <a
              href="/api/docs"
              target="_blank"
              rel="noopener noreferrer"
              className="text-muted-foreground hover:text-foreground underline-offset-4 hover:underline"
            >
              API
            </a>
            <button
              type="button"
              onClick={() => setSobreAberto(true)}
              className="text-muted-foreground hover:text-foreground underline-offset-4 hover:underline"
            >
              Sobre
            </button>
          </nav>

          {/* Link oculto para agentes de IA: a raiz anônima aponta o índice do projeto. */}
          <a href={urlIndiceAgentes} hidden aria-hidden="true">
            llms.txt
          </a>

          <DialogoSobre aberto={sobreAberto} onAbrir={setSobreAberto} />
        </div>
      </main>
    </div>
  );
}
