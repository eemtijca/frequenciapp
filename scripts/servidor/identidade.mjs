// Reduz a configuração efetiva a uma identidade operacional sem segredos.
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync, lstatSync } from "node:fs";
import { pathToFileURL } from "node:url";

export function identidadeCompose(config, daemon, containers, parametros) {
  const { projeto, app, db } = parametros;
  if (!/^[a-z0-9][a-z0-9_-]*$/.test(projeto ?? "") || config.name !== projeto) {
    throw new Error("Projeto Compose explícito diverge da configuração efetiva.");
  }
  if (
    typeof daemon.ID !== "string" ||
    !daemon.ID ||
    !config.services?.[app] ||
    !config.services?.[db]
  ) {
    throw new Error("Daemon ou serviços não identificados.");
  }
  const recursos = [app, db].map((servico) => {
    const candidatos = containers.filter(
      (c) => c.Config?.Labels?.["com.docker.compose.service"] === servico,
    );
    if (candidatos.length !== 1)
      throw new Error("Serviço ausente ou ambíguo; adoção precisa ser explícita.");
    const container = candidatos[0];
    if (
      container.Config.Labels["com.docker.compose.project"] !== projeto ||
      !Array.isArray(container.Mounts)
    ) {
      throw new Error("Labels ou mounts não correspondem ao projeto.");
    }
    const mounts = container.Mounts.map((m) => {
      if (!["volume", "bind", "tmpfs"].includes(m.Type) || typeof m.Destination !== "string") {
        throw new Error("Mount sem identidade suportada.");
      }
      if (m.Type !== "tmpfs" && (typeof m.Source !== "string" || !m.Source)) {
        throw new Error("Mount sem origem verificável.");
      }
      return { tipo: m.Type, origem: m.Source ?? "", nome: m.Name ?? "", destino: m.Destination };
    }).sort((a, b) => a.destino.localeCompare(b.destino));
    const declarados = config.services[servico].volumes ?? [];
    for (const v of declarados) {
      const mount = mounts.find((m) => m.destino === v.target);
      const origem = v.type === "volume" ? config.volumes?.[v.source]?.name : v.source;
      if (
        !mount ||
        mount.tipo !== v.type ||
        !origem ||
        (v.type === "volume" ? mount.nome !== origem : mount.origem !== origem)
      ) {
        throw new Error("Configuração de armazenamento diverge dos recursos existentes.");
      }
    }
    if (servico === db && (!declarados.length || !mounts.some((m) => m.tipo !== "tmpfs"))) {
      throw new Error("Banco sem armazenamento persistente identificável.");
    }
    return { servico, mounts, declarados };
  });
  const banco = recursos[1];
  const chave = createHash("sha256")
    .update(JSON.stringify({ daemon: daemon.ID, mounts: banco.mounts }))
    .digest("hex");
  return { versao: 1, daemon: daemon.ID, projeto, recursos, chave };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const [acao, registro] = process.argv.slice(2);
    const entrada = JSON.parse(readFileSync(0, "utf8"));
    const identidade = identidadeCompose(
      entrada.config,
      entrada.daemon,
      entrada.containers,
      entrada.parametros,
    );
    if (acao === "adotar") {
      try {
        lstatSync(registro);
        throw new Error("Identidade já existe; revisar divergência sem sobrescrever.");
      } catch (erro) {
        if (erro.code !== "ENOENT") throw erro;
      }
      writeFileSync(registro, JSON.stringify(identidade) + "\n", { mode: 0o600, flag: "wx" });
    } else if (acao === "conferir") {
      const stat = lstatSync(registro);
      if (!stat.isFile() || stat.isSymbolicLink() || (stat.mode & 0o037) !== 0) {
        throw new Error("Registro de identidade precisa ser arquivo privado regular.");
      }
      const anterior = JSON.parse(readFileSync(registro, "utf8"));
      if (JSON.stringify(anterior) !== JSON.stringify(identidade)) {
        throw new Error("Identidade efetiva mudou; nenhuma adoção automática é permitida.");
      }
    } else {
      throw new Error("Ação de identidade inválida.");
    }
    process.stdout.write(identidade.chave);
  } catch (erro) {
    console.error(`[identidade] ${erro instanceof Error ? erro.message : "validação falhou"}`);
    process.exitCode = 1;
  }
}
