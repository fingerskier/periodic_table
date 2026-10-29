#!/usr/bin/env python3
"""Check the decay-series steps in src/relations/decay.ts against mendeleev's isotope tables.

Run with a Python that has mendeleev 1.3.0 installed (the venv used for scripts/build_data.py
will do):

    .venv/bin/python scripts/verify_decay.py [--db PATH] [--source PATH]

Each step prints as ok or FAIL, followed by the tabulated values it was compared with and the
parent's other tabulated modes ("not drawn").

src/relations/decay.ts is the only copy of the data. Instead of keeping a parallel table, this
script parses it: inside each `export const <NAME>_SERIES: readonly DecayStep[] = [` array, every
line that is not blank or a // comment must be one call of the form

    step('Th-232', 'alpha', 100, '14.0 Gyr', 'Ra-228'),

and anything else stops the script, as does a step(...) call outside those arrays or an array
not named in SERIES, so a format change cannot silently skip steps. Only the standard library is
used (sqlite3, re); mendeleev is imported solely to locate its bundled elements.db, whose isotopes
and isotopedecaymodes tables come from NUBASE2020 (Kondev et al., Chin. Phys. C 45 (2021) 030001).

Checks
  each step    alpha gives (Z-2, A-4) and beta- gives (Z+1, A); the parent nuclide is tabulated and
               lists that mode; the half-life is the tabulated value rounded to the digits written
               (no uncertainty is added: '19.9 min' needs a tabulated 19.85-19.95 min); the branch
               intensity agrees within 0.01 percentage points ('=' values) or 1 point (values
               tabulated as '~').
  each parent  every alpha or beta- branch of 1% or more is listed.
  each series  every mass number has the same remainder mod 4; every chain end is stable; the first
               parent occurs in nature for the thorium, uranium and actinium series and not for the
               neptunium series.

mendeleev stores small intensities without their exponent (U-238 SF 5.44 means 5.44e-5 %), so a
minor branch counts as major only when it fits beside the dominant one (sum at most 100.5%); the
listing marks the others with '*'. The tables hold ground states only, so the NUBASE2020 rows of
the isomers the series pass through (Pa-234m) are copied by hand into ISOMERS and checked the same
way; an isomer without a row there fails.

Exit status: 0 when every check passes, 1 otherwise.
"""

from __future__ import annotations

import argparse
import os
import re
import sqlite3
import sys
from dataclasses import dataclass
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SOURCE = ROOT / 'src' / 'relations' / 'decay.ts'
MENDELEEV_VERSION = '1.3.0'

SERIES = ('THORIUM', 'NEPTUNIUM', 'URANIUM', 'ACTINIUM')
NATURAL_START = {'THORIUM': True, 'NEPTUNIUM': False, 'URANIUM': True, 'ACTINIUM': True}
CUTOFF = 1.0  # %: the smallest branch the layer draws
EXACT_TOL = 0.01  # percentage points, for intensities tabulated with '='
APPROX_TOL = 1.0  # percentage points, for intensities tabulated with '~'

NUCLIDE = r'[A-Z][a-z]?-\d+m?'
BLOCK = re.compile(r'^export const (?P<name>[A-Z]+)_SERIES: readonly DecayStep\[\] = \[\n(?P<body>.*?)^\];', re.M | re.S)
STEP = re.compile(
    rf"step\('(?P<parent>{NUCLIDE})', '(?P<mode>alpha|beta-)', (?P<percent>\d+(?:\.\d+)?), "
    rf"'(?P<half_life>[^']+)', '(?P<daughter>{NUCLIDE})'\),?"
)
HALF_LIFE = re.compile(r'(?P<mantissa>\d+(?:\.\d+)?)(?: × 10(?P<exponent>[⁰¹²³⁴⁵⁶⁷⁸⁹]+))? (?P<unit>\S+)')
SUPERSCRIPTS = str.maketrans('⁰¹²³⁴⁵⁶⁷⁸⁹', '0123456789')

