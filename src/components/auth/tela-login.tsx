"use client";

// Tela de entrada: cartão único, sem ruído, foco no formulário.
import { useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "motion/react";
import { LoaderCircle, LockKeyhole } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { pedir, corpoJson, ErroApi } from "@/lib/api-cliente";

export default function TelaLogin() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState("");

  async function submeter(evento: React.FormEvent) {
    evento.preventDefault();
    if (enviando) return;
    setEnviando(true);
    setErro("");
    try {
      await pedir<{ usuario: { nome: string } }>("/api/auth/entrar", corpoJson({ email, senha }));
      router.refresh();
    } catch (excecao) {
      const mensagem =
        excecao instanceof ErroApi ? excecao.message : "Não foi possível entrar. Tente novamente.";
      setErro(mensagem);
      setEnviando(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-sm flex-col justify-center px-6 py-10">
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
        className="flex flex-col gap-8"
      >
        <div className="flex flex-col items-center gap-3 text-center">
          <div
            className="bg-primary text-primary-foreground flex size-12 items-center justify-center rounded-xl"
            aria-hidden="true"
          >
            <LockKeyhole size={22} strokeWidth={1.8} />
          </div>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">FrequenciApp</h1>
            <p className="text-muted-foreground mt-1 text-sm">
              Registro de frequência dos seus alunos.
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
              required
              value={email}
              onChange={(evento) => setEmail(evento.target.value)}
              placeholder="professor@escola.br"
              className="h-12"
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="senha">Senha</Label>
            <Input
              id="senha"
              type="password"
              name="password"
              autoComplete="current-password"
              required
              value={senha}
              onChange={(evento) => setSenha(evento.target.value)}
              placeholder="Sua senha de acesso"
              className="h-12"
            />
          </div>

          {erro && (
            <motion.p
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.18 }}
              role="alert"
              className="bg-falta-fraca text-falta-texto rounded-lg px-4 py-3 text-sm"
            >
              {erro}
            </motion.p>
          )}

          <Button type="submit" size="lg" className="h-12 text-base" disabled={enviando}>
            {enviando ? <LoaderCircle className="animate-spin" size={18} /> : null}
            {enviando ? "Entrando..." : "Entrar"}
          </Button>
        </form>

        <p className="text-muted-foreground text-center text-xs leading-relaxed">
          Acesso pessoal. As contas são criadas pelo administrador da escola, sem cadastro público.
        </p>
      </motion.div>
    </main>
  );
}
