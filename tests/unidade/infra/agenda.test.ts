// Exercita a agenda real sem rede externa nem serviço de produção.
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { expect, it } from "vitest";

it("propaga seletores, URL e timeout aos consumidores de Compose, Helm e Actions", () => {
  const ler = (arquivo: string) => readFileSync(arquivo, "utf8");
  for (const nome of ["AGENDA_NOTIFICACOES", "AGENDA_PLANILHAS", "AGENDA_INDICADORES"]) {
    expect(ler("scripts/servidor/agenda.sh")).toContain(`-e "${nome}=`);
    expect(ler("compose.yml")).toContain(`${nome}:`);
    expect(ler("compose.ci.yml")).toContain(`${nome}:`);
    expect(ler("infra/kubernetes/frequenciapp/templates/cronjob-agenda.yaml")).toContain(
      `"${nome}"`,
    );
  }
  for (const nome of ["AGENDA_URL", "AGENDA_TIMEOUT"]) {
    expect(ler("scripts/servidor/agenda.sh")).toContain(`-e "${nome}=`);
    expect(ler("compose.yml")).toContain(`${nome}:`);
    expect(ler("compose.ci.yml")).toContain(`${nome}:`);
    expect(ler(".env.example")).toContain(`${nome}=`);
    expect(ler("infra/servidor/servidor.env.example")).toContain(`${nome}=`);
    expect(ler("infra/kubernetes/frequenciapp/templates/cronjob-agenda.yaml")).toContain(
      `name: ${nome}`,
    );
  }
  expect(ler(".github/workflows/notificacoes.yml")).toContain("vars.NOTIFICACOES_APP_URL");
  expect(ler(".github/workflows/notificacoes.yml")).toContain("vars.AGENDA_NOTIFICACOES");
  const fila = ler(".github/workflows/fila-planilha.yml");
  expect(fila).toContain("vars.AGENDA_PLANILHAS");
  expect(fila).toContain("vars.FILA_APP_URL");
  expect(fila).toContain(
    "always() && steps.configuracao.outputs.pronta == 'true' && env.AGENDA_INDICADORES == 'true'",
  );
});

