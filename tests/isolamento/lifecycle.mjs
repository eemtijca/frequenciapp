// Separa o estado dos clientes Docker do encerramento comprovado da tarefa criada.
export async function acompanharContainer(id, deps) {
  const logs = await deps.logs(id);
  if (logs.codigo !== 0 || logs.sinal)
    throw new Error(
      `Falha de acompanhamento Docker: código ${logs.codigo}, sinal ${logs.sinal ?? "nenhum"}.`,
    );
  const fim = await deps.esperar(id);
  if (fim.codigo !== 0 || fim.sinal || !/^\d+$/.test(fim.saida.trim()))
    throw new Error("Cliente Docker não comprovou o encerramento da tarefa.");
  const estado = deps.inspecionar(id).State;
  const codigo = Number(fim.saida.trim());
  if (estado?.Running !== false || !Number.isInteger(estado.ExitCode) || estado.ExitCode !== codigo)
    throw new Error("Tarefa ainda ativa ou encerramento divergente do ID criado.");
  return codigo;
}
