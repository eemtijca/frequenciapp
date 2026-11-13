// Delega a reconfiguração restrita do perfil adotado antes de qualquer etapa mutante.
import fs from "node:fs";
import path from "node:path";
import { rotinasPrevistas } from "./passos/ambiente.mjs";
import { acao, executarEtapa, falha } from "./passos/contexto.mjs";

const escolhas = new Set([
  "--agenda-habilitada",
  "--agenda-notificacoes",
  "--agenda-planilhas",
  "--agenda-indicadores",
  "--backup-planilhas-habilitado",
]);
const comuns = new Set([
  "--config",
  "--relatorio",
  "--arquivo-log",
  "--perfil",
  "--adotar-cron-sha256",
]);
function recusar(mensagem) {
  throw falha("E_CONTROLADOR", mensagem, {
    dica: "Use apenas escolhas de rotinas; outras mudanças exigem adoção administrativa separada.",
    documentacao: "docs/controlador-manutencao.md",
  });
}
export function reconfigurarControlador(ctx, simular = false) {
  if (ctx.estadoInvalido || ctx.estado?.controlador?.readocaoPendente)
    recusar("O estado do controlador exige revisão antes da reconfiguração.");
  const info = fs.lstatSync(ctx.caminhos.controladorPerfil);
  if (!info.isFile() || info.isSymbolicLink() || info.size > 4 * 1024 * 1024)
    recusar("O perfil adotado precisa ser um arquivo regular protegido.");
  const p = JSON.parse(fs.readFileSync(ctx.caminhos.controladorPerfil, "utf8"));
  const caminhoConfig = path.join(p.config, "instalador.json");
  const anterior = fs.existsSync(caminhoConfig)
    ? JSON.parse(fs.readFileSync(caminhoConfig, "utf8"))
    : {};
  for (const [flag, valor] of ctx.opcoes.valores) {
    if (escolhas.has(flag) || comuns.has(flag)) continue;
    const campo = flag.slice(2).replace(/-([a-z])/g, (_, letra) => letra.toUpperCase());
    if (ctx.opcoes.origem?.get(flag) === "config" && String(anterior[campo]) === String(valor))
      continue;
    if (flag === "--operador-controlador" && valor === p.operador) continue;
    if (flag === "--canal" && valor === ctx.estado?.canal) continue;
    if (flag === "--diretorio-fonte" && ctx.caminhos.appDir === p.app) continue;
    recusar(`O controlador adotado não permite alterar ${flag} junto das rotinas.`);
  }
  for (const flag of ctx.opcoes.booleanas) {
    if (
      ![
        "--json",
        "--sim",
        "--retomar",
        "--simular",
        "--modo-teste",
        "--nao-interativo",
        "--sem-cor",
        "--silencioso",
        "--verboso",
      ].includes(flag)
    )
      recusar(`A opção ${flag} não se aplica à reconfiguração adotada.`);
  }
  if (
    p.app !== ctx.caminhos.appDir ||
    p.config !== ctx.caminhos.configDir ||
    p.prefixo !== ctx.caminhos.controladorPrefixo
  )
    recusar("Os caminhos solicitados divergem do perfil adotado.");
  if (!simular && !ctx.sim) recusar("A reconfiguração do controlador exige --sim.");
  const rotinas = rotinasPrevistas(ctx);
  const seletores = {
    AGENDA_HABILITADA: String(rotinas.agenda),
    AGENDA_NOTIFICACOES: String(rotinas.notificacoes),
    AGENDA_PLANILHAS: String(rotinas.planilhas),
    AGENDA_INDICADORES: String(rotinas.indicadores),
    BACKUP_PLANILHAS_HABILITADO: String(rotinas.backupPlanilhas),
  };
  const input = JSON.stringify({
    seletores,
    destino: path.dirname(path.dirname(ctx.caminhos.cronFrequenciapp)),
  });
  const argumentos = [
    path.join(ctx.raizRepositorio, "scripts/servidor/controlador/cli.mjs"),
    "reconfigurar-rotinas",
    ctx.caminhos.controladorPerfil,
  ];
  if (ctx.configuracao.adotarCronSha256 !== undefined)
    argumentos.push("--adotar-cron-sha256", ctx.configuracao.adotarCronSha256);
  const executar = (fase) => {
    const r = executarEtapa(ctx, process.execPath, [...argumentos, fase], {
      input,
      timeout: 600000,
    });
    if (r.status !== 0 || r.erro)
      recusar("A reconfiguração das rotinas estáveis do controlador falhou.");
    let dados;
    try {
      dados = JSON.parse(r.stdout);
    } catch {
      recusar("O controlador não confirmou a reconfiguração das rotinas.");
    }
    if (JSON.stringify(dados.seletores) !== JSON.stringify(seletores))
      recusar("Os seletores confirmados divergem do pedido.");
    return dados;
  };
  const plano = executar("--plano");
  let confirmado = plano;
  if (!simular) {
    confirmado = executar("--confirmar");
    if (executar("--plano").semMudancas !== true)
      recusar("As rotinas não conferem depois da publicação.");
  }
  return {
    estado: simular ? "pendente" : "concluida",
    avisos: [],
    acoes: [
      acao(
        "Reconfigura somente os seletores e o cron do controlador sob a trava física",
        null,
        !simular && confirmado.semMudancas !== true,
      ),
    ],
    detalhes: {
      adotado: true,
      migradorSha256: p.migradorSha256,
      prefixo: p.prefixo,
      perfil: ctx.caminhos.controladorPerfil,
      rotinas: "cron",
      seletores,
      semMudancas: confirmado.semMudancas === true,
    },
  };
}
