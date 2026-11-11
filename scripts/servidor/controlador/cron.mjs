// Gera cron e logrotate apenas para a entrada fixa do perfil adotado.
import fs from 'node:fs';
import { exigir, protegido, exclusivo, lerAmbiente, sincronizar } from './contrato.mjs';

export function instalarRotinas(p, args) {
  let plano = false, confirmar = false, destino = '/etc';
  while (args.length) {
    const n = args.shift();
    if (n === '--plano') plano = true;
    else if (n === '--confirmar') confirmar = true;
    else if (n === '--destino') destino = args.shift();
    else throw new Error('Opção de cron desconhecida.');
  }
  exigir(plano !== confirmar, 'Escolher --plano ou --confirmar.');
  protegido(destino, 'diretorio');
  const e = lerAmbiente(p), entrada = `${p.prefixo}/executar`;
  const horario = (nome, padrao) => {
    const valor = e[nome] ?? padrao;
    exigir(valor.trim().split(/\s+/).length === 5 && /^[0-9*,/ -]+$/.test(valor), 'Horário cron inválido.');
    return valor;
  };
  const fuso = e.CRON_TZ || e.TZ_APP || 'America/Fortaleza';
  exigir(/^[a-zA-Z0-9_+/-]+$/.test(fuso), 'Fuso inválido.');
  // A adoção exige conferência explícita do fuso do daemon ou suporte CRON_TZ.
  exigir(e.CRON_TZ ? e.CRON_SUPORTA_TZ === 'true' : (e.CRON_FUSO_SISTEMA ?? '') === fuso, 'Confirmar CRON_FUSO_SISTEMA igual a TZ_APP ou CRON_SUPORTA_TZ=true para CRON_TZ.');
  exigir(!e.MAILTO || /^[a-zA-Z0-9@._+,-]+$/.test(e.MAILTO), 'MAILTO inválido.');
  const linhas = ['# Rotinas estáveis do controlador FrequenciApp.', 'SHELL=/bin/bash', `PATH=${p.path}`, `MAILTO=${e.MAILTO ?? ''}`];
  if (e.CRON_TZ) linhas.push(`CRON_TZ=${fuso}`);
  const adicionar = (flag, padrao, quando, agenda, acao, log) => {
    const valor = e[flag] ?? padrao;
    exigir(['true', 'false'].includes(valor), 'Habilitação cron inválida.');
    if (valor === 'true') linhas.push(`${horario(quando, agenda)} root ${entrada} ${acao} >>${p.logs}/${log}.log 2>&1`);
  };
  adicionar('AGENDA_HABILITADA', 'true', 'AGENDA_HORARIO', '*/5 * * * *', 'agenda', 'agenda');
  adicionar('BACKUP_HABILITADO', 'true', 'BACKUP_HORARIO', '30 2 * * *', 'backup-banco', 'backup');
  adicionar('BACKUP_PLANILHAS_HABILITADO', 'true', 'BACKUP_PLANILHAS_HORARIO', '0 3 * * *', 'backup-planilhas', 'backup-planilhas');
  adicionar('ATUALIZAR_HABILITADO', 'false', 'ATUALIZAR_HORARIO', '30 4 * * *', 'atualizar', 'atualizacao');
  if (e.PROXY_TIPO === 'nginx' && (e.TLS_MODO ?? 'acme') === 'acme') linhas.push(`${horario('CERTBOT_RENOVAR_HORARIO', '15 2 * * *')} root ${entrada} renovar-certificado >>${p.logs}/certificado.log 2>&1`);
  const cron = linhas.join('\n') + '\n';
  if (plano) { process.stdout.write(cron); return; }
  for (const sub of ['cron.d', 'logrotate.d']) {
    if (!fs.existsSync(`${destino}/${sub}`)) { fs.mkdirSync(`${destino}/${sub}`, { mode: 0o755 }); sincronizar(destino); }
    protegido(`${destino}/${sub}`, 'diretorio');
  }
  // Não substituir agendamento antigo implicitamente, inclusive na adoção inicial.
  exclusivo(`${destino}/cron.d/frequenciapp`, Buffer.from(cron));
  exclusivo(`${destino}/logrotate.d/frequenciapp`, Buffer.from(`# Logs das entradas estáveis.\n${p.logs}/*.log {\n    weekly\n    rotate 12\n    compress\n    delaycompress\n    missingok\n    notifempty\n    copytruncate\n}\n`));
  for (const sub of ['cron.d', 'logrotate.d']) { fs.chmodSync(`${destino}/${sub}/frequenciapp`, 0o644); sincronizar(`${destino}/${sub}/frequenciapp`); sincronizar(`${destino}/${sub}`); }
  console.log('Cron e logrotate instalados; nenhum serviço foi recarregado.');
}
