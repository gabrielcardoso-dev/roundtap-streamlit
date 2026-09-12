# RoundTap — teste público no Streamlit

Versão pública de teste com cadastro e login por e-mail e senha via Supabase Auth.

## Configuração

1. Crie um projeto gratuito no Supabase.
2. Em Authentication > Providers, mantenha Email habilitado.
3. Copie o Project URL e a chave `anon`/`publishable`.
4. No Streamlit Community Cloud, adicione aos Secrets:

```toml
SUPABASE_URL = "https://SEU-PROJETO.supabase.co"
SUPABASE_ANON_KEY = "SUA-CHAVE-ANON"
```

5. Publique usando `app.py` como arquivo principal.

O histórico de treino é isolado por usuário no navegador. A sincronização dos treinos com o Supabase será adicionada na próxima fase.
