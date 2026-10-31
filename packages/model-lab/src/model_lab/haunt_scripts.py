"""Sentence generator for Haunt_Set recording sessions (detection-model task 2.1).

Prints, or writes to a folder outside the repository, the 20 sentences each genuine
session reads aloud: 10 scam-like and 10 neutral, in Brazilian Portuguese or English,
plus two free-speech topics. The generated sentences are never stored in the repository:
without `--seed` the seed is random, and it is saved only next to the output.

    uv run --locked python -m model_lab.haunt_scripts                 # print all sessions
    uv run --locked python -m model_lab.haunt_scripts --out "$HAUNT_SET_DIR/scripts"
"""

from __future__ import annotations

import argparse
import json
import random
import secrets
import string
import subprocess
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Literal

Language = Literal["pt-BR", "en"]
SENTENCES_PER_KIND = 10


@dataclass(frozen=True)
class Session:
    """One genuine recording session."""

    id: str
    day: int
    language: Language


# 6 sessions over 3 days, 2 per day, each with a different device and room.
# English sessions fall on different days so the dev/eval split can include both languages.
SESSIONS: tuple[Session, ...] = (
    Session("s01", 1, "pt-BR"),
    Session("s02", 1, "en"),
    Session("s03", 2, "pt-BR"),
    Session("s04", 2, "pt-BR"),
    Session("s05", 3, "pt-BR"),
    Session("s06", 3, "en"),
)

SLOTS: dict[Language, dict[str, tuple[str, ...]]] = {
    "pt-BR": {
        "name": (
            "o Carlos",
            "a Marina",
            "o Paulo",
            "a Renata",
            "o Tiago",
            "a Luísa",
            "o Rafael",
            "a Beatriz",
        ),
        "amount": ("R$ 4.870", "R$ 12.500", "R$ 980", "R$ 7.300", "R$ 25.000", "R$ 3.150"),
        "time": ("três da tarde", "meio-dia", "dez horas", "cinco e meia", "oito da noite"),
        "city": ("Recife", "Curitiba", "Belém", "Salvador", "Campinas", "Porto Alegre"),
        "weekday": ("segunda", "terça", "quarta", "quinta", "sexta"),
        "food": ("tomate", "manga", "batata", "abacaxi", "feijão", "cenoura"),
        "device": (
            "a impressora",
            "o ventilador",
            "a cafeteira",
            "o ferro de passar",
            "a televisão",
        ),
        "repair": ("a bicicleta", "o guarda-chuva", "a torneira", "a cadeira", "o portão"),
    },
    "en": {
        "name": ("Carl", "Megan", "Paul", "Rachel", "Tom", "Lucy", "Ryan", "Beth"),
        "amount": ("$4,870", "$12,500", "$980", "$7,300", "$25,000", "$3,150"),
        "time": ("three o'clock", "noon", "ten", "half past five", "eight tonight"),
        "city": ("Denver", "Leeds", "Austin", "Dublin", "Toronto", "Glasgow"),
        "weekday": ("Monday", "Tuesday", "Wednesday", "Thursday", "Friday"),
        "food": ("tomatoes", "mangoes", "potatoes", "pineapple", "beans", "carrots"),
        "device": ("the printer", "the fan", "the coffee maker", "the iron", "the television"),
        "repair": ("the bike", "the umbrella", "the tap", "the chair", "the gate"),
    },
}

TEMPLATES: dict[Language, dict[str, tuple[str, ...]]] = {
    "pt-BR": {
        "scam": (
            "Oi, aqui é {name} da diretoria, preciso de um PIX de {amount} ainda hoje.",
            "Não dá para explicar agora, só confirma a transferência de {amount} até {time}.",
            "Mãe, perdi meu celular, este é meu número novo, me manda {amount} por favor.",
            "O fornecedor de {city} cancela o contrato se o pagamento não sair até {time}.",
            "Me passa o código que chegou por mensagem, {name} precisa confirmar agora.",
            "Estou numa reunião com o cliente em {city}, não posso ligar, só aprova o pedido.",
            "O banco bloqueou minha conta, você consegue pagar um boleto de {amount} para mim?",
            "Não comenta com ninguém, é confidencial, faz a transferência de {amount} agora.",
            "Sou {name}, do suporte, preciso da sua senha para liberar o acesso até {time}.",
            "Manda para esta chave PIX nova, a antiga foi desativada na {weekday}.",
            "Já autorizei com o financeiro, falta só você confirmar os {amount}.",
            "Estou sem bateria em {city}, depois eu explico, deposita {amount} nesta conta.",
        ),
        "neutral": (
            "Amanhã de manhã vou levar o cachorro para passear antes de {time}.",
            "A reunião de {weekday} foi transferida para {time}.",
            "Comprei {food} na feira e ainda sobrou bastante para o jantar.",
            "O trânsito em {city} estava tranquilo hoje cedo.",
            "Lembra de desligar {device} antes de sair de casa.",
            "O filme de {weekday} começou atrasado, mas valeu a pena esperar.",
            "Vou estudar mais um capítulo do livro na {weekday} à noite.",
            "Na {weekday} a gente pode almoçar naquele restaurante novo de {city}.",
            "O relatório está quase pronto, {name} só precisa revisar os gráficos.",
            "Choveu a tarde inteira em {city} e a rua ficou cheia de folhas.",
            "Preciso consertar {repair} neste fim de semana.",
            "O ônibus de {time} passou mais cheio do que o normal.",
        ),
        "free": (
            "Conte, com suas palavras, como foi o seu último fim de semana.",
            "Finja que liga para um colega e peça um pagamento urgente, com detalhes.",
            "Descreva o caminho da sua casa até um lugar que você visita sempre.",
            "Finja que é do banco e peça para a pessoa confirmar um código.",
        ),
    },
    "en": {
        "scam": (
            "Hi, it's {name} from the board, I need a transfer of {amount} today.",
            "I can't explain right now, just confirm the payment of {amount} before {time}.",
            "Mom, I lost my phone, this is my new number, please send me {amount}.",
            "The supplier in {city} will cancel the contract if we don't pay by {time}.",
            "Read me the code you just got by text, {name} needs to confirm it now.",
            "I'm in a client meeting in {city}, I can't call, just approve the order.",
            "The bank froze my account, can you cover a bill of {amount} for me?",
            "Don't tell anyone, it's confidential, send the {amount} right away.",
            "This is {name} from support, I need your password to restore access by {time}.",
            "Use this new account instead, the old one was closed on {weekday}.",
            "Finance already signed off, you only need to confirm the {amount}.",
            "My battery is dying in {city}, I'll explain later, wire {amount} to this account.",
        ),
        "neutral": (
            "Tomorrow morning I'll take the dog for a walk before {time}.",
            "The {weekday} meeting has been moved to {time}.",
            "I bought {food} at the market and there's plenty left for dinner.",
            "Traffic in {city} was calm this morning.",
            "Remember to switch off {device} before you leave.",
            "The film on {weekday} started late, but it was worth the wait.",
            "I'll read one more chapter of the book on {weekday} night.",
            "On {weekday} we could have lunch at that new place in {city}.",
            "The report is almost done, {name} only needs to check the charts.",
            "It rained all afternoon in {city} and the street filled with leaves.",
            "I need to fix {repair} this weekend.",
            "The {time} bus was more crowded than usual.",
        ),
        "free": (
            "Tell, in your own words, how your last weekend went.",
            "Pretend you are calling a colleague and ask for an urgent payment, with details.",
            "Describe the way from your home to a place you visit often.",
            "Pretend you are from the bank and ask the person to confirm a code.",
        ),
    },
}


