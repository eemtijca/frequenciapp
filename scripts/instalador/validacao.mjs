// Valida a configuração estática do instalador antes do plano e do preflight.
import { aviso, criarErro, erroUso } from "./json.mjs";

const PERFIS = new Set(["simples", "controlador", "dropbox", "completo"]);
const DOCUMENTACAO = "docs/instalador.md";

function bloqueio(avisoCodigo, erro, sempreErro = false) {
  return { avisoCodigo, erro, sempreErro };
}

// Devolve os bloqueios e avisos que não dependem de root, portas, disco ou estado.
export function validarConfiguracaoEstatica(configuracao, opcoes = {}) {
  const bloqueios = [];
  const avisos = [];
  const perfil = String(configuracao.perfil ?? "simples");
  const modoBackup = configuracao.modoBackup ?? "compose";
  const criptografia = configuracao.criptografia ?? "gpg";
  const comControlador = ["controlador", "completo"].includes(perfil);
  const comDropbox = ["dropbox", "completo"].includes(perfil);

  if (!PERFIS.has(perfil)) {
    bloqueios.push(
      bloqueio(
        "A_PERFIL_INVALIDO",
        erroUso("O perfil informado não é reconhecido.", {
          dica: "Use simples, controlador, dropbox ou completo.",
          documentacao: `${DOCUMENTACAO}#perfis`,
        }),
        true,
      ),
    );
  }

  if (comControlador && !configuracao.operadorControlador) {
    bloqueios.push(
      bloqueio(
        "A_OPERADOR_CONTROLADOR_AUSENTE",
        erroUso("O perfil com controlador exige uma conta de operação.", {
          dica: "Informe --operador-controlador com uma conta sem privilégio administrativo.",
          documentacao: "docs/controlador-manutencao.md#pré-requisitos",
        }),
        true,
      ),
    );
  }

  if (comDropbox) {
    for (const [campo, flag] of [
      [configuracao.configDropbox, "--config-dropbox"],
      [configuracao.arquivoTokenDropbox, "--arquivo-token-dropbox"],
      [configuracao.configRclone, "--config-rclone"],
      [configuracao.destino, "--destino"],
    ]) {
      if (!campo) {
        bloqueios.push(
          bloqueio(
            "A_DROPBOX_INCOMPLETO",
            erroUso("O perfil Dropbox exige a configuração completa.", {
              dica: `Informe ${flag} junto das demais flags do perfil Dropbox.`,
              documentacao: "docs/dropbox-retencao.md#adoção",
            }),
            true,
          ),
        );
      }
    }
  }

  if (configuracao.canal === "main" && !opcoes.permitirInstavel) {
    bloqueios.push(
      bloqueio(
        "A_CANAL_MAIN_NAO_CONFIRMADO",
        criarErro("E_CANAL", "O canal main exige confirmação explícita.", {
          dica: "Repita o comando com --permitir-instavel.",
          documentacao: `${DOCUMENTACAO}#canal-release-e-main`,
        }),
        true,
      ),
    );
  }
  if (configuracao.canal === "release" && !configuracao.tag && !opcoes.modoTeste) {
    bloqueios.push(
      bloqueio(
        "A_TAG_AUSENTE",
        erroUso("O canal release exige uma tag estável para aplicar a instalação.", {
          dica: "Informe --tag vX.Y.Z.",
          documentacao: `${DOCUMENTACAO}#canal-release-e-main`,
        }),
      ),
    );
  }
  if (configuracao.canal === "main" && configuracao.tag) {
    bloqueios.push(
      bloqueio(
        "A_CANAL_MAIN_COM_TAG",
        criarErro("E_CANAL", "O canal main não usa tag estável.", {
          dica: "Remova --tag ou use o canal release com uma tag vX.Y.Z.",
          documentacao: `${DOCUMENTACAO}#canal-release-e-main`,
        }),
        true,
      ),
    );
  }
  if (configuracao.canalAtualizacao === "main" && !opcoes.permitirInstavel) {
    bloqueios.push(
      bloqueio(
        "A_CANAL_ATUALIZACAO_NAO_CONFIRMADO",
        criarErro("E_CANAL", "O canal de atualização main exige confirmação explícita.", {
          dica: "Repita o comando com --permitir-instavel.",
          documentacao: `${DOCUMENTACAO}#canal-release-e-main`,
        }),
        true,
      ),
    );
  }
  if (configuracao.canal === "main" && opcoes.permitirInstavel) {
    avisos.push(
      aviso(
        "A_CANAL_MAIN",
        "O canal main é instável e não é recomendado para produção.",
        `${DOCUMENTACAO}#canal-release-e-main`,
      ),
    );
  }
  if (configuracao.canalAtualizacao === "main" && opcoes.permitirInstavel) {
    avisos.push(
      aviso(
        "A_CANAL_ATUALIZACAO_MAIN",
        "As atualizações agendadas usarão o canal main e são instáveis.",
        `${DOCUMENTACAO}#canal-release-e-main`,
      ),
    );
  }

  if (!configuracao.dominio) {
    bloqueios.push(
      bloqueio(
        "A_DOMINIO_AUSENTE",
        erroUso("O domínio é obrigatório para configurar o proxy e o TLS.", {
          dica: "Informe --dominio.",
          documentacao: `${DOCUMENTACAO}#flags`,
        }),
      ),
    );
  }
  if (configuracao.tls === "acme" && !configuracao.emailAcme) {
    bloqueios.push(
      bloqueio(
        "A_EMAIL_ACME_AUSENTE",
        erroUso("O modo TLS acme exige um e-mail para a autoridade certificadora.", {
          dica: "Informe --email-acme.",
          documentacao: `${DOCUMENTACAO}#flags`,
        }),
      ),
    );
  }
  if (!configuracao.pularContas && !configuracao.emailAdmin) {
    bloqueios.push(
      bloqueio(
        "A_EMAIL_ADMIN_AUSENTE",
        erroUso("A criação do administrador exige um e-mail.", {
          dica: "Informe --email-admin ou use --pular-contas.",
          documentacao: `${DOCUMENTACAO}#flags`,
        }),
      ),
    );
  }
  if (modoBackup !== "compose") {
    bloqueios.push(
      bloqueio(
        "A_BACKUP_MODO_URL",
        erroUso("O modo de backup url ainda não é aplicado nesta versão.", {
          dica: "Use --modo-backup compose nesta versão.",
          documentacao: `${DOCUMENTACAO}#backup`,
        }),
        true,
      ),
    );
  }
  if (criptografia === "gpg" && !configuracao.destinatarioGpg) {
    bloqueios.push(
      bloqueio(
        "A_GPG_AUSENTE",
        criarErro("E_BACKUP", "A cifra GPG exige o fingerprint completo do destinatário.", {
          dica: "Informe --destinatario-gpg com o fingerprint completo.",
          documentacao: `${DOCUMENTACAO}#backup`,
        }),
      ),
    );
  }
  if (
    criptografia === "gpg" &&
    configuracao.destinatarioGpg &&
    !/^(?:[A-Fa-f0-9]{40}|[A-Fa-f0-9]{64})$/.test(configuracao.destinatarioGpg)
  ) {
    bloqueios.push(
      bloqueio(
        "A_GPG_FORMATO",
        criarErro("E_BACKUP", "O fingerprint GPG informado não tem formato completo.", {
          dica: "Use 40 ou 64 caracteres hexadecimais.",
          documentacao: `${DOCUMENTACAO}#backup`,
        }),
      ),
    );
  }
  if (criptografia === "age" && !configuracao.destinatariosAge) {
    bloqueios.push(
      bloqueio(
        "A_AGE_AUSENTE",
        criarErro("E_BACKUP", "A cifra age exige um arquivo de destinatários.", {
          dica: "Informe --destinatarios-age.",
          documentacao: `${DOCUMENTACAO}#backup`,
        }),
      ),
    );
  }
  if (criptografia === "gpg") {
    avisos.push(
      aviso(
        "A_BACKUP_CHAVE",
        "O primeiro backup exige a chave pública GPG em BACKUP_GPG_CHAVE_PUBLICA.",
        `${DOCUMENTACAO}#backup`,
      ),
    );
  }
  if (configuracao.seed) {
    avisos.push(
      aviso(
        "A_SEED",
        "A semente sintética não é criada pelo aplicar; use o comando de semente do projeto.",
        `${DOCUMENTACAO}#flags`,
      ),
    );
  }
  if (configuracao.agendador !== "auto" || configuracao.habilitarAtualizacoes) {
    avisos.push(
      aviso(
        "A_AGENDADOR_LIMITADO",
        "O agendador e as atualizações automáticas ficam para a etapa de systemd e cron.",
        `${DOCUMENTACAO}#aplicar`,
      ),
    );
  }

  return { bloqueios, avisos };
}
