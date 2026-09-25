// Prepara a suíte: garante as contas fixas e grava o estado de sessão de cada
// papel em tests/e2e/.auth, evitando repetir login e estourar o limitador.
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { request } from "@playwright/test";
import { ADMIN_E2E, COORD_E2E, garantirContasDeTeste } from "./helpers/banco";

const baseURL = process.env.TEST_BASE_URL ?? "http://localhost:3000";
const PASTA_ESTADO = path.resolve("tests/e2e/.auth");

interface Conta {
  email: string;
  senha: string;
}

async function guardarEstado(conta: Conta, arquivo: string): Promise<void> {
  const contexto = await request.newContext({ baseURL });
  try {
    const resposta = await contexto.post("/api/auth/entrar", {
      data: { email: conta.email, senha: conta.senha },
    });
    if (!resposta.ok()) {
      throw new Error(
        `Login de preparação falhou para ${conta.email} (${resposta.status()}). ` +
          "Confira o banco migrado e as contas de teste.",
      );
    }
    await contexto.storageState({ path: arquivo });
  } finally {
    await contexto.dispose();
  }
}

export default async function globalSetup(): Promise<void> {
  await garantirContasDeTeste();
  await mkdir(PASTA_ESTADO, { recursive: true });
  await guardarEstado(ADMIN_E2E, path.join(PASTA_ESTADO, "admin.json"));
  await guardarEstado(COORD_E2E, path.join(PASTA_ESTADO, "coordenacao.json"));
}
