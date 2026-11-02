// Substitui a navegação do Next somente na fixture de componentes.
export function useRouter() {
  return { refresh: () => {} };
}
