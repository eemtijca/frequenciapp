// Chaves sintéticas e segredo da agenda para testes isolados. Escreve
// somente no arquivo indicado, sem mostrar chaves privadas nos logs.
import { appendFileSync } from "node:fs";
import webpush from "web-push";

const destino = process.argv[2];
if (!destino) throw new Error("Informe o arquivo de ambiente dos testes.");
const chaves = webpush.generateVAPIDKeys();
appendFileSync(
  destino,
  `\nPUSH_VAPID_PUBLIC_KEY=${chaves.publicKey}\nPUSH_VAPID_PRIVATE_KEY=${chaves.privateKey}\nPUSH_VAPID_SUBJECT=mailto:teste@escola.exemplo\nCRON_SECRET=segredo-ficticio-da-agenda-para-testes-0000\n`,
  { mode: 0o600 },
);
