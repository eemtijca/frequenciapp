# ADR-063: índice das chamadas em Google Docs

- Status: aceita
- Data: 2026-11-04

## Contexto

A navegação entre muitas abas mensais dificulta encontrar a chamada de uma turma. Um documento separado permite reunir links por mês sem copiar os registros da planilha.

## Decisão

Criar um Google Docs por arquivo de frequência, com meses decrescentes e turmas em ordem natural do nome. A origem continua na Sheets API. O índice usa a Google Docs API, ativada no mesmo projeto, e a autorização drive.file existente. Nenhuma permissão de compartilhamento é alterada.

Persistir o vínculo em indices_chamada, fora da cópia JSON. Reservar a criação antes da chamada externa. Uma resposta incerta mantém a reserva e permite recuperar o documento pelo link, sem criar uma cópia. Recusa explícita desfaz somente a reserva local. Preparação e índice compartilham a trava da frequência.

Comparar o texto atual com a assinatura da última escrita e condicionar a atualização à revisão do Google Docs. Texto manual ou conteúdo não reconhecido exige conferência. Os links e estilos gerados são reconstruídos. Uma releitura que encontra o texto desejado recupera uma atualização cuja resposta se perdeu. Sem retentativa automática de escritas.

## Consequências

O índice exige ativar uma API adicional e aplicar uma migração. A criação é explícita na Gestão; o preparo concluído e Liberar meses atualizam somente um índice já existente. Falhas do documento não invalidam o preparo das chamadas. Excluir ou editar manualmente o documento pode exigir conferência administrativa. Somente os nomes das turmas e os links das abas entram no documento.

Se nenhum documento for encontrado após uma criação incerta, a Gestão permite **Não encontrei o documento** e **Criar outro índice**, com confirmação de que a nova tentativa pode criar outro arquivo no Drive. Essa ação só reinicia uma reserva pendente, sem documento confirmado.

Se o documento for apagado ou não for encontrado no Drive, a próxima atualização libera o vínculo local. A recuperação pelo link ou a criação de outro índice volta a ficar disponível com confirmação explícita.