it("seleciona as oito combinações, autentica, falha isolada e aplica timeout real", () => {
  const resultado = execFileSync(
    process.execPath,
    [
      "--input-type=module",
      "-e",
      `
    import assert from 'node:assert/strict';
    import http from 'node:http';
    import { once } from 'node:events';
    process.env.CRON_SECRET = 'sintetico';
    const fetchNativo = globalThis.fetch;
    let importacoes = 0;
    globalThis.fetch = async () => { importacoes++; throw new Error('efeito ao importar'); };
    const { selecionarRotas, executarAgenda } = await import('./scripts/servidor/agenda.mjs');
    assert.equal(importacoes, 0);
    const nomes = ['AGENDA_NOTIFICACOES','AGENDA_PLANILHAS','AGENDA_INDICADORES'];
    const rotas = ['/api/notificacoes/agenda','/api/planilha/fila/agenda','/api/indicadores/agenda'];
    assert.deepEqual(selecionarRotas({}), rotas);
    for (let mascara=0; mascara<8; mascara++) {
      const ambiente = Object.fromEntries(nomes.map((n,i)=>[n, String(Boolean(mascara & (1<<i)))]));
      const esperadas = rotas.filter((_,i)=>mascara & (1<<i));
      assert.deepEqual(selecionarRotas(ambiente), esperadas);
      const chamadas = [];
      const sinais = [];
      const status = await executarAgenda({...ambiente, AGENDA_URL:'http://sintetico//', CRON_SECRET:'sintetico'}, async (url,opcoes)=> {
        assert.equal(opcoes.headers.Authorization, 'Bearer sintetico');
        assert.ok(opcoes.signal instanceof AbortSignal);
        chamadas.push(url);
        sinais.push(opcoes.signal);
        return {ok:true};
      }, {log(){}, error(){}});
      assert.equal(status,0);
      assert.deepEqual(chamadas, esperadas.map(r=>'http://sintetico'+r));
      assert.equal(new Set(sinais).size, sinais.length);
    }
    for (const nome of nomes) for (const invalido of ['','TRUE','1','sim',null,true]) {
      assert.throws(()=>selecionarRotas({[nome]:invalido}), /true ou false/);
    }
    for (const invalido of ['0','-1','NaN','Infinity','',' 3','3.5']) {
      await assert.rejects(()=>executarAgenda({CRON_SECRET:'sintetico',AGENDA_TIMEOUT:invalido}),/AGENDA_TIMEOUT/);
    }
    await assert.rejects(()=>executarAgenda({CRON_SECRET:'sintetico',AGENDA_URL:'ftp://sintetico'}),/AGENDA_URL/);
    assert.equal(await executarAgenda(Object.fromEntries(nomes.map(n=>[n,'false']))),0);

    const recebidas = [];
    let modo = 'ok';
    const servidor = http.createServer(async (requisicao, resposta) => {
      recebidas.push({ url: requisicao.url, auth: requisicao.headers.authorization });
      if (modo === 'lento' && requisicao.url === '/api/notificacoes/agenda') {
        await new Promise((resolver) => setTimeout(resolver, 1500));
      }
      if (modo === 'falha' && requisicao.url === '/api/planilha/fila/agenda') {
        resposta.statusCode = 503;
        resposta.end('falha sintetica');
        return;
      }
      resposta.statusCode = 200;
      resposta.end('ok');
    });
    servidor.listen(0, '127.0.0.1');
    await once(servidor, 'listening');
    const endereco = servidor.address();
    assert.ok(endereco && typeof endereco === 'object');
    const base = 'http://127.0.0.1:' + endereco.port;
    globalThis.fetch = fetchNativo;
    const sinais = [];
    globalThis.fetch = (url, opcoes) => {
      sinais.push(opcoes.signal);
      return fetchNativo(url, opcoes);
    };
    for (let mascara=0; mascara<8; mascara++) {
      recebidas.length = 0;
      sinais.length = 0;
      const ambiente = Object.fromEntries(nomes.map((n,i)=>[n, String(Boolean(mascara & (1<<i)))]));
      const esperadas = rotas.filter((_,i)=>mascara & (1<<i));
      const status = await executarAgenda({...ambiente, AGENDA_URL:base, CRON_SECRET:'sintetico'}, undefined, {log(){}, error(){}});
      assert.equal(status,0);
      assert.deepEqual(recebidas.map((r)=>r.url), esperadas);
      assert.ok(recebidas.every((r)=>r.auth === 'Bearer sintetico'));
      assert.equal(new Set(sinais).size, sinais.length);
    }
    modo = 'falha';
    recebidas.length = 0;
    assert.equal(await executarAgenda({CRON_SECRET:'sintetico', AGENDA_URL:base}, undefined, {log(){}, error(){}}),1);
    assert.deepEqual(recebidas.map((r)=>r.url), rotas);
    modo = 'lento';
    recebidas.length = 0;
    const logs = [];
    const statusLento = await executarAgenda(
      {CRON_SECRET:'sintetico', AGENDA_URL:base, AGENDA_TIMEOUT:'1'},
      undefined,
      {log(mensagem){logs.push(mensagem);}, error(mensagem){logs.push(mensagem);}},
    );
    assert.equal(statusLento,1);
    assert.deepEqual(recebidas.map((r)=>r.url), rotas);
    assert.ok(logs.some((linha)=>linha.includes('falha de rede ou timeout')));
    globalThis.fetch = fetchNativo;
    servidor.closeAllConnections();
    servidor.close();
    console.log('oito combinacoes, autenticacao, falhas e timeout verificados');
  `,
    ],
    { encoding: "utf8" },
  );
  expect(resultado).toContain("oito combinacoes, autenticacao, falhas e timeout verificados");
});
