"use client";

// Aba de equipe: contas da coordenação, da secretaria e da administração, com
// papel, senha e situação. Sem atribuições de turma.
import { useEffect, useMemo, useState } from "react";
import AddRoundedIcon from "@mui/icons-material/AddRounded";
import DeleteRoundedIcon from "@mui/icons-material/DeleteRounded";
import EditRoundedIcon from "@mui/icons-material/EditRounded";
import PersonAddRoundedIcon from "@mui/icons-material/PersonAddRounded";
import PowerSettingsNewRoundedIcon from "@mui/icons-material/PowerSettingsNewRounded";
import SearchOffRoundedIcon from "@mui/icons-material/SearchOffRounded";
import CircularProgress from "@mui/material/CircularProgress";
import Stack from "@mui/material/Stack";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableRow from "@mui/material/TableRow";
import Typography from "@mui/material/Typography";
import { EstadoVazio } from "@/components/layout/estado-vazio";
import { useLeituraDaVisao } from "@/components/layout/quadro-das-visoes";
import { Botao, BotaoIcone } from "@/components/ui/mui/botao";
import { BarraBusca } from "@/components/ui/mui/barra-busca";
import { Campo } from "@/components/ui/mui/campo";
import { CampoTexto } from "@/components/ui/mui/text-field";
import { CampoSenha } from "@/components/ui/mui/campo-senha";
import { Selecionar } from "@/components/ui/mui/selecionar";
import { Dialogo } from "@/components/ui/mui/dialogo";
import { DialogoConfirmacao } from "@/components/ui/mui/dialogo-confirmacao";
import { AlertaCompacto, type VarianteEstado } from "@/components/ui/mui/tela-estado";
import { Selo } from "@/components/ui/mui/selo";
import { ehPapelDaEquipe, rotuloDePapel, type Papel, type UsuarioDTO } from "@/domain/usuarios";
import { normalizar } from "@/domain/frequencia";
import { useAvisosDaSessao } from "@/lib/avisos";
import { estadoDeErro } from "@/lib/estado-http";
import { useAcaoUnica, useAcoesPorChave } from "@/lib/use-acao-unica";
import { pedir, corpoJson, corpoAlteracao, ErroApi } from "@/lib/api-cliente";
import { TOKENS_LAYOUT } from "@/theme/layout";
import { TextoDeCarregamento } from "@/components/ui/mui/texto-de-carregamento";
import { TabelaCadastrosAdministrativos } from "./tabela-cadastros-administrativos";

interface Props {
  usuarioId: string;
  onMudanca: () => Promise<void>;
  atualizacao?: number;
}

interface Formulario {
  nome: string;
  email: string;
  senha: string;
  papel: Papel;
}

const VAZIO: Formulario = { nome: "", email: "", senha: "", papel: "COORDENACAO" };

const ALVO_ACAO = {
  width: TOKENS_LAYOUT.alvoToque,
  height: TOKENS_LAYOUT.alvoToque,
} as const;

