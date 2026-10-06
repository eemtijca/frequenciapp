// Contrato da automação do schema de preview usada pelo workflow e pelos testes.
export function nomeDoSchema(pr: number | string | undefined): string;
export function emailDaConta(pr: number | string): string;
export function schemasParaRemover(existentes: string[], abertos: number[]): string[];
