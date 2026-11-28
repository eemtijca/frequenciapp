// Confere identidade explícita e rejeição de recursos vizinhos sem daemon.
import { execFileSync, spawnSync } from "node:child_process";
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  renameSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it } from "vitest";

function criarEntrada(origem: string) {
  mkdirSync(origem, { mode: 0o700 });
  chmodSync(origem, 0o755);
}

it("confere a instalação com a montagem revogada da partida manual registrada", () => {
  const raiz = mkdtempSync(join(realpathSync(tmpdir()), "identidade-revogada-"));
  try {
    const registro = join(raiz, "identidade.json");
    const estado = join(raiz, "estado.json");
    const operacao = "f919f937-d074-4b17-8ffc-ae945728ec90";
    const commit = "c".repeat(40);
    const imagem = `sha256:${"d".repeat(64)}`;
    const pasta = join(raiz, "migracao-partida.abcdefghijkl");
    const origem = join(pasta, "entrada");
    mkdirSync(pasta, { mode: 0o700 });
    criarEntrada(origem);
    const labels = (servico: string) => ({
      "com.docker.compose.project": "sintetico",
      "com.docker.compose.service": servico,
      "org.opencontainers.image.revision": commit,
    });
    const app = {
      Id: "a".repeat(64),
      Image: imagem,
      Config: { Labels: labels("app") },
      State: { Running: true },
      Mounts: [] as { Type: string; Source: string; Destination: string; RW: boolean }[],
    };
    const db = {
      Config: { Labels: labels("db") },
      Mounts: [
        { Type: "volume", Name: "banco-sintetico", Source: "/dados/isolado", Destination: "/pg" },
      ],
    };
    const entrada = {
      config: {
        name: "sintetico",
        services: {
          app: {},
          db: { volumes: [{ type: "volume", source: "banco", target: "/pg" }] },
        },
        volumes: { banco: { name: "banco-sintetico" } },
      },
      daemon: { ID: "daemon-sintetico" },
      containers: [app, db],
      parametros: { projeto: "sintetico", app: "app", db: "db" },
    };
    const cli = (acao: string, ...extra: string[]) =>
      spawnSync(
        process.execPath,
        ["scripts/servidor/identidade.mjs", acao, registro, raiz, ...extra],
        {
          input: JSON.stringify(entrada),
          encoding: "utf8",
        },
      );
    const adotada = cli("adotar");
    expect(adotada.status, adotada.stderr).toBe(0);
    const identidade = readFileSync(registro, "utf8");
    const stat = statSync(origem, { bigint: true });
    const prova = {
      versao: 1,
      operacao,
      revisao: commit,
      container: app.Id,
      imagem,
      origem,
      inode: `${stat.dev}:${stat.ino}`,
    };
    const escrever = (partidaManual: object | undefined) =>
      writeFileSync(estado, JSON.stringify({ commit, partidaManual }), { mode: 0o600 });
    escrever(prova);
    const bind = {
      Type: "bind",
      Source: origem,
      Destination: "/run/frequenciapp-migracao",
      RW: false,
    };
    app.Mounts.push(bind);

    const verificada = cli("auto");
    expect(verificada.status, verificada.stderr).toBe(0);
    expect(verificada.stdout).toBe(adotada.stdout);
    expect(readFileSync(registro, "utf8")).toBe(identidade);
    app.State.Running = false;
    expect(cli("auto").status).toBe(0);
    app.State.Running = true;

    const recusada = (motivo: string, ...extra: string[]) => {
      const resultado = cli("auto", ...extra);
      expect(resultado.status, motivo).toBe(1);
      expect(resultado.stdout).toBe("");
    };
    for (const variante of [
      undefined,
      { ...prova, container: "e".repeat(64) },
      { ...prova, imagem: `sha256:${"e".repeat(64)}` },
      { ...prova, origem: pasta },
      { ...prova, revisao: "e".repeat(40) },
    ]) {
      escrever(variante);
      recusada("prova ausente ou divergente");
    }
    escrever(prova);
    writeFileSync(join(origem, "autorizar"), "ainda presente");
    recusada("autorização presente");
    rmSync(join(origem, "autorizar"));
    bind.RW = true;
    recusada("montagem gravável");
    bind.RW = false;
    bind.Type = "tmpfs";
    recusada("tipo de montagem divergente");
    bind.Type = "bind";
    const destino = bind.Destination;
    bind.Destination = "/run/outro";
    recusada("destino de montagem divergente");
    bind.Destination = destino;
    app.Config.Labels["org.opencontainers.image.revision"] = "e".repeat(40);
    expect(cli("auto").status).toBe(0);
    app.Config.Labels["org.opencontainers.image.revision"] = commit;
    const montagens = [...app.Mounts];
    app.Mounts.push({ Type: "bind", Source: "/outro", Destination: "/outro", RW: false });
    recusada("montagem estranha adicional");
    app.Mounts = montagens;
    const [banco] = db.Mounts;
    if (!banco) throw new Error("Volume de teste ausente");
    const origemBanco = banco.Source;
    banco.Source = "/dados/outro";
    recusada("volume do banco mudou");
    banco.Source = origemBanco;

    const pendente = join(raiz, "atualizacao-manual-pendente.json");
    const proxima = "833f062e-cc75-49f1-805d-71bc05689772";
    writeFileSync(
      pendente,
      JSON.stringify({
        versao: 1,
        fase: "troca",
        operacao: proxima,
        base: commit,
        chave: adotada.stdout,
        appBase: { container: app.Id, imagem },
        vinculoTroca: "b".repeat(64),
      }),
      { mode: 0o600 },
    );
    recusada("operação não concluída");
    recusada("outro identificador não libera a troca", operacao);
    recusada("identificador público sem descritor da troca não é suficiente", proxima);
    app.Mounts = [];
    recusada("montagens canônicas não dispensam o descritor de uma troca solicitada", proxima);
    app.Mounts = montagens;
    rmSync(pendente);

    const outro = join(pasta, "outro");
    renameSync(origem, outro);
    criarEntrada(origem);
    recusada("diretório vazio trocado pelo mesmo caminho");
    rmSync(origem, { recursive: true });
    symlinkSync(outro, origem);
    recusada("diretório da montagem substituído por link");
    app.Mounts = [];
    expect(cli("auto").stdout).toBe(adotada.stdout);
  } finally {
    rmSync(raiz, { recursive: true, force: true });
  }
});

