#!/usr/bin/env python3
"""Build src/data/elements.json, the app's element dataset, from the mendeleev 1.3.0 database.

Run from the repository root:

    python3 -m venv .venv && .venv/bin/pip install mendeleev==1.3.0 && .venv/bin/python scripts/build_data.py

The generated JSON is committed, so CI and the web build need no Python. Only the standard
library is used (sqlite3, json); mendeleev is imported solely to locate its bundled elements.db.
Output is deterministic: re-running yields byte-identical JSON.

Options:
    --db PATH        read this elements.db instead of the installed mendeleev's
    --check          exit 1 if src/data/elements.json differs from a fresh build (writes nothing)
    --compare PATH   print the cross-check against pymatgen's core/periodic_table.json

Every departure from the database (OVERRIDE tables below) carries its source; docs/DATA.md
explains the sources, field definitions, category scheme, predicted-value policy and cross-check.
"""

from __future__ import annotations

import argparse
import json
import os
import re
import sqlite3
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / 'src' / 'data' / 'elements.json'
MENDELEEV_VERSION = '1.3.0'

FIELDS = (
    'z', 'symbol', 'name', 'mass', 'massIsMassNumber', 'category', 'config', 'en', 'ie1', 'ea',
    'atomicRadius', 'covalentRadius', 'vdwRadius', 'mp', 'bp', 'density', 'phase',
    'oxidationStates', 'discoveryYear', 'discoverers', 'radioactive', 'goldschmidt', 'pettifor',
    'abundanceCrust', 'predicted', 'notes',
)
CATEGORIES = (
    'alkali-metal', 'alkaline-earth-metal', 'transition-metal', 'post-transition-metal', 'metalloid',
    'reactive-nonmetal', 'noble-gas', 'lanthanide', 'actinide',
)
ROOM_T = 298.15  # K, at 101.325 kPa

# ------------------------------------------------------------------ mass

# Standard atomic weights revised by CIAAW after the values bundled in mendeleev 1.3.0.
SAW_OVERRIDES = {
    'F': 18.998403162,  # CIAAW 2021 (AME2020), Prohaska et al., Pure Appl. Chem. 94 (2022) 573
    'Al': 26.9815384,  # CIAAW 2017 (AME2016), Chem. Int. 40(4) (2018), doi:10.1515/ci-2018-0409
    'Sc': 44.955907,  # CIAAW 2021
    'Ar': 39.95,  # CIAAW 2017: interval [39.792, 39.963]; 39.95 is the abridged value
    'Mn': 54.938043,  # CIAAW 2017
    'Y': 88.905838,  # CIAAW 2021
    'Zr': 91.222,  # CIAAW 2024, Chem. Int. 47(1) (2025), doi:10.1515/ci-2025-0105
    'Rh': 102.90549,  # CIAAW 2017
    'Gd': 157.249,  # CIAAW 2024
    'Tb': 158.925354,  # CIAAW 2017
    'Ho': 164.930329,  # CIAAW 2021
    'Tm': 168.934219,  # CIAAW 2021
    'Lu': 174.96669,  # CIAAW 2024
    'Hf': 178.486,  # CIAAW 2019
    'Au': 196.96657,  # CIAAW 2017
}

# Elements whose standard atomic weight is an interval: CIAAW 2021 bounds. The record keeps the
# conventional value (Meija et al. 2016, Table 3), or the abridged value for Ar and Pb.
SAW_INTERVALS = {
    'H': '[1.00784, 1.00811]', 'Li': '[6.938, 6.997]', 'B': '[10.806, 10.821]',
    'C': '[12.0096, 12.0116]', 'N': '[14.00643, 14.00728]', 'O': '[15.99903, 15.99977]',
    'Mg': '[24.304, 24.307]', 'Si': '[28.084, 28.086]', 'S': '[32.059, 32.076]',
    'Cl': '[35.446, 35.457]', 'Ar': '[39.792, 39.963]', 'Br': '[79.901, 79.907]',
    'Tl': '[204.382, 204.385]', 'Pb': '[206.14, 207.94]',
}

# The 34 elements with no standard atomic weight: mass number of the longest-lived isotope as listed
# on CIAAW's radioactive-elements page (half-lives from NUBASE2020, Kondev et al., Chin. Phys. C 45
# (2021) 030001). mendeleev 1.3.0 predates that list for Lr, Sg, Bh, Hs, Mt, Rg and Mc, and stores
# isotope masses (97.90721, 144.91276) rather than mass numbers for Tc and Pm. Where CIAAW lists two
# isotopes whose half-lives overlap (Tc 97/98, Hs 269/270, Mt 277/278) the one with the smaller
# uncertainty is taken, the tie-break mendeleev documents for its own choice.
MASS_NUMBERS = {
    'Tc': 97, 'Pm': 145, 'Po': 209, 'At': 210, 'Rn': 222, 'Fr': 223, 'Ra': 226, 'Ac': 227,
    'Np': 237, 'Pu': 244, 'Am': 243, 'Cm': 247, 'Bk': 247, 'Cf': 251, 'Es': 252, 'Fm': 257,
    'Md': 258, 'No': 259, 'Lr': 266, 'Rf': 267, 'Db': 268, 'Sg': 269, 'Bh': 270, 'Hs': 270,
    'Mt': 278, 'Ds': 281, 'Rg': 282, 'Cn': 285, 'Nh': 286, 'Fl': 289, 'Mc': 290, 'Lv': 293,
    'Ts': 294, 'Og': 294,
}
ISOTOPE_TIES = {
    'Tc': 'Mass number: Tc-97 (4.21 Myr) and Tc-98 (4.2 Myr) half-lives overlap within uncertainty; many tables show [98].',
    'Hs': 'Mass number: Hs-269 (15 s) and Hs-270 (9 s) half-lives overlap within uncertainty (NUBASE2020).',
    'Mt': 'Mass number: Mt-277 (9 s) and Mt-278 (6 s) half-lives overlap within uncertainty (NUBASE2020).',
}

