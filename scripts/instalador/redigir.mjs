// Redige segredos antes de imprimir, gravar relatório, log ou JSON.
export const MARCADOR = "[REDIGIDO]";

const PADROES = [
  {
    regex: /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g,
    substituir: MARCADOR,
  },
  {
    regex: /-----BEGIN PGP PRIVATE KEY BLOCK-----[\s\S]*?-----END PGP PRIVATE KEY BLOCK-----/g,
    substituir: MARCADOR,
  },
  {
    regex: /AGE-SECRET-KEY-[A-Z0-9]+/g,
    substituir: MARCADOR,
  },
  {
    regex:
      /(\b[A-Za-z0-9_]*(?:SENHA|SEGREDO|SECRET|TOKEN|PASSWORD|PASSWD|PASS|CHAVE)[A-Za-z0-9_]*\b\s*[=:]\s*)("[^"]*"|'[^']*'|[^\s,;]+)/gi,
    substituir: `$1${MARCADOR}`,
  },
  {
    regex: /(\b[A-Z0-9_]*KEY\b\s*[=:]\s*)("[^"]*"|'[^']*'|[^\s,;]+)/g,
    substituir: `$1${MARCADOR}`,
  },
  {
    regex:
      /("(?:[^"]*(?:SENHA|SEGREDO|SECRET|TOKEN|PASSWORD|PASSWD|PASS|CHAVE|KEY)[^"]*)"\s*:\s*)("[^"]*"|[^,}\s]+)/gi,
    substituir: `$1${MARCADOR}`,
  },
  {
    regex: /([a-z][a-z0-9+.-]*:\/\/)[^/\s:@]+:[^/\s@]+@/gi,
    substituir: `$1${MARCADOR}@`,
  },
  {
    regex: /(^|\n)([ \t]*(?:Authorization|Cookie)\s*:\s*)[^\r\n]+/gi,
    substituir: `$1$2${MARCADOR}`,
  },
  {
    regex: /(--(?:senha|token|secret|password|chave)(?:=|\s+))("[^"]*"|'[^']*'|[^\s]+)/gi,
    substituir: `$1${MARCADOR}`,
  },
];

// Substitui os padrões conhecidos de segredo pelo marcador estável.
export function redigir(texto) {
  if (typeof texto !== "string") return texto;
  let saida = texto;
  for (const padrao of PADROES) {
    saida = saida.replace(padrao.regex, padrao.substituir);
  }
  return saida;
}

// Percorre objetos e listas redigindo strings e valores de chaves sensíveis.
export function redigirObjeto(valor) {
  if (typeof valor === "string") return redigir(valor);
  if (Array.isArray(valor)) return valor.map((item) => redigirObjeto(item));
  if (valor && typeof valor === "object") {
    const saida = {};
    for (const [chave, item] of Object.entries(valor)) {
      const sensivel =
        /(SENHA|SEGREDO|SECRET|TOKEN|PASSWORD|PASSWD|CHAVE|KEY)$/i.test(chave) &&
        (typeof item === "string" || typeof item === "number");
      saida[chave] = sensivel ? MARCADOR : redigirObjeto(item);
    }
    return saida;
  }
  return valor;
}

// Cria um redator que também remove valores conhecidos recebidos fora do texto.
export function criarRedator(valores = []) {
  const conhecidos = valores
    .filter((valor) => typeof valor === "string" && valor.length >= 4)
    .sort((a, b) => b.length - a.length);
  return (texto) => {
    let saida = redigir(texto);
    for (const valor of conhecidos) {
      saida = saida.split(valor).join(MARCADOR);
    }
    return saida;
  };
}
