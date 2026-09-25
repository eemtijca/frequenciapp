// Decide se o bootstrap do administrador deve gravar. No modo --somente-criar,
// uma conta existente é preservada; fora dele, a conta é criada ou atualizada.
export function deveGravarAdmin({ existe, somenteCriar }) {
  return !existe || !somenteCriar;
}
