import html
import os
from pathlib import Path

import requests
import streamlit as st
import streamlit.components.v1 as components


st.set_page_config(
    page_title="RoundTap",
    page_icon="⏱️",
    layout="centered",
    initial_sidebar_state="collapsed",
)

ROOT = Path(__file__).parent


def secret(name: str) -> str:
    try:
        return str(st.secrets[name])
    except (KeyError, FileNotFoundError):
        return os.getenv(name, "")


SUPABASE_URL = secret("SUPABASE_URL").rstrip("/")
SUPABASE_ANON_KEY = secret("SUPABASE_ANON_KEY")


def auth_request(path: str, payload: dict) -> tuple[dict, str | None]:
    try:
        response = requests.post(
            f"{SUPABASE_URL}/auth/v1/{path}",
            headers={
                "apikey": SUPABASE_ANON_KEY,
                "Authorization": f"Bearer {SUPABASE_ANON_KEY}",
                "Content-Type": "application/json",
            },
            json=payload,
            timeout=15,
        )
        data = response.json() if response.content else {}
        if response.ok:
            return data, None
        message = data.get("msg") or data.get("message") or data.get("error_description")
        translations = {
            "Invalid login credentials": "E-mail ou senha incorretos.",
            "Email not confirmed": "Confirme seu e-mail antes de entrar.",
            "User already registered": "Este e-mail já está cadastrado.",
            "Password should be at least 6 characters": "A senha precisa ter pelo menos 6 caracteres.",
        }
        return {}, translations.get(message, message or "Não foi possível concluir a solicitação.")
    except (requests.RequestException, ValueError):
        return {}, "O serviço de acesso está temporariamente indisponível. Tente novamente."


def sign_in(email: str, password: str) -> str | None:
    data, error = auth_request(
        "token?grant_type=password",
        {"email": email.strip().lower(), "password": password},
    )
    if error:
        return error
    user = data.get("user") or {}
    metadata = user.get("user_metadata") or {}
    account_email = user.get("email", email.strip().lower())
    st.session_state.auth = {
        "access_token": data.get("access_token"),
        "refresh_token": data.get("refresh_token"),
        "user_id": user.get("id"),
        "email": account_email,
        "name": metadata.get("full_name") or account_email.split("@", 1)[0].replace(".", " ").title(),
    }
    return None


def sign_up(name: str, email: str, password: str) -> tuple[bool, str]:
    data, error = auth_request(
        "signup",
        {
            "email": email.strip().lower(),
            "password": password,
            "data": {"full_name": name.strip()},
        },
    )
    if error:
        return False, error
    if data.get("session") or data.get("access_token"):
        user = data.get("user") or {}
        st.session_state.auth = {
            "access_token": data.get("access_token") or data.get("session", {}).get("access_token"),
            "refresh_token": data.get("refresh_token") or data.get("session", {}).get("refresh_token"),
            "user_id": user.get("id"),
            "email": user.get("email", email.strip().lower()),
            "name": name.strip(),
        }
        return True, "Conta criada."
    return True, "Cadastro realizado. Confira seu e-mail para confirmar a conta."


def update_password(access_token: str, password: str) -> str | None:
    try:
        response = requests.put(
            f"{SUPABASE_URL}/auth/v1/user",
            headers={
                "apikey": SUPABASE_ANON_KEY,
                "Authorization": f"Bearer {access_token}",
                "Content-Type": "application/json",
            },
            json={"password": password},
            timeout=15,
        )
        if response.ok:
            return None
        data = response.json() if response.content else {}
        message = data.get("msg") or data.get("message") or data.get("error_description")
        if response.status_code == 401:
            return "Sua sessão expirou. Entre novamente para alterar a senha."
        if message == "Password should be at least 6 characters":
            return "A senha precisa ter pelo menos 6 caracteres."
        return message or "Não foi possível alterar a senha."
    except (requests.RequestException, ValueError):
        return "O serviço de acesso está temporariamente indisponível. Tente novamente."


def render_brand() -> None:
    st.markdown(
        """
        <div class="rt-brand">
          <div class="rt-dial">R</div>
          <div><strong>RoundTap</strong><span>Seu treino. Seu ritmo.</span></div>
        </div>
        """,
        unsafe_allow_html=True,
    )


