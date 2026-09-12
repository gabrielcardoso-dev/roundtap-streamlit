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
    st.session_state.auth = {
        "access_token": data.get("access_token"),
        "refresh_token": data.get("refresh_token"),
        "user_id": user.get("id"),
        "email": user.get("email", email.strip().lower()),
    }
    return None


def sign_up(email: str, password: str) -> tuple[bool, str]:
    data, error = auth_request(
        "signup",
        {"email": email.strip().lower(), "password": password},
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
        }
        return True, "Conta criada."
    return True, "Cadastro realizado. Confira seu e-mail para confirmar a conta."


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
            new_email = st.text_input("E-mail", placeholder="voce@email.com", key="new_email")
            new_password = st.text_input("Crie uma senha", type="password", help="Use pelo menos 6 caracteres.")
            confirmation = st.text_input("Repita a senha", type="password")
            registered = st.form_submit_button("Criar minha conta", use_container_width=True)
        if registered:
            if "@" not in new_email or "." not in new_email.rsplit("@", 1)[-1]:
                st.error("Informe um e-mail válido.")
            elif len(new_password) < 6:
                st.error("A senha precisa ter pelo menos 6 caracteres.")
            elif new_password != confirmation:
                st.error("As senhas não coincidem.")
            else:
                ok, message = sign_up(new_email, new_password)
                if ok:
                    st.success(message)
                    if st.session_state.get("auth"):
                        st.rerun()
                else:
                    st.error(message)

    st.markdown("<p class='rt-legal'>Ao continuar, você concorda com os Termos de Uso e a Política de Privacidade.</p>", unsafe_allow_html=True)


def render_roundtap() -> None:
    account = st.session_state.auth
    left, right = st.columns([4, 1])
    with left:
        st.caption(f"Conectado como {html.escape(account['email'])}")
    with right:
        if st.button("Sair", use_container_width=True):
            st.session_state.pop("auth", None)
            st.rerun()

    app_html = (ROOT / "roundtap.html").read_text(encoding="utf-8")
    suffix = str(account.get("user_id") or account["email"]).replace("'", "")
    app_html = app_html.replace("round20-v2-state", f"round20-v2-state-{suffix}")
    app_html = app_html.replace("round20-v2-history", f"round20-v2-history-{suffix}")
    app_html = app_html.replace("round20-v2-settings", f"round20-v2-settings-{suffix}")
    components.html(app_html, height=900, scrolling=False)


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
    </style>
    """,
    unsafe_allow_html=True,
)

if not SUPABASE_URL or not SUPABASE_ANON_KEY:
    render_brand()
    st.error("O acesso ainda precisa ser conectado ao banco de usuários antes da publicação.")
    st.info("Configure SUPABASE_URL e SUPABASE_ANON_KEY nos Secrets do Streamlit.")
elif st.session_state.get("auth"):
    render_roundtap()
else:
    render_login()
