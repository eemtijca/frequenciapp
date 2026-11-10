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
