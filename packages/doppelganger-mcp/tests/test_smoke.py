import importlib


def test_loads() -> None:
    module = importlib.import_module("doppelganger_mcp")
    assert module.__doc__
