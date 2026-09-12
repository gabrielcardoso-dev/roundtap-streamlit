# RoundTap

Contador de treinos com foco em CrossFit, disponível como aplicativo web instalável e preparado para iOS e Android.

## Versão React (V3)

A aplicação principal está em `react-app/` e utiliza React, TypeScript, Vite, PWA, Capacitor e Supabase.

Recursos disponíveis:

- cadastro, login, confirmação de e-mail e recuperação de senha;
- perfil, alteração segura de senha, exportação e exclusão da conta;
- modos Rounds, For Time, AMRAP e EMOM;
- rounds automáticos no EMOM, descanso configurável e repetições parciais;
- desfazer round, som, vibração e tela sempre ativa;
- histórico sincronizado por usuário e fila offline;
- políticas RLS para isolamento dos dados no Supabase;
- PWA instalável e configuração do Capacitor para futuros builds nativos.

### Desenvolvimento local

```bash
cd react-app
cp .env.example .env
npm ci
npm run dev
```

Preencha em `.env`:

```dotenv
VITE_SUPABASE_URL=https://SEU-PROJETO.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=SUA-CHAVE-PUBLICAVEL
VITE_TURNSTILE_SITE_KEY=CHAVE_OPCIONAL_DO_TURNSTILE
```

A chave publicável do Supabase pode ficar no cliente. Nunca coloque a `service_role` no aplicativo ou no repositório.

### Banco de dados

Execute `supabase/migrations/001_roundtap_v3.sql` no projeto Supabase. A migração cria os perfis e treinos, ativa RLS, restringe cada usuário aos próprios registros e adiciona a função de autoexclusão da conta.

Adicione a URL publicada à lista de URLs permitidas em Authentication > URL Configuration antes de testar confirmação de e-mail e recuperação de senha.

### Testes e build

```bash
cd react-app
npm test
npm run build
npm audit
```

O workflow `.github/workflows/react-pages.yml` executa testes, gera a PWA e publica o resultado no GitHub Pages.

### Aplicativos nativos

Depois de instalar Xcode ou Android Studio:

```bash
cd react-app
npm run build
npx cap add ios
npx cap add android
npx cap sync
```

## Versão Streamlit (legado)

`app.py` mantém a versão pública atual enquanto a versão React é validada. Seus segredos ficam em `.streamlit/secrets.toml` no desenvolvimento e nas configurações privadas do Streamlit Community Cloud em produção.
