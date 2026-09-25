"use client";

// Aba de professores: contas, papéis, senhas e turmas atribuídas.
// A senha de cada professor é definida aqui; ele pode trocá-la depois.
import { useCallback, useEffect, useMemo, useState } from "react";
import { motion } from "motion/react";
import {
  Check,
  KeyRound,
  LoaderCircle,
  Pencil,
  Plus,
  Power,
  Trash2,
  UserRound,
} from "lucide-react";
import { toast } from "sonner";
import type { Turma } from "@/domain/frequencia";
import { rotuloDePapel, type UsuarioComTurmas } from "@/domain/usuarios";
import { pedir, corpoJson, corpoAlteracao, ErroApi } from "@/lib/api-cliente";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
  turmas: Turma[];
  onMudanca: () => Promise<void>;
  rotuloTurma: (id: string) => string;
}

interface Formulario {
  nome: string;
  email: string;
  senha: string;
  papel: "ADMIN" | "PROFESSOR";
  turmas: string[];
}

const VAZIO: Formulario = { nome: "", email: "", senha: "", papel: "PROFESSOR", turmas: [] };

export default function AbaProfessores({ turmas, onMudanca, rotuloTurma }: Props) {
  const [usuarios, setUsuarios] = useState<UsuarioComTurmas[] | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [dialogoAberto, setDialogoAberto] = useState(false);
  const [emEdicao, setEmEdicao] = useState<UsuarioComTurmas | null>(null);
  const [formulario, setFormulario] = useState<Formulario>(VAZIO);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState("");

  const recarregar = useCallback(async () => {
    setCarregando(true);
    try {
      const dados = await pedir<{ usuarios: UsuarioComTurmas[] }>("/api/usuarios");
      setUsuarios(dados.usuarios);
    } catch (excecao) {
      const mensagem =
        excecao instanceof ErroApi ? excecao.message : "Não foi possível carregar os professores.";
      toast.error(mensagem);
      setUsuarios([]);
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => {
    void recarregar();
  }, [recarregar]);

  const rotulo = useMemo(
    () => (id: string) => turmas.find((t) => t.id === id)?.rotulo ?? rotuloTurma(id),
    [turmas, rotuloTurma],
  );

  function abrirNovo() {
    setEmEdicao(null);
    setFormulario(VAZIO);
    setErro("");
    setDialogoAberto(true);
  }

  function abrirEdicao(usuario: UsuarioComTurmas) {
    setEmEdicao(usuario);
    setFormulario({
      nome: usuario.nome,
      email: usuario.email,
      senha: "",
      papel: usuario.papel,
      turmas: [...usuario.turmas],
    });
    setErro("");
    setDialogoAberto(true);
  }

  function alternarTurma(turmaId: string) {
    setFormulario((atual) => ({
      ...atual,
      turmas: atual.turmas.includes(turmaId)
        ? atual.turmas.filter((id) => id !== turmaId)
        : [...atual.turmas, turmaId],
    }));
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
          turmas: formulario.turmas,
        };
        if (formulario.senha !== "") corpo.senha = formulario.senha;
        await pedir<{ usuario: UsuarioComTurmas }>(
          `/api/usuarios/${emEdicao.id}`,
          corpoAlteracao("PATCH", corpo),
        );
        toast.success("Conta atualizada.");
      } else {
        await pedir<{ usuario: UsuarioComTurmas }>("/api/usuarios", corpoJson(formulario));
        toast.success("Conta criada.");
      }
      setDialogoAberto(false);
      await recarregar();
      await onMudanca();
    } catch (excecao) {
      setErro(excecao instanceof ErroApi ? excecao.message : "Não foi possível salvar a conta.");
    } finally {
      setEnviando(false);
    }
  }

  async function alternarAtivo(usuario: UsuarioComTurmas) {
    try {
      await pedir<{ usuario: UsuarioComTurmas }>(
        `/api/usuarios/${usuario.id}`,
        corpoAlteracao("PATCH", { ativo: !usuario.ativo }),
      );
      toast.success(usuario.ativo ? "Conta desativada." : "Conta reativada.");
      await recarregar();
    } catch (excecao) {
      const mensagem =
        excecao instanceof ErroApi ? excecao.message : "Não foi possível alterar a conta.";
      toast.error(mensagem);
    }
  }

  async function excluir(usuario: UsuarioComTurmas) {
    try {
      await pedir<{ ok: boolean }>(`/api/usuarios/${usuario.id}`, corpoAlteracao("DELETE"));
      toast.success("Conta excluída.");
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
            : `${usuarios.filter((u) => u.papel === "PROFESSOR").length} professores · ${usuarios.filter((u) => u.papel === "ADMIN").length} administradores`}
        </p>
        <Button size="lg" className="h-11 rounded-lg" onClick={abrirNovo}>
          <Plus size={16} />
          Nova conta
        </Button>
      </div>

      <p className="bg-secondary/60 text-secondary-foreground rounded-lg border px-4 py-3 text-xs leading-relaxed">
        Cada professor entra com o próprio e-mail e senha. Marque as turmas que ele pode chamar. Ao
        desativar, o acesso é bloqueado na hora.
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
            Crie a conta de cada professor para liberar o acesso.
          </p>
          <Button variant="outline" className="mt-2" onClick={abrirNovo}>
            <Plus size={16} />
            Criar conta
          </Button>
        </div>
      ) : (
        <ul className="flex flex-col gap-3">
          {(usuarios ?? []).map((usuario) => (
            <motion.li
              key={usuario.id}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.2 }}
              className={`bg-card overflow-hidden rounded-lg border ${usuario.ativo ? "" : "opacity-60"}`}
            >
              <div className="flex items-center gap-3 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-2 truncate font-medium">
                    {usuario.nome}
                    <span className="bg-secondary text-secondary-foreground rounded-full px-2 py-0.5 text-[10px] font-medium whitespace-nowrap">
                      {rotuloDePapel(usuario.papel)}
                    </span>
                  </p>
                  <p className="text-muted-foreground truncate text-sm">{usuario.email}</p>
                  <p className="text-muted-foreground mt-0.5 text-xs">
                    {usuario.turmas.length === 0
                      ? "sem turmas atribuídas"
                      : `${usuario.turmas.length} ${usuario.turmas.length === 1 ? "turma" : "turmas"}`}
                    {!usuario.ativo ? " · desativada" : ""}
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
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-11"
                    aria-label={
                      usuario.ativo
                        ? `Desativar conta de ${usuario.nome}`
                        : `Reativar conta de ${usuario.nome}`
                    }
                    onClick={() => alternarAtivo(usuario)}
                  >
                    <Power size={16} />
                  </Button>
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
                        <AlertDialogTitle>Excluir a conta de {usuario.nome}?</AlertDialogTitle>
                        <AlertDialogDescription>
                          A exclusão só é possível quando não há chamadas registradas pela conta.
                          Com histórico, o caminho é desativar.
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
                </div>
              </div>
              {usuario.turmas.length > 0 && (
                <div className="border-t px-4 py-2.5">
                  <div className="flex flex-wrap gap-1.5">
                    {usuario.turmas.map((turmaId) => (
                      <span
                        key={turmaId}
                        className="bg-secondary text-secondary-foreground rounded-md px-2 py-1 text-xs font-medium"
                      >
                        {rotulo(turmaId)}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </motion.li>
          ))}
        </ul>
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
                placeholder="professor@escola.br"
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
                <Input
                  id="senha-usuario"
                  type="text"
                  value={formulario.senha}
                  autoComplete="off"
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
                onChange={(evento) =>
                  setFormulario((atual) => ({
                    ...atual,
                    papel: evento.target.value === "ADMIN" ? "ADMIN" : "PROFESSOR",
                  }))
                }
                opcoes={[
                  { valor: "PROFESSOR", rotulo: "Professor(a)" },
                  { valor: "ADMIN", rotulo: "Administrador (acesso total)" },
                ]}
              />
            </div>
            {formulario.papel === "PROFESSOR" && turmas.length > 0 && (
              <fieldset className="flex flex-col gap-2">
                <legend className="text-sm font-medium">Turmas desta conta</legend>
                <div className="flex flex-wrap gap-1.5">
                  {turmas.map((turma) => {
                    const marcada = formulario.turmas.includes(turma.id);
                    return (
                      <button
                        key={turma.id}
                        type="button"
                        aria-pressed={marcada}
                        onClick={() => alternarTurma(turma.id)}
                        className={`flex h-9 items-center gap-1.5 rounded-lg border px-3 text-xs font-medium transition-colors active:scale-[0.97] ${
                          marcada
                            ? "border-primary bg-primary text-primary-foreground"
                            : "text-muted-foreground hover:border-foreground/30"
                        }`}
                      >
                        {marcada && <Check size={13} aria-hidden="true" />}
                        {turma.rotulo}
                      </button>
                    );
                  })}
                </div>
              </fieldset>
            )}
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
