// Gera os PNGs do ícone do aplicativo (public/) a partir do desenho mestre em design/icone/mestre.svg.
// Uso: pnpm run icones:gerar. O favicon vetorial fica em src/app/icon.svg e não passa por aqui.
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const mestre = await readFile(path.join(raiz, "design/icone/mestre.svg"));
const publico = path.join(raiz, "public");
await mkdir(publico, { recursive: true });

// Proporção do canto arredondado dos ícones "any", igual à do favicon vetorial (14 em 64).
const CANTO = 14 / 64;

// Rasteriza em 4 vezes a resolução natural do SVG e reduz, para as bordas saírem suaves.
const quadrado = (lado) => sharp(mestre, { density: 288 }).resize(lado, lado);

// Maskable e apple-touch-icon: fundo sangrado, sem cantos, porque o sistema recorta.
async function sangrado(arquivo, lado) {
  const png = await quadrado(lado).removeAlpha().png({ compressionLevel: 9 }).toBuffer();
  await writeFile(path.join(publico, arquivo), png);
}

// Purpose "any": cantos arredondados transparentes.
async function arredondado(arquivo, lado) {
  const raio = Math.round(lado * CANTO);
  const mascara = Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${lado}" height="${lado}"><rect width="${lado}" height="${lado}" rx="${raio}" fill="#fff"/></svg>`,
  );
  const png = await quadrado(lado)
    .ensureAlpha()
    .composite([{ input: mascara, blend: "dest-in" }])
    .png({ compressionLevel: 9 })
    .toBuffer();
  await writeFile(path.join(publico, arquivo), png);
}

await sangrado("icon-mascara-512.png", 512);
await sangrado("icon-mascara-192.png", 192);
await sangrado("apple-touch-icon.png", 180);
await arredondado("icon-512.png", 512);
await arredondado("icon-192.png", 192);
console.log("Ícones gerados em public/.");