# ------------------------------------------------------------------ category

SERIES_CATEGORY = {
    'Alkali metals': 'alkali-metal',
    'Alkaline earth metals': 'alkaline-earth-metal',
    'Transition metals': 'transition-metal',
    'Poor metals': 'post-transition-metal',
    'Metalloids': 'metalloid',
    'Nonmetals': 'reactive-nonmetal',
    'Halogens': 'reactive-nonmetal',  # a group, not a metallicity class
    'Noble gases': 'noble-gas',
    'Lanthanides': 'lanthanide',
    'Actinides': 'actinide',
}
CATEGORY_OVERRIDES = {
    'Lu': 'lanthanide',  # IUPAC Red Book 2005 IR-3.5: lanthanoids La-Lu (mendeleev: transition metal)
    'Lr': 'actinide',  # IUPAC Red Book 2005 IR-3.5: actinoids Ac-Lr (mendeleev: transition metal)
    'Po': 'post-transition-metal',  # metallic solid; Hawkes, J. Chem. Educ. 87 (2010) 783
    'At': 'metalloid',  # contested; see note and docs/DATA.md
    'Ts': 'post-transition-metal',  # no chemistry known; expected more metallic than At (docs/DATA.md)
}
# Mt onward: chemistry unstudied (Mt, Ds, Rg, Lv, Ts, Og) or limited to single-atom adsorption
# experiments that do not settle metallic character (Cn, Nh, Fl, Mc). At: bulk never made.
CATEGORY_PREDICTED_FROM_Z = 109
CATEGORY_NOTES = {
    'Lu': 'Counted as a lanthanide: IUPAC lanthanoids are La-Lu (Red Book 2005, IR-3.5).',
    'Lr': 'Counted as an actinide: IUPAC actinoids are Ac-Lr (Red Book 2005, IR-3.5).',
    'Po': 'Classed as a post-transition metal (a metallic solid); some tables list it as a metalloid.',
    'At': ('Class contested: tracer chemistry shows both halide-like At⁻ and cationic At⁺; '
           'bulk At has never been made and is predicted to be metallic (Hermann et al. 2013).'),
    'Ts': ('Class predicted: Ts has never been studied chemically; relativistic effects and the rise in '
           'metallic character down group 17 point to a metal rather than a halogen-like nonmetal.'),
    'Og': 'Group 18, but predicted to be a semiconducting solid at room temperature (Smits et al. 2020).',
}

# ------------------------------------------------------------------ configuration

CONFIG_OVERRIDES = {
    # Relativistic calculations give 6d^n 7s^2 (Eliav et al., Phys. Rev. Lett. 73 (1994) 3203 for Rg;
    # Lackenby, Dzuba & Flambaum, Phys. Rev. A 101 (2020) 012514); mendeleev's 7s1 copies Pt/Au.
    'Ds': '[Rn] 5f14 6d8 7s2',
    'Rg': '[Rn] 5f14 6d9 7s2',
}
# Lr onward: configurations come from relativistic calculations. Lr's measured IE1 (Sato et al.,
# Nature 520 (2015) 209) agrees with the calculated 7p1 ground state but does not measure it.
CONFIG_PREDICTED_FROM_Z = 103
CONFIG_NOTES = {
    'Lr': 'The 7p1 configuration is predicted; the measured ionization energy (Sato et al. 2015) supports it.',
    'Ds': 'Configuration from relativistic calculations (6d8 7s2), not the 6d9 7s1 Pt analogy.',
    'Rg': 'Configuration from relativistic calculations (6d9 7s2), not the 6d10 7s1 Au analogy.',
}

# ------------------------------------------------------------------ electronegativity & energies

# Pauling values for Fr and At are extrapolations: no thermochemical data exist for their bonds.
EN_PREDICTED = {'Fr', 'At'}