@dataclass(frozen=True)
class Script:
    """One sentence or topic to read in a session."""

    session: str
    script_id: str
    kind: Literal["scam", "neutral", "free"]
    text: str


def _fill(template: str, slots: dict[str, tuple[str, ...]], rng: random.Random) -> str:
    names = [field for _, field, _, _ in string.Formatter().parse(template) if field]
    return template.format(**{name: rng.choice(slots[name]) for name in names})


def generate(seed: int) -> list[Script]:
    """All scripts for every session, deterministic for a given seed, never repeating."""
    rng = random.Random(seed)  # noqa: S311  (not for security: picks sentences to read)
    used: set[str] = set()
    scripts: list[Script] = []
    for session in SESSIONS:
        lang = session.language
        drawn: list[tuple[Literal["scam", "neutral"], str]] = []
        for kind in ("scam", "neutral"):
            for template in rng.sample(TEMPLATES[lang][kind], SENTENCES_PER_KIND):
                text = _fill(template, SLOTS[lang], rng)
                while text in used:  # every template has a slot, so a redraw ends quickly
                    text = _fill(template, SLOTS[lang], rng)
                used.add(text)
                drawn.append((kind, text))
        rng.shuffle(drawn)  # scam-like and neutral mixed
        scripts.extend(
            Script(session.id, f"t{n:02d}", kind, text) for n, (kind, text) in enumerate(drawn, 1)
        )
        free = rng.sample(TEMPLATES[lang]["free"], 2)
        scripts.extend(
            Script(session.id, f"free-{n}", "free", text) for n, text in enumerate(free, 1)
        )
    return scripts


def _inside_git_repository(path: Path) -> bool:
    probe = path if path.exists() else next(p for p in path.parents if p.exists())
    result = subprocess.run(  # noqa: S603  (fixed git arguments; the path is one argument)
        ["git", "-C", str(probe), "rev-parse", "--is-inside-work-tree"],  # noqa: S607
        capture_output=True,
        text=True,
        check=False,
    )
    return result.returncode == 0 and result.stdout.strip() == "true"


def write(scripts: list[Script], seed: int, out: Path) -> None:
    """Write scripts/<session>/<script_id>.txt and plan.json; refuses a path in a repository."""
    if _inside_git_repository(out.resolve()):
        msg = f"refusing to write sentences inside a git repository: {out}"
        raise ValueError(msg)
    for script in scripts:
        target = out / script.session / f"{script.script_id}.txt"
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(script.text + "\n", encoding="utf-8")
    plan = {
        "seed": seed,
        "sessions": [vars(s) for s in SESSIONS],
        "scripts": [vars(s) for s in scripts],
    }
    (out / "plan.json").write_text(json.dumps(plan, ensure_ascii=False, indent=2) + "\n")


def main(argv: list[str] | None = None) -> int:
    """Print every session's scripts, and optionally write them outside the repository."""
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0] if __doc__ else None)
    parser.add_argument("--seed", type=int, help="reuse a seed to print the same sentences")
    parser.add_argument("--out", type=Path, help="folder outside the repository")
    args = parser.parse_args(argv)
    seed = args.seed if args.seed is not None else secrets.randbits(32)
    scripts = generate(seed)
    lines: list[str] = []
    for session in SESSIONS:
        lines.append(f"\n## {session.id} (day {session.day}, {session.language})")
        lines.extend(
            f"{s.script_id:>7}  [{s.kind}]  {s.text}" for s in scripts if s.session == session.id
        )
    sys.stdout.write("\n".join(lines) + "\n")
    if args.out is not None:
        try:
            write(scripts, seed, args.out)
        except ValueError as error:
            sys.stderr.write(f"{error}\n")
            return 2
        sys.stdout.write(f"\nWritten to {args.out} (seed saved in plan.json there only)\n")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
