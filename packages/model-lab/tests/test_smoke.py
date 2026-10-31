import importlib


def test_loads() -> None:
    module = importlib.import_module("model_lab")
    assert module.__doc__