EA_OVERRIDES = {
    # mendeleev's He/Be/Ar/Xe values (and N's -1.4) describe metastable excited anions (Andersen
    # 2004), not ground-state electron affinities; these atoms form no stable anion.
    'He': None, 'Be': None, 'Ar': None, 'Xe': None,
    'N': -0.07,  # N- 3P unbound: Andersen, Haugen & Hotop, J. Phys. Chem. Ref. Data 28 (1999) 1511
    'Ga': 0.3012,  # Gibson et al., Phys. Rev. A 100 (2019) 052512 (CRC: 0.43)
    'In': 0.38392,  # Walter et al., Phys. Rev. A 82 (2010) 032507 (CRC: 0.3)
    'La': 0.557553,  # Lu et al., Phys. Rev. A 99 (2019) 062507 (CRC: 0.47)
    'Pr': 0.10923,  # Fu et al., Phys. Rev. A 101 (2020) 022502 (CRC: 0.962)
    'Nd': 0.09748,  # Fu et al. 2020 (CRC: 1.916)
    'Eu': 0.116,  # Cheng & Castleman, Sci. Rep. 5 (2015) 12414 (CRC: 0.864)
    'Tb': 0.13131,  # Fu et al. 2020 (CRC: 1.165)
    'Dy': None,  # CRC's 0.352 eV is not a direct measurement
    'Lu': 0.23882,  # Fu, Tang, Lu & Ning, Chin. J. Chem. Phys. 32 (2019) 187 (CRC: 0.34)
    'Hf': 0.178,  # Ning group cryo-SEVI, 0.1780(7) eV as tabulated by Wikipedia's EA data page (CRC: 0.014)
    'Re': 0.060396,  # Chen & Ning, J. Phys. Chem. Lett. 8 (2017) 2735 (CRC: 0.15)
    'Os': 1.0778,  # 1.07780(12) eV, Bilodeau & Haugen, Phys. Rev. Lett. 85 (2000) 534 (database: 1.1)
    'Tl': 0.320053,  # Walter, Gibson & Spielman, Phys. Rev. A 101 (2020) 052511 (CRC: 0.377)
    'Po': None,  # never measured; CRC's 1.9 eV is an estimate
    'At': 2.41578,  # Leimbach et al., Nat. Commun. 11 (2020) 3824 (CRC estimate: 2.8)
    'Th': 0.60769,  # Tang et al., Phys. Rev. Lett. 123 (2019) 203002 (absent from mendeleev)
}
# Calculated values in CRC / mendeleev. Tc's 0.55(20) eV is tabulated as an estimate ("est.") on
# Wikipedia's "Electron affinity (data page)"; no measurement of Tc- exists.
EA_PREDICTED = {'Tc', 'Fr', 'Ra', 'Ac', 'Yb', 'Og'}
EA_NOTES = {
    'N': 'Negative electron affinity: the N⁻ anion is unbound.',
    'Tc': 'Electron affinity is an estimate (±0.2 eV): the Tc⁻ anion has not been measured.',
    'Yb': 'Electron affinity is a calculated estimate, not a measurement.',
    'Dy': 'Electron affinity omitted: the often-quoted 0.352 eV is not a direct measurement.',
    'Po': 'Electron affinity has not been measured.',
}

# NIST flags these first ionization energies as semi-empirical or theoretical; H is the exception:
# its value (uncertainty 1.2e-11 eV) is a QED calculation tied to hydrogen spectroscopy, not a prediction.
IE_NOT_PREDICTED = {'H'}
IE_NOTES = {
    'Fm': 'Surface-ionization measurement gives IE1 = 6.52 ± 0.13 eV (Sato et al. 2018), consistent with this value.',
    'Md': 'Surface-ionization measurement gives IE1 = 6.59 ± 0.13 eV (Sato et al. 2018), consistent with this value.',
}

# Slater (1964) lists no radius for the noble gases; mendeleev's He/Ne values have no stated source
# and Ar's 71 pm equals Clementi's calculated radius.
ATOMIC_RADIUS_NULL = {'He', 'Ne', 'Ar'}

# mendeleev stores the mean of Cordero et al.'s (2008, Table 2) separate radii for these four.
COVALENT_NOTES = {
    'C': 'Covalent radius is the mean of Cordero et al.’s sp³, sp² and sp values (76, 73 and 69 pm).',
    'Mn': 'Covalent radius is the mean of Cordero et al.’s low- and high-spin values (139 and 161 pm).',
    'Fe': 'Covalent radius is the mean of Cordero et al.’s low- and high-spin values (132 and 152 pm).',
    'Co': 'Covalent radius is the mean of Cordero et al.’s low- and high-spin values (126 and 150 pm).',
}

# ------------------------------------------------------------------ phase transitions

# Allotrope row used when the database lists several (CRC's conventional standard-state choice).
ALLOTROPE = {'P': 'white', 'S': 'monoclinic', 'Se': 'gray', 'Sn': 'white'}
# Melting points that are estimates (never measured on a bulk sample).
MP_PREDICTED = {'At', 'Fr', 'Fm', 'Md', 'No', 'Lr'}
PHASE_NOTES = {
    'He': 'No mp: helium does not solidify at 101.325 kPa (solid helium needs about 2.5 MPa).',
    'C': 'bp is a sublimation point at 1 atm (graphite); it melts only under pressure (triple point 4762 K, 10.3 MPa).',
    'As': 'bp is a sublimation point at 1 atm (grey arsenic); it melts only under pressure (triple point 1090 K, 3.7 MPa).',
    'P': 'mp, bp and density are for white phosphorus.',
    'S': 'mp is for monoclinic sulfur (rhombic S converts to it at 368.35 K); density is for rhombic S.',
    'Se': 'mp, bp and density are for grey (trigonal) selenium.',
    'Sn': 'mp is for white (β) tin; grey (α) tin converts to white above 286.35 K.',
    'Fr': 'Never isolated in bulk: mp is an estimate near room temperature, so the phase is unknown.',
    'At': 'Never isolated in bulk: mp, density and phase are estimates.',
}

# ------------------------------------------------------------------ density