YEAR = 365.2422 * 86400  # mendeleev's year (see its propertymetadata); used on both sides
OUR_UNITS = {
    'Gyr': 1e9 * YEAR, 'Myr': 1e6 * YEAR, 'kyr': 1e3 * YEAR, 'yr': YEAR, 'd': 86400.0, 'h': 3600.0,
    'min': 60.0, 's': 1.0, 'ms': 1e-3, 'µs': 1e-6, 'μs': 1e-6, 'ns': 1e-9,
}
DB_UNITS = {
    'Yyear': 1e24 * YEAR, 'Zyear': 1e21 * YEAR, 'Eyear': 1e18 * YEAR, 'Pyear': 1e15 * YEAR,
    'Tyear': 1e12 * YEAR, 'Gyear': 1e9 * YEAR, 'Myear': 1e6 * YEAR, 'kyear': 1e3 * YEAR, 'year': YEAR,
    'day': 86400.0, 'hour': 3600.0, 'minute': 60.0, 'sec': 1.0, 'msec': 1e-3, 'usec': 1e-6,
    'nsec': 1e-9, 'psec': 1e-12, 'fsec': 1e-15, 'asec': 1e-18, 'zsec': 1e-21, 'ysec': 1e-24,
}
DB_MODE = {'alpha': 'A', 'beta-': 'B-'}

# NUBASE2020 rows (nubase_4.mas20, Kondev et al. 2021) for isomers, which mendeleev's tables lack:
# (half-life, unit, uncertainty, ((mode, relation, intensity %), ...)). Copied from
#   234 0911   234Pam   1.159  m 0.011  (0-)   B-~100;IT=0.16 4
ISOMERS = {
    'Pa-234m': (1.159, 'minute', 0.011, (('B-', '~', 100.0), ('IT', '=', 0.16))),
}


# ------------------------------------------------------------------ parsing decay.ts


@dataclass(frozen=True)
class Nuclide:
    symbol: str
    a: int
    isomer: bool

    @classmethod
    def parse(cls, name: str) -> Nuclide:
        symbol, mass = name.split('-')
        return cls(symbol, int(mass.rstrip('m')), mass.endswith('m'))

    def __str__(self) -> str:
        return f'{self.symbol}-{self.a}{"m" if self.isomer else ""}'


@dataclass(frozen=True)
class Step:
    parent: Nuclide
    mode: str
    percent: float
    half_life: str
    daughter: Nuclide
    line: int


def parse_series(path: Path) -> dict[str, list[Step]]:
    text = path.read_text(encoding='utf-8')
    found: dict[str, list[Step]] = {}
    for block in BLOCK.finditer(text):
        first = text.count('\n', 0, block.start('body')) + 1
        steps: list[Step] = []
        for offset, raw in enumerate(block.group('body').splitlines()):
            line = raw.strip()
            if not line or line.startswith('//'):
                continue
            m = STEP.fullmatch(line)
            if not m:
                sys.exit(f'{path}:{first + offset}: not a step(...) line: {line}')
            steps.append(
                Step(Nuclide.parse(m['parent']), m['mode'], float(m['percent']), m['half_life'],
                     Nuclide.parse(m['daughter']), first + offset)
            )
        found[block.group('name')] = steps
    calls, parsed = len(re.findall(r"\bstep\('", text)), sum(len(steps) for steps in found.values())
    if calls != parsed:
        sys.exit(f'{path}: {calls - parsed} step(...) call(s) outside the parsed *_SERIES arrays')
    unexpected = sorted(set(found) - set(SERIES))
    if unexpected:
        sys.exit(f'{path}: {", ".join(f"{n}_SERIES" for n in unexpected)} not in SERIES; add it there and to NATURAL_START')
    missing = [name for name in SERIES if not found.get(name)]
    if missing:
        sys.exit(f'{path}: no step lines found for {", ".join(f"{n}_SERIES" for n in missing)}')
    return {name: found[name] for name in SERIES}


def parse_half_life(text: str) -> tuple[float, float]:
    """Seconds, and half a unit in the last digit written (the rounding allowance), in seconds."""
    m = HALF_LIFE.fullmatch(text)
    if not m or m['unit'] not in OUR_UNITS:
        raise ValueError(f'unreadable half-life {text!r}')
    exponent = int(m['exponent'].translate(SUPERSCRIPTS)) if m['exponent'] else 0
    decimals = len(m['mantissa'].partition('.')[2])
    scale = OUR_UNITS[m['unit']] * 10.0**exponent
    return float(m['mantissa']) * scale, 0.5 * 10.0**-decimals * scale


# ------------------------------------------------------------------ mendeleev tables


@dataclass(frozen=True)
class Mode:
    code: str
    relation: str
    intensity: float | None
    allowed_not_observed: bool

    def __str__(self) -> str:
        if self.intensity is None:
            return f'{self.code} (no intensity)'
        return f'{self.code}{self.relation}{self.intensity:g}'


@dataclass(frozen=True)
class Isotope:
    half_life: float | None
    unit: str | None
    uncertainty: float | None
    radioactive: bool
    abundance: float | None
    modes: tuple[Mode, ...]
    source: str = 'db'


