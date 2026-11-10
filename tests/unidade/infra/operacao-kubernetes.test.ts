// Guarda o contrato declarativo do chart; a renderização Helm é validada em tests/kubernetes.
import { readFileSync } from "node:fs";
import { expect, it } from "vitest";

const ler = (arquivo: string) => readFileSync(arquivo, "utf8");

it("exige persistência efetiva e mantém o gate de backup do #454", () => {
  const cron = ler("infra/kubernetes/frequenciapp/templates/cronjob-backup-banco.yaml");
  expect(cron).toContain(".Values.backup.database.remote.enabled");
  expect(cron).toContain('fail "Backup de banco exige PVC ou remoto explicitamente habilitado"');
  expect(cron).toContain('fail "backup.database.local exige persistência habilitada"');
  expect(cron).toContain('fail "backup.database.local deve ser booleano"');
  expect(cron).toContain("name: BACKUP_EXIGIR_REMOTO");
  expect(cron).toContain("not .Values.backup.database.persistence.enabled | quote");
  expect(cron).toContain("name: BACKUP_CATALOGO_PERSISTENTE");
  expect(cron).toContain("value: /backups/estado");

  expect(ler("infra/kubernetes/frequenciapp/templates/hook-backup-gate.yaml")).toContain(
    "helm.sh/hook: pre-upgrade,pre-rollback",
  );
  expect(ler("infra/kubernetes/frequenciapp/templates/configmap-backup-gate.yaml")).toContain(
    "verificar-backup.sh",
  );
  expect(ler("infra/kubernetes/frequenciapp/templates/pvc-backup.yaml")).toContain(
    "frequenciapp.fullname",
  );
});

it("renderiza agenda independente, timeout próprio e fuso nos três CronJobs", () => {
  const agenda = ler("infra/kubernetes/frequenciapp/templates/cronjob-agenda.yaml");
  expect(agenda).toContain("agenda.timeoutSeconds");
  expect(agenda).toContain('fail "agenda.timeoutSeconds deve ser um inteiro entre 1 e 2147483"');
  expect(agenda).toContain("AGENDA_NOTIFICACOES");
  expect(agenda).toContain("AGENDA_PLANILHAS");
  expect(agenda).toContain("AGENDA_INDICADORES");
  expect(agenda).toContain("frequenciapp.appUrl");
  expect(agenda).toContain("frequenciapp.timeZone");

  const values = ler("infra/kubernetes/frequenciapp/values.yaml");
  expect(values).toContain("notifications: true");
  expect(values).toContain("spreadsheets: true");
  expect(values).toContain("indicators: true");
  expect(values).toContain("timeoutSeconds: 300");
  expect(values).toContain("remote:\n      enabled: false");
});
