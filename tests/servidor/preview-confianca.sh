#!/usr/bin/env bash
# Prova local do ambiente entregue ao processo não confiável, sem credenciais reais.
set -euo pipefail
cd "$(dirname "$0")/../.."
node --input-type=module <<'JS'
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { ambienteValidacao } from './scripts/github/validar-preview.mjs';
for (const evento of ['interno', 'fork', 'synchronize', 'closed']) {
  const ambiente = ambienteValidacao({PATH: process.env.PATH, DIRECT_URL_PREVIEW:'MARCADOR_PRIVILEGIADO', VERCEL_TOKEN:'MARCADOR_PRIVILEGIADO', GITHUB_TOKEN:'MARCADOR_PRIVILEGIADO'});
  const filho = spawnSync(process.execPath, ['-e', 'process.stdout.write(JSON.stringify(process.env))'], { env: ambiente, encoding:'utf8' });
  assert.equal(filho.status, 0, evento);
  assert(!filho.stdout.includes('MARCADOR_PRIVILEGIADO'), evento);
}
console.log('4 cenários sintéticos sem marcador privilegiado; não atesta políticas do Actions.');
JS
