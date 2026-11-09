// Restringe operações de contêiner a receitas locais e persiste identidade antes da partida.
import { randomBytes } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import {
  validarReceitaPostgres,
  normalizarPostgres,
  consultarIdentidadePostgres,
} from "./postgres-nativo.mjs";

function validarReceita(s, rodada, imagens) {
  if (imagens[s?.Image]?.perfil === "postgres-nativo") {
    validarReceitaPostgres(s, rodada, imagens[s.Image]);
    return;
  }
  const chaves = (obj, lista) =>
    obj && isDeepStrictEqual(Object.keys(obj).sort(), [...lista].sort());
  const h = s?.HostConfig;
  if (
    !/^[a-f0-9]{32}$/.test(rodada) ||
    !chaves(s, ["Image", "Cmd", "Env", "Labels", "HostConfig"]) ||
    !/^sha256:[a-f0-9]{64}$/.test(s.Image) ||
    !Object.hasOwn(imagens, s.Image) ||
    !isDeepStrictEqual(imagens[s.Image].volumes, []) ||
    !isDeepStrictEqual(s.Cmd, ["postgres"]) ||
    !isDeepStrictEqual(s.Env, ["POSTGRES_DB=sintetico"]) ||
    !isDeepStrictEqual(s.Labels, {
      "br.frequenciapp.isolamento": rodada,
      "br.frequenciapp.isolamento.tipo": "banco",
    }) ||
    !chaves(h, [
      "NetworkMode",
      "CapDrop",
      "SecurityOpt",
      "Memory",
      "NanoCpus",
      "PidsLimit",
      "LogConfig",
    ]) ||
    h.NetworkMode !== "none" ||
    !isDeepStrictEqual(h.CapDrop, ["ALL"]) ||
    !isDeepStrictEqual(h.SecurityOpt, ["no-new-privileges:true"]) ||
    !Number.isSafeInteger(h.Memory) ||
    h.Memory < 16777216 ||
    h.Memory > 536870912 ||
    !Number.isSafeInteger(h.NanoCpus) ||
    h.NanoCpus < 1 ||
    h.NanoCpus > 1000000000 ||
    !Number.isSafeInteger(h.PidsLimit) ||
    h.PidsLimit < 1 ||
    h.PidsLimit > 128 ||
    !isDeepStrictEqual(h.LogConfig, {
      Type: "local",
      Config: { "max-size": "1m", "max-file": "1" },
    })
  )
    throw new Error("Receita administrativa não autorizada.");
}

const VARIANTES = Object.freeze({
  consultarIdentidade: [
    "psql",
    "--no-psqlrc",
    "--set=ON_ERROR_STOP=1",
    "--dbname=sintetico",
    "--command=SELECT current_database(), current_user",
  ],
  dump: ["pg_dump", "--format=custom", "--dbname=sintetico"],
  restaurar: ["pg_restore", "--exit-on-error", "--dbname=sintetico"],
});
function validarResultado(r) {
  if (
    !r ||
    r.grupoEncerrado !== true ||
    ![null, "SIGTERM", "SIGINT", "SIGHUP", "SIGPIPE", "SIGKILL"].includes(r.sinal) ||
    !(
      (r.codigo === null && r.sinal !== null) ||
      (Number.isInteger(r.codigo) && r.codigo >= 0 && r.codigo <= 255 && r.sinal === null)
    )
  )
    throw new Error("Processos sem conclusão confirmada.");
  return { codigo: r.codigo, sinal: r.sinal, grupoEncerrado: true };
}