def locate_db(explicit: str | None) -> str:
    if explicit:
        return explicit
    import mendeleev  # only to find the bundled database

    version = getattr(mendeleev, '__version__', '?')
    if version != MENDELEEV_VERSION:
        print(f'warning: mendeleev {version} installed; these checks were written against {MENDELEEV_VERSION}')
    return os.path.join(os.path.dirname(mendeleev.__file__), 'elements.db')


class Tables:
    def __init__(self, db_path: str) -> None:
        self.con = sqlite3.connect(f'file:{db_path}?mode=ro', uri=True)
        self.z = dict(self.con.execute('SELECT symbol, atomic_number FROM elements'))

    def isotope(self, n: Nuclide) -> Isotope | None:
        if n.isomer:
            if str(n) not in ISOMERS:
                return None
            half_life, unit, uncertainty, modes = ISOMERS[str(n)]
            return Isotope(half_life, unit, uncertainty, True, None,
                           tuple(Mode(code, relation, i, False) for code, relation, i in modes), 'NUBASE2020 row')
        rows = self.con.execute(
            'SELECT id, half_life, half_life_unit, half_life_uncertainty, is_radioactive, abundance '
            'FROM isotopes WHERE atomic_number = ? AND mass_number = ?',
            (self.z[n.symbol], n.a),
        ).fetchall()
        if len(rows) != 1:
            return None
        iso_id, half_life, unit, uncertainty, radioactive, abundance = rows[0]
        modes = tuple(
            Mode(code, (relation or '=').strip() or '=', intensity, bool(not_observed))
            for code, relation, intensity, not_observed in self.con.execute(
                'SELECT mode, relation, intensity, is_allowed_not_observed FROM isotopedecaymodes WHERE isotope_id = ?',
                (iso_id,),
            )
        )
        return Isotope(half_life, unit, uncertainty, bool(radioactive), abundance, modes)


def major_codes(modes: tuple[Mode, ...]) -> set[str]:
    """Modes of at least CUTOFF % that are real values, not small ones stored without their exponent."""
    measured = [
        (m.code, m.intensity)
        for m in modes
        if m.intensity is not None and not m.allowed_not_observed and m.relation != '<'
    ]
    if not measured:
        return set()
    top = max(intensity for _, intensity in measured)
    return {code for code, i in measured if i >= CUTOFF and (i == top or top + i <= 100.5)}


# ------------------------------------------------------------------ checks


def z_of(tables: Tables, n: Nuclide) -> int:
    if n.symbol not in tables.z:
        raise KeyError(f'unknown element symbol {n.symbol}')
    return tables.z[n.symbol]


def check_arithmetic(tables: Tables, s: Step) -> str | None:
    zp, zd = z_of(tables, s.parent), z_of(tables, s.daughter)
    want = (zp - 2, s.parent.a - 4) if s.mode == 'alpha' else (zp + 1, s.parent.a)
    return None if (zd, s.daughter.a) == want else f'{s.mode} of {s.parent} should give Z={want[0]}, A={want[1]}'


def check_half_life(s: Step, iso: Isotope) -> str | None:
    if iso.half_life is None or iso.unit not in DB_UNITS:
        return f'no usable half-life tabulated ({iso.half_life} {iso.unit})'
    try:
        ours, allowance = parse_half_life(s.half_life)
    except ValueError as err:
        return str(err)
    theirs = iso.half_life * DB_UNITS[iso.unit]
    # The factor only absorbs float error, so a tabulated value exactly halfway may round either way.
    if abs(ours - theirs) <= allowance * (1 + 1e-9):
        return None
    return f'half-life {s.half_life} is not the tabulated {iso.half_life:g} {iso.unit} rounded to the digits written'


def check_intensity(s: Step, mode: Mode) -> str | None:
    if mode.intensity is None:
        return f'{mode.code} has no tabulated intensity'
    if mode.relation == '~':
        ok = abs(s.percent - mode.intensity) <= APPROX_TOL
    elif mode.relation == '<':
        ok = s.percent <= mode.intensity
    elif mode.relation == '>':
        ok = s.percent >= mode.intensity
    else:
        ok = abs(s.percent - mode.intensity) <= EXACT_TOL
    return None if ok else f'branch {s.percent:g}% vs tabulated {mode}'