DENSITY_OVERRIDES = {
    'K': 0.859,  # X-ray density, bcc a = 532.69 pm at 20 C (Arblaster 2018); CRC's 0.89 is too high
    'Tc': 11.5,  # 99Tc metal, X-ray density 11.475 g/cm3 at 20 C (Arblaster 2018); CRC rounds to 11
    'Ra': 5.5,  # X-ray density from bcc a = 514.8 pm (Weigel & Trinkl, Radiochim. Acta 10 (1968) 78-82)
    'Am': 13.67,  # X-ray density of dhcp 241Am (a = 346.8 pm, c = 1124 pm); CRC's 12 is near a 1956 cell's 11.87
    'At': 8.91,  # predicted fcc metal (Hermann et al., Phys. Rev. Lett. 111 (2013) 116404; 210At)
    'Fr': None,  # mendeleev's 1.87 is caesium's value (1.873); published estimates are higher and disagree
    'Lr': None,  # predictions disagree
}
# Transactinides: predictions disagree by up to ~50% (e.g. Hs 27-29 vs 40.7 g/cm3), so none is shown.
DENSITY_NULL_FROM_Z = 104
DENSITY_PREDICTED = {'At', 'Fm', 'Md', 'No'}
DENSITY_NOTES = {
    'K': 'Density is the X-ray value at 20 °C; the CRC Handbook lists 0.89 g/cm³.',
    'Tc': 'Density is for ⁹⁹Tc metal, the only isotope available in bulk.',
    'Ra': 'Density is the X-ray value from the bcc lattice (a = 514.8 pm).',
    'Am': 'Density is the X-ray value for dhcp ²⁴¹Am; the CRC Handbook lists 12 g/cm³.',
    'Es': 'Density is the X-ray value for fcc ²⁵³Es metal (a = 575 pm; Haire & Baybarz 1979).',
}

# ------------------------------------------------------------------ chemistry & history

# No2+ is the most stable state in water: Maly et al., Science 160 (1968) 1114.
OXIDATION_OVERRIDES = {'No': [2, 3]}
OXIDATION_NOTES = {'No': 'Oxidation state +2 is the most stable in water, unusual among actinides.'}

# Discovery years that mendeleev gets wrong or pairs with the wrong event (sources in docs/DATA.md).
DISCOVERY_YEAR_OVERRIDES = {
    'V': 1801,  # del Rio; mendeleev gives Sefstrom's 1830 rediscovery
    'Se': 1817,  # Berzelius & Gahn, found 1817 (published 1818)
    'Y': 1794,  # Gadolin; mendeleev: 1789
    'Nd': 1885,  # Auer von Welsbach split didymium; mendeleev: 1925, when the pure metal was made
    'Rn': 1899,  # Rutherford & Owens, thorium emanation; mendeleev: 1898
    'Pa': 1913,  # Fajans & Gohring (234mPa); mendeleev: 1917, the 231Pa work
    'Am': 1944,  # Seaborg et al., late 1944; mendeleev: 1945
    'No': 1966,  # Dubna, credited by IUPAC/IUPAP (1993); the 1957 Stockholm claim failed
    'Bh': 1981,  # GSI, credited; mendeleev: 1976, an unconfirmed Dubna claim
    'Nh': 2004,  # RIKEN's first event; mendeleev: 2015, the year IUPAC credited it
}

