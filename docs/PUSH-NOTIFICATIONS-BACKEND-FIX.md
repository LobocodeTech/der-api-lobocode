# 🔧 Push Notifications - Correção do Backend

## 🐛 Problema Identificado

O backend estava enviando o **payload no formato incorreto**, causando falhas nas notificações push.

### Formato Errado (Antes)

```javascript
{
  title: "Título",
  body: "Mensagem",
  icon: "/assets/icons/logo.svg",
  badge: "/assets/icons/logo.svg",
  vibrate: [200, 100, 200],
  data: {...}
}
```

### Formato Correto (Depois)

```javascript
{
  notification: {
    title: "Título",
    body: "Mensagem",
    icon: "/assets/icons/icon-192x192.png",
    badge: "/assets/icons/icon-96x96.png",
    vibrate: [200, 100, 200]
  },
  data: {
    ...
    timestamp: 1234567890,
    url: "/notifications"
  }
}
```

**Motivo:** O Service Worker (`push-sw.js`) segue o padrão **Web Push Notification**, que requer este formato específico.

---

## ✅ Correções Aplicadas

### 1. **Payload Correto**

- Formato agora está de acordo com Web Push Notification Standard
- Campo `notification` separado de `data`
- Ícones corretos (`icon-192x192.png` e `icon-96x96.png`)

### 2. **Opções de Envio Otimizadas**

```typescript
const options = {
  TTL: 86400, // 24 horas
  urgency: 'high', // Prioridade alta
  timeout: 30000, // 30 segundos
};
```

**TTL (Time To Live):**

- Define por quanto tempo o push service deve tentar entregar a notificação
- 86400 segundos = 24 horas
- Se o dispositivo estiver offline, tentará reenviar por 24h

**Urgency:**

- `high`: Notificações importantes (padrão)
- `normal`: Notificações regulares
- `low`: Notificações de baixa prioridade
- `very-low`: Notificações que podem esperar

**Timeout:**

- Tempo máximo para aguardar resposta do push service
- 30 segundos é o recomendado

### 3. **Tratamento de Erros Melhorado**

**Erros Temporários (não remove subscription):**

- `429 Too Many Requests`: Rate limit atingido
- `503 Service Unavailable`: Serviço temporariamente indisponível

**Erros Permanentes (remove subscription):**

- `410 Gone`: Subscription expirada
- `404 Not Found`: Subscription não existe

### 4. **Logs Detalhados**

- Log de cada subscription encontrada
- Log de sucesso/erro para cada envio
- Stack trace completo em caso de erro

### 5. **Endpoint de Teste**

- Novo endpoint para testar push notifications facilmente
- `POST /notifications/push/test`

---

## 📦 Arquivos Modificados

```
src/modules/notifications/shared/push-notification.service.ts  # Correção principal
src/modules/notifications/shared/notification.service.ts       # Ícones corretos
src/modules/notifications/notification.controller.ts           # Endpoint de teste
```

---

## 🚀 Como Fazer Deploy

### Passo 1: Verificar Mudanças

```bash
cd /home/ubuntu/projetos/departamento-estadual-rodovias-engine-lobocode

# Ver o que mudou
git status
git diff
```

### Passo 2: Commitar

```bash
git add .
git commit -m "fix: corrige formato de payload das push notifications

- Corrige formato do payload para seguir padrão Web Push
- Adiciona TTL, urgency e timeout nas opções de envio
- Melhora tratamento de erros (temporários vs permanentes)
- Adiciona logs detalhados para debug
- Adiciona endpoint de teste POST /notifications/push/test
- Corrige ícones (icon-192x192.png ao invés de logo.svg)"
```

### Passo 3: Rebuild e Restart

**Se estiver usando Docker:**

```bash
# Rebuild da imagem
docker-compose build backend

# Restart do container
docker-compose restart backend

# Verificar logs
docker-compose logs -f backend
```

**Se estiver rodando direto:**

```bash
# Rebuild do projeto
npm run build

# Restart do PM2 (se estiver usando)
pm2 restart departamento-estadual-rodovias-backend

# Ou restart manual
npm run start:prod
```

### Passo 4: Verificar

```bash
# Verificar se o backend iniciou corretamente
curl http://localhost:30100/health

# Verificar logs
# Docker:
docker-compose logs -f backend | grep -i "vapid\|push"

# PM2:
pm2 logs departamento-estadual-rodovias-backend | grep -i "vapid\|push"
```