export default function AbaEquipe({ usuarioId, onMudanca, atualizacao = 0 }: Props) {
  const { avisarErro, avisarSucesso } = useAvisosDaSessao();
  const [usuarios, setUsuarios] = useState<UsuarioDTO[] | null>(null);
  useLeituraDaVisao(usuarios === null);
  const [dialogoAberto, setDialogoAberto] = useState(false);
  const [emEdicao, setEmEdicao] = useState<UsuarioDTO | null>(null);
  const [formulario, setFormulario] = useState<Formulario>(VAZIO);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState("");
  const [erroVariante, setErroVariante] = useState<VarianteEstado>("dados_invalidos");
  const [excluirAlvo, setExcluirAlvo] = useState<UsuarioDTO | null>(null);

  const { executando: carregando, executar: recarregar } = useAcaoUnica(async () => {
    try {
      const dados = await pedir<{ usuarios: UsuarioDTO[] }>("/api/usuarios");
      setUsuarios(dados.usuarios);
    } catch (excecao) {
      avisarErro(excecao, { contexto: "Não foi possível carregar a equipe." });
      setUsuarios([]);
    }
  });

  const { chaveAtiva, executar: executarPorChave } = useAcoesPorChave();

  useEffect(() => {
    void recarregar();
  }, [recarregar, atualizacao]);

  const administradoresAtivos = useMemo(
    () => (usuarios ?? []).filter((u) => u.papel === "ADMIN" && u.ativo).length,
    [usuarios],
  );
  const [busca, setBusca] = useState("");
  const termo = normalizar(busca);
  const usuariosFiltrados = (usuarios ?? []).filter(
    (usuario) => termo === "" || normalizar(`${usuario.nome} ${usuario.email}`).includes(termo),
  );

  function abrirNovo() {
    setEmEdicao(null);
    setFormulario(VAZIO);
    setErro("");
    setDialogoAberto(true);
  }

  function abrirEdicao(usuario: UsuarioDTO) {
    setEmEdicao(usuario);
    setFormulario({
      nome: usuario.nome,
      email: usuario.email,
      senha: "",
      papel: usuario.papel,
    });
    setErro("");
    setDialogoAberto(true);
  }

  async function submeter() {
    if (enviando) return;
    setEnviando(true);
    setErro("");
    try {
      if (emEdicao) {
        const corpo: Record<string, unknown> = {
          nome: formulario.nome,
          email: formulario.email,
          papel: formulario.papel,
        };
        if (formulario.senha !== "") corpo.senha = formulario.senha;
        await pedir<{ usuario: UsuarioDTO }>(
          `/api/usuarios/${emEdicao.id}`,
          corpoAlteracao("PATCH", corpo),
        );
        avisarSucesso(
          "Conta atualizada.",
          corpo.senha !== undefined
            ? "Os acessos abertos foram encerrados; a pessoa entra de novo com a senha nova."
            : "Os dados novos valem no próximo acesso.",
        );
      } else {
        await pedir<{ usuario: UsuarioDTO }>("/api/usuarios", corpoJson(formulario));
        avisarSucesso("Conta criada.", "A pessoa entra com o e-mail e a senha cadastrados.");
      }
      setDialogoAberto(false);
      await recarregar();
      await onMudanca();
    } catch (excecao) {
      setErro(excecao instanceof ErroApi ? excecao.message : "Não foi possível salvar a conta.");
      setErroVariante(estadoDeErro(excecao));
      avisarErro(excecao, { contexto: "Não foi possível salvar a conta." });
    } finally {
      setEnviando(false);
    }
  }

  function alternarAtivo(usuario: UsuarioDTO) {
    void executarPorChave(usuario.id, async () => {
      try {
        await pedir<{ usuario: UsuarioDTO }>(
          `/api/usuarios/${usuario.id}`,
          corpoAlteracao("PATCH", { ativo: !usuario.ativo }),
        );
        avisarSucesso(
          usuario.ativo ? "Conta desativada." : "Conta reativada.",
          usuario.ativo
            ? "A pessoa perde o acesso, mas o histórico é preservado."
            : "A pessoa volta a entrar com a senha de sempre.",
        );
        await recarregar();
      } catch (excecao) {
        avisarErro(excecao, { contexto: "Não foi possível alterar a conta." });
      }
    });
  }

  function excluir(usuario: UsuarioDTO) {
    void executarPorChave(usuario.id, async () => {
      try {
        await pedir<{ ok: boolean }>(`/api/usuarios/${usuario.id}`, corpoAlteracao("DELETE"));
        avisarSucesso(
          "Conta excluída.",
          "O histórico fica sem autoria e as faltas continuam salvas.",
        );
        await recarregar();
      } catch (excecao) {
        avisarErro(excecao, { contexto: "Não foi possível excluir a conta." });
      }
    });
  }

  return (
    <Stack spacing={2}>
      <Stack
        direction="row"
        spacing={2}
        useFlexGap
        sx={{ alignItems: "center", justifyContent: "space-between", flexWrap: "wrap" }}
      >
        <Typography variant="body2" sx={{ color: "text.secondary" }}>
          {usuarios === null
            ? null
            : `${usuarios.filter((u) => u.papel === "COORDENACAO").length} coordenação · ${usuarios.filter((u) => u.papel === "SECRETARIA").length} secretaria · ${usuarios.filter((u) => u.papel === "ADMIN").length} administração`}
        </Typography>
        <Botao variante="principal" icone={<AddRoundedIcon />} onClick={abrirNovo}>
          Nova conta
        </Botao>
      </Stack>

      {carregando ? (
        <Stack
          direction="row"
          spacing={1}
          sx={{
            alignItems: "center",
            justifyContent: "center",
            minHeight: 128,
            color: "text.secondary",
          }}
        >
          <CircularProgress size={20} aria-hidden="true" />
          <TextoDeCarregamento>Carregando contas...</TextoDeCarregamento>
        </Stack>
      ) : (usuarios ?? []).length === 0 ? (
        <EstadoVazio
          icone={<PersonAddRoundedIcon />}
          titulo="Nenhuma conta além da sua"
          descricao="Crie a conta de cada pessoa da equipe para liberar o acesso."
          acao={
            <Botao variante="contorno" icone={<AddRoundedIcon />} onClick={abrirNovo}>
              Criar conta
            </Botao>
          }
        />
      ) : (
        <Stack spacing={2}>
          <BarraBusca
            id="busca-equipe"
            valor={busca}
            onValor={setBusca}
            placeholder="Buscar por nome ou e-mail"
          />
          {usuariosFiltrados.length === 0 ? (
            <EstadoVazio
              icone={<SearchOffRoundedIcon />}
              titulo="Nenhuma conta encontrada"
              descricao="Tente outro termo de busca."
            />
          ) : (
            <TabelaCadastrosAdministrativos
              caption="Contas da coordenação, da secretaria e da administração."
              identidade="Conta"
            >
              <TableBody role="rowgroup">
                {usuariosFiltrados.map((usuario) => {
                  const propria = usuario.id === usuarioId;
                  const ultimoAdmin =
                    usuario.papel === "ADMIN" && usuario.ativo && administradoresAtivos === 1;
                  return (
                    <TableRow key={usuario.id} data-conta={usuario.id} role="row">
                      <TableCell component="th" scope="row" role="rowheader">
                        <Stack spacing={0.5} sx={{ minWidth: 0 }}>
                          <Typography sx={{ fontWeight: 600 }}>{usuario.nome}</Typography>
                          <Typography variant="body2" sx={{ color: "text.secondary" }}>
                            {usuario.email}
                          </Typography>
                          <Stack
                            direction="row"
                            spacing={1}
                            useFlexGap
                            sx={{ alignItems: "center", flexWrap: "wrap" }}
                          >
                            <Selo
                              rotulo={rotuloDePapel(usuario.papel)}
                              tom={usuario.papel === "ADMIN" ? "atencao" : "neutro"}
                            />
                            {propria ? <Selo rotulo="Você" tom="sucesso" /> : null}
                            {!usuario.ativo ? <Selo rotulo="desativada" /> : null}
                          </Stack>
                          {usuario.ativo ? (
                            <Typography variant="caption" sx={{ color: "text.secondary" }}>
                              ativa
                            </Typography>
                          ) : null}
                        </Stack>
                      </TableCell>
                      <TableCell align="right" role="cell">
                        <Stack
                          direction="row"
                          spacing={0.5}
                          sx={{ justifyContent: "flex-end", flexWrap: "wrap" }}
                        >
                          <BotaoIcone
                            rotulo={`Editar conta de ${usuario.nome}`}
                            icone={<EditRoundedIcon fontSize="small" />}
                            variante="texto"
                            sx={ALVO_ACAO}
                            onClick={() => abrirEdicao(usuario)}
                          />
                          {!propria ? (
                            <BotaoIcone
                              rotulo={
                                usuario.ativo
                                  ? `Desativar conta de ${usuario.nome}`
                                  : `Reativar conta de ${usuario.nome}`
                              }
                              icone={<PowerSettingsNewRoundedIcon fontSize="small" />}
                              variante="texto"
                              sx={ALVO_ACAO}
                              disabled={ultimoAdmin || chaveAtiva === usuario.id}
                              title={
                                ultimoAdmin
                                  ? "A escola precisa de ao menos um administrador ativo."
                                  : undefined
                              }
                              onClick={() => alternarAtivo(usuario)}
                            />
                          ) : null}
                          {!propria ? (
                            <BotaoIcone
                              rotulo={`Excluir conta de ${usuario.nome}`}
                              icone={<DeleteRoundedIcon fontSize="small" />}
                              variante="texto"
                              sx={[ALVO_ACAO, (tema) => ({ color: tema.vars.palette.falta.texto })]}
                              disabled={chaveAtiva === usuario.id}
                              onClick={() => setExcluirAlvo(usuario)}
                            />
                          ) : null}
                        </Stack>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </TabelaCadastrosAdministrativos>
          )}
        </Stack>
      )}

      <Dialogo
        aberto={dialogoAberto}
        onFechar={() => setDialogoAberto(false)}
        titulo={emEdicao ? `Editar ${emEdicao.nome}` : "Nova conta"}
        quebrarTitulo
        tamanho="grande"
        acoes={
          <>
            <Botao variante="texto" onClick={() => setDialogoAberto(false)}>
              Cancelar
            </Botao>
            <Botao variante="secundario" carregando={enviando} onClick={() => void submeter()}>
              {emEdicao ? "Salvar" : "Criar"}
            </Botao>
          </>
        }
      >
        <form
          onSubmit={(evento) => {
            evento.preventDefault();
            void submeter();
          }}
          noValidate
        >
          <Stack spacing={2}>
            <Campo id="nome-usuario" rotulo="Nome">
              <CampoTexto
                valor={formulario.nome}
                onValor={(nome) => setFormulario((atual) => ({ ...atual, nome }))}
                required
                maxLength={100}
                autoComplete="off"
                placeholder="Nome de tratamento"
              />
            </Campo>
            <Campo id="email-usuario" rotulo="E-mail de acesso">
              <CampoTexto
                valor={formulario.email}
                onValor={(email) => setFormulario((atual) => ({ ...atual, email }))}
                tipo="email"
                required
                autoComplete="off"
                inputMode="email"
                placeholder="pessoa@escola.br"
              />
            </Campo>
            {emEdicao?.id === usuarioId ? (
              <Typography variant="caption" sx={{ color: "text.secondary" }}>
                A sua própria senha muda no ícone de senha do cabeçalho, com a senha atual.
              </Typography>
            ) : (
              <Campo
                id="senha-usuario"
                rotulo={emEdicao ? "Nova senha (opcional)" : "Senha inicial"}
                descricao={
                  emEdicao
                    ? "Redefinir a senha encerra os acessos abertos da pessoa."
                    : "A pessoa troca a senha depois, no ícone de senha do cabeçalho."
                }
              >
                <CampoSenha
                  valor={formulario.senha}
                  onValor={(senha) => setFormulario((atual) => ({ ...atual, senha }))}
                  autoComplete="new-password"
                  required={emEdicao === null}
                  placeholder="Mínimo 8 caracteres, com letra e número"
                />
              </Campo>
            )}
            <Campo id="papel-usuario" rotulo="Papel">
              <Selecionar
                valor={formulario.papel}
                disabled={emEdicao?.id === usuarioId}
                onValor={(valor) =>
                  setFormulario((atual) => ({
                    ...atual,
                    papel: ehPapelDaEquipe(valor as Papel) ? (valor as Papel) : "COORDENACAO",
                  }))
                }
                opcoes={[
                  { valor: "COORDENACAO", rotulo: "Coordenação" },
                  { valor: "SECRETARIA", rotulo: "Secretaria (só consulta)" },
                  { valor: "ADMIN", rotulo: "Administração (acesso total)" },
                ]}
              />
            </Campo>
            {formulario.papel === "SECRETARIA" ? (
              <Typography variant="caption" sx={{ color: "text.secondary" }}>
                A Secretaria vê o Painel e, em Relatórios, a Grade e o Por aluno. Não faz chamada
                nem registra saídas, entradas ou provas.
              </Typography>
            ) : null}
            {emEdicao?.id === usuarioId ? (
              <Typography variant="caption" sx={{ color: "text.secondary" }}>
                O próprio acesso de administração não pode ser removido.
              </Typography>
            ) : null}
            {erro ? (
              <AlertaCompacto variante={erroVariante} descricao={erro} tamanho="linha" />
            ) : null}
          </Stack>
        </form>
      </Dialogo>

      <DialogoConfirmacao
        aberto={excluirAlvo !== null}
        titulo={`Excluir a conta de ${excluirAlvo?.nome ?? ""}?`}
        quebrarTitulo
        descricao="A exclusão remove o acesso. As frequências da escola são preservadas, sem a autoria desta conta."
        rotuloConfirmar="Excluir"
        destrutivo
        operacaoEmAndamento={excluirAlvo !== null && chaveAtiva === excluirAlvo.id}
        onConfirmar={() => {
          const alvo = excluirAlvo;
          setExcluirAlvo(null);
          if (alvo) excluir(alvo);
        }}
        onCancelar={() => setExcluirAlvo(null)}
      />
    </Stack>
  );
}
