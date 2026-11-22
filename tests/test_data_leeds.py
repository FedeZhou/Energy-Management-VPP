"""Leeds fleet depot loader on a small sample of the real file.

Sample rows: EV Fleet Chargepoint use (Depot Usage 2023), (c) Leeds City Council, 2023,
https://datamillnorth.org/dataset/e7ljx/ev-fleet-chargepoint-use. This information is licensed under the terms of
the Open Government Licence.
"""
# ruff: noqa: E501  (sample rows are kept verbatim)

import datetime as dt
from pathlib import Path

import pytest

from emsbench.data import leeds
from emsbench.sim.profiles import EVSession

HEADER = ("﻿Chargepoint ID,Plug in Date,Plug in Time,Unplug Date,Unplug Time,Charge Start Date,Charge Start Time,"
          "Charge End Date,Charge End Time,Total kWh,New List.Charger Location\n")
ROWS = """\
1324-01,28/04/2023,18:50:39,02/05/2023,08:12:03,28/04/2023,18:50:39,02/05/2023,08:12:03,4.93,"LCC Knowsthorpe HQ, Leeds 1"
1324-01,30/04/2023,15:17:21,01/05/2023,10:30:00,30/04/2023,15:17:21,01/05/2023,10:30:00,12.14,"LCC Knowsthorpe HQ, Leeds 1"
1324-01,02/05/2023,08:03:51,05/05/2023,09:16:26,02/05/2023,08:03:51,05/05/2023,09:16:26,5.583,"LCC Knowsthorpe HQ, Leeds 1"
1324-01,02/05/2023,08:59:59,02/05/2023,12:41:51,02/05/2023,08:59:59,02/05/2023,12:41:51,8.907,"LCC Knowsthorpe HQ, Leeds 1"
1324-01,02/05/2023,15:59:35,03/05/2023,11:06:47,02/05/2023,15:59:35,03/05/2023,11:06:47,10.677,"LCC Knowsthorpe HQ, Leeds 1"
1324-01,04/05/2023,15:15:06,05/05/2023,11:40:03,04/05/2023,15:15:06,05/05/2023,11:40:03,11.184,"LCC Knowsthorpe HQ, Leeds 1"
1324-01,06/05/2023,15:09:58,07/05/2023,10:55:19,06/05/2023,15:09:58,07/05/2023,10:55:19,8.78,"LCC Knowsthorpe HQ, Leeds 1"
1324-01,29/05/2023,10:17:25,29/05/2023,11:34:07,29/05/2023,10:17:25,29/05/2023,11:34:07,0,"LCC Knowsthorpe HQ, Leeds 1"
1317-01,29/09/2023,12:47:45,02/10/2023,11:03:35,29/09/2023,12:47:45,02/10/2023,11:03:35,6.601,Leeds Museum Discovery Centre
1318-01,02/10/2023,08:58:03,02/10/2023,14:43:39,02/10/2023,08:58:03,02/10/2023,14:43:39,11.107,"LCC Farnley Hall, Leeds 1"
"""


@pytest.fixture
def sample(tmp_path: Path) -> Path:
    path = tmp_path / "depot_usage_2023.csv"
    path.write_text(HEADER + ROWS, encoding="utf-8")
    return path


def test_two_socket_split_and_cleaning(sample: Path) -> None:
    sets = {s.id: s for s in leeds.parse(sample)}
    assert set(sets) == {"leeds/1324-01a", "leeds/1324-01b", "leeds/1317-01a", "leeds/1318-01a"}
    a, b = sets["leeds/1324-01a"], sets["leeds/1324-01b"]
    # 7 sessions with energy (the 0 kWh one is dropped); overlapping ones go to the second socket.
    assert len(a.sessions) == 5 and len(b.sessions) == 2
    assert [s.energy_kwh for s in b.sessions] == [12.14, 5.583]
    for sock in (a, b):
        assert all(x.departure <= y.arrival for x, y in zip(sock.sessions, sock.sessions[1:], strict=False))
    assert "Knowsthorpe HQ, charger 1 socket A (5 visits)" in a.label
    assert "Discovery Centre, charger socket A" in sets["leeds/1317-01a"].label
    assert "Farnley Hall, charger 1" in sets["leeds/1318-01a"].label
    assert "OGL" in a.licence


def test_times_and_coverage(sample: Path) -> None:
    s = next(x for x in leeds.parse(sample) if x.id == "leeds/1324-01a")
    # UK summer time (UTC+1) equals fixed CET (UTC+1): the clock is unchanged.
    assert s.sessions[0].arrival == dt.datetime(2023, 4, 28, 18, 50, 39)
    # Whole months only: first plug-in 28 Apr -> 1 May; last unplug 2 Oct -> 1 Oct.
    assert s.first == dt.datetime(2023, 5, 1) and s.last == dt.datetime(2023, 10, 1)


def test_assign_sockets_uses_first_free() -> None:
    t = dt.datetime(2023, 5, 1)
    h = dt.timedelta(hours=1)
    spans = [(0, 3), (1, 2), (2, 4), (2.5, 5)]  # hours
    sess = [EVSession(t + a * h, t + b * h, 1, "x") for a, b in spans]
    sockets = leeds.assign_sockets(sess)
    assert [len(s) for s in sockets] == [1, 2, 1]  # the fourth overlaps both others: a third socket


def test_build_downloads_into_the_cache(sample: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    seen: list[Path] = []
    monkeypatch.setattr(leeds, "download", lambda url, dest: seen.append(dest) or sample)
    assert len(leeds.build()) == 4
    assert seen[0].parent.name == "leeds"
