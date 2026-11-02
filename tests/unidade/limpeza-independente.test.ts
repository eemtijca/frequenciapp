import { expect, it, vi } from "vitest";
import { limparIndependentemente } from "../helpers/limpeza-independente";

it("executa todas as limpezas e preserva todos os erros", async () => {
  const primeiro = new Error("primeiro");
  const ultimo = new Error("último");
  const executadas: number[] = [];
  const fechar = vi.fn(async () => {
    executadas.push(3);
    throw ultimo;
  });
  await expect(
    limparIndependentemente([
      async () => {
        executadas.push(1);
        throw primeiro;
      },
      async () => {
        executadas.push(2);
      },
      fechar,
    ]),
  ).rejects.toMatchObject({ errors: [primeiro, ultimo] });
  expect(executadas).toEqual([1, 2, 3]);
});
