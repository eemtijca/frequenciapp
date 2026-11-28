"use client";

// Política de privacidade pública, sem sessão, para a equipe e para o consentimento OAuth.
import type { ReactNode } from "react";
import ShieldRoundedIcon from "@mui/icons-material/ShieldRounded";
import AppBar from "@mui/material/AppBar";
import Box from "@mui/material/Box";
import Divider from "@mui/material/Divider";
import Link from "@mui/material/Link";
import Paper from "@mui/material/Paper";
import Stack from "@mui/material/Stack";
import Toolbar from "@mui/material/Toolbar";
import Typography from "@mui/material/Typography";
import pacote from "../../../package.json";
import { CabecalhoPagina } from "@/components/layout/cabecalho-pagina";
import { LayoutConteudo } from "@/components/layout/layout-conteudo";
import { LayoutPagina } from "@/components/layout/layout-pagina";
import { Logotipo } from "@/components/ui/mui/logotipo";
import { SeletorTema } from "@/components/ui/mui/seletor-tema";
import { ROTA_PRIVACIDADE } from "@/lib/rotas-publicas";
import { TOKENS_LAYOUT } from "@/theme/layout";
import { FAMILIA_MONO } from "@/theme/tipografia";

/** Lacunas institucionais: a escola ainda não informou estes dados ao repositório. */
export const LACUNAS_PRIVACIDADE = {
  encarregado: "[PREENCHER: nome do encarregado pelo tratamento de dados da escola]",
  email: "[PREENCHER: e-mail institucional para solicitações de dados pessoais]",
} as const;

const ENDERECO = "https://frequenciapp.jcelab.com.br";
const ESCOPO = "https://www.googleapis.com/auth/drive.file";
const ATUALIZADA_EM = "24 de novembro de 2026";

const SUMARIO = [
  ["ambito", "Controladora e âmbito"],
  ["dados", "Dados tratados"],
  ["finalidades", "Finalidades"],
  ["base-legal", "Base legal"],
  ["criancas", "Crianças e adolescentes"],
  ["google", "Integração com o Google"],
  ["compartilhamento", "Compartilhamento"],
  ["retencao", "Retenção"],
  ["seguranca", "Segurança"],
  ["direitos", "Direitos da pessoa titular"],
  ["contato", "Contato"],
] as const;

// A barra fixa cobriria o título da seção aberta pelo sumário.
const FOLGA_ANCORA = {
  scrollMarginTop: { xs: TOKENS_LAYOUT.barra.celular + 16, sm: TOKENS_LAYOUT.barra.desktop + 16 },
} as const;

function SecaoPolitica({
  id,
  titulo,
  children,
}: {
  id: string;
  titulo: string;
  children: ReactNode;
}) {
  return (
    <Stack
      component="section"
      id={id}
      aria-labelledby={`titulo-${id}`}
      spacing={1.5}
      sx={FOLGA_ANCORA}
    >
      <Typography id={`titulo-${id}`} component="h2" variant="h6">
        {titulo}
      </Typography>
      {children}
    </Stack>
  );
}

function Paragrafo({ children }: { children: ReactNode }) {
  return <Typography variant="body1">{children}</Typography>;
}

function Lista({ children }: { children: ReactNode }) {
  return (
    <Stack component="ul" spacing={1} sx={{ typography: "body1", m: 0, pl: 2.5 }}>
      {children}
    </Stack>
  );
}

function Codigo({ children }: { children: ReactNode }) {
  return (
    <Box
      component="code"
      sx={{
        fontFamily: FAMILIA_MONO,
        overflowWrap: "anywhere",
        bgcolor: "action.hover",
        borderRadius: 0.5,
        px: 0.5,
      }}
    >
      {children}
    </Box>
  );
}

function Lacuna({ campo }: { campo: keyof typeof LACUNAS_PRIVACIDADE }) {
  return (
    <Box component="span" data-lacuna={campo} sx={{ fontWeight: 500 }}>
      {LACUNAS_PRIVACIDADE[campo]}
    </Box>
  );
}

