// Monta controles reais para verificar foco sem banco ou autenticação.
import { useState } from "react";
import { createRoot } from "react-dom/client";
import Box from "@mui/material/Box";
import CssBaseline from "@mui/material/CssBaseline";
import OutlinedInput from "@mui/material/OutlinedInput";
import { ThemeProvider } from "@mui/material/styles";
import { SeletorTurmaChamada } from "@/components/chamada/seletor-turma-chamada";
import { BarraBusca } from "@/components/ui/mui/barra-busca";
import { Botao } from "@/components/ui/mui/botao";
import { CampoTexto } from "@/components/ui/mui/text-field";
import { Dialogo } from "@/components/ui/mui/dialogo";
import { Interruptor } from "@/components/ui/mui/interruptor";
import { Popover } from "@/components/ui/mui/popover";
import { Selecionar } from "@/components/ui/mui/selecionar";
import { tema } from "@/theme/tema";

function MenuPopover() {
  const [ancora, setAncora] = useState<HTMLElement | null>(null);
  return (
    <>
      <Botao type="button" onClick={(evento) => setAncora(evento.currentTarget)}>
        Abrir menu de teste
      </Botao>
      <Popover
        aberto={ancora !== null}
        ancora={ancora}
        onFechar={() => setAncora(null)}
        rotuloAcessivel="Menu de teste"
      >
        <Box role="menu" aria-label="Menu de teste">
          <Botao type="button" role="menuitem" variante="texto">
            Primeiro item
          </Botao>
          <Botao type="button" role="menuitem" variante="texto">
            Segundo item
          </Botao>
        </Box>
      </Popover>
    </>
  );
}

function Aplicacao() {
  const [busca, setBusca] = useState("");
  const [nome, setNome] = useState("");
  const [escolha, setEscolha] = useState("");
  const [interruptor, setInterruptor] = useState(false);
  const [dialogo, setDialogo] = useState(false);
  const [campoDialogo, setCampoDialogo] = useState("");
  return (
    <Box component="main" data-pronto="sim" sx={{ p: 2 }}>
      <Botao type="button">Primeira ação</Botao>
      <CampoTexto ariaLabel="Nome" valor={nome} onValor={setNome} />
      <BarraBusca id="busca-teste" valor={busca} onValor={setBusca} placeholder="Buscar" />
      <OutlinedInput aria-label="Inválido" aria-invalid="true" />
      <Botao variante="contorno" type="button" aria-pressed="true">
        Selecionado
      </Botao>
      <Selecionar
        valor={escolha}
        onValor={setEscolha}
        ariaLabel="Seleção simples"
        opcoes={[
          { valor: "a", rotulo: "Alfa" },
          { valor: "b", rotulo: "Beta" },
        ]}
      />
      <MenuPopover />
      <Interruptor rotulo="Interruptor de teste" checked={interruptor} onChange={setInterruptor} />
      <details>
        <summary>Resumo de teste</summary>
        <p>Conteúdo do resumo</p>
      </details>
      <Box role="button" tabIndex={0} aria-label="Cartão focável" sx={{ p: 2 }}>
        Cartão focável
      </Box>
      <Box
        contentEditable
        suppressContentEditableWarning
        role="textbox"
        tabIndex={0}
        aria-label="Anotação editável"
        sx={{ p: 2 }}
      >
        Anotação
      </Box>
      <a href="#resumo-teste" onClick={(evento) => evento.preventDefault()}>
        Link de teste
      </a>
      <Botao type="button" onClick={() => setDialogo(true)}>
        Abrir diálogo
      </Botao>
      <Dialogo
        aberto={dialogo}
        onFechar={() => setDialogo(false)}
        titulo="Diálogo de teste"
        descricao="Conteúdo de teste"
        acoes={
          <Botao type="button" onClick={() => setDialogo(false)}>
            Concluir
          </Botao>
        }
      >
        <CampoTexto ariaLabel="Campo do diálogo" valor={campoDialogo} onValor={setCampoDialogo} />
      </Dialogo>
      <Botao variante="contorno" type="button">
        Superfície controle
      </Botao>
      <Botao variante="texto" type="button">
        Superfície discreto
      </Botao>
      <Botao type="button">Superfície primário</Botao>
      <Botao variante="destrutivo" type="button">
        Superfície destrutivo
      </Botao>
      <SeletorTurmaChamada
        turmas={[
          {
            id: "a",
            serieId: "s",
            nome: "A",
            rotulo: "1ª série A",
            serieNome: "1º ano",
            horarios: [],
          },
        ]}
        alunos={[]}
        turmaId="a"
        dia="2026-10-27"
        frequencias={[]}
        coberturaDisponivel
        carregando={false}
        temAlteracoes={false}
        travado={false}
        onEscolher={() => {}}
      />
      <textarea aria-label="Observações" />
      <Selecionar
        valor=""
        onValor={() => {}}
        ariaLabel="Escolha"
        placeholder="Escolha"
        buscavel
        opcoes={[
          { valor: "a", rotulo: "Alfa" },
          { valor: "b", rotulo: "Beta" },
        ]}
      />
    </Box>
  );
}

const raiz = document.getElementById("root");
if (raiz)
  createRoot(raiz).render(
    <ThemeProvider theme={tema}>
      <CssBaseline enableColorScheme />
      <Aplicacao />
    </ThemeProvider>,
  );
