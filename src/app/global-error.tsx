"use client";

// Fallback quando o layout raiz falha. Usa estilos próprios para não depender do CSS.
import { useEffect } from "react";
import Link from "next/link";

export default function ErroGlobal({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Falha no layout raiz:", error);
  }, [error]);

  return (
    <html lang="pt-BR">
      <head>
        <title>Algo saiu do esperado · FrequenciApp</title>
        <style>{`
          :root {
            color-scheme: light dark;
            --fundo: #f6f6f6;
            --tinta: #262626;
            --tinta-fraca: #595959;
            --borda: #e4e4e2;
            --verde: #1d7253;
            --verde-texto: #effaf6;
            --emblema-fundo: rgba(29, 114, 83, 0.1);
            --foco: #1d7253;
          }
          @media (prefers-color-scheme: dark) {
            :root {
              --fundo: #141413;
              --tinta: #ffffff;
              --tinta-fraca: #a6a6a6;
              --borda: #393837;
              --verde: #81cfb3;
              --verde-texto: #082b1e;
              --emblema-fundo: rgba(129, 207, 179, 0.15);
              --foco: #81cfb3;
            }
          }
          body { background: var(--fundo); color: var(--tinta); }
          .texto { color: var(--tinta-fraca); }
          .emblema {
            display: flex;
            width: 56px;
            height: 56px;
            align-items: center;
            justify-content: center;
            border-radius: 8px;
            background: var(--emblema-fundo);
            color: var(--verde);
          }
          .acao {
            margin-top: 8px;
            display: inline-flex;
            align-items: center;
            justify-content: center;
            padding: 10px 18px;
            min-height: 44px;
            border-radius: 8px;
            border: none;
            background: var(--verde);
            color: var(--verde-texto);
            font-size: 15px;
            font-weight: 600;
            text-decoration: none;
            cursor: pointer;
          }
          .acao:focus-visible { outline: 2px solid var(--foco); outline-offset: 2px; }
          .secundaria {
            background: transparent;
            color: var(--tinta);
            border: 1px solid var(--borda);
          }
        `}</style>
      </head>
      <body
        style={{
          margin: 0,
          minHeight: "100dvh",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 12,
          padding: 24,
          fontFamily: "system-ui, sans-serif",
          textAlign: "center",
        }}
      >
        <span aria-hidden="true" className="emblema">
          <svg
            width="26"
            height="26"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <circle cx="12" cy="12" r="9" />
            <path d="M12 8v4M12 16h.01" />
          </svg>
        </span>
        <span
          className="texto"
          style={{ fontFamily: "ui-monospace, monospace", fontSize: 11, fontWeight: 600 }}
        >
          Erro 500
        </span>
        <h1 style={{ margin: 0, fontSize: 22 }}>Algo saiu do esperado</h1>
        <p className="texto" style={{ margin: 0, maxWidth: 420, fontSize: 14, lineHeight: 1.6 }}>
          Não foi possível carregar a aplicação. Tente novamente em instantes.
        </p>
        <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "center", gap: 8 }}>
          <button type="button" className="acao" onClick={reset}>
            Tentar novamente
          </button>
          <Link href="/" className="acao secundaria">
            Ir para o início
          </Link>
        </div>
      </body>
    </html>
  );
}
