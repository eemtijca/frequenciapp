// Copia os assets do Swagger UI de node_modules para public/vendor.
// Roda na instalação e antes do build; arquivos ausentes interrompem a publicação.
import { cpSync, existsSync, mkdirSync, rmSync } from "fs";
import { join } from "path";

const src = "node_modules/swagger-ui-dist";
const dest = "public/vendor/swagger-ui";
const arquivos = ["swagger-ui.css", "swagger-ui-bundle.js"];

for (const arquivo of arquivos) {
  if (!existsSync(join(src, arquivo))) {
    throw new Error(
      `Arquivo do Swagger UI ausente: ${arquivo}. Execute pnpm install --frozen-lockfile com as dependências de desenvolvimento.`,
    );
  }
}

rmSync(dest, { recursive: true, force: true });
mkdirSync(dest, { recursive: true });
for (const arquivo of arquivos) {
  cpSync(join(src, arquivo), join(dest, arquivo));
}
console.log("Swagger UI copiado para", dest);
