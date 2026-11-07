"""Site configuration: the generic asset model.

A site is a grid connection plus a list of assets on one electrical bus
(one meter). The web app edits exactly this structure, and it round-trips to
JSON/YAML. Each parameter carries a label, unit, help text and, where it has a
default value, the public source of that value.
"""

from __future__ import annotations

from typing import Annotated, Any, Literal

from pydantic import BaseModel, ConfigDict, Field

CL_EVS_SCHEMA = "CityLearn citylearn_challenge_2022_phase_all_plus_evs schema.json"
CL_P1_SCHEMA = "CityLearn citylearn_challenge_2022_phase_1 schema.json"


def param(
    default: Any,
    label: str,
    *,
    unit: str = "",
    help: str = "",
    source: str = "",
    options: str = "",
    ge: float | None = None,
    le: float | None = None,
) -> Any:
    """A model field with UI metadata (label, unit, help, source, option list)."""
    extra: dict[str, Any] = {"unit": unit, "source": source}
    if options:
        extra["options"] = options
    return Field(default, title=label, description=help, ge=ge, le=le, json_schema_extra=extra)


class UiPosition(BaseModel):
    """Where the asset sits on the canvas. Ignored by the simulator."""

    x: float = 0.0
    y: float = 0.0


class AssetBase(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: str = Field(title="ID", min_length=1)
    name: str = param("", "Name")
    ui: UiPosition = Field(default_factory=UiPosition, json_schema_extra={"hidden": True})


class Building(AssetBase):
    """A fixed electricity demand (lights, plugs, appliances)."""

    type: Literal["building"] = "building"
    load_profile: str = param(
        "cl2022/home_1", "Load profile", options="load",
        help="Hour-by-hour demand recorded in a real building.",
        source="CityLearn 2022 dataset, Building_1.csv",
    )
    scale: float = param(
        1.0, "Scale factor", ge=0,
        help="Multiplies the profile. 20 means twenty buildings like this one.",
    )


class SolarPV(AssetBase):
    """Rooftop or ground-mounted solar panels."""

    type: Literal["pv"] = "pv"
    capacity_kwp: float = param(
        4.0, "Installed capacity", unit="kWp", ge=0,
        help="Peak DC power of the panels.",
        source=f"{CL_P1_SCHEMA}, Building_1 pv.nominal_power",
    )
    profile: str = param(
        "cl2022/pv_1", "Solar profile", options="pv",
        help="Generation per kWp, hour by hour, from the same dataset as the loads.",
        source="CityLearn 2022 dataset, Building_1.csv solar_generation",
    )


class Battery(AssetBase):
    """A stationary battery."""

    type: Literal["battery"] = "battery"
    capacity_kwh: float = param(
        6.4, "Usable capacity", unit="kWh", ge=0,
        source=f"{CL_P1_SCHEMA}, Building_1 electrical_storage.capacity",
    )
    power_kw: float = param(
        5.0, "Max charge/discharge power", unit="kW", ge=0,
        source=f"{CL_P1_SCHEMA}, Building_1 electrical_storage.nominal_power",
    )
    round_trip_efficiency: float = param(
        0.9, "Round-trip efficiency", ge=0.01, le=1,
        help="Share of energy put in that comes back out. Losses split equally between "
        "charging and discharging.",
        source=f"{CL_P1_SCHEMA}, Building_1 electrical_storage.efficiency (CityLearn takes "
        "the square root as one-way efficiency)",
    )
    soc_min: float = param(0.0, "Minimum state of charge", ge=0, le=1,
                           help="Never discharge below this fraction of capacity.")
    soc_max: float = param(1.0, "Maximum state of charge", ge=0, le=1,
                           help="Never charge above this fraction of capacity.")
    soc_initial: float = param(
        0.0, "Initial state of charge", ge=0, le=1,
        source="CityLearn default initial_soc = 0",
    )


class EVCharger(AssetBase):
    """One EV charging point with the cars that visit it."""

    type: Literal["ev_charger"] = "ev_charger"
    max_power_kw: float = param(
        11.0, "Max charging power", unit="kW", ge=0,
        source=f"{CL_EVS_SCHEMA}, charger_1_1 max_charging_power",
    )
    efficiency: float = param(
        0.95, "Charging efficiency", ge=0.01, le=1,
        help="Share of grid energy that reaches the car battery.",
        source=f"{CL_EVS_SCHEMA}, charger_1_1 efficiency",
    )
    sessions: str = param(
        "cl2022/charger_1_1", "EV sessions", options="ev",
        help="Which cars arrive, when they leave, and how much energy they need.",
        source="CityLearn 2022 EV dataset, charger_1_1.csv",
    )


Asset = Annotated[Building | SolarPV | Battery | EVCharger, Field(discriminator="type")]
ASSET_TYPES: dict[str, type[AssetBase]] = {
    "building": Building, "pv": SolarPV, "battery": Battery, "ev_charger": EVCharger,
}


class GridConnection(BaseModel):
    model_config = ConfigDict(extra="forbid")

    import_limit_kw: float | None = param(
        None, "Import limit", unit="kW", ge=0,
        help="Maximum power the site may draw (connection or transformer rating). "
        "Empty = unlimited.",
    )
    export_limit_kw: float | None = param(
        None, "Export limit", unit="kW", ge=0,
        help="Maximum power the site may feed back. Solar is curtailed above it. "
        "Empty = unlimited.",
    )


class Tariff(BaseModel):
    model_config = ConfigDict(extra="forbid")

    price_profile: str = param("cl2022/tou", "Import price", options="price")
    export_price: float = param(
        0.0, "Export price", unit="per kWh", ge=0,
        help="What exported energy earns.",
        source="CityLearn convention: exports earn nothing",
    )
    demand_charge_per_kw_month: float = param(
        0.0, "Demand charge", unit="per kW per month", ge=0,
        help="Charged on each month's highest hourly import. Common for commercial sites. "
        "Enter your tariff's value; there is no default.",
    )


BatteryStrategy = Literal["idle", "self_consumption", "price_arbitrage", "peak_shaving"]
EVStrategy = Literal["as_fast_as_possible", "spread_until_departure"]


class ControllerSpec(BaseModel):
    model_config = ConfigDict(extra="forbid")

    battery: BatteryStrategy = param(
        "self_consumption", "Battery strategy",
        help="idle: never used. self_consumption: store spare solar, use it when short. "
        "price_arbitrage: also charge from the grid at the day's cheapest hours and "
        "discharge at the most expensive. peak_shaving: keep grid import under a threshold.",
    )
    peak_threshold_kw: float = param(
        10.0, "Peak-shaving threshold", unit="kW", ge=0,
        help="Only used by peak_shaving. Target ceiling for grid import.",
    )
    ev: EVStrategy = param(
        "as_fast_as_possible", "EV charging strategy",
        help="as_fast_as_possible: full power on arrival. spread_until_departure: the "
        "lowest constant power that still finishes by departure.",
    )


class Site(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: str = "My site"
    days: int = param(365, "Days to simulate", ge=1, le=365)
    start_day: int = param(0, "Start day", ge=0, le=364)
    grid: GridConnection = Field(default_factory=GridConnection)
    tariff: Tariff = Field(default_factory=Tariff)
    controller: ControllerSpec = Field(default_factory=ControllerSpec)
    assets: list[Asset] = Field(default_factory=list)
