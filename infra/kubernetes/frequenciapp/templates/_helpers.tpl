{{- define "frequenciapp.name" -}}
{{- default .Chart.Name .Values.nameOverride | trunc 63 | trimSuffix "-" -}}
{{- end -}}

{{- define "frequenciapp.fullname" -}}
{{- if .Values.fullnameOverride -}}
{{- .Values.fullnameOverride | trunc 63 | trimSuffix "-" -}}
{{- else -}}
{{- $name := default .Chart.Name .Values.nameOverride -}}
{{- if contains $name .Release.Name -}}
{{- .Release.Name | trunc 63 | trimSuffix "-" -}}
{{- else -}}
{{- printf "%s-%s" .Release.Name $name | trunc 63 | trimSuffix "-" -}}
{{- end -}}
{{- end -}}
{{- end -}}

{{- define "frequenciapp.chart" -}}
{{- printf "%s-%s" .Chart.Name .Chart.Version | replace "+" "_" | trunc 63 | trimSuffix "-" -}}
{{- end -}}

{{- define "frequenciapp.selectorLabels" -}}
app.kubernetes.io/name: {{ include "frequenciapp.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
{{- end -}}

{{- define "frequenciapp.labels" -}}
helm.sh/chart: {{ include "frequenciapp.chart" . }}
{{ include "frequenciapp.selectorLabels" . }}
{{- if .Chart.AppVersion }}
app.kubernetes.io/version: {{ .Chart.AppVersion | quote }}
{{- end }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
{{- end -}}

{{- define "frequenciapp.serviceAccountName" -}}
{{- if .Values.serviceAccount.create -}}
{{- default (include "frequenciapp.fullname" .) .Values.serviceAccount.name -}}
{{- else -}}
{{- default "default" .Values.serviceAccount.name -}}
{{- end -}}
{{- end -}}

{{- define "frequenciapp.secretName" -}}
{{- if .Values.existingSecret -}}
{{- .Values.existingSecret -}}
{{- else if .Values.secrets.create -}}
{{- include "frequenciapp.fullname" . -}}
{{- else -}}
{{- required "Defina existingSecret ou secrets.create" "" -}}
{{- end -}}
{{- end -}}

{{- define "frequenciapp.image" -}}
{{- printf "%s:%s" .Values.image.repository (default .Chart.AppVersion .Values.image.tag) -}}
{{- end -}}

{{- define "frequenciapp.backupImage" -}}
{{- printf "%s:%s" .Values.backupImage.repository (default .Chart.AppVersion .Values.backupImage.tag) -}}
{{- end -}}

{{- define "frequenciapp.appUrl" -}}
{{- if .Values.agenda.appUrl -}}
{{- .Values.agenda.appUrl -}}
{{- else -}}
{{- printf "http://%s:%v" (include "frequenciapp.fullname" .) .Values.service.port -}}
{{- end -}}
{{- end -}}

{{- define "frequenciapp.backupFilesSecret" -}}
{{- required "Defina backup.filesSecret para habilitar o backup" .Values.backup.filesSecret -}}
{{- end -}}

{{/* Nome do Secret que guarda o token da coleta. A fonte é única por
renderização: o nome explícito do ServiceMonitor vence; vazio usa o Secret do
Pod, que é o existingSecret ou o Secret gerenciado. */}}
{{- define "frequenciapp.metricsTokenSecretName" -}}
{{- $metricas := default (dict) .Values.metrics -}}
{{- $serviceMonitor := default (dict) $metricas.serviceMonitor -}}
{{- $tokenSecret := default (dict) $serviceMonitor.bearerTokenSecret -}}
{{- if $tokenSecret.name -}}
{{- $tokenSecret.name -}}
{{- else if or .Values.existingSecret .Values.secrets.create -}}
{{- include "frequenciapp.secretName" . -}}
{{- else -}}
{{- required "Defina metrics.serviceMonitor.bearerTokenSecret.name, existingSecret ou secrets.create para o token da coleta" "" -}}
{{- end -}}
{{- end -}}

{{/* Chave do token da coleta no Secret, com METRICAS_TOKEN como padrão. */}}
{{- define "frequenciapp.metricsTokenKey" -}}
{{- $metricas := default (dict) .Values.metrics -}}
{{- $serviceMonitor := default (dict) $metricas.serviceMonitor -}}
{{- $tokenSecret := default (dict) $serviceMonitor.bearerTokenSecret -}}
{{- default "METRICAS_TOKEN" $tokenSecret.key -}}
{{- end -}}

{{/* Recusa combinações que deixariam o Pod e o ServiceMonitor sem o mesmo
token quando a coleta está habilitada. */}}
{{- define "frequenciapp.validateMetrics" -}}
{{- $metricas := default (dict) .Values.metrics -}}
{{- $serviceMonitor := default (dict) $metricas.serviceMonitor -}}
{{- if $serviceMonitor.enabled -}}
{{- $tokenSecret := default (dict) $serviceMonitor.bearerTokenSecret -}}
{{- if not $tokenSecret.key -}}
{{- fail "metrics.serviceMonitor.bearerTokenSecret.key precisa ser informada quando metrics.serviceMonitor.enabled=true" -}}
{{- end -}}
{{- $gerenciado := and .Values.secrets.create (not .Values.existingSecret) -}}
{{- if $gerenciado -}}
{{- $dados := default (dict) .Values.secrets.data -}}
{{- $semToken := and (not $metricas.token) (not (hasKey $dados "METRICAS_TOKEN")) -}}
{{- $nomeToken := $tokenSecret.name -}}
{{- $nomePod := include "frequenciapp.fullname" . -}}
{{- $fonteGerenciada := or (not $nomeToken) (eq $nomeToken $nomePod) -}}
{{- if and $semToken $fonteGerenciada -}}
{{- fail "O Secret gerenciado não tem METRICAS_TOKEN: defina metrics.token ou secrets.data.METRICAS_TOKEN, ou aponte metrics.serviceMonitor.bearerTokenSecret.name para outro Secret" -}}
{{- end -}}
{{- if and $fonteGerenciada (ne (include "frequenciapp.metricsTokenKey" .) "METRICAS_TOKEN") -}}
{{- fail "O Secret gerenciado só oferece a chave METRICAS_TOKEN: use a chave padrão ou aponte metrics.serviceMonitor.bearerTokenSecret.name para outro Secret" -}}
{{- end -}}
{{- end -}}
{{- end -}}
{{- end -}}

{{/* Fuso IANA dos CronJobs, com America/Fortaleza como padrão. */}}
{{- define "frequenciapp.timeZone" -}}
{{- default "America/Fortaleza" . -}}
{{- end -}}

{{/* Checksum do Secret que entra no Pod. existingSecret usa o lookup do
cluster e, sem cluster, a revisão explícita dos values. */}}
{{- define "frequenciapp.secretChecksum" -}}
{{- if .Values.existingSecret -}}
{{- $segredo := lookup "v1" "Secret" .Release.Namespace .Values.existingSecret -}}
{{- if $segredo -}}
{{- toYaml $segredo.data | sha256sum -}}
{{- else -}}
{{- printf "revisao:%s" (toString .Values.existingSecretRevision) | sha256sum -}}
{{- end -}}
{{- else if .Values.secrets.create -}}
{{- include (print .Template.BasePath "/secret.yaml") . | sha256sum -}}
{{- else -}}
{{- required "Defina existingSecret ou secrets.create" "" -}}
{{- end -}}
{{- end -}}
