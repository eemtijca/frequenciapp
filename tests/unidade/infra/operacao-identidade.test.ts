// Confere identidade explícita e rejeição de recursos vizinhos sem daemon.
import { execFileSync } from "node:child_process";
import { expect, it } from "vitest";

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
