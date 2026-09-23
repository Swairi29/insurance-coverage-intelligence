import streamlit as st
from pathlib import Path

st.set_page_config(page_title="InsureIntel", page_icon="🛡️", layout="wide")

css = Path(__file__).parent / "assets" / "styles.css"
if css.exists():
    st.markdown(f"<style>{css.read_text()}</style>", unsafe_allow_html=True)

if "page" not in st.session_state:
    st.session_state.page = "home"
if "authenticated" not in st.session_state:
    st.session_state.authenticated = False

def go(page):
    st.session_state.page = page
    st.rerun()

def brand():
    st.markdown('<div class="brand">🛡️ <b>Insure<span>Intel</span></b><small>Coverage intelligence for SMEs</small></div>', unsafe_allow_html=True)

def nav():
    a,b,c,d,e,f = st.columns([2.6,1,1,1,1,1])
    with a: brand()
    with b:
        if st.button("Features"): st.session_state.section = "features"
    with c:
        if st.button("Workflow"): st.session_state.section = "workflow"
    with d:
        if st.button("Security"): st.session_state.section = "security"
    with e:
        if st.button("Log in"): go("login")
    with f:
        if st.button("Get started"): go("signup")

def home():
    nav()
    st.markdown("""
    <div class="hero">
      <div class="badge">✦ AI-powered insurance intelligence for SMEs</div>
      <h1>Understand your risks.<br><span>Discover your coverage gaps.</span></h1>
      <p>InsureIntel helps small and medium-sized businesses analyse business risks and insurance policies through a structured, evidence-based workflow.</p>
    </div>
    """, unsafe_allow_html=True)
    x,y,_ = st.columns([1.3,1.5,4])
    with x:
        if st.button("Start assessment →", type="primary", use_container_width=True): go("signup")
    with y:
        if st.button("Explore workflow", use_container_width=True): st.session_state.section = "workflow"
    st.markdown('<div class="trust">✓ Structured risk assessment &nbsp;&nbsp; ✓ Multi-policy analysis &nbsp;&nbsp; ✓ Evidence-based explanations</div>', unsafe_allow_html=True)
    st.markdown("## Platform capabilities")
    cols = st.columns(3)
    data = [
        ("01","Risk profiling","Identify potential business risks from operations, assets, employees and digital activities."),
        ("02","Policy intelligence","Organise policies and retrieve relevant coverage, exclusions, limits and conditions."),
        ("03","Gap detection","Compare identified risks against available evidence and flag potential coverage gaps.")
    ]
    for col,(n,t,p) in zip(cols,data):
        with col:
            st.markdown(f'<div class="card"><b>{n}</b><h3>{t}</h3><p>{p}</p></div>', unsafe_allow_html=True)
    st.markdown("## How it works")
    steps = ["Business profile + policy upload","Risk Profiling Agent","Policy Intelligence Agent","Coverage & Gap Analysis Agent","Evidence-based report"]
    for i, step in enumerate(steps,1):
        st.markdown(f'<div class="step"><b>{i:02}</b><span>{step}</span></div>', unsafe_allow_html=True)
    st.markdown('<div class="notice"><b>Responsible AI</b><br>Results should include evidence, uncertainty and limitations. Important conclusions must be verified with a qualified insurance professional.</div>', unsafe_allow_html=True)
    st.caption("Academic prototype: InsureIntel does not provide legal, financial or insurance advice.")

def auth(mode):
    nav()
    st.markdown('<div class="auth">', unsafe_allow_html=True)
    st.header("Create your account" if mode == "signup" else "Welcome back")
    st.write("Start organising your business risks and insurance coverage.")
    with st.form(mode):
        if mode == "signup": name = st.text_input("Full name")
        else: name = "User"
        email = st.text_input("Email")
        password = st.text_input("Password", type="password")
        confirmed = st.checkbox("I understand this is a prototype.") if mode == "signup" else True
        submit = st.form_submit_button("Create account" if mode == "signup" else "Log in", type="primary")
        if submit:
            if not email or not password or not name or not confirmed:
                st.error("Please complete all required fields.")
            else:
                st.session_state.authenticated = True
                go("dashboard")
    if st.button("Back to home"): go("home")
    st.caption("Prototype authentication only. Production deployment requires secure server-side authentication and authorization.")
    st.markdown('</div>', unsafe_allow_html=True)

def dashboard():
    st.sidebar.title("InsureIntel")
    if st.sidebar.button("Log out"):
        st.session_state.authenticated = False
        go("home")
    st.title("Your workspace")
    a,b,c = st.columns(3)
    a.metric("Businesses", "0")
    b.metric("Policies analysed", "0")
    c.metric("Potential gaps", "0")
    st.info("Dashboard foundation ready. Next: business profile, policy upload and agent API integration.")
    if st.button("Start new assessment", type="primary"):
        st.success("Demo assessment workspace created.")

if st.session_state.page == "home": home()
elif st.session_state.page in ["login","signup"]: auth(st.session_state.page)
elif st.session_state.page == "dashboard":
    dashboard() if st.session_state.authenticated else go("login")
