// Esqueleto do shell enquanto a página resolve a sessão e os dados do mês.
export default function Carregando() {
  return (
    <div className="flex min-h-dvh w-full flex-col lg:flex-row" aria-busy="true">
      <div className="border-border bg-card/40 hidden w-60 shrink-0 border-r lg:block" />
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
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
        <div className="flex flex-1 flex-col gap-4 px-4 pt-4 sm:px-6 lg:px-8">
          <div className="bg-secondary h-6 w-44 animate-pulse rounded" />
          <div className="bg-secondary h-11 w-full animate-pulse rounded-lg" />
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-secondary h-16 animate-pulse rounded-lg" />
            <div className="bg-secondary h-16 animate-pulse rounded-lg" />
          </div>
          <div className="bg-secondary h-64 w-full animate-pulse rounded-lg" />
        </div>
      </div>
    </div>
  );
}