# Discoverer strings corrected (misspellings, wrong people, inconsistent titles and initials).
DISCOVERERS = {
    'He': 'William Ramsay; Per Teodor Cleve and Abraham Langlet',
    'Li': 'Johan August Arfwedson',
    'Be': 'Louis-Nicolas Vauquelin',  # mendeleev names the 1828 isolators, Wohler and Bussy
    'B': 'Humphry Davy; Joseph Louis Gay-Lussac and Louis Jacques Thénard',
    'O': 'Joseph Priestley, Carl Wilhelm Scheele',
    'Ne': 'William Ramsay, Morris W. Travers',
    'Na': 'Humphry Davy',
    'Mg': 'Humphry Davy',
    'Al': 'Hans Christian Ørsted',
    'Si': 'Jöns Jacob Berzelius',
    'Ar': 'Lord Rayleigh, William Ramsay',
    'K': 'Humphry Davy',
    'Ca': 'Humphry Davy',
    'Sc': 'Lars Fredrik Nilson',
    'V': 'Andrés Manuel del Río',
    'Cr': 'Louis-Nicolas Vauquelin',
    'Mn': 'Johan Gottlieb Gahn',
    'Co': 'Georg Brandt',
    'Ni': 'Axel Fredrik Cronstedt',
    'Se': 'Jöns Jacob Berzelius, Johan Gottlieb Gahn',
    'Br': 'Antoine Jérôme Balard',
    'Kr': 'William Ramsay, Morris W. Travers',
    'Rb': 'Robert Bunsen, Gustav Kirchhoff',
    'Sr': 'Adair Crawford',
    'Y': 'Johan Gadolin',
    'Zr': 'Martin Heinrich Klaproth',
    'Nb': 'Charles Hatchett',
    'Tc': 'Carlo Perrier, Emilio Segrè',
    'Ru': 'Karl Ernst Claus',
    'Rh': 'William Hyde Wollaston',
    'Pd': 'William Hyde Wollaston',
    'Cd': 'Friedrich Stromeyer',
    'In': 'Ferdinand Reich, Hieronymus Theodor Richter',
    'Te': 'Franz-Joseph Müller von Reichenstein',
    'Xe': 'William Ramsay, Morris W. Travers',
    'Cs': 'Robert Bunsen, Gustav Kirchhoff',
    'Ba': 'Humphry Davy',
    'La': 'Carl Gustaf Mosander',
    'Ce': 'Jöns Jacob Berzelius and Wilhelm Hisinger; Martin Heinrich Klaproth',
    'Pr': 'Carl Auer von Welsbach',
    'Nd': 'Carl Auer von Welsbach',
    'Pm': 'Jacob A. Marinsky, Lawrence E. Glendenin, Charles D. Coryell',
    'Gd': 'Jean Charles Galissard de Marignac',
    'Tb': 'Carl Gustaf Mosander',
    'Ho': 'Marc Delafontaine, Jacques-Louis Soret',
    'Er': 'Carl Gustaf Mosander',
    'Tm': 'Per Teodor Cleve',
    'Yb': 'Jean Charles Galissard de Marignac',
    'Os': 'Smithson Tennant',
    'Ir': 'Smithson Tennant; Antoine Fourcroy, Louis-Nicolas Vauquelin, Hippolyte-Victor Collet-Descotils',
    'Pt': 'Antonio de Ulloa',  # mendeleev: Scaliger, who described the metal in 1557, not 1735
    'Tl': 'William Crookes',
    'At': 'Dale R. Corson, Kenneth R. MacKenzie, Emilio Segrè',
    'Rn': 'Ernest Rutherford, Robert B. Owens',  # mendeleev: Friedrich Dorn (1900)
    'Fr': 'Marguerite Perey',
    'Ra': 'Pierre Curie, Marie Curie, Gustave Bémont',
    'Th': 'Jöns Jacob Berzelius',
    'Pa': 'Kasimir Fajans, Oswald Helmuth Göhring',
    'U': 'Martin Heinrich Klaproth',
    'Np': 'Edwin M. McMillan, Philip H. Abelson',
    'Pu': 'Glenn T. Seaborg, Edwin M. McMillan, Joseph W. Kennedy, Arthur C. Wahl',
    'Am': 'Glenn T. Seaborg, Ralph A. James, Leon O. Morgan, Albert Ghiorso',
    'Cm': 'Glenn T. Seaborg, Ralph A. James, Albert Ghiorso',
    'Bk': 'Stanley G. Thompson, Albert Ghiorso, Glenn T. Seaborg',
    'Cf': 'Stanley G. Thompson, Kenneth Street Jr., Albert Ghiorso, Glenn T. Seaborg',
    'Es': 'Albert Ghiorso et al. (Berkeley, Argonne, Los Alamos)',
    'Fm': 'Albert Ghiorso et al. (Berkeley, Argonne, Los Alamos)',
    'Md': 'Albert Ghiorso, Bernard G. Harvey, Gregory R. Choppin, Stanley G. Thompson, Glenn T. Seaborg',
    'No': 'Joint Institute for Nuclear Research, Dubna',  # mendeleev: the Nobel Institute (1957)
    'Lr': 'Albert Ghiorso, Torbjørn Sikkeland, Almon E. Larsh, Robert M. Latimer',
    'Rf': 'Albert Ghiorso et al. (Berkeley)',
    'Db': 'Albert Ghiorso et al. (Berkeley)',
    'Sg': 'Albert Ghiorso et al. (Berkeley and Livermore)',
    'Bh': 'GSI, Darmstadt',
    'Hs': 'GSI, Darmstadt',
    'Mt': 'GSI, Darmstadt',
    'Ds': 'GSI, Darmstadt',
    'Rg': 'GSI, Darmstadt',
    'Cn': 'GSI, Darmstadt',
    'Fl': 'Joint Institute for Nuclear Research and Lawrence Livermore National Laboratory',
    'Mc': 'Joint Institute for Nuclear Research and Lawrence Livermore National Laboratory',
    'Lv': 'Joint Institute for Nuclear Research and Lawrence Livermore National Laboratory',
    'Ts': 'Joint Institute for Nuclear Research, Oak Ridge National Laboratory and partners',
    'Og': 'Joint Institute for Nuclear Research and Lawrence Livermore National Laboratory',
}
DISCOVERY_NOTES = {
    'He': 'Discovered in the solar spectrum in 1868 (Janssen, Lockyer); the year shown is its isolation.',
    'V': 'Discovered in 1801 by del Río, who withdrew the claim; rediscovered and named by Nils Sefström in 1830.',
    'Rn': 'Discovered as thorium emanation (1899); Friedrich Dorn’s 1900 radium emanation is often cited instead.',
    # H. W. Kirby, "The discovery of actinium", Isis 62 (1971) 290
    'Ac': ('Discovery credit is disputed: Debierne’s 1899 samples are questioned, and Friedrich Giesel '
           'isolated actinium independently in 1902.'),
    'Pa': 'Discovered as ²³⁴ᵐPa (1913); long-lived ²³¹Pa was found in 1917-18 by Hahn and Meitner and by Soddy and Cranston.',
    'No': 'A 1957 Stockholm discovery claim was not confirmed; IUPAC/IUPAP credited Dubna (1966).',
    # Transfermium Working Group: Barber et al., Pure Appl. Chem. 65 (1993) 1757 (also for Rf, Db)
    'Lr': 'IUPAC/IUPAP (1993) shared the discovery credit between Berkeley and Dubna.',
    'Rf': 'IUPAC/IUPAP (1993) shared the discovery credit between Berkeley and Dubna.',
    'Db': 'IUPAC/IUPAP (1993) shared the discovery credit between Berkeley and Dubna.',
    'Nh': 'First atom made in 2004; IUPAC/IUPAP credited the discovery in 2015.',
}

NAME_OVERRIDES = {'Al': 'Aluminium', 'Cs': 'Caesium'}  # IUPAC Red Book 2005 spellings
NAME_NOTES = {'Al': 'IUPAC name aluminium; US spelling aluminum.', 'Cs': 'IUPAC name caesium; US spelling cesium.'}

# Natural U/Th decay-series members have no Goldschmidt class; mendeleev labels them 'synthetic'.
GOLDSCHMIDT_NULL = {'Po', 'At', 'Rn', 'Fr', 'Ac'}
GOLDSCHMIDT_NOTE = 'Occurs naturally as a U/Th decay-series member; no Goldschmidt class assigned.'
RADIOACTIVE_NOTES = {
    'Bi': '²⁰⁹Bi is alpha-radioactive (half-life about 2×10¹⁹ years; de Marcillac et al. 2003) but is treated as stable.',
}
SUPERHEAVY_NOTE = 'Made only a few atoms at a time: bulk properties such as density are unknown.'