def render_login() -> None:
    render_brand()
    st.markdown("<h1 class='rt-title'>Entre para começar</h1><p class='rt-sub'>Seus resultados ficam vinculados à sua conta.</p>", unsafe_allow_html=True)
    login_tab, signup_tab = st.tabs(["Entrar", "Criar conta"])

    with login_tab:
        with st.form("login", clear_on_submit=False):
            email = st.text_input("E-mail", placeholder="voce@email.com")
            password = st.text_input("Senha", type="password", placeholder="Sua senha")
            submitted = st.form_submit_button("Entrar", use_container_width=True)
        if submitted:
            if not email or not password:
                st.error("Informe seu e-mail e sua senha.")
            else:
                error = sign_in(email, password)
                if error:
                    st.error(error)
                else:
                    st.rerun()

    with signup_tab:
        with st.form("signup", clear_on_submit=False):
            new_name = st.text_input("Nome", placeholder="Como devemos chamar você?")
            new_email = st.text_input("E-mail", placeholder="voce@email.com", key="new_email")
            new_password = st.text_input("Crie uma senha", type="password", help="Use pelo menos 6 caracteres.")
            confirmation = st.text_input("Repita a senha", type="password")
            registered = st.form_submit_button("Criar minha conta", use_container_width=True)
        if registered:
            if len(new_name.strip()) < 2:
                st.error("Informe seu nome.")
            elif "@" not in new_email or "." not in new_email.rsplit("@", 1)[-1]:
                st.error("Informe um e-mail válido.")
            elif len(new_password) < 6:
                st.error("A senha precisa ter pelo menos 6 caracteres.")
            elif new_password != confirmation:
                st.error("As senhas não coincidem.")
            else:
                ok, message = sign_up(new_name, new_email, new_password)
                if ok:
                    st.success(message)
                    if st.session_state.get("auth"):
                        st.rerun()
                else:
                    st.error(message)

    st.markdown("<p class='rt-legal'>Ao continuar, você concorda com os Termos de Uso e a Política de Privacidade.</p>", unsafe_allow_html=True)


def render_roundtap() -> None:
    account = st.session_state.auth
    brand_col, profile_col = st.columns([5, 1], vertical_alignment="center")
    with brand_col:
        st.markdown(
            """
            <div class="rt-app-brand">
              <div class="rt-mini-dial">R</div>
              <strong>RoundTap</strong><span>PERFORMANCE</span>
            </div>
            """,
            unsafe_allow_html=True,
        )
    with profile_col:
        if st.button("👤", key="open_profile", help="Abrir meu perfil", use_container_width=True):
            st.query_params["profile"] = "1"
            st.rerun()

    app_html = (ROOT / "roundtap.html").read_text(encoding="utf-8")
    suffix = str(account.get("user_id") or account["email"]).replace("'", "")
    app_html = app_html.replace("round20-v2-state", f"round20-v2-state-{suffix}")
    app_html = app_html.replace("round20-v2-history", f"round20-v2-history-{suffix}")
    app_html = app_html.replace("round20-v2-settings", f"round20-v2-settings-{suffix}")
    components.html(app_html, height=900, scrolling=False)


def render_profile() -> None:
    account = st.session_state.auth
    email = account.get("email", "")
    name = account.get("name") or email.split("@", 1)[0].replace(".", " ").title()

    if st.button("← Voltar ao treino", key="back_to_workout"):
        st.query_params.clear()
        st.rerun()

    st.markdown(
        f"""
        <div class="profile-head">
          <div class="profile-avatar">{html.escape(name[:1].upper() or "A")}</div>
          <div><span>PERFIL DO ATLETA</span><h1>{html.escape(name)}</h1></div>
        </div>
        <div class="profile-card">
          <span>Nome</span><strong>{html.escape(name)}</strong>
          <span>E-mail</span><strong>{html.escape(email)}</strong>
        </div>
        """,
        unsafe_allow_html=True,
    )

    st.markdown("<h2 class='profile-section'>Alterar senha</h2>", unsafe_allow_html=True)
    with st.form("change_password", clear_on_submit=True):
        new_password = st.text_input("Nova senha", type="password", help="Use pelo menos 6 caracteres.")
        confirmation = st.text_input("Confirme a nova senha", type="password")
        submitted = st.form_submit_button("Salvar nova senha", use_container_width=True)
    if submitted:
        if len(new_password) < 6:
            st.error("A senha precisa ter pelo menos 6 caracteres.")
        elif new_password != confirmation:
            st.error("As senhas não coincidem.")
        else:
            error = update_password(account.get("access_token", ""), new_password)
            if error:
                st.error(error)
            else:
                st.success("Senha alterada com sucesso.")

    if st.button("Sair do aplicativo", use_container_width=True, type="secondary"):
        st.session_state.pop("auth", None)
        st.query_params.clear()
        st.rerun()


