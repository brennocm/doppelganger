import pii_scan
import pytest

# Built at runtime so this test file itself contains no real-looking personal data.
REAL_EMAIL = "jane.doe" + "@" + "gmail.com"
REAL_HOME = "/home/" + "jdoe/projects/app"
REAL_MAC_HOME = "/Users/" + "jdoe/Desktop"
REAL_WIN_HOME = "C:" + "\\Users\\" + "jdoe\\file.txt"
REAL_IP = "10.20.30." + "40"
PUBLIC_IP = "8.8." + "4.4"


@pytest.mark.parametrize(
    ("text", "kind"),
    [
        (f"contact {REAL_EMAIL} today", "email"),
        (f"cd {REAL_HOME}", "home-path"),
        (f"open {REAL_MAC_HOME}", "home-path"),
        (f"path {REAL_WIN_HOME}", "home-path"),
        (f"server at {REAL_IP}:8080", "ipv4"),
        (f"dns {PUBLIC_IP}", "ipv4"),
    ],
)
def test_true_positives(text: str, kind: str) -> None:
    findings = pii_scan.find(text)
    assert [f.kind for f in findings] == [kind]


@pytest.mark.parametrize(
    "text",
    [
        "write to user@example.com",
        "or admin@mail.example.org",
        "bind 127.0.0.1:8787 and 0.0.0.0 inside the container",
        "docs use 192.0.2.10, 198.51.100.7 and 203.0.113.250",
        "paths like /home/<user>/.kiro and /home/$USER and /home/${USER}/x",
        "placeholder /home/user/projects and /Users/username/x",
        "pins: pnpm@12.16.1 node@26.13.0 @doppelganger/detector",
        "version 26.13.0 and 1.2.3 are not addresses",
        "not an ip: 999.1.1.1",
    ],
)
def test_placeholders_and_lookalikes_are_ignored(text: str) -> None:
    assert pii_scan.find(text) == []


def test_reports_line_numbers() -> None:
    text = f"first line\nsecond {REAL_EMAIL}\nthird {REAL_IP}\n"
    assert [(f.line, f.kind) for f in pii_scan.find(text)] == [(2, "email"), (3, "ipv4")]


def test_redact_replaces_findings_and_keeps_placeholders() -> None:
    text = f"{REAL_EMAIL} {REAL_HOME} {REAL_IP} user@example.com 127.0.0.1"
    redacted = pii_scan.redact(text)
    assert REAL_EMAIL not in redacted
    assert "jdoe" not in redacted
    assert REAL_IP not in redacted
    assert pii_scan.find(redacted) == []
    assert redacted.endswith("user@example.com 127.0.0.1")
