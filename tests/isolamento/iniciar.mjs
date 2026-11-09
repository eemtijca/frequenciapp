// Provisiona apenas o banco vazio atestado e encerra o servidor em qualquer saída.
import { spawn } from "node:child_process";
import { closeSync, openSync } from "node:fs";
import { setTimeout as esperar } from "node:timers/promises";
import net from "node:net";
import pg from "pg";
import { exigirIsolamento, verificarIsolamento, conferirBanco } from "../helpers/isolamento.mjs";

const prova = exigirIsolamento();
const comando = process.argv.slice(2);
if (!comando.length) throw new Error("Comando de teste ausente.");
let servidor;
let tarefa;
let interrompido = false;
for (const sinal of ["SIGINT", "SIGTERM"])
  process.once(sinal, () => {
    interrompido = true;
    tarefa?.kill(sinal);
    servidor?.kill(sinal);
  });
function executar(programa, argumentos, env = process.env) {
  return new Promise((resolve, reject) => {
    tarefa = spawn(programa, argumentos, { stdio: "inherit", env });
    tarefa.once("error", reject);
    tarefa.once("exit", (codigo, sinal) => {
      tarefa = undefined;
      if (codigo === 0) resolve();
      else reject(new Error(`Comando de teste encerrou com ${codigo ?? sinal}.`));
    });
  });
}
async function bancoVazio() {
  for (let tentativa = 0; tentativa < 60; tentativa++) {
    if (interrompido) throw new Error("Execução interrompida.");
    const cliente = new pg.Client({
      connectionString: prova.databaseUrl,
      connectionTimeoutMillis: 1000,
    });
    try {
      try {
        await cliente.connect();
      } catch (erro) {
        if (!["ECONNREFUSED", "57P03", "ETIMEDOUT"].includes(erro.code)) throw erro;
        await esperar(500);
        continue;
      }
      const { rows } =
        await cliente.query(`select current_database() as banco, current_user as papel,
        (select count(*)::int from pg_class c join pg_namespace n on n.oid=c.relnamespace
        where n.nspname='public' and c.relkind in ('r','p','v','m','S','f')) as objetos`);
      if (
        rows[0]?.banco !== `ft_${prova.rodada}` ||
        rows[0]?.papel !== `ft_${prova.rodada}` ||
        rows[0]?.objetos !== 0
      )
        throw new Error("Banco descartável não está vazio ou tem identidade divergente.");
      return;
    } finally {
      await cliente.end();
    }
  }
  throw new Error("PostgreSQL descartável não ficou disponível.");
}
let erroOriginal;
try {
  if (!/^\d+\.\d+\.\d+\.\d+$/.test(prova.ipCanario)) throw new Error("Canário sintético ausente.");
  await new Promise((resolve, reject) => {
    const socket = net.connect({ host: prova.ipCanario, port: 4001 });
    socket.setTimeout(1000, () => {
      socket.destroy();
      reject(new Error("Perímetro sem recusa de rota."));
    });
    socket.once("connect", () => {
      socket.destroy();
      reject(new Error("Canário vizinho alcançável."));
    });
    socket.once("error", (erro) => {
      if (erro.code === "ENETUNREACH") resolve();
      else reject(erro);
    });
  });
  process.stdout.write("[isolamento] canário vizinho recusado por ausência de rota.\n");
  await bancoVazio();
  await executar("node", ["docker/app/migrar.mjs"]);
  const banco = new pg.Client({ connectionString: prova.databaseUrl });
  try {
    await banco.connect();
    await banco.query("create table public._frequenciapp_isolamento (marcador text primary key)");
    await banco.query("insert into public._frequenciapp_isolamento values ($1)", [prova.marcador]);
    await conferirBanco(banco, prova);
  } finally {
    await banco.end();
  }
  const log = openSync("/run/frequenciapp-isolamento/runtime.log", "w", 0o600);
  try {
    servidor = spawn(
      "node",
      ["--import", "./tests/helpers/redirecionar-google.mjs", "tests/isolamento/runtime.mjs"],
      { stdio: ["ignore", log, log], env: { ...process.env, NODE_ENV: "production" } },
    );
  } finally {
    closeSync(log);
  }
  let falhaRuntime;
  servidor.once("error", (erro) => {
    falhaRuntime = erro;
  });
  servidor.once("exit", () => {
    falhaRuntime = new Error("Runtime de teste encerrou antes da suíte.");
  });
  let validado = false;
  for (let tentativa = 0; tentativa < 60; tentativa++) {
    if (falhaRuntime || interrompido) throw falhaRuntime ?? new Error("Execução interrompida.");
    try {
      await verificarIsolamento();
      validado = true;
      break;
    } catch {
      await esperar(500);
    }
  }
  if (!validado) throw new Error("Runtime e banco não comprovaram a mesma identidade.");
  process.stdout.write("[isolamento] runtime HTTP e banco migrado da mesma rodada comprovados.\n");
  await executar("node", ["tests/isolamento/negativos.mjs"]);
  await executar("node", ["scripts/administracao/criar-admin.mjs", "--somente-criar"], {
    ...process.env,
    ADMIN_EMAIL: "direcao@escola.exemplo",
    ADMIN_SENHA: "DirecaoFrequencia2026",
    ADMIN_NOME: "Direção",
  });
  await executar("node", ["scripts/administracao/criar-coordenacao.mjs"], {
    ...process.env,
    CONTA_EMAIL: "demo@escola.exemplo",
    CONTA_SENHA: "DemoFrequencia2026",
    CONTA_NOME: "Demo",
  });
  await verificarIsolamento();
  await executar(comando[0], comando.slice(1));
} catch (erro) {
  erroOriginal = erro;
  process.exitCode = 1;
  console.error(erro.message);
} finally {
  if (servidor && servidor.exitCode === null) {
    servidor.kill("SIGTERM");
    await Promise.race([new Promise((resolve) => servidor.once("exit", resolve)), esperar(5000)]);
    if (servidor.exitCode === null) servidor.kill("SIGKILL");
  }
  if (interrompido && !erroOriginal) process.exitCode = 130;
}
