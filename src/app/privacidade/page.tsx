// Página pública da política de privacidade, sem sessão e sem dado escolar.
import type { Metadata } from "next";
import VistaPrivacidade from "@/components/privacidade/vista-privacidade";
import { ROTA_PRIVACIDADE } from "@/lib/rotas-publicas";

export const metadata: Metadata = {
  title: "Política de privacidade",
  description:
    "Como a EEMTI José Cláudio de Araújo trata dados pessoais no FrequenciApp, inclusive na integração opcional com o Google.",
  alternates: { canonical: ROTA_PRIVACIDADE },
  robots: { index: true, follow: true },
};

export default function PaginaPrivacidade() {
  return <VistaPrivacidade />;
}
