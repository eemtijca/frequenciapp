// Confere o perfil Helm adotado sem consultar cluster ou Secrets reais.
import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import path from "node:path";
const raiz = path.resolve(import.meta.dirname, "../..");
const helm = process.env.HELM_BIN;
const args = [
  "template",
  "frequenciapp",
  "infra/kubernetes/frequenciapp",
  "--set",
  "existingSecret=app-sintetico",
  "--set",
  "backup.enabled=true",
  "--set",
  "backup.filesSecret=arquivos-sinteticos",
  "--set",
  "backup.database.existingSecret=backup-sintetico",
  "--set",
  "backup.spreadsheets.enabled=false",
  "--set",
  "backupOrigin.adopted=true",
  "--set",
  "backupOrigin.policySecret=policy-sintetica-v1",
  "--set",
  "backupOrigin.hmacSecret=hmac-sintetico-v1",
  "--set",
  "backupOrigin.connectionSecret=conexao-sintetica-v1",
  "--set",
  "backupOrigin.schema=public",
];
function render(extra = []) {
  assert.ok(helm, "Defina HELM_BIN para o binário Helm local.");
  const r = spawnSync(helm, [...args, ...extra], { cwd: raiz, encoding: "utf8", timeout: 30000 });
  assert.equal(r.error, undefined);
  assert.equal(r.signal, null);
  return r;
}
test("chart adotado conecta runtime, migrador, produtor e hook à autoridade fora do PVC", () => {
  const r = render();
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /BACKUP_ORIGEM_POLICY/);
  assert.match(r.stdout, /BACKUP_ORIGEM_CHAVE/);
  assert.match(r.stdout, /origem-backup\.mjs.*executar/);
  assert.match(r.stdout, /secretName: policy-sintetica-v1/);
  assert.match(r.stdout, /secretName: hmac-sintetico-v1/);
  assert.match(r.stdout, /name: conexao-sintetica-v1/);
  const deployment = r.stdout.split("kind: Deployment")[1].split("\n---")[0];
  assert.doesNotMatch(deployment, /hmac-sintetico/);
  assert.match(deployment, /BACKUP_DATABASE_URL/);
  assert.match(r.stdout, /name: BACKUP_RETER_MINIMO\s+value: "30"/);
});
for (const [nome, extra, erro] of [
  [
    "extraEnv de URL",
    ["--set", "extraEnv[0].name=DATABASE_URL", "--set", "extraEnv[0].value=outro"],
    /conflito/,
  ],
  ["extraEnvFrom opaco", ["--set", "extraEnvFrom[0].secretRef.name=outro"], /extraEnvFrom/],
  [
    "Secret HMAC compartilhado",
    ["--set", "backupOrigin.hmacSecret=policy-sintetica-v1"],
    /separado/,
  ],
  ["schema na config geral", ["--set", "config.DATABASE_SCHEMA=outro"], /conflito/],
  [
    "PVC ausente",
    [
      "--set",
      "backup.database.local=false",
      "--set",
      "backup.database.persistence.enabled=false",
      "--set",
      "backup.database.remote.enabled=true",
    ],
    /PVC/,
  ],
  ["bypass legado", ["--set", "backupGate.ensaioSemProtecao=true"], /bypass/],
])
  test(`chart recusa ${nome}`, () => {
    const r = render(extra);
    assert.notEqual(r.status, 0, r.stdout);
    assert.match(r.stderr, erro);
  });
test("retenção mínima permite override positivo explícito", () => {
  const r = render(["--set", "backup.retentionMinimum=7"]);
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /name: BACKUP_RETER_MINIMO\s+value: "7"/);
});
