from pathlib import Path

import pytest
from hypothesis import given, settings
from hypothesis import strategies as st

from model_lab import haunt_set as hs

HEADER = "path,label,session_id,system_id,device,room,language,script_id"


def _rows(sessions: dict[str, str], systems: tuple[str, ...] = ("tts-a", "vc-b")) -> list[str]:
    lines = [HEADER]
    for session, language in sessions.items():
        for t in ("t01", "t02"):
            lines.append(f"genuine/{session}/{t}.flac,genuine,{session},,mic,room,{language},{t}")
            lines.extend(
                f"synthetic/{s}/{session}/{t}.flac,synthetic,{session},{s},,,{language},{t}"
                for s in systems
            )
    return lines


PLAN = {"s01": "pt-BR", "s02": "en", "s03": "pt-BR", "s04": "pt-BR", "s05": "pt-BR", "s06": "en"}


def test_the_six_session_plan_splits_two_dev_four_eval_with_both_languages() -> None:
    rows = hs.parse_index(_rows(PLAN))
    split = hs.split_sessions(rows)
    assert len(split.dev) == 2  # noqa: PLR2004
    assert len(split.eval) == 4  # noqa: PLR2004
    assert {PLAN[s] for s in split.dev} == {"pt-BR", "en"}
    assert {PLAN[s] for s in split.eval} == {"pt-BR", "en"}


def test_a_session_and_its_clones_stay_on_one_side() -> None:
    rows = hs.parse_index(_rows(PLAN))
    split = hs.split_sessions(rows, seed=3)
    dev_paths = {r.path for r in hs.rows_in(rows, split.dev)}
    eval_paths = {r.path for r in hs.rows_in(rows, split.eval)}
    assert not dev_paths & eval_paths
    for session in split.dev:
        assert all(f"/{session}/" not in p for p in eval_paths)


@pytest.mark.parametrize(
    ("line", "message"),
    [
        ("/abs/s01/t01.flac,genuine,s01,,m,r,en,t01", "relative"),
        ("../s01/t01.flac,genuine,s01,,m,r,en,t01", "relative"),
        ("a.flac,fake,s01,,m,r,en,t01", "label"),
        ("a.flac,genuine,,,m,r,en,t01", "session_id"),
        ("a.flac,synthetic,s01,,m,r,en,t01", "system_id"),
        ("a.flac,genuine,s01,tts-a,m,r,en,t01", "system_id"),
    ],
)
def test_malformed_rows_name_the_line(line: str, message: str) -> None:
    with pytest.raises(hs.DatasetError, match=rf"line 2: .*{message}"):
        hs.parse_index([HEADER, line])


def test_missing_columns_are_reported() -> None:
    with pytest.raises(hs.DatasetError, match="missing columns: language"):
        hs.parse_index(["path,label,session_id,system_id,device,room", "a,genuine,s1,,,"])


def test_dataset_dir_names_the_variable(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> None:
    monkeypatch.delenv(hs.ENV_VAR, raising=False)
    with pytest.raises(hs.DatasetError, match="HAUNT_SET_DIR is not set"):
        hs.dataset_dir()
    monkeypatch.setenv(hs.ENV_VAR, str(tmp_path / "missing"))
    with pytest.raises(hs.DatasetError, match="HAUNT_SET_DIR does not point"):
        hs.dataset_dir()
    monkeypatch.setenv(hs.ENV_VAR, str(tmp_path))
    assert hs.dataset_dir() == tmp_path


def test_load_index_reads_the_csv(tmp_path: Path) -> None:
    (tmp_path / "index.csv").write_text("\n".join(_rows({"s01": "en"})), encoding="utf-8")
    assert len(hs.load_index(tmp_path)) == 6  # noqa: PLR2004
    (tmp_path / "index.csv").unlink()
    with pytest.raises(hs.DatasetError, match=r"index\.csv not found"):
        hs.load_index(tmp_path)


_SESSIONS = st.dictionaries(
    st.from_regex(r"s[0-9]{2}", fullmatch=True),
    st.sampled_from(["pt-BR", "en", "es"]),
    min_size=0,
    max_size=12,
)


@settings(max_examples=200, deadline=None)
@given(sessions=_SESSIONS, seed=st.integers(0, 1000), fraction=st.floats(0.05, 0.95))
def test_split_is_a_deterministic_partition_of_sessions(
    sessions: dict[str, str], seed: int, fraction: float
) -> None:
    rows = hs.parse_index(_rows(sessions, systems=("tts-a",)))
    split = hs.split_sessions(rows, fraction, seed)
    assert split.dev | split.eval == set(sessions)
    assert not split.dev & split.eval
    assert split == hs.split_sessions(rows, fraction, seed)
    if len(sessions) >= 2:  # noqa: PLR2004
        assert split.dev
        assert split.eval
