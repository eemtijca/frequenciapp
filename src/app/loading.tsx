// Esqueleto do shell enquanto a página resolve a sessão e os dados do mês.
export default function Carregando() {
  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-3xl flex-col" aria-busy="true">
      <div className="bg-background border-b">
        <div className="flex items-center justify-between px-4 py-3 sm:px-6">
          <div className="flex flex-col gap-1.5">
            <div className="bg-secondary h-5 w-36 animate-pulse rounded" />
            <div className="bg-secondary h-3 w-24 animate-pulse rounded" />
          </div>
          <div className="flex gap-1">
            <div className="bg-secondary size-11 animate-pulse rounded-full" />
            <div className="bg-secondary size-11 animate-pulse rounded-full" />
          </div>
        </div>
      </div>
      <div className="flex flex-1 flex-col gap-4 px-4 pt-4 sm:px-6">
        <div className="bg-secondary h-6 w-44 animate-pulse rounded" />
        <div className="bg-secondary h-11 w-full animate-pulse rounded-lg" />
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-secondary h-16 animate-pulse rounded-lg" />
          <div className="bg-secondary h-16 animate-pulse rounded-lg" />
        </div>
        <div className="bg-secondary h-64 w-full animate-pulse rounded-lg" />
      </div>
    </div>
  );
}
