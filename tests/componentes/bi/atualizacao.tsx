// Monta o componente real do FrequenciBI com respostas HTTP sintéticas.
import { createRoot } from "react-dom/client";
import VistaBi from "@/components/bi/vista-bi";
import "@/app/globals.css";

const raiz = document.getElementById("root");
if (!raiz) throw new Error("Elemento raiz ausente");
createRoot(raiz).render(<VistaBi fuso="UTC" />);
