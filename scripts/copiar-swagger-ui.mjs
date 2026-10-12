// Copia os assets do Swagger UI de node_modules para public/vendor.
// Roda no postinstall; sem a pasta de origem, encerra sem erro.
import { cpSync, existsSync, mkdirSync, rmSync } from "fs";
import { join } from "path";

const src = "node_modules/swagger-ui-dist";
const dest = "public/vendor/swagger-ui";
const arquivos = ["swagger-ui.css", "swagger-ui-bundle.js"];

if (!existsSync(src)) {
  console.log("swagger-ui-dist não encontrado, pule cópia");
  process.exit(0);
}

rmSync(dest, { recursive: true, force: true });
mkdirSync(dest, { recursive: true });
for (const arquivo of arquivos) {
  cpSync(join(src, arquivo), join(dest, arquivo));
}
console.log("Swagger UI copiado para", dest);
