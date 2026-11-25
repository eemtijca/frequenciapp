// Gera docs/imagens/README.md a partir do manifesto da galeria.
import { readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const raiz = process.cwd();
const manifesto = JSON.parse(await readFile(path.join(raiz, "docs/imagens/galeria.json"), "utf8"));
const capturas = Array.isArray(manifesto.capturas) ? manifesto.capturas : [];

const porArea = new Map();
for (const captura of capturas) {
  if (!porArea.has(captura.area)) porArea.set(captura.area, []);
  porArea.get(captura.area).push(captura);
}

function tela(nome, viewport) {
  return nome
    .replace(`-${viewport.nome}-claro.png`, "")
    .replace(`-${viewport.nome}-escuro.png`, "");
}

const areas = [...porArea.keys()].sort((a, b) => a.localeCompare(b, "pt-BR"));
const secoes = [];

for (const area of areas) {
  const lista = porArea.get(area).sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
  const linhas = [];
  for (const claro of lista.filter((item) => item.tema === "claro")) {
    const escuro = lista.find(
      (item) =>
        item.tema === "escuro" &&
        item.viewport.nome === claro.viewport.nome &&
        tela(item.nome, item.viewport) === tela(claro.nome, claro.viewport),
    );
    const alt = `${area}: ${tela(claro.nome, claro.viewport)} no ${claro.viewport.nome}`;
    const mini = escuro
      ? `<a href="${claro.nome}"><picture><source media="(prefers-color-scheme: dark)" srcset="${escuro.nome}"><img src="${claro.nome}" alt="${alt}" width="360"></picture></a>`
      : `<a href="${claro.nome}"><img src="${claro.nome}" alt="${alt}" width="360"></a>`;
    linhas.push([claro.viewport.nome, mini]);
  }
  for (const escuro of lista.filter((item) => item.tema === "escuro")) {
    const temClaro = lista.some(
      (item) =>
        item.tema === "claro" &&
        item.viewport.nome === escuro.viewport.nome &&
        tela(item.nome, item.viewport) === tela(escuro.nome, escuro.viewport),
    );
    if (temClaro) continue;
    const alt = `${area}: ${tela(escuro.nome, escuro.viewport)} no ${escuro.viewport.nome}, tema escuro`;
    linhas.push([
      escuro.viewport.nome,
      `<a href="${escuro.nome}"><img src="${escuro.nome}" alt="${alt}" width="360"></a>`,
    ]);
  }
  secoes.push(
    `## ${area}\n\n| Viewport | Captura |\n|---|---|\n${linhas.map(([v, m]) => `| ${v} | ${m} |`).join("\n")}`,
  );
}

const conteudo = `# Galeria de capturas\n\nCapturas de demonstração do FrequenciApp, geradas com dados sintéticos por \`pnpm run capturas:galeria\`. As imagens não devem ser editadas à mão. Cada miniatura abre o arquivo completo.\n\n${secoes.join("\n\n")}\n`;
await writeFile(path.join(raiz, "docs/imagens/README.md"), conteudo);

// Mantém as capturas dentro do limite de 300 KB do teste editorial.
for (const captura of capturas) {
  const caminho = path.join(raiz, "docs/imagens", captura.nome);
  if ((await stat(caminho)).size <= 300 * 1024) continue;
  const buffer = await sharp(caminho)
    .png({ compressionLevel: 9, palette: true, colors: 256, quality: 92 })
    .toBuffer();
  await writeFile(caminho, buffer);
}