export function criarBarreiraEngine({
  rodada,
  receitas,
  imagens,
  persistir,
  requisitar: cliente,
  supervisionar,
  prazoMs = 5000,
}) {
  if (!Number.isInteger(prazoMs) || prazoMs < 1 || prazoMs > 60000)
    throw new Error("Prazo administrativo inválido.");
  async function limitado(promessa) {
    let timer;
    try {
      return await Promise.race([
        promessa,
        new Promise((_, rejeitar) => {
          timer = setTimeout(
            () => rejeitar(new Error("Prazo do cliente administrativo excedido.")),
            prazoMs,
          );
          timer.unref();
        }),
      ]);
    } finally {
      clearTimeout(timer);
    }
  }
  const requisitar = (...args) => limitado(cliente(...args));
  const planos = structuredClone(receitas);
  for (const spec of Object.values(planos)) validarReceita(spec, rodada, imagens);
  const recursos = new Map();
  const slots = new Set();
  let fechado = false;
  function recurso(handle) {
    const r = recursos.get(handle);
    if (!r) throw new Error("Handle administrativo desconhecido.");
    return r;
  }
  async function registrar(r, estado) {
    await persistir({
      handle: r.handle,
      slot: r.slot,
      id: r.id,
      tipo: "container",
      rodada,
      estado,
      especificacao: structuredClone(r.spec),
    });
    r.estado = estado;
  }
  async function inspecionar(r) {
    const raw = await requisitar("GET", `/containers/${r.id}/json`);
    const imagem = imagens[r.spec.Image];
    const info =
      imagem.perfil === "postgres-nativo" ? normalizarPostgres(raw, r.spec, imagem, r.id) : raw;
    if (
      !info ||
      info.Id !== r.id ||
      !isDeepStrictEqual(info.Config, r.spec) ||
      !isDeepStrictEqual(info.HostConfig, r.spec.HostConfig) ||
      !isDeepStrictEqual(info.Mounts, []) ||
      typeof info.State?.Running !== "boolean" ||
      !Number.isInteger(info.State.ExitCode)
    ) {
      throw new Error("Ownership ou especificação divergente.");
    }
    return { ...info.State, info };
  }
  async function exclusivo(r, acao) {
    if (r.ocupado) throw new Error("Recurso ocupado.");
    r.ocupado = true;
    try {
      return await acao();
    } finally {
      r.ocupado = false;
    }
  }
  const gate = {
    async atender(metodo, caminho, corpo) {
      if (fechado) throw new Error("Requisição após encerramento.");
      if (metodo === "POST" && caminho === "/containers/create") {
        const candidatos = Object.entries(planos).filter(([, spec]) =>
          isDeepStrictEqual(spec, corpo),
        );
        if (candidatos.length !== 1) throw new Error("Requisição fora da receita.");
        const handle = await gate.criar(candidatos[0][0]);
        return { Id: recurso(handle).id };
      }
      const rota =
        typeof caminho === "string" &&
        /^\/containers\/([a-f0-9]{64})\/(json|start|stop)$/.exec(caminho);
      const r = rota && [...recursos.values()].find((atual) => atual.id === rota[1]);
      if (!r || corpo !== undefined) throw new Error("Requisição administrativa não autorizada.");
      if (metodo === "GET" && rota[2] === "json") return (await inspecionar(r)).info;
      if (metodo === "POST" && rota[2] === "start") return gate.iniciar(r.handle);
      if (metodo === "POST" && rota[2] === "stop") return gate.parar(r.handle);
      throw new Error("Requisição administrativa não autorizada.");
    },
    async criar(slot, signal) {
      if (fechado || signal?.aborted || slots.has(slot) || !Object.hasOwn(planos, slot))
        throw new Error("Slot indisponível.");
      slots.add(slot);
      const r = {
        handle: randomBytes(16).toString("hex"),
        slot,
        spec: planos[slot],
        id: null,
        estado: "intencao",
        ocupado: false,
        execs: new Set(),
      };
      recursos.set(r.handle, r);
      return exclusivo(r, async () => {
        await registrar(r, "intencao");
        // Antes do envio, fechamento revoga a autorização sem criar efeito remoto incerto.
        if (fechado || signal?.aborted) throw new Error("Criação após encerramento.");
        try {
          const resposta = await requisitar("POST", "/containers/create", structuredClone(r.spec));
          if (!/^[a-f0-9]{64}$/.test(resposta?.Id ?? ""))
            throw new Error("Criação sem identidade confirmada.");
          r.id = resposta.Id;
          await registrar(r, "criacao-confirmada");
          if ((await inspecionar(r)).Running) throw new Error("Criação não está parada.");
          await registrar(r, "inspecionado");
          // Um efeito já enviado continua rastreável, mas não publica sucesso após fechar.
          if (fechado || signal?.aborted) throw new Error("Criação após encerramento.");
          return r.handle;
        } catch (erro) {
          r.estado = "incerto";
          try {
            await registrar(r, "incerto");
          } catch {
            /* A intenção já persistida mantém o resíduo rastreável. */
          }
          throw erro;
        }
      });
    },
    async iniciar(handle, signal) {
      const r = recurso(handle);
      return exclusivo(r, async () => {
        if (fechado || signal?.aborted || !["inspecionado", "parado"].includes(r.estado))
          throw new Error("Partida não autorizada.");
        if ((await inspecionar(r)).Running) throw new Error("Estado de partida divergente.");
        if (fechado || signal?.aborted || !["inspecionado", "parado"].includes(r.estado))
          throw new Error("Partida não autorizada.");
        try {
          await requisitar("POST", `/containers/${r.id}/start`);
          if (!(await inspecionar(r)).Running) throw new Error("Partida não confirmada.");
          await registrar(r, "iniciado");
          if (fechado || signal?.aborted) throw new Error("Partida após revogação.");
        } catch (erro) {
          r.estado = "incerto";
          try {
            await registrar(r, "incerto");
          } catch {
            /* O ID e a fase anterior persistidos preservam a rastreabilidade. */
          }
          throw erro;
        }
      });
    },
    async consultar(handle) {
      const r = recurso(handle);
      const estado = await inspecionar(r);
      return { estado: estado.Running ? "iniciado" : "parado", codigo: estado.ExitCode };
    },
    async parar(handle) {
      const r = recurso(handle);
      return exclusivo(r, async () => {
        if (r.execs.size) throw new Error("Execução ainda ativa.");
        if (!["inspecionado", "iniciado", "parado"].includes(r.estado))
          throw new Error("Parada não autorizada.");
        const estado = await inspecionar(r);
        try {
          if (estado.Running) await requisitar("POST", `/containers/${r.id}/stop`);
          if ((await inspecionar(r)).Running) throw new Error("Parada não confirmada.");
          await registrar(r, "parado");
        } catch (erro) {
          r.estado = "incerto";
          try {
            await registrar(r, "incerto");
          } catch {
            /* O ID e a fase anterior persistidos preservam a rastreabilidade. */
          }
          throw erro;
        }
      });
    },
    async consultarPrimeiraIdentidade(handle, persistirExec, signal) {
      const r = recurso(handle);
      if (
        fechado ||
        r.ocupado ||
        r.execs.size ||
        r.estado !== "iniciado" ||
        imagens[r.spec.Image]?.perfil !== "postgres-nativo" ||
        typeof persistirExec !== "function"
      )
        throw new Error("Consulta nativa não autorizada.");
      return exclusivo(r, async () => {
        const token = {};
        r.execs.add(token);
        const autorizar = () => {
          if (fechado || signal?.aborted || r.estado !== "iniciado")
            throw new Error("Consulta nativa não autorizada.");
        };
        try {
          const identidade = await consultarIdentidadePostgres({
            id: r.id,
            spec: structuredClone(r.spec),
            requisitar,
            signal,
            autorizar,
            persistir: persistirExec,
            conferir: async () => {
              autorizar();
              const estado = await inspecionar(r);
              autorizar();
              if (!estado.Running) throw new Error("Consulta sem estado nativo confirmado.");
            },
          });
          r.execs.delete(token);
          return identidade;
        } catch (erro) {
          r.estado = "incerto";
          try {
            await registrar(r, "incerto");
          } catch {
            /* A intenção e o exec já persistidos preservam o resíduo. */
          }
          throw erro;
        }
      });
    },
    async executar(handle, variante, entrada, signal) {
      const r = recurso(handle);
      // A prova nativa não autoriza o supervisor genérico de dumps, restauração ou sessão.
      if (imagens[r.spec.Image]?.perfil === "postgres-nativo")
        throw new Error("Exec genérico nativo fechado.");
      if (
        fechado ||
        r.ocupado ||
        signal.aborted ||
        !Object.hasOwn(VARIANTES, variante) ||
        typeof supervisionar !== "function" ||
        r.estado !== "iniciado"
      )
        throw new Error("Execução não autorizada.");
      const token = {};
      r.execs.add(token);
      let enviado = false;
      try {
        if (
          !(await inspecionar(r)).Running ||
          fechado ||
          r.ocupado ||
          r.estado !== "iniciado" ||
          signal.aborted
        )
          throw new Error("Execução sem estado confirmado.");
        enviado = true;
        const exec = await limitado(
          supervisionar({ id: r.id, argv: [...VARIANTES[variante]], entrada, signal }),
        );
        const resultado = limitado(Promise.resolve(exec.resultado))
          .then(validarResultado)
          .then((valor) => {
            r.execs.delete(token);
            return valor;
          });
        resultado.catch(() => {
          r.estado = "incerto";
        });
        let cancelamento;
        return {
          stdout: exec.stdout,
          stderr: exec.stderr,
          resultado,
          cancelar: () => {
            cancelamento ??= (async () => {
              const recibo = validarResultado(await limitado(exec.cancelar()));
              if (!isDeepStrictEqual(recibo, await resultado))
                throw new Error("Cancelamento divergente.");
              return recibo;
            })().catch((erro) => {
              r.estado = "incerto";
              throw erro;
            });
            return cancelamento;
          },
        };
      } catch (erro) {
        if (enviado) r.estado = "incerto";
        else r.execs.delete(token);
        throw erro;
      }
    },
    async encerrar(coletar) {
      fechado = true;
      const resultado = { removidos: [], preservados: [], falhas: [] };
      try {
        await coletar();
      } catch {
        resultado.falhas.push("coleta");
        resultado.preservados.push(...recursos.keys());
        return resultado;
      }
      for (const r of recursos.values()) {
        if (r.estado === "ausencia-confirmada") continue;
        try {
          await gate.parar(r.handle);
          await exclusivo(r, async () => {
            await inspecionar(r);
            await requisitar("DELETE", `/containers/${r.id}`);
            await registrar(r, "removido");
            if ((await requisitar("GET", `/containers/${r.id}/json`)) !== null)
              throw new Error("Ausência não confirmada.");
            await registrar(r, "ausencia-confirmada");
          });
          resultado.removidos.push(r.handle);
        } catch {
          resultado.preservados.push(r.handle);
          resultado.falhas.push("recurso");
        }
      }
      return resultado;
    },
    inventario() {
      return [...recursos.values()].map(({ handle, slot, estado }) => ({ handle, slot, estado }));
    },
  };
  return Object.freeze(gate);
}