# ------------------------------------------------------------------ helpers


def clean(x: float | None) -> float | None:
    """Drop binary noise from stored floats (e.g. 28.000000000000004) without losing real digits."""
    return None if x is None else float(f'{x:.14g}')


def kelvin(x: float | None) -> float | None:
    """Phase-transition temperatures were stored as degC + 273.15; CRC gives at most 4 decimals."""
    return None if x is None else round(x, 4)


def normalise_config(raw: str) -> str:
    """'[Ar] 3d 4s2' -> '[Ar] 3d1 4s2': single spaces, explicit counts, order as given."""
    out = []
    for token in raw.split():
        if re.fullmatch(r'\[[A-Z][a-z]?\]', token):
            out.append(token)
            continue
        m = re.fullmatch(r'(\d)([spdfg])(\d*)', token)
        if not m:
            raise ValueError(f'unexpected configuration token {token!r} in {raw!r}')
        out.append(f'{m[1]}{m[2]}{m[3] or "1"}')
    return ' '.join(out)


CORES = {
    'He': ('1s',),
    'Ne': ('1s', '2s', '2p'),
    'Ar': ('1s', '2s', '2p', '3s', '3p'),
    'Kr': ('1s', '2s', '2p', '3s', '3p', '3d', '4s', '4p'),
    'Xe': ('1s', '2s', '2p', '3s', '3p', '3d', '4s', '4p', '4d', '5s', '5p'),
    'Rn': ('1s', '2s', '2p', '3s', '3p', '3d', '4s', '4p', '4d', '5s', '5p', '4f', '5d', '6s', '6p'),
}


def nist_mismatches(config: str, nist: str) -> list[str]:
    """Subshells of a NIST ground configuration ('3p6.3d7.4s2', '3d5.(6S).4s') missing from ours.

    NIST also lists some closed core subshells; those are accepted when our noble-gas core holds them.
    """
    ours = set(config.split())
    core_name = re.match(r'\[([A-Z][a-z]?)\]', config)
    core = set(CORES[core_name[1]]) if core_name else set()
    missing = []
    for part in nist.split('.'):
        m = re.fullmatch(r'(\d)([spdf])(\d*)', part)
        if not m:
            continue  # parenthesised parent terms such as (6S)
        token = f'{m[1]}{m[2]}{m[3] or "1"}'
        if token not in ours and f'{m[1]}{m[2]}' not in core:
            missing.append(token)
    return missing


def phase_of(mp: float | None, bp: float | None, sublimes: bool) -> str | None:
    if bp is not None and bp < ROOM_T:
        return 'gas'
    if mp is not None and mp < ROOM_T:
        return 'liquid' if bp is not None and bp >= ROOM_T else None
    if mp is not None:
        return 'solid'
    if sublimes and bp is not None:
        return 'solid'
    return None


def locate_db(explicit: str | None) -> str:
    if explicit:
        return explicit
    import mendeleev  # only to find the bundled database

    version = getattr(mendeleev, '__version__', '?')
    if version != MENDELEEV_VERSION:
        sys.exit(f'mendeleev {MENDELEEV_VERSION} required for reproducible output, found {version}')
    return os.path.join(os.path.dirname(mendeleev.__file__), 'elements.db')


# ------------------------------------------------------------------ build


def load(db_path: str) -> list[dict]:
    con = sqlite3.connect(f'file:{db_path}?mode=ro', uri=True)
    con.row_factory = sqlite3.Row
    rows = con.execute(
        'SELECT e.*, s.name AS series_name FROM elements e '
        'LEFT JOIN series s ON s.id = e.series_id ORDER BY e.atomic_number'
    ).fetchall()
    ie = {
        r['atomic_number']: r
        for r in con.execute(
            'SELECT atomic_number, ionization_energy, is_semi_empirical, is_theoretical, ground_configuration '
            'FROM ionizationenergies WHERE ion_charge = 0'
        )
    }
    transitions: dict[int, list[sqlite3.Row]] = {}
    for r in con.execute('SELECT * FROM phasetransitions ORDER BY atomic_number, id'):
        transitions.setdefault(r['atomic_number'], []).append(r)
    oxidation: dict[int, set[int]] = {}
    for r in con.execute("SELECT atomic_number, oxidation_state FROM oxidationstates WHERE category = 'main'"):
        oxidation.setdefault(r['atomic_number'], set()).add(r['oxidation_state'])
    isotopes = {(r[0], r[1]) for r in con.execute('SELECT atomic_number, mass_number FROM isotopes')}
    con.close()
    return [build_element(r, ie.get(r['atomic_number']), transitions.get(r['atomic_number'], []),
                          oxidation.get(r['atomic_number'], set()), isotopes) for r in rows]


def pick_transition(sym: str, rows: list[sqlite3.Row]) -> sqlite3.Row | None:
    if not rows:
        return None
    if len(rows) == 1:
        return rows[0]
    wanted = ALLOTROPE.get(sym)
    chosen = [r for r in rows if r['allotrope'] == wanted]
    if len(chosen) != 1:
        raise ValueError(f'{sym}: choose an allotrope among {[r["allotrope"] for r in rows]}')
    return chosen[0]


