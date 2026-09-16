import subprocess, pathlib

FORBIDDEN = [
    "wildberries_", "ozonhelp", "chat_ozone", "tiwbozon", "marketplace_pro",
    "STUDIO_PRODUCT", "STUDIO_AUDIENCE", "han_solopreneur",  # канал допустим ТОЛЬКО в brand.txt — см. ниже
]
ROOT = pathlib.Path(__file__).resolve().parent.parent

def _grep(term):
    r = subprocess.run(["grep", "-rln", term, str(ROOT),
                        "--exclude-dir=.git", "--exclude-dir=.venv",
                        "--exclude-dir=__pycache__", "--exclude-dir=output",
                        "--exclude=test_no_personal_data.py"],  # сам тест содержит эти строки как литералы
                       capture_output=True, text=True)
    return [l for l in r.stdout.splitlines() if l]

def test_no_chat_names_or_studio_strings():
    for term in ["wildberries_", "ozonhelp", "chat_ozone", "tiwbozon",
                 "marketplace_pro", "STUDIO_PRODUCT", "STUDIO_AUDIENCE"]:
        assert _grep(term) == [], f"Найден личный/студийный след: {term} в {_grep(term)}"

def test_no_phone_number():
    r = subprocess.run(["grep", "-rEln", r"\+7[0-9]{10}", str(ROOT),
                        "--exclude-dir=.git", "--exclude-dir=.venv",
                        "--exclude-dir=__pycache__"], capture_output=True, text=True)
    leaks = [l for l in r.stdout.splitlines()
             if l
             and not l.endswith(".env.example")  # шаблон-плейсхолдер допустим
             and not l.endswith("config.py")]     # формат-подсказка в интерактивном вводе допустима
    assert leaks == [], f"Похоже на реальный телефон: {leaks}"

def test_no_secrets_or_session_committed():
    for bad in [".env", "session.session", ".env.save"]:
        assert not (ROOT / bad).exists(), f"Секретный файл попал в репо: {bad}"

def test_brand_links_only_in_expected_places():
    # ссылка на канал допустима в brand.txt, CLAUDE.md, SKILL.md, README, AGENTS, docs — но не в коде движка
    hits = _grep("han_solopreneur")
    for h in hits:
        assert any(h.endswith(x) for x in
                   ["brand.txt", "CLAUDE.md", "README.md", "AGENTS.md", "SKILL.md"]) or "/docs/" in h, \
            f"Бренд-ссылка в неожиданном месте: {h}"