st.markdown(
    """
    <style>
      #MainMenu, header, footer {visibility:hidden}
      .stApp {background:radial-gradient(circle at 50% -15%,#1a3214 0,transparent 36%),#030604;color:#f5f7f3}
      .block-container {max-width:540px;padding:1.25rem 1rem 2rem}
      .rt-brand {display:flex;align-items:center;gap:12px;margin:3rem 0 2.2rem}
      .rt-brand strong {display:block;color:#a8ff19;font-size:1.45rem;line-height:1}
      .rt-brand span {display:block;color:#8d978f;font-size:.82rem;margin-top:5px}
      .rt-dial {width:54px;height:54px;border:7px dashed #a8ff19;border-radius:50%;display:grid;place-items:center;color:white;font-weight:900;font-size:1.25rem}
      .rt-title {font-size:2rem!important;margin:0 0 .4rem!important;color:white!important}
      .rt-sub,.rt-legal {color:#8d978f}.rt-legal {font-size:.75rem;text-align:center;margin-top:2rem}
      div[data-testid="stForm"] {background:#0a0f0b;border:1px solid #283029;border-radius:16px;padding:1.15rem}
      div[data-testid="stTextInput"] input {background:#101712;color:white;border-color:#303a32}
      div[data-testid="stFormSubmitButton"] button {background:#a8ff19;color:#071006;border:0;font-weight:900;min-height:48px}
      div[data-testid="stFormSubmitButton"] button:hover {background:#bdff51;color:#071006}
      button[data-baseweb="tab"] {font-weight:800}
      iframe {border:0;border-radius:16px;background:#030604}
      .rt-app-brand {height:62px;display:flex;align-items:center;gap:9px;color:#a8ff19;font-size:1.35rem;font-weight:950}
      .rt-app-brand span {font-size:.58rem;color:#aab2ac;border:1px solid #333b35;border-radius:4px;padding:3px 6px;letter-spacing:.1em;margin-left:2px}
      .rt-mini-dial {width:40px;height:40px;border:5px dashed #a8ff19;border-radius:50%;display:grid;place-items:center;color:white;font-size:.9rem;font-weight:950}
      .st-key-open_profile button {width:44px!important;height:44px!important;min-height:44px!important;border-radius:50%!important;border:1px solid #303832!important;background:#0c110d!important;color:#a8ff19!important;font-size:1.15rem!important;padding:0!important}
      .st-key-open_profile button:hover {border-color:#a8ff19!important;color:#a8ff19!important}
      .profile-head {display:flex;align-items:center;gap:16px;margin:1.5rem 0 1.2rem}
      .profile-avatar {width:64px;height:64px;border-radius:50%;display:grid;place-items:center;background:#a8ff19;color:#071006;font-size:1.65rem;font-weight:950;box-shadow:0 0 30px #a8ff1930}
      .profile-head span {color:#a8ff19;font-size:.72rem;font-weight:900;letter-spacing:.12em}
      .profile-head h1 {color:white;font-size:1.75rem;margin:.2rem 0 0}
      .profile-card {display:grid;background:#0a0f0b;border:1px solid #283029;border-radius:16px;padding:1.15rem;margin-bottom:1.4rem}
      .profile-card span {color:#869087;font-size:.72rem;text-transform:uppercase;letter-spacing:.08em;margin-top:.8rem}
      .profile-card span:first-child {margin-top:0}
      .profile-card strong {color:#f5f7f3;margin-top:.18rem;overflow-wrap:anywhere}
      .profile-section {color:white;font-size:1.15rem;margin:1.2rem 0 .7rem}
      button[kind="secondary"] {border-color:#ff6259!important;color:#ff6259!important}
    </style>
    """,
    unsafe_allow_html=True,
)

if st.query_params.get("logout") == "1":
    st.session_state.pop("auth", None)
    st.query_params.clear()
    st.rerun()

if not SUPABASE_URL or not SUPABASE_ANON_KEY:
    render_brand()
    st.error("O acesso ainda precisa ser conectado ao banco de usuários antes da publicação.")
    st.info("Configure SUPABASE_URL e SUPABASE_ANON_KEY nos Secrets do Streamlit.")
elif st.session_state.get("auth") and st.query_params.get("profile") == "1":
    render_profile()
elif st.session_state.get("auth"):
    render_roundtap()
else:
    render_login()
