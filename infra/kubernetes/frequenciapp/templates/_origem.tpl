{{/* Autoridade externa, segregação de chaves e ambiente único do perfil direto. */}}
{{- define "frequenciapp.origem.validar" -}}
{{- if .Values.backupGate.ensaioSemProtecao }}{{ fail "bypass legado não é suportado; diagnóstico não autoriza rollout" }}{{ end -}}
{{- if not (kindIs "bool" .Values.backupOrigin.adopted) }}{{ fail "backupOrigin.adopted deve ser booleano" }}{{ end -}}
{{- if .Values.backupOrigin.adopted -}}
{{- $o := .Values.backupOrigin -}}
{{- range $nome := list "policySecret" "hmacSecret" "connectionSecret" -}}
{{- $s := required (printf "Defina backupOrigin.%s" $nome) (get $o $nome) -}}
{{- $obj := lookup "v1" "Secret" $.Release.Namespace $s -}}
{{- if and $obj (not $obj.immutable) }}{{ fail "Secrets de origem devem ser immutable e geridos pelo operador" }}{{ end -}}
{{- end -}}
{{- if or (eq $o.hmacSecret $o.policySecret) (eq $o.hmacSecret $o.connectionSecret) (eq $o.hmacSecret .Values.existingSecret) (eq $o.hmacSecret .Values.backup.filesSecret) (eq $o.hmacSecret .Values.backup.database.existingSecret) }}{{ fail "Secret HMAC deve ser separado da policy, conexão, aplicativo e transporte" }}{{ end -}}
{{- if not (regexMatch "^[a-zA-Z_][a-zA-Z0-9_]{0,62}$" $o.schema) }}{{ fail "backupOrigin.schema incompatível" }}{{ end -}}
{{- if not (and .Values.backup.enabled .Values.backup.database.enabled .Values.backup.database.persistence.enabled) }}{{ fail "Origem adotada exige produtor habilitado e PVC persistente para o hook" }}{{ end -}}
{{- if .Values.extraEnvFrom }}{{ fail "extraEnvFrom não é suportado com origem adotada" }}{{ end -}}
{{- $reservados := list "DATABASE_URL" "DIRECT_URL" "BACKUP_DATABASE_URL" "DATABASE_SCHEMA" "BACKUP_ORIGEM_POLICY" "BACKUP_ORIGEM_CHAVE" "NODE_OPTIONS" "NODE_TLS_REJECT_UNAUTHORIZED" "MIGRAR_NA_PARTIDA" -}}
{{- range $e := .Values.extraEnv -}}
{{- if or (has $e.name $reservados) (hasPrefix "PG" $e.name) }}{{ fail (printf "extraEnv em conflito com origem: %s" $e.name) }}{{ end -}}
{{- end -}}
{{- range $k, $v := .Values.config -}}
{{- if or (and (has $k $reservados) (ne $k "MIGRAR_NA_PARTIDA")) (hasPrefix "PG" $k) }}{{ fail (printf "config em conflito com origem: %s" $k) }}{{ end -}}
{{- end -}}
{{- if ne (toString .Values.config.MIGRAR_NA_PARTIDA) "false" }}{{ fail "MIGRAR_NA_PARTIDA deve ser false no perfil adotado" }}{{ end -}}
{{- range $k, $v := .Values.secrets.data -}}
{{- if or (has $k $reservados) (hasPrefix "PG" $k) }}{{ fail (printf "secrets.data em conflito com origem: %s" $k) }}{{ end -}}
{{- end -}}
{{- end -}}
{{- end -}}

{{- define "frequenciapp.origem.env" -}}
- name: BACKUP_ORIGEM_POLICY
  value: /etc/frequenciapp-origem/policy.json
- name: DATABASE_SCHEMA
  value: {{ .Values.backupOrigin.schema | quote }}
{{- range $nome := list "DATABASE_URL" "DIRECT_URL" "BACKUP_DATABASE_URL" }}
- name: {{ $nome }}
  valueFrom:
    secretKeyRef:
      name: {{ $.Values.backupOrigin.connectionSecret }}
      key: url
{{- end -}}
{{- end -}}

{{- define "frequenciapp.origem.mount" -}}
- name: origem-policy
  mountPath: /etc/frequenciapp-origem
  readOnly: true
{{- end -}}

{{- define "frequenciapp.origem.volume" -}}
- name: origem-policy
  secret:
    secretName: {{ .Values.backupOrigin.policySecret }}
    defaultMode: 0440
    items:
      - key: policy.json
        path: policy.json
      - key: ca.crt
        path: ca.crt
{{- end -}}

{{- define "frequenciapp.origem.chaveMount" -}}
- name: origem-hmac
  mountPath: /etc/frequenciapp-hmac
  readOnly: true
{{- end -}}

{{- define "frequenciapp.origem.chaveVolume" -}}
- name: origem-hmac
  secret:
    secretName: {{ .Values.backupOrigin.hmacSecret }}
    defaultMode: 0440
    items:
      - key: key
        path: key
{{- end -}}
