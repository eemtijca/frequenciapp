// Endereços de página que respondem sem sessão. O proxy não autentica.
export const ROTA_PRIVACIDADE = "/privacidade";
export const ROTA_POLITICA_DE_PRIVACIDADE = "/politica-de-privacidade";

/** Redirecionamento permanente do nome alternativo para a política pública. */
export const REDIRECIONAMENTO_PRIVACIDADE = {
  source: ROTA_POLITICA_DE_PRIVACIDADE,
  destination: ROTA_PRIVACIDADE,
  permanent: true,
} as const;
