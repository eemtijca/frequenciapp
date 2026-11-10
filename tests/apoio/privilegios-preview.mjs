// Confere o relatório JSON do ensaio de privilégios do schema de preview.
// Não se conecta ao banco: recebe os fatos apurados pelo psql do contêiner.
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

const PAPEIS = ["preview_migrador", "preview_app"];

function exigir(condicao, falhas, mensagem) {
  if (!condicao) falhas.push(mensagem);
}

function conferirPapel(falhas, nome, papel) {
  exigir(papel && typeof papel === "object", falhas, `o papel ${nome} não foi informado`);
  if (!papel || typeof papel !== "object") return;
  exigir(papel.login === true, falhas, `${nome} precisa de LOGIN`);
  exigir(papel.herda === false, falhas, `${nome} precisa ser NOINHERIT`);
  exigir(papel.superusuario === false, falhas, `${nome} não pode ser SUPERUSER`);
  exigir(papel.criaPapel === false, falhas, `${nome} não pode ser CREATEROLE`);
  exigir(papel.criaBanco === false, falhas, `${nome} não pode ser CREATEDB`);
  exigir(papel.replica === false, falhas, `${nome} não pode ser REPLICATION`);
  exigir(papel.ignoraRls === false, falhas, `${nome} não pode ser BYPASSRLS`);
}

function conferirLista(falhas, nome, itens, conferirItem) {
  exigir(Array.isArray(itens) && itens.length > 0, falhas, `a lista de ${nome} está vazia`);
  if (!Array.isArray(itens)) return;
  for (const item of itens) {
    exigir(item && typeof item === "object", falhas, `item inválido em ${nome}`);
    if (item && typeof item === "object") conferirItem(item, nome);
  }
}

function conferirMembros(falhas, relatorio, opcoes) {
  const membros = relatorio.membrosEntrada;
  exigir(Array.isArray(membros), falhas, "a lista de memberships de entrada não foi informada");
  if (!Array.isArray(membros)) return;

  for (const membro of membros) {
    exigir(
      membro && typeof membro === "object",
      falhas,
      "membership de entrada com formato inválido",
    );
    if (!membro || typeof membro !== "object") continue;
    exigir(
      PAPEIS.includes(membro.papel),
      falhas,
      `membership de entrada aponta para papel inesperado: ${String(membro.papel)}`,
    );
    exigir(
      membro.membro === relatorio.administrador,
      falhas,
      `membership de entrada pertence a ${String(membro.membro)}, não ao administrador do ensaio`,
    );
    exigir(membro.herda === false, falhas, "membership de entrada não pode herdar privilégios");
    if (membro.papel === "preview_app") {
      exigir(membro.set === false, falhas, "o administrador não pode usar SET ROLE em preview_app");
    }
  }

  if (opcoes.exigirMembership) {
    exigir(
      membros.some((membro) => membro?.papel === "preview_migrador" && membro?.set === true),
      falhas,
      "falta a membership administrativa com SET ROLE em preview_migrador",
    );
  }
  if (membros.length > 0 || opcoes.exigirMembership) {
    exigir(
      typeof relatorio.administrador === "string" && relatorio.administrador.length > 0,
      falhas,
      "o administrador do ensaio não foi identificado",
    );
    exigir(
      !PAPEIS.includes(relatorio.administrador),
      falhas,
      "o provisionamento não pode ser executado por uma role de preview",
    );
  }
}