export default function VistaPrivacidade() {
  return (
    <Box
      sx={{
        display: "flex",
        flexDirection: "column",
        minHeight: "100dvh",
        "& > main": { flex: 1, minHeight: 0 },
      }}
    >
      <AppBar
        position="sticky"
        sx={{
          paddingTop: "env(safe-area-inset-top, 0px)",
          paddingLeft: "env(safe-area-inset-left, 0px)",
          paddingRight: "env(safe-area-inset-right, 0px)",
        }}
      >
        <Toolbar sx={{ justifyContent: "space-between", columnGap: 1 }}>
          <Link
            href="/"
            underline="none"
            color="inherit"
            sx={{
              display: "inline-flex",
              alignItems: "center",
              gap: 1.5,
              minWidth: 0,
              minHeight: TOKENS_LAYOUT.alvoToque,
              // Marca, não link de texto: sem o fio que o tema desenha sob os links.
              "&::before": { display: "none" },
            }}
          >
            <Logotipo tamanho={36} prioridade alt="" />
            <Typography component="span" variant="subtitle1" noWrap sx={{ fontWeight: 600 }}>
              FrequenciApp
            </Typography>
          </Link>
          <Box
            sx={{
              display: "inline-flex",
              "& > button": {
                width: TOKENS_LAYOUT.alvoToque,
                height: TOKENS_LAYOUT.alvoToque,
                backgroundColor: "transparent",
                borderColor: "transparent",
                "&:hover": { backgroundColor: "action.hover" },
              },
            }}
          >
            <SeletorTema />
          </Box>
        </Toolbar>
      </AppBar>

      <LayoutPagina semGaveta>
        <LayoutConteudo largura="leitura">
          <Typography
            component="p"
            variant="subtitle2"
            color="primary"
            sx={{ display: "flex", alignItems: "center", gap: 1, mb: 1 }}
          >
            <ShieldRoundedIcon fontSize="small" aria-hidden="true" />
            Lei 13.709/2018
          </Typography>
          <CabecalhoPagina
            titulo="Política de privacidade"
            descricao={`EEMTI José Cláudio de Araújo, em Mucambo, Ceará. Versão ${pacote.version}. Atualizada em ${ATUALIZADA_EM}.`}
          />

          <Stack spacing={3}>
            <Paper
              component="nav"
              aria-labelledby="titulo-sumario"
              variant="outlined"
              sx={{ p: { xs: 2, sm: 3 }, boxShadow: "none" }}
            >
              <Typography id="titulo-sumario" component="h2" variant="subtitle2">
                Nesta página
              </Typography>
              <Box
                component="ol"
                sx={{
                  m: 0,
                  mt: 1,
                  pl: 0,
                  listStyle: "none",
                  columnCount: { xs: 1, sm: 2 },
                  columnGap: 3,
                }}
              >
                {SUMARIO.map(([id, titulo], indice) => (
                  <Box component="li" key={id} sx={{ breakInside: "avoid" }}>
                    <Link
                      href={`#${id}`}
                      variant="body1"
                      underline="hover"
                      sx={{
                        display: "inline-flex",
                        alignItems: "center",
                        minHeight: TOKENS_LAYOUT.alvoToque,
                      }}
                    >
                      {indice + 1}. {titulo}
                    </Link>
                  </Box>
                ))}
              </Box>
            </Paper>

            <Paper
              component="article"
              variant="outlined"
              sx={{
                p: { xs: 2, sm: 3 },
                boxShadow: "none",
                display: "flex",
                flexDirection: "column",
                gap: 4,
              }}
            >
              <SecaoPolitica id="ambito" titulo="Controladora e âmbito">
                <Paragrafo>
                  A controladora dos dados pessoais tratados neste serviço é a EEMTI José Cláudio de
                  Araújo, escola pública em Mucambo, Ceará. O FrequenciApp é o aplicativo de
                  frequência escolar mantido pela escola, com código aberto sob licença MIT.
                </Paragrafo>
                <Paragrafo>
                  Esta política descreve a instância em produção, servida em{" "}
                  <Link href={ENDERECO} underline="hover">
                    {ENDERECO}
                  </Link>
                  , na infraestrutura da própria escola. A página inicial pública é a raiz desse
                  endereço. Outra instalação do mesmo código tem a própria controladora e não é
                  coberta por este texto.
                </Paragrafo>
                <Paragrafo>
                  O texto registra o que o aplicativo implementa. Não substitui decisão jurídica da
                  escola nem certificação de conformidade. O inventário técnico usado na manutenção
                  fica no repositório, em docs/lgpd.md.
                </Paragrafo>
              </SecaoPolitica>

              <SecaoPolitica id="dados" titulo="Dados tratados">
                <Paragrafo>
                  O cadastro do aluno guarda nome, turma atual, turma de origem, ordem de chamada,
                  situação (ativo ou desistente, com a data quando houver) e o identificador
                  interno. Não há campo de CPF, matrícula externa, telefone, endereço, filiação ou
                  fotografia.
                </Paragrafo>
                <Paragrafo>A rotina escolar acrescenta, quando a equipe registra:</Paragrafo>
                <Lista>
                  <li>
                    Faltas da chamada diária. A presença é implícita: só a ausência vira registro,
                    com o dia, a turma e, se a chamada por aula estiver ligada, a aula. Pode haver
                    código de justificativa e observação curta.
                  </li>
                  <li>
                    Retrato de quem estava na lista e das aulas previstas no dia em que a chamada
                    foi salva, para o histórico não mudar se o aluno for transferido depois.
                  </li>
                  <li>
                    Presença parcial, quando usada: aluno, dia, turno ou aulas, nome e turma
                    gravados na época, observação curta, justificativa e a confirmação manual
                    chamada Registro na SEDUC, com data e nome da conta da equipe que confirmou.
                  </li>
                  <li>
                    Saída antecipada: dia, horário, momento, justificativa, observação, texto curto
                    e o nome de quem liberou, preservado como histórico.
                  </li>
                  <li>
                    Entrada atrasada: aluno, turma do registro, dia, horário, momento, motivo e o
                    nome de quem registrou, também preservado como histórico.
                  </li>
                  <li>
                    Confirmação de chamada em data passada, quando a composição da turma não pode
                    ser comprovada: nome de quem confirmou, motivo e identificadores internos dos
                    alunos, sem o nome deles nesse retrato.
                  </li>
                  <li>
                    Prova específica, como Enem ou vestibular, quando a equipe a cadastra: nome da
                    prova, data, local em texto, coordenadas do local escolhidas no mapa, alunos
                    inscritos, a marca de presente, ausente ou sem registro e, quando a equipe
                    informar, o local e as coordenadas daquele aluno. Em branco, vale o local da
                    prova. As coordenadas descrevem o lugar da prova, não a posição de quem usa o
                    aplicativo.
                  </li>
                  <li>
                    Posição do aparelho: só é lida quando a pessoa toca em Usar minha localização e
                    o navegador autoriza. Ela aparece no mapa e só é gravada, como coordenadas do
                    local da prova ou do local de um aluno, se a equipe salvar. Não há rastreamento
                    nem gravação de trajeto.
                  </li>
                </Lista>
                <Paragrafo>
                  Justificativa, observação e motivo são textos livres. O aplicativo não pede dado
                  de saúde, mas um texto pode revelar dado sensível se a equipe o escrever. A
                  orientação do sistema é registrar só o necessário à rotina, sem diagnóstico, laudo
                  ou detalhe clínico.
                </Paragrafo>
                <Paragrafo>
                  Contas da equipe, criadas pela administração, sem cadastro público:
                </Paragrafo>
                <Lista>
                  <li>
                    E-mail ou identificador de acesso, nome de tratamento, papel (administração,
                    coordenação, secretaria ou diretor de turma), situação da conta e hash da senha.
                    A senha em claro não é gravada.
                  </li>
                  <li>
                    Sessão: token aleatório no cookie HttpOnly, guardado no servidor só como hash
                    SHA-256.
                  </li>
                  <li>
                    Diretor de turma: vínculos com turmas de origem, com início e fim, e o ciclo da
                    palavra-chave (emissão, validade, primeiro uso e revogação). O segredo é a senha
                    da conta.
                  </li>
                  <li>
                    Tentativas de entrada: o endereço de origem informado pelo proxy (último item de
                    X-Forwarded-For ou X-Real-IP) e o identificador informado, só para limitar
                    tentativas.
                  </li>
                  <li>
                    Auditoria administrativa: conta, ação e alvo. Não entra dado pessoal de aluno.
                    Em ações sobre contas e catálogos pode permanecer e-mail, identificador ou
                    rótulo da equipe.
                  </li>
                  <li>
                    Notificações, se a pessoa ativar no dispositivo: endereço do serviço de push,
                    chaves da assinatura e o registro de entrega. O texto do aviso é genérico e não
                    leva nome de aluno, turma ou número.
                  </li>
                  <li>
                    Preferências de aviso da conta. Chave do FrequenciBI: rótulo, hash do segredo,
                    escopo, validade e contagem de uso. O segredo em claro aparece uma vez para a
                    administração e não fica no banco.
                  </li>
                </Lista>
                <Paragrafo>No próprio navegador da equipe, sem envio extra ao servidor:</Paragrafo>
                <Lista>
                  <li>
                    O identificador de acesso, se a opção Manter conectado neste dispositivo estiver
                    marcada na entrada.
                  </li>
                  <li>
                    Rascunho da chamada ainda não salva, na sessão do navegador, até salvar,
                    descartar ou fechar a sessão.
                  </li>
                  <li>
                    No FrequenciBI, preferências e painéis locais. Com a opção de uso offline
                    marcada, a chave e os retratos consultados ficam no dispositivo por até sete
                    dias.
                  </li>
                </Lista>
              </SecaoPolitica>

              <SecaoPolitica id="finalidades" titulo="Finalidades">
                <Paragrafo>Os dados existem para a rotina da escola:</Paragrafo>
                <Lista>
                  <li>Registrar a chamada, as saídas antecipadas e as entradas atrasadas.</li>
                  <li>
                    Consultar frequência, movimentações e indicadores pela equipe autorizada, e
                    estatísticas agregadas pelo diretor de turma no período do vínculo.
                  </li>
                  <li>
                    Apoiar o lançamento separado no sistema da Seduc. A confirmação é manual. O
                    FrequenciApp não envia dados a esse sistema.
                  </li>
                  <li>
                    Autenticar a equipe, limitar tentativas e prestar contas das ações
                    administrativas.
                  </li>
                  <li>
                    Enviar avisos genéricos a quem ativou notificações, e permitir a análise interna
                    no FrequenciBI com chave de leitura.
                  </li>
                  <li>
                    Exportar, se a administração ligar a integração, a frequência e as movimentações
                    para arquivos Google da própria escola.
                  </li>
                </Lista>
                <Paragrafo>
                  O diretor de turma vê apenas alunos ativos da turma de origem vinculada, no
                  período do vínculo, e apenas agregados. Não vê observação, justificativa escrita,
                  quem liberou uma saída, outras turmas nem ação de escrita. Não há cadastro aberto
                  ao público nem uso para publicidade, crédito ou perfilhamento comercial.
                </Paragrafo>
              </SecaoPolitica>

              <SecaoPolitica id="base-legal" titulo="Base legal">
                <Paragrafo>
                  A escola pública trata esses dados no exercício da sua função educacional,
                  observada a Lei 13.709/2018 (LGPD):
                </Paragrafo>
                <Lista>
                  <li>
                    Art. 7º, III, e art. 23: execução de política pública prevista em lei, pela
                    administração pública, para o registro e o acompanhamento da frequência escolar.
                  </li>
                  <li>
                    Art. 7º, II: cumprimento de obrigação legal. A Lei 9.394/1996 exige o controle
                    da frequência para a vida escolar do estudante.
                  </li>
                  <li>
                    Art. 7º, III, também alcança as contas da equipe, a auditoria e o controle de
                    acesso, necessários para operar o mesmo serviço público com segurança (art. 6º,
                    VII, e art. 46).
                  </li>
                  <li>
                    Art. 11, II, b: se um texto livre revelar dado sensível, o tratamento permanece
                    restrito à política pública educacional e ao mínimo necessário. Não há coleta
                    organizada de dado de saúde.
                  </li>
                </Lista>
                <Paragrafo>
                  Os princípios do art. 6º orientam o desenho: finalidade escolar, adequação,
                  necessidade e minimização (a chamada normal não grava a presença um a um), livre
                  acesso pela escola controladora, segurança e transparência por esta página.
                </Paragrafo>
              </SecaoPolitica>

              <SecaoPolitica id="criancas" titulo="Crianças e adolescentes">
                <Paragrafo>
                  Alunos podem ser crianças ou adolescentes. O tratamento observa o melhor interesse
                  (art. 14) e limita-se à vida escolar. O estudante não cria conta nem informa dados
                  diretamente no aplicativo. Quem lança a chamada é a equipe da escola.
                </Paragrafo>
                <Paragrafo>
                  A base não é um consentimento coletado por esta tela. É a política pública e o
                  dever legal da escola, descritos acima. Dados de alunos não são vendidos, não são
                  usados em anúncio e não são publicados pelo aplicativo.
                </Paragrafo>
              </SecaoPolitica>

              <SecaoPolitica id="google" titulo="Integração com o Google">
                <Paragrafo>
                  A integração é opcional e nasce desligada. Sem ela, chamada, relatórios e o
                  restante do aplicativo funcionam. Somente a administração conecta a conta e
                  escolhe os arquivos. O navegador abre o Google Picker para essa escolha explícita.
                </Paragrafo>
                <Paragrafo>
                  O único escopo OAuth solicitado é <Codigo>{ESCOPO}</Codigo>. Esse escopo permite
                  ver, editar, criar e apagar apenas os arquivos que a pessoa cria com o
                  FrequenciApp ou escolhe no Google Picker. O aplicativo não pede acesso ao Drive
                  inteiro, ao Gmail, ao perfil nem à lista geral de arquivos.
                </Paragrafo>
                <Paragrafo>
                  Com a integração ligada, o uso dos arquivos escolhidos é este:
                </Paragrafo>
                <Lista>
                  <li>
                    Planilha de frequência: a chamada reorganizada por turma de origem. O código
                    interno do aluno fica nos metadados do arquivo, visíveis a quem edita a
                    planilha.
                  </li>
                  <li>
                    Outro arquivo, se a finalidade de saídas estiver ligada: saídas antecipadas e
                    entradas atrasadas, com justificativa, observação e responsável.
                  </li>
                  <li>
                    Terceiro arquivo, distinto, se a chamada parcial estiver ligada: uma linha por
                    aluno e dia de chamada salva no período enviado, com data, aluno, turma,
                    presença, estado e instante da confirmação manual, observação, identificador e
                    revisão. A coluna de código usa o formato chamada, código do aluno e dia.
                  </li>
                  <li>
                    Documento de índice das chamadas, pela Google Docs API, no mesmo escopo, com
                    links para os meses do arquivo de frequência.
                  </li>
                  <li>
                    Se uma fonte agregada antiga ainda estiver ativa, somente contagens, sem nome,
                    identificador pessoal, justificativa, motivo ou observação. Totais de grupos
                    pequenos não equivalem a anonimização.
                  </li>
                </Lista>
                <Paragrafo>
                  A autorização usa OAuth 2.0, com estado assinado de curta duração e PKCE. O token
                  de atualização fica cifrado no servidor da escola (AES-256-GCM, com chave derivada
                  do segredo da instalação) e fora da cópia JSON. O token de acesso é renovado no
                  servidor e guardado só em memória, até pouco antes do vencimento. A exceção é um
                  token breve entregue ao navegador da administração apenas para abrir o Google
                  Picker. As leituras e escritas da planilha saem do servidor, pela Sheets API,
                  sobre os arquivos já escolhidos. O aplicativo relê o arquivo para não preencher,
                  no modo conservador, célula ocupada ou com fórmula.
                </Paragrafo>
                <Paragrafo>
                  Desconectar encerra o uso local da credencial. Não apaga o que já foi gravado na
                  conta Google da escola. Trocar de arquivo desliga a integração até nova
                  conferência. A escola controla o compartilhamento desses arquivos no Google.
                </Paragrafo>
                <Paragrafo>
                  Os dados de usuários Google obtidos por esta integração não são vendidos e não são
                  usados para publicidade. Não há função de anúncio, crédito ou treinamento de
                  modelos com esses dados nem com os dados escolares. O uso limita-se a fornecer e
                  manter a função visível de exportar e atualizar os arquivos que a administração
                  escolheu.
                </Paragrafo>
                <Paragrafo>
                  Esse tratamento observa a Google API Services User Data Policy, inclusive os
                  requisitos de Limited Use. Dados obtidos das APIs do Google servem somente a essa
                  funcionalidade voltada à equipe da escola. Não são transferidos a terceiros, salvo
                  para executar a própria função na conta Google da escola, cumprir obrigação legal,
                  proteger a segurança ou atender instrução da escola controladora. Pessoas da
                  equipe autorizada leem os arquivos porque eles pertencem à escola. Quem desenvolve
                  o aplicativo não recebe a base de produção: o serviço roda na infraestrutura da
                  escola, sem telemetria.
                </Paragrafo>
              </SecaoPolitica>

              <SecaoPolitica id="compartilhamento" titulo="Compartilhamento">
                <Paragrafo>
                  Fora da equipe autorizada da escola, o aplicativo só fala com terceiros nestes
                  casos:
                </Paragrafo>
                <Lista>
                  <li>
                    Google, quando a administração liga a integração descrita acima. O conteúdo
                    gravado fica na conta Google da escola.
                  </li>
                  <li>
                    Serviço de push do navegador (endereços aceitos: Google, Mozilla, Apple ou
                    Microsoft), se houver notificações ativas. O aviso não identifica aluno nem
                    turma.
                  </li>
                  <li>
                    OpenStreetMap, quando a equipe abre o mapa do local de uma prova: o navegador
                    baixa as imagens do mapa direto de tile.openstreetmap.org, servidor da
                    OpenStreetMap Foundation, que recebe o endereço IP, o navegador, a origem do
                    aplicativo e a área exibida, que pode ser a vizinhança da posição lida pelo GPS.
                    Não saem alunos, provas nem as coordenadas gravadas. O mapa é dos colaboradores
                    do OpenStreetMap (openstreetmap.org/copyright).
                  </li>
                  <li>
                    Serviço de ruas ou de busca de endereço, somente se a escola configurar o
                    endereço. A consulta de ruas recebe as coordenadas da partida e das paradas. A
                    busca recebe o texto digitado. Não saem nomes de alunos nem a posição contínua
                    de quem acompanha o ônibus. Sem essa configuração, a consulta não acontece.
                  </li>
                  <li>
                    Base de feriados, só quando a administração aciona a sincronização. O servidor
                    envia o ano e, se estiverem configurados, a unidade da federação ou o código
                    IBGE. O padrão do código consulta feriadosapi.com. Não saem alunos, frequências
                    nem senhas.
                  </li>
                  <li>
                    Destino de cópia de segurança escolhido pela escola, se a rotina estiver ligada.
                    O banco é cifrado antes de sair do servidor. O destino remoto, quando existe, vê
                    nome, tamanho e horário do arquivo cifrado, não o conteúdo aberto. A retenção é
                    da escola.
                  </li>
                </Lista>
                <Paragrafo>
                  Não há venda de dados, corretor de publicidade nem operador contratado pelo
                  aplicativo para tratar a frequência. Métricas operacionais, quando a escola as
                  liga no próprio servidor, são agregadas e não contêm nome, e-mail, identificador
                  de aluno nem conteúdo de pedido. O Registro na SEDUC não transmite dados ao
                  sistema da Seduc.
                </Paragrafo>
              </SecaoPolitica>

              <SecaoPolitica id="retencao" titulo="Retenção">
                <Paragrafo>
                  Não há expurgo automático do cadastro nem das chamadas. A escola mantém o
                  histórico escolar pelo tempo exigido pela guarda dos registros e pela própria
                  política interna. A exclusão do aluno apaga o cadastro e, em cascata, faltas,
                  presenças parciais, saídas e entradas. Desativar o aluno tira a pessoa das
                  chamadas futuras e preserva o histórico.
                </Paragrafo>
                <Lista>
                  <li>
                    Sessão da administração, da coordenação e da secretaria: 30 dias se a opção de
                    manter conectado estiver marcada, ou 12 horas sem essa opção. O cookie some ao
                    fechar o navegador quando a sessão não é persistente.
                  </li>
                  <li>
                    Sessão do diretor de turma: o prazo configurado pela administração, com padrão
                    de 12 horas, limitado também pela validade da palavra-chave. O padrão dessa
                    validade é 90 dias. A revogação encerra o acesso.
                  </li>
                  <li>
                    Tentativas de entrada: apagadas depois de um dia sem tentativa nova naquela
                    chave, e também após uma entrada bem-sucedida.
                  </li>
                  <li>
                    Assinatura de notificação: até desativar no dispositivo, excluir a conta ou o
                    serviço recusar o endereço. Registros de entrega saem após 30 dias.
                  </li>
                  <li>
                    Chave do FrequenciBI: até revogação, expiração ou limpeza. O hash permanece
                    enquanto a chave existir. No navegador, o segredo guardado para uso offline
                    expira em sete dias e é removido no logout, ao esquecer a chave ou ao limpar os
                    dados locais.
                  </li>
                  <li>
                    Nomes históricos de quem confirmou o Registro na SEDUC, de quem liberou uma
                    saída e de quem registrou uma entrada permanecem no registro depois da exclusão
                    da conta, para a prestação de contas. A trilha de auditoria também conserva o
                    identificador da ação.
                  </li>
                  <li>
                    Planilhas e documentos Google, arquivos exportados e cópias já extraídas não são
                    apagados quando o registro local some. A escola trata esses destinos à parte.
                  </li>
                </Lista>
              </SecaoPolitica>

              <SecaoPolitica id="seguranca" titulo="Segurança">
                <Paragrafo>
                  A senha usa scrypt. A sessão é opaca, com hash no banco e cookie HttpOnly, Secure
                  em produção com TLS, e SameSite lax. Mutações recusam origem cruzada. O tráfego de
                  produção usa HTTPS. Conta desativada perde a sessão.
                </Paragrafo>
                <Paragrafo>
                  Downloads da gestão e dos relatórios oferecem arquivo ZIP com senha e AES-256 como
                  escolha inicial. A senha do arquivo fica só na memória do navegador. A cópia
                  completa pede de novo a senha de acesso, conferida no servidor com limite de
                  tentativas. A auditoria dessas exportações registra conta, tipo, formato e data,
                  sem o conteúdo.
                </Paragrafo>
                <Paragrafo>
                  Papéis separam as funções: a administração configura a escola e as contas; a
                  coordenação opera a frequência; a secretaria consulta o Painel e as grades de
                  relatório; o diretor de turma apenas lê agregados das próprias turmas. O
                  repositório não contém dados reais de alunos.
                </Paragrafo>
              </SecaoPolitica>

              <SecaoPolitica id="direitos" titulo="Direitos da pessoa titular">
                <Paragrafo>
                  A pessoa titular, ou o responsável legal quando o titular é criança ou
                  adolescente, pode pedir à escola confirmação e acesso, correção, anonimização,
                  bloqueio ou eliminação de dado desnecessário ou excessivo, portabilidade quando
                  couber, informação sobre compartilhamentos e revisão de decisão automatizada. O
                  FrequenciApp não toma decisão exclusivamente automatizada sobre o estudante. O
                  alerta de frequência dos benefícios é um aviso à equipe, calculado sobre as faltas
                  já lançadas, e não decide pagamento nem aprovação.
                </Paragrafo>
                <Paragrafo>No próprio aplicativo, a escola dispõe de:</Paragrafo>
                <Lista>
                  <li>Consulta da frequência por aluno e da grade por turma de origem.</li>
                  <li>
                    Correção de nome, turmas, chamada, presença parcial e retirada de saída ou
                    entrada.
                  </li>
                  <li>
                    Eliminação do aluno, que apaga o cadastro e os registros vinculados. Nomes já
                    copiados para planilha externa ou para o retrato histórico exigem tratamento à
                    parte.
                  </li>
                  <li>
                    Cópia JSON dos dados escolares na gestão, e o despejo do banco na operação da
                    escola. A cópia JSON não inclui a credencial Google.
                  </li>
                  <li>
                    Exclusão de conta da equipe, que remove acesso, sessões e assinaturas de aviso.
                    Os registros escolares permanecem, com a autoria anulada onde o sistema a anula.
                  </li>
                </Lista>
                <Paragrafo>
                  Há hipóteses em que a escola precisa conservar o histórico escolar ou a trilha de
                  prestação de contas. Nesses casos a eliminação pode ser limitada ao que a lei
                  educacional e a LGPD permitirem, com a resposta fundamentada pela escola.
                </Paragrafo>
                <Paragrafo>
                  Também cabe reclamação à Autoridade Nacional de Proteção de Dados. O canal
                  interno, abaixo, é o primeiro passo para a escola localizar o registro.
                </Paragrafo>
              </SecaoPolitica>

              <SecaoPolitica id="contato" titulo="Contato">
                <Paragrafo>
                  Solicitações sobre dados pessoais são atendidas pela gestão da EEMTI José Cláudio
                  de Araújo, em Mucambo, Ceará. O art. 41 da LGPD prevê um encarregado. O nome e o
                  e-mail institucionais ainda não foram publicados nesta página:
                </Paragrafo>
                <Lista>
                  <li>
                    Encarregado: <Lacuna campo="encarregado" />
                  </li>
                  <li>
                    E-mail: <Lacuna campo="email" />
                  </li>
                </Lista>
                <Typography variant="caption" component="p" sx={{ color: "text.secondary" }}>
                  Os textos entre colchetes com o prefixo PREENCHER são lacunas. Não são endereço
                  válido. Até o preenchimento, o pedido segue pela gestão da escola.
                </Typography>
              </SecaoPolitica>

              <SecaoPolitica id="atualizacao" titulo="Atualização desta política">
                <Paragrafo>
                  A página em {ROTA_PRIVACIDADE} é a versão vigente. O endereço
                  /politica-de-privacidade redireciona para ela. Mudança relevante de tratamento
                  atualiza a data no topo. O uso continuado pela equipe, depois da publicação,
                  ocorre sobre o texto novo. Direitos já exercíveis não dependem de nova
                  concordância nesta tela.
                </Paragrafo>
              </SecaoPolitica>
            </Paper>

            <Divider />
            <Stack
              component="footer"
              direction={{ xs: "column", sm: "row" }}
              spacing={1}
              sx={{ alignItems: { sm: "center" }, justifyContent: "space-between" }}
            >
              <Link
                href="/"
                variant="body2"
                underline="hover"
                sx={{
                  display: "inline-flex",
                  alignItems: "center",
                  minHeight: TOKENS_LAYOUT.alvoToque,
                }}
              >
                Voltar ao início
              </Link>
              <Typography variant="caption" sx={{ color: "text.secondary" }}>
                Licença MIT. FrequenciApp {pacote.version}.
              </Typography>
            </Stack>
          </Stack>
        </LayoutConteudo>
      </LayoutPagina>
    </Box>
  );
}
