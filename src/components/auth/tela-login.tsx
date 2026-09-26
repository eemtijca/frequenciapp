"use client";

// Tela de entrada: cartão único no celular e painel institucional no desktop.
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { CalendarCheck, LoaderCircle, LockKeyhole, WifiOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CampoSenha } from "@/components/ui/campo-senha";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SeletorTema } from "@/components/ui/seletor-tema";
import { pedir, corpoJson, ErroApi } from "@/lib/api-cliente";

const CHAVE_EMAIL = "frequenciapp:email";

const DESTAQUES = [
  { Icone: CalendarCheck, texto: "Chamada do dia com saída por aula" },
  { Icone: LockKeyhole, texto: "Acesso pessoal, sem cadastro público" },
  { Icone: WifiOff, texto: "Rascunho local enquanto a rede oscila" },
];

export default function TelaLogin() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [lembrar, setLembrar] = useState(true);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState("");

  // Preenche o e-mail lembrado neste dispositivo, se houver.
  useEffect(() => {
    try {
      const salvo = window.localStorage.getItem(CHAVE_EMAIL);
      if (salvo) setEmail(salvo);
    } catch {
      // Sem armazenamento local: segue sem lembrar.
    }
  }, []);

  async function submeter(evento: React.FormEvent) {
    evento.preventDefault();
    if (enviando) return;
    setEnviando(true);
    setErro("");
    try {
      await pedir<{ usuario: { nome: string } }>(
        "/api/auth/entrar",
        corpoJson({ email, senha, lembrar }),
      );
      try {
        if (lembrar) window.localStorage.setItem(CHAVE_EMAIL, email.trim().toLowerCase());
        else window.localStorage.removeItem(CHAVE_EMAIL);
      } catch {
        // Sem armazenamento local: o login continua.
      }
      router.refresh();
    } catch (excecao) {
      const mensagem =
        excecao instanceof ErroApi ? excecao.message : "Não foi possível entrar. Tente novamente.";
      setErro(mensagem);
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
      <div className="absolute top-3 right-3 z-10">
        <SeletorTema />
      </div>

      <aside className="bg-primary text-primary-foreground hidden flex-col justify-between p-10 lg:flex xl:p-14">
        <div>
          <div className="flex items-center gap-2.5">
            <span className="bg-primary-foreground/15 flex size-10 items-center justify-center rounded-xl">
              <CalendarCheck size={20} aria-hidden="true" />
            </span>
            <span className="text-lg font-semibold tracking-tight">FrequenciApp</span>
          </div>
          <h2 className="mt-14 max-w-md text-3xl leading-tight font-semibold tracking-tight">
            A frequência da escola em um só lugar.
          </h2>
          <p className="text-primary-foreground/80 mt-4 max-w-md text-sm leading-relaxed">
            Uma chamada por turma e dia, compartilhada pela coordenação, com as saídas no meio da
            aula registradas aula a aula.
          </p>
        </div>
        <ul className="flex flex-col gap-3">
          {DESTAQUES.map(({ Icone, texto }) => (
            <li
              key={texto}
              className="text-primary-foreground/85 flex items-center gap-2.5 text-sm"
            >
              <Icone size={16} aria-hidden="true" />
              {texto}
            </li>
          ))}
        </ul>
      </aside>

      <main className="flex flex-1 items-center justify-center px-6 py-10 sm:px-10">
        <div className="flex w-full max-w-xs flex-col gap-8 sm:max-w-sm">
          <div className="flex flex-col items-center gap-3 text-center lg:items-start lg:text-left">
            <div
              className="bg-primary text-primary-foreground flex size-12 items-center justify-center rounded-xl lg:hidden"
              aria-hidden="true"
            >
              <LockKeyhole size={22} strokeWidth={1.8} />
            </div>
            <div>
              <h1 className="text-2xl font-semibold tracking-tight">FrequenciApp</h1>
              <p className="text-muted-foreground mt-1 text-sm">
                Registro de frequência dos alunos da escola.
              </p>
            </div>
          </div>

          <form onSubmit={submeter} className="flex flex-col gap-5" noValidate>
            <div className="flex flex-col gap-2">
              <Label htmlFor="email">E-mail</Label>
              <Input
                id="email"
                type="email"
                name="email"
                autoComplete="username"
                inputMode="email"
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
                placeholder="pessoa@escola.br"
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

            {erro && (
              <p
                id="erro-entrada"
                role="alert"
                className="bg-falta-fraca text-falta-texto rounded-lg px-4 py-3 text-sm"
              >
                {erro}
              </p>
            )}

            <Button type="submit" size="lg" className="h-12 text-base" disabled={enviando}>
              {enviando ? <LoaderCircle className="animate-spin" size={18} /> : null}
              {enviando ? "Entrando..." : "Entrar"}
            </Button>
          </form>

          <p className="text-muted-foreground text-center text-xs leading-relaxed lg:text-left">
            Acesso pessoal. As contas são criadas pela administração da escola e a recuperação de
            senha é feita com ela, sem cadastro público.
          </p>
        </div>
      </main>
    </div>
  );
}