it("exige projeto explícito ao montar Compose", () => {
  const saida = execFileSync(
    "bash",
    [
      "-c",
      `
    set -Eeuo pipefail
    . scripts/servidor/comum.sh
    COMPOSE_ARQUIVOS=compose.yml
    if (unset COMPOSE_PROJECT_NAME; montar_compose) 2>/dev/null; then exit 41; fi
    COMPOSE_PROJECT_NAME=sintetico montar_compose
    printf '%s\\n' "\${COMPOSE[@]}"
  `,
    ],
    { encoding: "utf8" },
  );
  expect(saida).toContain("--project-name\nsintetico\n");
});

it("confere projeto, daemon, serviços, labels e mounts e deriva a trava do banco efetivo", () => {
  const saida = execFileSync(
    process.execPath,
    [
      "--input-type=module",
      "-e",
      `
    import assert from 'node:assert/strict';
    const { identidadeCompose } = await import('./scripts/servidor/identidade.mjs');
    const config={name:'sintetico',services:{web:{},postgres:{volumes:[{type:'volume',source:'dados',target:'/var/lib/postgresql/data'}]}},volumes:{dados:{name:'opaque-volume'}}};
    const db={Id:'opaque-db',Config:{Labels:{'com.docker.compose.project':'sintetico','com.docker.compose.service':'postgres'}},Mounts:[{Type:'volume',Name:'opaque-volume',Source:'/db/opaque',Destination:'/var/lib/postgresql/data'}]};
    const app={Id:'opaque-app',Config:{Labels:{'com.docker.compose.project':'sintetico','com.docker.compose.service':'web'}},Mounts:[]};
    const parametros={projeto:'sintetico',app:'web',db:'postgres'};
    const atual=identidadeCompose(config,{ID:'opaque-engine'},[db,app],parametros);
    assert.equal(atual.versao,1);
    assert.equal(atual.projeto,'sintetico');
    const configVizinho=structuredClone(config);configVizinho.volumes.dados.name='volume-vizinho';
    assert.throws(()=>identidadeCompose(configVizinho,{ID:'opaque-engine'},[db,app],parametros));
    assert.ok(!JSON.stringify(atual).includes('opaque-db'));
    const clone=structuredClone(db);clone.Id='outro-container';
    assert.deepEqual(identidadeCompose(config,{ID:'opaque-engine'},[clone,app],parametros),atual);
    for (const campo of ['projeto','app','db']) {
      assert.throws(()=>identidadeCompose(config,{ID:'opaque-engine'},[db,app],{...parametros,[campo]:'vizinho'}));
    }
    const vizinho=structuredClone(db);vizinho.Config.Labels['com.docker.compose.project']='vizinho';
    assert.throws(()=>identidadeCompose(config,{ID:'opaque-engine'},[vizinho,app],parametros));
    assert.throws(()=>identidadeCompose(config,{},[db,app],parametros));
    assert.throws(()=>identidadeCompose(config,{ID:'opaque-engine'},[app],parametros));
    const outro=structuredClone(db);outro.Mounts[0].Source='/db/outro';
    assert.notEqual(identidadeCompose(config,{ID:'opaque-engine'},[outro,app],parametros).chave,atual.chave);
    assert.notEqual(identidadeCompose(config,{ID:'outro-engine'},[db,app],parametros).chave,atual.chave);
    console.log('identidade conferida');
  `,
    ],
    { encoding: "utf8" },
  );
  expect(saida).toContain("identidade conferida");
});