def build_element(r: sqlite3.Row, ie: sqlite3.Row | None, transitions: list[sqlite3.Row],
                  oxidation: set[int], isotopes: set[tuple[int, int]]) -> dict:
    z, sym = r['atomic_number'], r['symbol']
    predicted: set[str] = set()
    notes: list[str] = []

    # mass
    if sym in MASS_NUMBERS:
        mass, is_mass_number = MASS_NUMBERS[sym], True
        if (z, mass) not in isotopes:
            raise ValueError(f'{sym}-{mass} missing from the isotopes table')
        if sym in ISOTOPE_TIES:
            notes.append(ISOTOPE_TIES[sym])
    else:
        mass, is_mass_number = SAW_OVERRIDES.get(sym, r['atomic_weight']), False
        if float(mass).is_integer():
            raise ValueError(f'{sym}: integral atomic weight {mass} needs a MASS_NUMBERS entry')
        if sym in SAW_INTERVALS:
            kind = 'abridged' if sym in ('Ar', 'Pb') else 'conventional'
            notes.append(f'Standard atomic weight is the interval {SAW_INTERVALS[sym]}; '
                         f'{mass:g} is the {kind} value (CIAAW).')

    # category
    category = CATEGORY_OVERRIDES.get(sym, SERIES_CATEGORY[r['series_name']])
    if z >= CATEGORY_PREDICTED_FROM_Z or sym == 'At':
        predicted.add('category')
    if sym in CATEGORY_NOTES:
        notes.append(CATEGORY_NOTES[sym])

    # configuration
    config = CONFIG_OVERRIDES.get(sym) or normalise_config(r['electronic_configuration'])
    if z >= CONFIG_PREDICTED_FROM_Z:
        predicted.add('config')
    if ie is not None and ie['ground_configuration']:
        missing = nist_mismatches(config, ie['ground_configuration'])
        if missing:
            print(f'warning: {sym} config {config!r} lacks NIST subshells {missing}', file=sys.stderr)
    if sym in CONFIG_NOTES:
        notes.append(CONFIG_NOTES[sym])

    # electronegativity, ionization energy, electron affinity
    en = clean(r['en_pauling'])
    if en is not None and sym in EN_PREDICTED:
        predicted.add('en')
    ie1 = clean(ie['ionization_energy']) if ie is not None else None
    if ie1 is not None and (ie['is_semi_empirical'] or ie['is_theoretical']) and sym not in IE_NOT_PREDICTED:
        predicted.add('ie1')
    if sym in IE_NOTES:
        notes.append(IE_NOTES[sym])
    ea = clean(EA_OVERRIDES[sym] if sym in EA_OVERRIDES else r['electron_affinity'])
    if ea is not None and sym in EA_PREDICTED:
        predicted.add('ea')
    if sym in EA_NOTES:
        notes.append(EA_NOTES[sym])

    # radii
    atomic_radius = None if sym in ATOMIC_RADIUS_NULL else clean(r['atomic_radius'])
    covalent_radius = clean(r['covalent_radius_cordero'])
    if sym in COVALENT_NOTES:
        notes.append(COVALENT_NOTES[sym])
    vdw_radius = clean(r['vdw_radius_alvarez'])

    # melting and boiling points, phase
    t = pick_transition(sym, transitions)
    mp = bp = None
    sublimes = False
    if t is not None:
        sublimes = bool(t['is_sublimation_point'])
        bp = kelvin(t['boiling_point'])
        # A sublimation point means no liquid at 1 atm; any stored "melting point" is then the triple point.
        mp = None if sublimes else kelvin(t['melting_point'])
    if mp is not None and sym in MP_PREDICTED:
        predicted.add('mp')
    phase = phase_of(mp, bp, sublimes)
    if phase is not None and 'mp' in predicted:
        predicted.add('phase')
    if sym in PHASE_NOTES:
        notes.append(PHASE_NOTES[sym])

    # density
    if z >= DENSITY_NULL_FROM_Z:
        density = None
    else:
        density = clean(DENSITY_OVERRIDES[sym] if sym in DENSITY_OVERRIDES else r['density'])
    if density is not None and sym in DENSITY_PREDICTED:
        predicted.add('density')
    if sym in DENSITY_NOTES:
        notes.append(DENSITY_NOTES[sym])

    # chemistry and history
    oxidation_states = OXIDATION_OVERRIDES.get(sym, sorted(oxidation))
    if sym in OXIDATION_NOTES:
        notes.append(OXIDATION_NOTES[sym])
    year = DISCOVERY_YEAR_OVERRIDES.get(sym, r['discovery_year'])
    discoverers = DISCOVERERS.get(sym, r['discoverers'])
    if year is None:
        discoverers = None  # mendeleev's "Known to the ancients" placeholder
    if sym in DISCOVERY_NOTES:
        notes.append(DISCOVERY_NOTES[sym])
    goldschmidt = r['goldschmidt_class']
    if goldschmidt == 'litophile':
        goldschmidt = 'lithophile'
    if sym in GOLDSCHMIDT_NULL:
        goldschmidt = None
        notes.append(GOLDSCHMIDT_NOTE)
    if sym in RADIOACTIVE_NOTES:
        notes.append(RADIOACTIVE_NOTES[sym])
    if sym in NAME_NOTES:
        notes.append(NAME_NOTES[sym])
    if z >= DENSITY_NULL_FROM_Z:
        notes.append(SUPERHEAVY_NOTE)

    element = {
        'z': z,
        'symbol': sym,
        'name': NAME_OVERRIDES.get(sym, r['name']),
        'mass': mass if is_mass_number else clean(mass),
        'massIsMassNumber': is_mass_number,
        'category': category,
        'config': config,
        'en': en,
        'ie1': ie1,
        'ea': ea,
        'atomicRadius': atomic_radius,
        'covalentRadius': covalent_radius,
        'vdwRadius': vdw_radius,
        'mp': mp,
        'bp': bp,
        'density': density,
        'phase': phase,
        'oxidationStates': oxidation_states,
        'discoveryYear': year,
        'discoverers': discoverers,
        'radioactive': bool(r['is_radioactive']),
        'goldschmidt': goldschmidt,
        'pettifor': r['pettifor_number'],
        'abundanceCrust': clean(r['abundance_crust']),
        'predicted': [f for f in FIELDS if f in predicted],
        'notes': notes,
    }
    require(tuple(element) == FIELDS, f'{sym}: keys out of contract order')
    return element