**Deve aparecer:**

```
✅ VAPID keys configuradas
```

---

## 🧪 Como Testar

### Teste 1: Verificar Subscriptions no Banco

```sql
-- Ver subscriptions existentes
SELECT
    id,
    "userId",
    endpoint,
    "createdAt",
    "updatedAt"
FROM push_subscriptions
ORDER BY "createdAt" DESC
LIMIT 10;

-- Contar subscriptions por usuário
SELECT
    "userId",
    COUNT(*) as total
FROM push_subscriptions
GROUP BY "userId";
```

### Teste 2: Enviar Notificação de Teste (via Postman/Insomnia)

**Endpoint:** `POST /notifications/push/test`

**Headers:**

```
Authorization: Bearer SEU_TOKEN
Content-Type: application/json
```

**Body (opcional):**

```json
{
  "title": "🧪 Teste Manual",
  "body": "Testando notificação às 15:30",
  "userId": "id_do_usuario" // Opcional, se não passar usa o usuário logado
}
```

**Resposta esperada:**

```json
{
  "success": true,
  "message": "Push notification de teste enviada",
  "details": {
    "userId": "...",
    "title": "🧪 Teste Manual",
    "body": "Testando notificação às 15:30",
    "timestamp": "2026-01-15T18:30:00.000Z"
  }
}
```

### Teste 3: Verificar Logs do Backend

Após enviar o teste, verificar os logs:

```bash
# Docker
docker-compose logs -f backend

# PM2
pm2 logs departamento-estadual-rodovias-backend

# Direto
tail -f logs/app.log
```

**Logs esperados:**

```
📤 Enviando push notification para usuário abc123...
📦 Notificação: 🧪 Teste Manual
📱 Encontradas 1 subscription(s) para o usuário
   #1: https://fcm.googleapis.com/fcm/send/abc123...
✅ Push enviado para https://fcm.googleapis.com/fcm/send/abc123...
```

**Se der erro:**

```
❌ Erro ao enviar push (410): Gone
⚠️ Subscription inválida (410), removendo: https://fcm...
```

→ Significa que a subscription expirou. Usuário precisa ativar notificações novamente no frontend.

### Teste 4: Teste End-to-End Completo

**1. Frontend - Ativar Notificações:**

- Abrir o app
- Clicar em "Ativar Notificações"
- Verificar logs no console
- Deve aparecer: "✅ Push notifications ativadas com sucesso!"

**2. Backend - Verificar Subscription no Banco:**

```sql
SELECT * FROM push_subscriptions
WHERE "userId" = 'SEU_USER_ID'
ORDER BY "createdAt" DESC
LIMIT 1;
```

**3. Backend - Enviar Teste:**

```bash
curl -X POST http://localhost:30100/notifications/push/test \
  -H "Authorization: Bearer SEU_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Teste End-to-End",
    "body": "Se você viu isso, está tudo funcionando! 🎉"
  }'
```

**4. Verificar Notificação:**

- Deve aparecer notificação no sistema
- Mesmo com app fechado/em background

**5. Teste de Longevidade:**

- Fechar TODAS as abas do app
- Aguardar 5 minutos
- Enviar outra notificação de teste
- Deve continuar funcionando!

---

## 🔍 Troubleshooting

### Problema: "VAPID keys não configuradas"

**Causa:** Variáveis de ambiente não estão sendo carregadas

**Solução:**

```bash
# Verificar .env
cat .env | grep VAPID

# Deve mostrar:
# VAPID_PUBLIC_KEY=BOvm-fMT...
# VAPID_PRIVATE_KEY=Mdm6a...
# VAPID_SUBJECT=mailto:admin@departamento-estadual-rodovias.com

# Se estiver usando Docker, verificar se .env está sendo montado
docker-compose config | grep VAPID

# Restart após verificar
docker-compose restart backend
```

---

### Problema: "Subscription inválida (410)"

**Causa:** Subscription expirou ou foi revogada

**Solução:**

1. No frontend, desregistrar Service Worker:
   - F12 → Application → Service Workers → Unregister
2. Recarregar página
3. Ativar notificações novamente
4. Nova subscription será criada

---

### Problema: "Erro 401 Unauthorized"

**Causa:** Token de autenticação inválido ou expirado

**Solução:**

