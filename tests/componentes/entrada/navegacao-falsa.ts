// Substitui a navegação do Next somente na fixture de componentes.
export function useRouter() {
  return { refresh: () => {} };
}

// No navegador da fixture não há servidor Next nem inserção de HTML no SSR.
export function useServerInsertedHTML() {}
