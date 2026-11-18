// Versão do pacote e revisão implantada, lidas do ambiente de build e execução.
import pacote from "../../package.json";

export const VERSAO = pacote.version;

export const COMMIT =
  process.env.COMMIT_SHA ?? process.env.VERCEL_GIT_COMMIT_SHA ?? process.env.GIT_COMMIT ?? "local";