def require(condition: bool, message: str) -> None:
    """Fail the build (unlike assert, this survives python -O)."""
    if not condition:
        raise SystemExit(f'build_data.py: {message}')


def validate(elements: list[dict]) -> None:
    require([e['z'] for e in elements] == list(range(1, 119)), 'expected Z = 1..118')
    require(len({e['name'] for e in elements}) == 118, 'names must be unique')
    for e in elements:
        require(e['category'] in CATEGORIES, f'{e["symbol"]}: unknown category')
        require(set(e['predicted']) <= set(FIELDS), f'{e["symbol"]}: predicted names unknown fields')
        require(all(len(n) <= 240 for n in e['notes']), f'{e["symbol"]}: note over 240 characters')
        require(e['oxidationStates'] == sorted(set(e['oxidationStates'])), f'{e["symbol"]}: oxidation states')

    def members(pred) -> list[str]:
        return [e['symbol'] for e in elements if pred(e)]

    require(members(lambda e: e['category'] == 'lanthanide') == members(lambda e: 57 <= e['z'] <= 71), 'La-Lu')
    require(members(lambda e: e['category'] == 'actinide') == members(lambda e: 89 <= e['z'] <= 103), 'Ac-Lr')
    gases = members(lambda e: e['phase'] == 'gas')
    require(gases == ['H', 'He', 'N', 'O', 'F', 'Ne', 'Cl', 'Ar', 'Kr', 'Xe', 'Rn'], f'gases: {gases}')
    liquids = members(lambda e: e['phase'] == 'liquid')
    require(liquids == ['Br', 'Hg'], f'liquids: {liquids}')
    require(len(members(lambda e: e['massIsMassNumber'])) == len(MASS_NUMBERS), 'mass-number count')


def render(elements: list[dict]) -> str:
    return json.dumps(elements, indent=1, ensure_ascii=False) + '\n'


# ------------------------------------------------------------------ cross-check

TOLERANCES = (  # (pymatgen key, our field, kind, tolerance)
    ('Atomic mass', 'mass', 'relative', 0.001),
    ('X', 'en', 'absolute', 0.05),
    ('Melting point', 'mp', 'absolute', 10.0),
    ('Boiling point', 'bp', 'absolute', 10.0),
    ('Density of solid', 'density', 'relative', 0.03),
    ('Atomic radius', 'atomicRadius', 'absolute', 0.5),
    ('Ionization energies', 'ie1', 'absolute', 0.05),
    ('Electron affinity', 'ea', 'absolute', 0.02),  # eV
)


def pymatgen_value(entry: dict, key: str) -> float | None:
    v = entry.get(key)
    if key == 'Ionization energies':
        v = v[0] if v else None  # the list is in eV despite pymatgen's _unit table
    if isinstance(v, str):
        try:
            v = float(v.split()[0])
        except ValueError:
            return None
    if v is None:
        return None
    v = float(v)
    if key == 'Density of solid':
        v /= 1000.0  # kg/m3 -> g/cm3
    if key == 'Atomic radius':
        v *= 100.0  # angstrom -> pm
    return v


def compare(elements: list[dict], path: str) -> None:
    with open(path, encoding='utf-8') as fh:
        pmg = json.load(fh)
    for key, field, kind, tol in TOLERANCES:
        print(f'== {field} vs pymatgen "{key}" ({kind} tolerance {tol})')
        for e in elements:
            ours, theirs = e[field], pymatgen_value(pmg.get(e['symbol'], {}), key)
            if ours is None or theirs is None:
                if (ours is None) != (theirs is None):
                    print(f'  {e["symbol"]:>2}: ours {ours}, pymatgen {theirs} (one side missing)')
                continue
            diff = abs(ours - theirs) / abs(ours) if kind == 'relative' else abs(ours - theirs)
            if diff > tol:
                print(f'  {e["symbol"]:>2}: ours {ours}, pymatgen {theirs}')


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__.split('\n')[0])
    ap.add_argument('--db')
    ap.add_argument('--check', action='store_true')
    ap.add_argument('--compare', metavar='PYMATGEN_JSON')
    args = ap.parse_args()
    elements = load(locate_db(args.db))
    validate(elements)
    text = render(elements)
    if args.compare:
        compare(elements, args.compare)
    if args.check:
        current = OUT.read_text(encoding='utf-8') if OUT.exists() else ''
        if current != text:
            sys.exit(f'{OUT.relative_to(ROOT)} is stale: run scripts/build_data.py')
        print(f'{OUT.relative_to(ROOT)} is up to date')
        return
    OUT.write_text(text, encoding='utf-8')
    print(f'wrote {len(elements)} elements to {OUT.relative_to(ROOT)}')


if __name__ == '__main__':
    main()
