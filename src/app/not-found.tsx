import Link from "next/link";

export default function NaoEncontrada() {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-sm flex-col items-center justify-center gap-3 px-6 text-center">
      <h1 className="text-xl font-semibold tracking-tight">Página não encontrada</h1>
      <p className="text-muted-foreground text-sm">
        O endereço acessado não existe nesta aplicação.
      </p>
      <Link
        href="/"
        className="text-primary pressionavel mt-2 rounded-lg px-4 py-2.5 text-sm font-medium hover:underline"
      >
        Voltar ao início
      </Link>
    </main>
  );
}