/** Devolve a lista de divergências do contrato; lista vazia significa conformidade. */
export function conferirPrivilegios(relatorio, opcoes = {}) {
  const falhas = [];
  const exigirMembership = opcoes.exigirMembership === true;

  exigir(relatorio && typeof relatorio === "object", falhas, "relatório ausente ou inválido");
  if (!relatorio || typeof relatorio !== "object") return falhas;

  for (const nome of PAPEIS) {
    conferirPapel(falhas, nome, relatorio.papeis?.[nome]);
  }
  exigir(
    relatorio.membrosSaida === 0,
    falhas,
    "as roles de preview não podem ser membros de outras roles",
  );

  const schema = relatorio.schemaPreview;
  exigir(schema && typeof schema === "object", falhas, "o schema de preview não foi informado");
  if (schema && typeof schema === "object") {
    exigir(
      schema.dono === "preview_migrador",
      falhas,
      "o schema preview precisa pertencer ao migrador",
    );
    exigir(schema.migradorUso === true, falhas, "preview_migrador perdeu USAGE no schema preview");
    exigir(
      schema.migradorCria === true,
      falhas,
      "preview_migrador perdeu CREATE no schema preview",
    );
    exigir(schema.appUso === true, falhas, "preview_app perdeu USAGE no schema preview");
    exigir(schema.appCria === false, falhas, "preview_app não pode ter CREATE no schema preview");
    exigir(schema.publico === 0, falhas, "PUBLIC ainda tem privilégio no schema preview");
  }

  conferirLista(falhas, "tabelas", relatorio.tabelas, (tabela) => {
    exigir(
      tabela.dono === "preview_migrador",
      falhas,
      `a tabela ${tabela.nome} não pertence ao migrador`,
    );
    for (const privilegio of ["appSeleciona", "appInsere", "appAtualiza", "appRemove"]) {
      exigir(
        tabela[privilegio] === true,
        falhas,
        `preview_app não tem ${privilegio} em ${tabela.nome}`,
      );
    }
    exigir(tabela.publico === 0, falhas, `PUBLIC ainda tem privilégio na tabela ${tabela.nome}`);
  });

  conferirLista(falhas, "sequências", relatorio.sequencias, (sequencia) => {
    exigir(
      sequencia.dono === "preview_migrador",
      falhas,
      `a sequence ${sequencia.nome} não pertence ao migrador`,
    );
    exigir(sequencia.appUso === true, falhas, `preview_app não usa a sequence ${sequencia.nome}`);
    exigir(
      sequencia.appSeleciona === true,
      falhas,
      `preview_app não seleciona a sequence ${sequencia.nome}`,
    );
    exigir(
      sequencia.publico === 0,
      falhas,
      `PUBLIC ainda tem privilégio na sequence ${sequencia.nome}`,
    );
  });

  conferirLista(falhas, "funções", relatorio.funcoes, (funcao) => {
    exigir(
      funcao.dono === "preview_migrador",
      falhas,
      `a rotina ${funcao.nome} não pertence ao migrador`,
    );
    exigir(funcao.appExecuta === true, falhas, `preview_app não executa ${funcao.nome}`);
    exigir(funcao.publico === 0, falhas, `PUBLIC ainda executa ${funcao.nome}`);
  });

  conferirLista(falhas, "tipos", relatorio.tipos, (tipo) => {
    exigir(
      tipo.dono === "preview_migrador",
      falhas,
      `o type ${tipo.nome} não pertence ao migrador`,
    );
    exigir(tipo.appUsa === true, falhas, `preview_app não usa o type ${tipo.nome}`);
    exigir(tipo.publico === 0, falhas, `PUBLIC ainda usa o type ${tipo.nome}`);
  });

  const banco = relatorio.banco;
  exigir(
    banco && typeof banco === "object",
    falhas,
    "os privilégios de banco não foram informados",
  );
  if (banco && typeof banco === "object") {
    exigir(banco.migradorConecta === true, falhas, "preview_migrador perdeu CONNECT no banco");
    exigir(
      banco.migradorCria === true,
      falhas,
      "preview_migrador perdeu CREATE de schemas no banco",
    );
    exigir(banco.appConecta === true, falhas, "preview_app perdeu CONNECT no banco");
    exigir(banco.appCria === false, falhas, "preview_app não pode criar schemas no banco");
  }

  const alheio = relatorio.schemaAlheio;
  exigir(alheio && typeof alheio === "object", falhas, "o schema alheio não foi informado");
  if (alheio && typeof alheio === "object") {
    exigir(alheio.appUso === false, falhas, "preview_app alcançou USAGE em schema alheio");
    exigir(alheio.appSeleciona === false, falhas, "preview_app leu tabela de schema alheio");
    exigir(
      alheio.migradorUso === false,
      falhas,
      "preview_migrador alcançou USAGE em schema alheio",
    );
    exigir(
      alheio.migradorSeleciona === false,
      falhas,
      "preview_migrador leu tabela de schema alheio",
    );
  }

  const publico = relatorio.publicoAlheio;
  exigir(
    publico && typeof publico === "object",
    falhas,
    "a tabela do schema public não foi informada",
  );
  if (publico && typeof publico === "object") {
    exigir(publico.appSeleciona === false, falhas, "preview_app leu tabela do schema public");
  }

  conferirMembros(falhas, relatorio, { exigirMembership });
  return falhas;
}

function principal() {
  let relatorio;
  try {
    relatorio = JSON.parse(readFileSync(0, "utf8"));
  } catch {
    console.error("FALHOU: o relatório de privilégios não é um JSON válido.");
    process.exitCode = 1;
    return;
  }
  const falhas = conferirPrivilegios(relatorio, {
    exigirMembership: process.argv.includes("--exigir-membership"),
  });
  if (falhas.length > 0) {
    console.error("FALHOU: contrato de privilégios do preview divergente:");
    for (const falha of falhas) console.error(`- ${falha}`);
    process.exitCode = 1;
    return;
  }
  process.stdout.write("Contrato de privilégios do preview confirmado.\n");
}

const executadoDiretamente =
  process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (executadoDiretamente) principal();
