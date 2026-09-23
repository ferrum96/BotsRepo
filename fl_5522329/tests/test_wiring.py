def test_wiring_imports():
    import app.api.app  # noqa: F401
    import app.bot.factory  # noqa: F401
    import app.main  # noqa: F401
    import app.services.chat  # noqa: F401
    import app.services.readings  # noqa: F401


def test_backup_script_syntax():
    import subprocess
    from pathlib import Path

    script = Path(__file__).resolve().parents[1] / "scripts" / "backup.sh"
    subprocess.run(["sh", "-n", str(script)], check=True)
