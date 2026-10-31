import json
import re
import subprocess
from collections import Counter
from pathlib import Path

import pytest

from model_lab import haunt_scripts as hs

SESSIONS = 6
READ_PER_SESSION = 20
SCRIPTS_PER_SESSION = 22
MIN_WORDS, MAX_WORDS = 6, 25
SEED = 5


def test_each_session_has_10_scam_10_neutral_and_2_free_topics() -> None:
    scripts = hs.generate(seed=7)
    for session in hs.SESSIONS:
        kinds = Counter(s.kind for s in scripts if s.session == session.id)
        assert kinds == {"scam": 10, "neutral": 10, "free": 2}


def test_plan_is_6_sessions_on_3_days_with_2_in_english() -> None:
    assert len(hs.SESSIONS) == SESSIONS
    assert Counter(s.day for s in hs.SESSIONS) == {1: 2, 2: 2, 3: 2}
    assert [s.id for s in hs.SESSIONS if s.language == "en"] == ["s02", "s06"]


def test_the_same_seed_gives_the_same_sentences() -> None:
    assert hs.generate(seed=42) == hs.generate(seed=42)
    assert hs.generate(seed=42) != hs.generate(seed=43)


@pytest.mark.parametrize("seed", range(20))
def test_no_sentence_repeats_across_sessions(seed: int) -> None:
    texts = [s.text for s in hs.generate(seed) if s.kind != "free"]
    assert len(texts) == len(set(texts)) == SESSIONS * READ_PER_SESSION


def _template_pattern(template: str) -> re.Pattern[str]:
    parts = re.split(r"\{\w+\}", template)
    return re.compile("^" + ".+".join(re.escape(p) for p in parts) + "$")


def test_sentences_come_from_the_session_language_and_are_fully_filled() -> None:
    by_session = {s.id: s.language for s in hs.SESSIONS}
    patterns = {
        lang: [_template_pattern(t) for kind in kinds.values() for t in kind]
        for lang, kinds in hs.TEMPLATES.items()
    }
    for script in hs.generate(seed=3):
        assert "{" not in script.text
        assert "}" not in script.text
        words = len(script.text.split())
        assert MIN_WORDS <= words <= MAX_WORDS, script.text
        own = by_session[script.session]
        other = "en" if own == "pt-BR" else "pt-BR"
        assert any(p.match(script.text) for p in patterns[own]), script.text
        assert not any(p.match(script.text) for p in patterns[other]), script.text


def test_portuguese_names_always_carry_a_matching_article() -> None:
    for name in hs.SLOTS["pt-BR"]["name"]:
        article, _ = name.split(" ", 1)
        assert article in {"o", "a"}
    for template in hs.TEMPLATES["pt-BR"]["scam"] + hs.TEMPLATES["pt-BR"]["neutral"]:
        assert "o {name}" not in template
        assert "a {name}" not in template


def test_sentences_are_mixed_not_grouped_by_kind() -> None:
    kinds = [s.kind for s in hs.generate(seed=11) if s.session == "s01" and s.kind != "free"]
    assert kinds != sorted(kinds)


def test_write_refuses_a_folder_inside_a_git_repository(tmp_path: Path) -> None:
    subprocess.run(["git", "init", "-q", str(tmp_path)], check=True)  # noqa: S603, S607
    with pytest.raises(ValueError, match="inside a git repository"):
        hs.write(hs.generate(seed=1), 1, tmp_path / "scripts")
    assert not (tmp_path / "scripts").exists()


def test_write_outside_a_repository_creates_files_and_plan(tmp_path: Path) -> None:
    out = tmp_path / "haunt" / "scripts"
    scripts = hs.generate(seed=SEED)
    hs.write(scripts, SEED, out)
    assert (out / "s01" / "t01.txt").read_text(encoding="utf-8").strip() == scripts[0].text
    assert (out / "s06" / "free-2.txt").is_file()
    plan = json.loads((out / "plan.json").read_text())
    assert plan["seed"] == SEED
    assert len(plan["scripts"]) == SESSIONS * SCRIPTS_PER_SESSION
