"use client";

// Aba de equipe: contas da coordenação e da administração, com papel,
// senha e situação. Sem atribuições de turma.
import { useCallback, useEffect, useMemo, useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import { KeyRound, LoaderCircle, Pencil, Plus, Power, Trash2, UserRound } from "lucide-react";
import { toast } from "sonner";
import { avisarErro, avisarSucesso } from "@/lib/avisos";
import { rotuloDePapel, type Papel, type UsuarioDTO } from "@/domain/usuarios";
import { normalizar } from "@/domain/frequencia";
import { pedir, corpoJson, corpoAlteracao, ErroApi } from "@/lib/api-cliente";
import { Button } from "@/components/ui/button";
import { CampoSenha } from "@/components/ui/campo-senha";
import { Input } from "@/components/ui/input";
import { BarraBusca } from "@/components/ui/barra-busca";
import { Label } from "@/components/ui/label";
import { Selecionar } from "@/components/ui/selecionar";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

interface Props {
  usuarioId: string;
  onMudanca: () => Promise<void>;
}

interface Formulario {
  nome: string;
  email: string;
  senha: string;
  papel: Papel;
}

const VAZIO: Formulario = { nome: "", email: "", senha: "", papel: "COORDENACAO" };

export default function AbaEquipe({ usuarioId, onMudanca }: Props) {
  const [usuarios, setUsuarios] = useState<UsuarioDTO[] | null>(null);
  const semMovimento = useReducedMotion() ?? false;
  const [carregando, setCarregando] = useState(true);
  const [dialogoAberto, setDialogoAberto] = useState(false);
  const [emEdicao, setEmEdicao] = useState<UsuarioDTO | null>(null);
  const [formulario, setFormulario] = useState<Formulario>(VAZIO);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState("");

  const recarregar = useCallback(async () => {
    setCarregando(true);
    try {
      const dados = await pedir<{ usuarios: UsuarioDTO[] }>("/api/usuarios");
      setUsuarios(dados.usuarios);
    } catch (excecao) {
      const mensagem =
        excecao instanceof ErroApi ? excecao.message : "Não foi possível carregar a equipe.";
      toast.error(mensagem);
      setUsuarios([]);
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => {
    void recarregar();
  }, [recarregar]);

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
        avisarSucesso("Conta atualizada.", "Os dados novos valem no próximo acesso.");
      } else {
        await pedir<{ usuario: UsuarioDTO }>("/api/usuarios", corpoJson(formulario));
        avisarSucesso("Conta criada.", "A pessoa entra com o e-mail e a senha cadastrados.");
      }
      setDialogoAberto(false);
      await recarregar();
      await onMudanca();
    } catch (excecao) {
      setErro(excecao instanceof ErroApi ? excecao.message : "Não foi possível salvar a conta.");
      avisarErro(excecao, { contexto: "Não foi possível salvar a conta." });
    } finally {
      setEnviando(false);
    }
  }

  async function alternarAtivo(usuario: UsuarioDTO) {
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
      const mensagem =
        excecao instanceof ErroApi ? excecao.message : "Não foi possível alterar a conta.";
      toast.error(mensagem);
    }
  }

  async function excluir(usuario: UsuarioDTO) {
    try {
      await pedir<{ ok: boolean }>(`/api/usuarios/${usuario.id}`, corpoAlteracao("DELETE"));
      avisarSucesso(
        "Conta excluída.",
        "O histórico fica sem autoria e as faltas continuam salvas.",
      );
      await recarregar();
    } catch (excecao) {
      const mensagem =
        excecao instanceof ErroApi ? excecao.message : "Não foi possível excluir a conta.";
      toast.error(mensagem);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-muted-foreground text-sm">
          {usuarios === null
            ? "Carregando..."
            : `${usuarios.filter((u) => u.papel === "COORDENACAO").length} coordenação · ${usuarios.filter((u) => u.papel === "ADMIN").length} administração`}
        </p>
        <Button size="lg" className="h-11 rounded-lg" onClick={abrirNovo}>
          <Plus size={16} />
          Nova conta
        </Button>
      </div>

      <p className="bg-secondary/60 text-secondary-foreground rounded-lg border px-4 py-3 text-xs leading-relaxed">
        Cada pessoa entra com o próprio e-mail e senha. A coordenação faz a frequência e consulta o
        histórico; a administração também cuida de contas e cadastros. Ao desativar, o acesso é
        bloqueado na hora.
      </p>

      {carregando ? (
        <div className="text-muted-foreground flex min-h-32 items-center justify-center gap-2 text-sm">
          <LoaderCircle size={18} className="animate-spin" aria-hidden="true" />
          Carregando contas...
        </div>
      ) : (usuarios ?? []).length === 0 ? (
        <div className="bg-card flex min-h-44 flex-col items-center justify-center gap-2 rounded-lg border px-6 text-center">
          <UserRound size={28} className="text-muted-foreground" aria-hidden="true" />
          <p className="font-medium">Nenhuma conta além da sua</p>
          <p className="text-muted-foreground text-sm">
            Crie a conta de cada pessoa da equipe para liberar o acesso.
          </p>
          <Button variant="outline" className="mt-2" onClick={abrirNovo}>
            <Plus size={16} />
            Criar conta
          </Button>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          <BarraBusca
            id="busca-equipe"
            valor={busca}
            onValor={setBusca}
            placeholder="Buscar por nome ou e-mail"
          />
          {usuariosFiltrados.length === 0 ? (
            <div className="bg-card flex min-h-40 flex-col items-center justify-center gap-1 rounded-lg border px-6 text-center">
              <p className="font-medium">Nenhuma conta encontrada</p>
              <p className="text-muted-foreground text-sm">Tente outro termo de busca.</p>
            </div>
          ) : (
            <ul className="flex flex-col gap-3">
              {usuariosFiltrados.map((usuario) => {
                const propria = usuario.id === usuarioId;
                const ultimoAdmin =
                  usuario.papel === "ADMIN" && usuario.ativo && administradoresAtivos === 1;
                return (
                  <motion.li
                    key={usuario.id}
                    initial={semMovimento ? false : { opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={semMovimento ? { duration: 0 } : { duration: 0.2 }}
                    className={`bg-card overflow-hidden rounded-lg border ${usuario.ativo ? "" : "opacity-60"}`}
                  >
                    <div className="flex items-center gap-3 px-4 py-3">
                      <div className="min-w-0 flex-1">
                        <p className="flex items-center gap-2 truncate font-medium">
                          {usuario.nome}
                          <span className="bg-secondary text-secondary-foreground rounded-full px-2 py-0.5 text-[10px] font-medium whitespace-nowrap">
                            {rotuloDePapel(usuario.papel)}
                          </span>
                          {propria && (
                            <span className="bg-primary/15 text-primary rounded-full px-2 py-0.5 text-[10px] font-medium whitespace-nowrap">
                              Você
                            </span>
                          )}
                        </p>
                        <p className="text-muted-foreground truncate text-sm">{usuario.email}</p>
                        <p className="text-muted-foreground mt-0.5 text-xs">
                          {usuario.ativo ? "ativa" : "desativada"}
                        </p>
                      </div>
                      <div className="flex shrink-0 items-center gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-11"
                          aria-label={`Editar conta de ${usuario.nome}`}
                          onClick={() => abrirEdicao(usuario)}
                        >
                          <Pencil size={16} />
                        </Button>
                        {!propria && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="size-11"
                            aria-label={
                              usuario.ativo
                                ? `Desativar conta de ${usuario.nome}`
                                : `Reativar conta de ${usuario.nome}`
                            }
                            disabled={ultimoAdmin}
                            title={
                              ultimoAdmin
                                ? "A escola precisa de ao menos um administrador ativo."
                                : undefined
                            }
                            onClick={() => alternarAtivo(usuario)}
                          >
                            <Power size={16} />
                          </Button>
                        )}
                        {!propria && (
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="text-falta-texto size-11"
                                aria-label={`Excluir conta de ${usuario.nome}`}
                              >
                                <Trash2 size={16} />
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>
                                  Excluir a conta de {usuario.nome}?
                                </AlertDialogTitle>
                                <AlertDialogDescription>
                                  A exclusão remove o acesso. As frequências da escola são
                                  preservadas, sem a autoria desta conta.
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Cancelar</AlertDialogCancel>
                                <AlertDialogAction
                                  className="bg-falta text-falta-foreground hover:bg-falta/90"
                                  onClick={() => excluir(usuario)}
                                >
                                  Excluir
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        )}
                      </div>
                    </div>
                  </motion.li>
                );
              })}
            </ul>
          )}
        </div>
      )}

      <Dialog open={dialogoAberto} onOpenChange={setDialogoAberto}>
        <DialogContent className="max-h-[90dvh] max-w-sm overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{emEdicao ? `Editar ${emEdicao.nome}` : "Nova conta"}</DialogTitle>
          </DialogHeader>
          <form
            className="flex flex-col gap-4"
            onSubmit={(evento) => {
              evento.preventDefault();
              void submeter();
            }}
            noValidate
          >
            <div className="flex flex-col gap-2">
              <Label htmlFor="nome-usuario">Nome</Label>
              <Input
                id="nome-usuario"
                value={formulario.nome}
                required
                maxLength={100}
                autoComplete="off"
                onChange={(evento) =>
                  setFormulario((atual) => ({ ...atual, nome: evento.target.value }))
                }
                placeholder="Nome de tratamento"
                className="h-11 rounded-lg"
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="email-usuario">E-mail de acesso</Label>
              <Input
                id="email-usuario"
                type="email"
                value={formulario.email}
                required
                autoComplete="off"
                inputMode="email"
                onChange={(evento) =>
                  setFormulario((atual) => ({ ...atual, email: evento.target.value }))
                }
                placeholder="pessoa@escola.br"
                className="h-11 rounded-lg"
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="senha-usuario">
                {emEdicao ? "Nova senha (opcional)" : "Senha inicial"}
              </Label>
              <div className="relative">
                <KeyRound
                  size={15}
                  aria-hidden="true"
                  className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 -translate-y-1/2"
                />
                <CampoSenha
                  id="senha-usuario"
                  value={formulario.senha}
                  autoComplete="new-password"
                  minLength={emEdicao ? 0 : 8}
                  required={emEdicao === null}
                  onChange={(evento) =>
                    setFormulario((atual) => ({ ...atual, senha: evento.target.value }))
                  }
                  placeholder="Mínimo 8 caracteres, com letra e número"
                  className="h-11 rounded-lg pl-9"
                />
              </div>
              <p className="text-muted-foreground text-xs">
                A pessoa troca a senha depois, no ícone de senha do cabeçalho.
              </p>
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="papel-usuario">Papel</Label>
              <Selecionar
                id="papel-usuario"
                value={formulario.papel}
                disabled={emEdicao?.id === usuarioId}
                onValueChange={(valor) =>
                  setFormulario((atual) => ({
                    ...atual,
                    papel: valor === "ADMIN" ? "ADMIN" : "COORDENACAO",
                  }))
                }
                opcoes={[
                  { valor: "COORDENACAO", rotulo: "Coordenação" },
                  { valor: "ADMIN", rotulo: "Administração (acesso total)" },
                ]}
              />
              {emEdicao?.id === usuarioId && (
                <p className="text-muted-foreground text-xs">
                  O próprio acesso de administração não pode ser removido.
                </p>
              )}
            </div>
            {erro && (
              <p
                role="alert"
                className="bg-falta-fraca text-falta-texto rounded-lg px-3 py-2 text-sm"
              >
                {erro}
              </p>
            )}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setDialogoAberto(false)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={enviando}>
                {enviando && <LoaderCircle size={16} className="animate-spin" />}
                {emEdicao ? "Salvar" : "Criar"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
