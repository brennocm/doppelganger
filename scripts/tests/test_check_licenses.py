import check_licenses as cl
import pytest

ALLOWED = frozenset({"MIT", "Zlib", "Apache-2.0 WITH LLVM-exception"})


@pytest.mark.parametrize(
    ("expression", "expected"),
    [
        ("MIT AND Zlib", True),
        ("MIT AND Apache-2.0 WITH LLVM-exception", True),
        ("(Apache-2.0 WITH LLVM-exception) OR GPL-3.0-only", True),
        ("GPL-2.0-only WITH Classpath-exception-2.0", False),
        ("Apache-2.0", False),
        ("MIT WITH", False),
        ("WITH MIT", False),
        ("MIT WITH AND Zlib", False),
        ("MIT AND LicenseRef-Proprietary", False),
    ],
)
def test_spdx_with_counts_as_one_id(expression: str, *, expected: bool) -> None:
    assert cl.spdx_allowed(expression, ALLOWED) is expected


def test_policy_allows_the_torch_expression() -> None:
    policy = cl.tomllib.loads(cl.POLICY_PATH.read_text(encoding="utf-8"))
    torch = (
        "Apache-2.0 AND Apache-2.0 WITH LLVM-exception AND BSD-2-Clause AND BSD-3-Clause "
        "AND BSL-1.0 AND ISC AND MIT AND Zlib"
    )
    assert cl.spdx_allowed(torch, frozenset(policy["allowed"]))
