import nextCoreWebVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";

const restricoesDoStackAntigo = [
  {
    group: [
      "tailwindcss",
      "tailwindcss/*",
      "@tailwindcss/*",
      "@radix-ui/*",
      "lucide-react",
      "sonner",
      "next-themes",
      "motion",
      "motion/*",
      "clsx",
      "tailwind-merge",
      "class-variance-authority",
    ],
    message: "O stack visual antigo foi removido: use Material UI e os tokens do tema.",
  },
];

const restricoesDosPacotesPro = [
  {
    group: [
      "@mui/x-charts-pro",
      "@mui/x-charts-pro/*",
      "@mui/x-data-grid-pro",
      "@mui/x-data-grid-pro/*",
      "@mui/x-data-grid-premium",
      "@mui/x-data-grid-premium/*",
      "@mui/x-tree-view-pro",
      "@mui/x-tree-view-pro/*",
      "@mui/x-date-pickers-pro",
      "@mui/x-date-pickers-pro/*",
    ],
    message: "O projeto não usa pacotes Pro do MUI X.",
  },
];

// Regras do ESLint. Estritas de propósito: o projeto não silencia
// alertas de TypeScript sem justificativa registrada em ADR.
const eslintConfig = [
  ...nextCoreWebVitals,
  ...nextTypescript,
  {
    rules: {
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/no-non-null-assertion": "error",
      "@typescript-eslint/ban-ts-comment": [
        "error",
        { "ts-expect-error": "allow-with-description", "ts-ignore": true },
      ],
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      "no-console": ["error", { allow: ["warn", "error"] }],
    },
  },
  {
    // Fora do BI, Recharts é proibido; os pacotes Pro do MUI X nunca entram.
    files: ["src/**/*.{ts,tsx}"],
    ignores: ["src/components/bi/**"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            ...restricoesDoStackAntigo,
            ...restricoesDosPacotesPro,
            {
              group: ["recharts", "recharts/*"],
              message: "Recharts é exclusivo do FrequenciBI.",
            },
          ],
        },
      ],
    },
  },
  {
    // No BI, Recharts é a exceção documentada; o restante continua proibido.
    files: ["src/components/bi/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [...restricoesDoStackAntigo, ...restricoesDosPacotesPro],
        },
      ],
    },
  },
  {
    // Scripts de operação são ferramentas de linha de comando: usam
    // console de propósito para informar o operador.
    files: ["scripts/**/*.mjs", "docker/**/*.mjs"],
    rules: {
      "no-console": "off",
    },
  },
  {
    ignores: [
      "node_modules/**",
      "public/vendor/**",
      "sandbox/**",
      "scripts-icone.cjs",
      "tool-results/**",
      ".next/**",
      "out/**",
      "generated/**",
      "next-env.d.ts",
      ".postgres/**",
      ".sandbox-tools/**",
      "analysis/**",
      "download/**",
      "skills/**",
      "playwright-report/**",
      "test-results/**",
    ],
  },
];

export default eslintConfig;