1. Fazer login novamente
2. Obter novo token
3. Usar o novo token no header Authorization

---

### Problema: Notificação não aparece no dispositivo

**Verificar:**

1. **Frontend - Permissão:**

```javascript
console.log('Permissão:', Notification.permission);
// Deve ser: "granted"
```

2. **Frontend - Subscription existe:**

```javascript
navigator.serviceWorker.ready.then((reg) => {
  reg.pushManager.getSubscription().then((sub) => {
    console.log('Subscription:', !!sub);
  });
});
```

3. **Backend - Subscription no banco:**

```sql
SELECT * FROM push_subscriptions WHERE "userId" = 'SEU_USER_ID';
```

4. **Backend - Logs de envio:**

```bash
# Deve mostrar "✅ Push enviado para..."
docker-compose logs backend | grep "Push enviado"
```

---

## 📊 Monitoramento

### Métricas Importantes

**1. Taxa de Sucesso de Envio:**

```sql
-- Contar subscriptions ativas
SELECT COUNT(*) as total_subscriptions
FROM push_subscriptions;

-- Subscriptions por usuário
SELECT
    COUNT(DISTINCT "userId") as usuarios_com_push,
    COUNT(*) as total_subscriptions,
    ROUND(COUNT(*) / COUNT(DISTINCT "userId")::numeric, 2) as subscriptions_por_usuario
FROM push_subscriptions;
```

**2. Subscriptions Antigas (podem estar inválidas):**

```sql
-- Subscriptions com mais de 30 dias
SELECT
    "userId",
    endpoint,
    "createdAt",
    AGE(NOW(), "createdAt") as idade
FROM push_subscriptions
WHERE "createdAt" < NOW() - INTERVAL '30 days'
ORDER BY "createdAt" ASC;
```

**3. Análise de Erros:**

```bash
# Ver erros no log (últimas 100 linhas)
docker-compose logs --tail=100 backend | grep -i "erro\|error"

# Contar erros por tipo
docker-compose logs backend | grep "Erro ao enviar push" | sort | uniq -c
```

---

## 📈 Melhorias Futuras (Opcional)

### 1. **Retry Logic**

Implementar tentativas automáticas em caso de erros temporários:

```typescript
// Exemplo
async function sendWithRetry(subscription, payload, maxRetries = 3) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      await webpush.sendNotification(subscription, payload);
      return;
    } catch (error) {
      if (i === maxRetries - 1) throw error;
      await sleep(1000 * (i + 1)); // Exponential backoff
    }
  }
}
```

### 2. **Queue System**

Usar fila (Bull, BullMQ) para envios assíncronos:

- Melhor performance
- Retry automático
- Rate limiting
- Monitoramento

### 3. **Analytics**

Adicionar métricas:

- Taxa de delivery
- Taxa de cliques
- Tempo médio de vida da subscription
- Dispositivos mais usados

### 4. **Segmentação**

Enviar notificações baseadas em:

- Tipo de usuário (ADMIN, FIELD_TEAM, C2C)
- Localização geográfica
- Preferências do usuário
- Horário (não enviar à noite)

---

## ✅ Checklist de Deploy

- [ ] Código atualizado no repositório
- [ ] Variáveis VAPID configuradas no .env
- [ ] Backend rebuilded e restartado
- [ ] Logs verificados (sem erros de VAPID)
- [ ] Teste manual executado com sucesso
- [ ] Subscription criada e salva no banco
- [ ] Notificação de teste recebida
- [ ] Teste de longevidade (app fechado) passou
- [ ] Documentação atualizada
- [ ] Time notificado sobre as mudanças

---

## 📞 Suporte

Se encontrar problemas:

1. **Verificar logs do backend** (sempre tem informação útil)
2. **Verificar tabela push_subscriptions** (subscription existe?)
3. **Testar endpoint de teste** (POST /notifications/push/test)
4. **Reportar com logs completos** (backend + frontend)

---

## 🎯 Resultado Esperado

Após estas correções:

- ✅ Notificações funcionam 100% do tempo
- ✅ Formato correto seguindo Web Push Standard
- ✅ Tratamento robusto de erros
- ✅ Logs detalhados para debug
- ✅ Endpoint de teste fácil de usar
- ✅ Funciona em background/app fechado
- ✅ Funciona no mobile (iOS 16.4+, Android)

---

**Última atualização:** 2026-01-15  
**Versão:** 2.0.0
