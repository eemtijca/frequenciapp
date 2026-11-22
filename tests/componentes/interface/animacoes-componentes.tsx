// Monta diálogo e acordeão reais para verificar as transições MUI e o movimento reduzido.
import { useState } from "react";
import { createRoot } from "react-dom/client";
import Box from "@mui/material/Box";
import CircularProgress from "@mui/material/CircularProgress";
import LinearProgress from "@mui/material/LinearProgress";
import Drawer from "@mui/material/Drawer";
import Skeleton from "@mui/material/Skeleton";
import { CarrosselCartoes } from "@/components/ui/mui/carrossel-cartoes";
import { SeletorAnimacoes } from "@/components/conta/seletor-animacoes";
import { SeletorTurmaChamada } from "@/components/chamada/seletor-turma-chamada";
import { MenuConta } from "@/components/conta/menu-conta";
import { Acordeao } from "@/components/ui/mui/acordeao";
import { Botao } from "@/components/ui/mui/botao";
import { Dialogo } from "@/components/ui/mui/dialogo";
import { ProvedorTema } from "@/theme/provedor-tema";

function Aplicacao() {
  const [modal, setModal] = useState(false);
  const [aberto, setAberto] = useState(false);
  const [gaveta, setGaveta] = useState(false);
  const [cartao, setCartao] = useState("primeiro");
  return (
    <Box sx={{ p: 2 }}>
      <Botao type="button" onClick={() => setModal(true)}>
        Abrir modal
      </Botao>
      <Dialogo aberto={modal} onFechar={() => setModal(false)} titulo="Modal de teste">
        <p>Conteúdo modal</p>
      </Dialogo>
      <Acordeao titulo="Configurações" aberto={aberto} onChange={setAberto}>
        <button type="button">Ação interna</button>
      </Acordeao>
      <button type="button">Ação externa</button>
      <MenuConta
        usuario={{
          id: "qa",
          nome: "Pessoa sintética",
          email: "qa@escola.test",
          papel: "ADMIN",
          ativo: true,
        }}
        movel={false}
        saindo={false}
        onAcao={() => undefined}
      />
      <SeletorAnimacoes />
      <button type="button" onClick={() => setGaveta(true)}>
        Abrir gaveta
      </button>
      <Drawer
        open={gaveta}
        onClose={() => setGaveta(false)}
        slotProps={{ paper: { "aria-label": "Gaveta de teste" } }}
      >
        <button type="button" onClick={() => setGaveta(false)}>
          Fechar gaveta
        </button>
      </Drawer>
      <CircularProgress aria-label="Carregamento circular" />
      <LinearProgress aria-label="Carregamento linear" />
      <Skeleton animation="wave" data-testid="esqueleto" />
      <SeletorTurmaChamada
        turmas={[
          {
            id: "turma-qa",
            serieId: "serie-qa",
            nome: "QA",
            rotulo: "1ª série QA",
            serieNome: "1º ano",
            horarios: [],
          },
        ]}
        alunos={[]}
        turmaId="turma-qa"
        dia="2026-11-20"
        frequencias={[]}
        coberturaDisponivel
        carregando={false}
        temAlteracoes={false}
        travado={false}
        onEscolher={() => undefined}
      />
      <CarrosselCartoes
        rotuloAcessivel="Gráficos de teste"
        itens={[
          { id: "primeiro", rotulo: "Primeiro", render: () => <p>Primeiro gráfico</p> },
          { id: "segundo", rotulo: "Segundo", render: () => <p>Segundo gráfico</p> },
        ]}
        visitados={["primeiro", "segundo"]}
        valor={cartao}
        onValor={setCartao}
      />
    </Box>
  );
}

const raiz = document.getElementById("root");
if (raiz)
  createRoot(raiz).render(
    <ProvedorTema>
      <Aplicacao />
    </ProvedorTema>,
  );