def describe_db(iso: Isotope, codes: set[str]) -> str:
    major = major_codes(iso.modes)
    listed = ', '.join(str(m) for m in iso.modes if m.code in codes)
    others = [
        f'{m}{"*" if m.intensity is not None and m.intensity >= CUTOFF and m.code not in major else ""}'
        for m in iso.modes
        if m.code not in codes and not m.allowed_not_observed
    ]
    half = f'{iso.half_life:g} {iso.unit} ± {iso.uncertainty or 0:g}'
    return f'{iso.source} {listed}; T½ {half}' + (f'; not drawn: {", ".join(others)}' if others else '')


def verify(series: dict[str, list[Step]], tables: Tables) -> int:
    failures = by_hand = 0
    for name, steps in series.items():
        residues = {n.a % 4 for s in steps for n in (s.parent, s.daughter)}
        print(f'\n{name}_SERIES: {len(steps)} steps, A mod 4 = {", ".join(map(str, sorted(residues)))}')
        problems: list[str] = []
        if len(residues) != 1:
            problems.append(f'mass numbers mix residues mod 4: {sorted(residues)}')
        parents = {s.parent for s in steps}
        seen_parents: set[Nuclide] = set()
        for s in steps:
            head = f'{str(s.parent):8s} -> {str(s.daughter):8s} {s.mode:5s} {s.percent:>7g}%  {s.half_life:>15s}'
            ours = {DB_MODE[x.mode] for x in steps if x.parent == s.parent}
            errors = [e for e in [check_arithmetic(tables, s)] if e]
            iso = tables.isotope(s.parent)
            if iso is None:
                errors.append('isomer has no NUBASE2020 row in ISOMERS' if s.parent.isomer else 'parent nuclide not tabulated')
            else:
                by_hand += iso.source != 'db'
                mode = next((m for m in iso.modes if m.code == DB_MODE[s.mode] and not m.allowed_not_observed), None)
                if mode is None:
                    errors.append(f'{DB_MODE[s.mode]} not listed for {s.parent}')
                else:
                    errors += [e for e in (check_half_life(s, iso), check_intensity(s, mode)) if e]
                if s.parent not in seen_parents:
                    missing = sorted((major_codes(iso.modes) & set(DB_MODE.values())) - ours)
                    errors += [f'branch {code} of 1% or more is not listed' for code in missing]
            failures += bool(errors)
            if errors:
                detail = '; '.join(errors)
            elif iso is not None and s.parent not in seen_parents:
                detail = describe_db(iso, ours)
            else:
                detail = '(same parent as above)'
            print(f'  {"FAIL" if errors else "ok":5s} {head}  {detail}')
            seen_parents.add(s.parent)

        ends = sorted({s.daughter for s in steps} - parents, key=str)
        for end in ends:
            iso = tables.isotope(end)
            if iso is None or iso.radioactive or iso.half_life is not None:
                problems.append(f'chain end {end} is not stable in the tables')
            else:
                abundance = f'{iso.abundance:g}%' if iso.abundance is not None else 'not tabulated'
                print(f'  ok    end {end} is stable (natural abundance {abundance})')
        if len(ends) != 1:
            problems.append(f'expected one chain end, found {", ".join(map(str, ends)) or "none"}')
        roots = sorted(parents - {s.daughter for s in steps}, key=str)
        if len(roots) != 1 or roots[0] != steps[0].parent:
            problems.append(f'expected the first parent to be the only root, found {", ".join(map(str, roots))}')
        else:
            iso = tables.isotope(roots[0])
            natural = bool(iso and iso.abundance)
            if natural != NATURAL_START[name]:
                problems.append(f'{roots[0]} natural abundance {iso.abundance if iso else None}, expected natural={NATURAL_START[name]}')
            else:
                print(f'  ok    start {roots[0]} ' + (f'occurs in nature ({iso.abundance:g}%)' if iso and iso.abundance else 'has no natural abundance'))
        for p in problems:
            print(f'  FAIL  {p}')
        failures += len(problems)

    total = sum(len(steps) for steps in series.values())
    print(f'\n{total} steps checked, {by_hand} of them against hand-copied NUBASE2020 isomer rows; {failures} failure(s).')
    return failures


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.split('\n\n')[0])
    parser.add_argument('--db', help='read this elements.db instead of the installed mendeleev one')
    parser.add_argument('--source', default=str(SOURCE), help='decay.ts to check (default: %(default)s)')
    args = parser.parse_args()
    db = locate_db(args.db)
    print(f'mendeleev tables: {db}')
    tables = Tables(db)
    try:
        failures = verify(parse_series(Path(args.source)), tables)
    finally:
        tables.con.close()
    sys.exit(1 if failures else 0)


if __name__ == '__main__':
    main()
