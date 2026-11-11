"""Site configuration: the generic asset model.

A site is a grid connection plus a list of assets on one electrical bus
(one meter). The web app edits exactly this structure, and it round-trips to
JSON/YAML. Each parameter carries a label, unit, help text and, where it has a
default value, the public source of that value.
"""

from __future__ import annotations

import datetime as dt
from typing import Annotated, Any, Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator

CL_EVS_SCHEMA = "CityLearn citylearn_challenge_2022_phase_all_plus_evs schema.json"
CL_P1_SCHEMA = "CityLearn citylearn_challenge_2022_phase_1 schema.json"
# Nominal low-voltage phase-to-neutral voltage in Europe (IEC 60038: 230/400 V systems).
PHASE_VOLTAGE = 230.0
# § 14a EnWG (BNetzA BK6-22-300, Anlage 1): devices above 4.2 kW are controllable (2.4.1); minimum power 4.2 kW
# per device, 0.4 x power for heat pumps / air conditioning above 11 kW (4.5.1); for EMS control the minimum is
# 4.2 kW + (n - 1) x GZF x 4.2 kW with these simultaneity factors (4.5.2).
DIM_THRESHOLD_KW = 4.2
DIM_MIN_KW = 4.2
DIM_LARGE_KW = 11.0
DIM_LARGE_FACTOR = 0.4
DIM_GZF = {2: 0.8, 3: 0.75, 4: 0.7, 5: 0.65, 6: 0.6, 7: 0.55, 8: 0.5}  # 9 or more devices: 0.45
DIM_GZF_MANY = 0.45
MAX_STEPS = 110_000  # keeps a run under ~20 s; e.g. a year at 5-minute steps


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
        help="Multiplies the profile. Homes: number of similar homes. Commercial profiles given per "
        "1,000 m²: floor area in m² divided by 1,000 (e.g. 2.5 for 2,500 m²).",
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


Chemistry = Literal["lfp", "nmc"]


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
    chemistry: Chemistry = param(
        "lfp", "Cell chemistry (for wear)",
        help="Which ageing model prices battery wear. lfp: lithium iron phosphate, most new stationary storage. "
        "nmc: nickel manganese cobalt, more common in older and car batteries; ages faster in the models used.",
        source="NREL BLAST-Lite models Lfp_Gr_250AhPrismatic and NMC_Gr_75Ah_A, fitted to Gasper et al. 2023, "
        "https://doi.org/10.1016/j.est.2023.109042",
    )
    replacement_cost_per_kwh: float | None = param(
        None, "Replacement cost", unit="per kWh", ge=0,
        help="What the battery system costs per usable kWh, in the site's currency. Wear = this value used up as the "
        "battery ages. Empty = by size, EUR sites only: 1,200 (home, up to 30 kWh), 580-710 (commercial), "
        "380-464 (large-scale); 2022 prices excluding VAT, higher than today's.",
        source="Figgener et al. 2023, The development of battery storage systems in Germany: a market review "
        "(status 2023), https://arxiv.org/abs/2203.06762: 2022 mean prices per usable kWh, excl. VAT",
    )
    end_of_life_capacity: float = param(
        0.8, "End of life at", ge=0.5, le=0.99,
        help="Share of the original capacity at which the battery counts as worn out. Warranties use 60-80%.",
        source="LG Energy Solution RESU12 warranty: 80% energy retention after 10 years or 30 MWh throughput",
    )
    temperature_c: float = param(
        25.0, "Battery temperature", unit="°C", ge=-10, le=50,
        help="Assumed constant. Warmer batteries age faster. The ageing models were fitted between 10 and 45 °C.",
        source="Example choice (indoor installation); fitting range from the BLAST-Lite model notes",
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
    phases: Literal[1, 3] = param(
        3, "Phases", help="Three-phase chargers spread their load over L1-L3; single-phase "
        "chargers put it all on one phase.",
    )
    phase: Literal["L1", "L2", "L3"] = param(
        "L1", "Phase for single-phase charging",
        help="Used by single-phase chargers, and by single-phase cars on a three-phase charger (they "
        "draw from one phase only). Spread chargers over L1-L3 to balance the load.",
    )
    min_current_a: float = param(
        6.0, "Minimum charging current", unit="A", ge=0,
        help="Chargers cannot charge below this current per phase; they pause instead.",
        source="IEC 61851-1: the lowest current a charger may signal to the car is 6 A",
    )
    bidirectional: bool = param(
        False, "Bidirectional (V2H / V2G)",
        help="Lets a plugged-in car give energy back to the site (vehicle-to-home) at up to the charger's power, "
        "but only while it can still be charged to its target by departure. Needs a bidirectional charger and car. "
        "Assumed to be a DC charger, which can discharge at any power up to its rating (the 6 A minimum applies to "
        "AC charging only).",
    )
    v2g_max_kwh_per_visit: float = param(
        10.0, "Max energy borrowed per visit", unit="kWh", ge=0,
        help="Only for bidirectional chargers. Upper limit on energy taken from one car during one visit, to "
        "protect the driver's range and the car battery.",
        source="Example choice",
    )


class DataCenter(AssetBase):
    """A data center: servers (IT load) plus cooling and other overhead, set by the PUE.

    Facility power = IT power x PUE. The PUE is held constant, so cooling follows the IT load
    but not the weather (real cooling rises on hot afternoons). The UPS battery and backup
    generator are separate components: add a battery with a minimum charge as the backup reserve.
    """

    type: Literal["data_center"] = "data_center"
    it_load_profile: str = param(
        "esif/it_202404", "IT load profile", options="load",
        help="Measured server power. The ESIF profiles are a ~3 MW supercomputer centre in Colorado.",
        source="NLR (NREL) HPC Facility PUE Data, it_power_kw, https://data.openei.org/submissions/8616",
    )
    it_scale: float = param(
        1.0, "IT scale factor", ge=0,
        help="Multiplies the IT profile. 2 means twice the servers of the measured site.",
    )
    pue: float = param(
        1.54, "PUE (total power / IT power)", ge=1.0, le=3.0,
        help="1.54 is the 2025 industry average; best liquid-cooled sites reach about 1.05-1.1. Everything "
        "above 1 is cooling, fans, pumps, lights and losses.",
        source="Uptime Institute Global Data Center Survey 2025 (UII Keynote Report 180), p. 7, Fig. 2: "
        "weighted average annual PUE 1.54, n=681",
    )


class HeatPump(AssetBase):
    """An electric heat pump for space heating and hot water, with a heat buffer (tank).

    Heat demand = a When2Heat profile x the annual heat demand. Electricity = heat / COP, using the COP of the
    chosen heat pump type in that hour. The tank lets the controller heat earlier than needed (when power is
    cheap or solar is spare) and use the stored heat later. If the heat pump cannot cover the demand (too
    small, or limited by the grid operator), the shortfall is recorded as unmet heat.
    """

    type: Literal["heat_pump"] = "heat_pump"
    heat_profile: str = param(
        "w2h/de_sfh", "Heat demand profile", options="heat",
        help="Hourly shape of space heating plus hot water for a building type and country.",
        source="When2Heat (Ruhnau, Hirth, Praktiknjo 2019, Scientific Data 6:189), Open Power System Data 2023-07-27, https://doi.org/10.1038/s41597-019-0199-y",
    )
    annual_heat_kwh: float = param(
        15730.0, "Annual heat demand", unit="kWh", ge=0,
        help="Heat needed in a year for space heating and hot water. 15,730 kWh is the average gas use of a "
        "130 m² single-family house in Germany; gas use includes boiler losses, so the heat actually needed is "
        "somewhat lower.",
        source="co2online Heizspiegel 2025 (with Deutscher Mieterbund and BMWK), as reported by t-online, 23.09.2025: "
        "130 m² single-family house, about 15,730 kWh of gas per year",
    )
    cop_profile: str = param(
        "w2h/de_ashp_radiator", "Heat pump type (COP)", options="cop",
        help="Coefficient of performance per hour: kWh of heat per kWh of electricity. Depends on the heat source "
        "(air or ground), the outdoor temperature and the heating circuit (radiators need hotter water than floor "
        "heating, so the COP is lower).",
        source="When2Heat (Ruhnau, Hirth, Praktiknjo 2019, Scientific Data 6:189), Open Power System Data 2023-07-27, https://doi.org/10.1038/s41597-019-0199-y",
    )
    max_power_kw: float | None = param(
        None, "Max electric power", unit="kW", ge=0,
        help="Electric power of the heat pump. Empty = sized to cover the coldest hour of the simulated period "
        "exactly (no spare capacity for pre-heating then).",
    )
    buffer_kwh: float = param(
        7.0, "Heat buffer (tank) size", unit="kWh heat", ge=0,
        help="Heat the tank can store and release later. About 7 kWh is a 300-litre water tank used over 20 °C.",
        source="Example choice; water stores about 4.19 kJ per kg per kelvin, so 300 kg x 20 K x 4.19 kJ/(kg·K) "
        "= 7.0 kWh",
    )
    buffer_initial: float = param(
        0.5, "Initial tank charge", ge=0, le=1, help="Share of the buffer that is full at the start.",
        source="Example choice",
    )


Asset = Annotated[Building | SolarPV | Battery | EVCharger | DataCenter | HeatPump, Field(discriminator="type")]
ASSET_TYPES: dict[str, type[AssetBase]] = {
    "building": Building, "data_center": DataCenter, "heat_pump": HeatPump, "pv": SolarPV, "battery": Battery,
    "ev_charger": EVCharger,
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
    fuse_a: float | None = param(
        None, "Fuse per phase", unit="A", ge=0,
        help="Main fuse rating per phase (three-phase, 230 V to neutral). EV charging is "
        "slowed so no phase exceeds it. Empty = not checked.",
    )
    dimming: Literal["off", "direct", "ems"] = param(
        "off", "Grid-operator dimming (§14a, Germany)",
        help="Simulates the grid operator limiting controllable devices during a daily window: EV chargers, heat "
        "pumps and batteries (while charging) rated above 4.2 kW. direct: each device is limited to 4.2 kW (heat "
        "pumps above 11 kW to 40% of their power). ems: the devices together are limited to 4.2 kW + (n - 1) x "
        "simultaneity factor x 4.2 kW, and the energy management system shares it out.",
        source="BNetzA decision BK6-22-300 of 27.11.2023, Anlage 1, sections 2.4.1 (devices above 4.2 kW) and 4.5 "
        "(minimum power 4.2 kW; 0.4 x power above 11 kW; EMS formula with simultaneity factors 0.8 for 2 devices "
        "down to 0.45 for 9 or more)",
    )
    dimming_start_hour: float = param(
        17.0, "Dimming window start", unit="h", ge=0, le=24,
        help="Real dimming is rare and comes at short notice; a daily window is a stress test, not a forecast.",
        source="Example choice",
    )
    dimming_hours: float = param(
        2.0, "Dimming window length", unit="h", ge=0, le=24, source="Example choice",
    )


class Tariff(BaseModel):
    model_config = ConfigDict(extra="forbid")

    price_profile: str = param("cl2022/tou", "Import price", options="price")
    price_adder: float = param(
        0.0, "Price adder", unit="per kWh",
        help="Added to every import price: grid fees, taxes, supplier margin. Spot-price "
        "profiles need this to look like a real dynamic tariff. Enter your tariff's value.",
    )
    export_price: float = param(
        0.0, "Export price", unit="per kWh", ge=0,
        help="What exported energy earns (e.g. a feed-in tariff). German examples use the EEG rate for new small "
        "rooftop systems.",
        source="CityLearn convention: exports earn nothing",
    )
    export_unpaid_at_negative_prices: bool = param(
        False, "No export pay at negative spot prices",
        help="German rule for new systems (since Feb 2025) once a smart meter is fitted: exported energy earns "
        "nothing while the day-ahead spot price is negative.",
        source="§ 51 (1) EEG 2023 (Solarspitzengesetz, BGBl. 2025 I Nr. 51): 'Fuer Zeitraeume, in denen der "
        "Spotmarktpreis negativ ist, verringert sich der anzulegende Wert auf null'; § 51 (2) Nr. 1: systems below "
        "100 kW only from the year after a smart meter is fitted. https://www.gesetze-im-internet.de/eeg_2014/__51.html",
    )
    demand_charge_per_kw_month: float = param(
        0.0, "Demand charge", unit="per kW per month", ge=0,
        help="Charged on each month's highest import (per time step). Common for commercial sites. "
        "Enter your tariff's value; there is no default.",
    )
    network_fee_profile: str = param(
        "", "Time-variable network fee (§14a Modul 3)", options="netfee",
        help="Optional. Adds a time-of-day network fee (low / standard / high tier) to every imported kWh, from a "
        "real German grid operator's 2026 price sheet. If you use it, leave the network fee out of the price "
        "adder. Empty = none.",
    )
    demand_charge_profile: str = param(
        "", "Peak-window demand charge (profile id)",
        help="Optional, on top of the demand charge above. A 'demand' profile giving a rate per kW per month "
        "for each hour (0 outside the window), e.g. urdb/xcel_co_pg_demand. Each month, each rate is charged "
        "on the highest import during the hours that carry it. Empty = none.",
    )


BatteryStrategy = Literal["idle", "self_consumption", "price_arbitrage", "peak_shaving", "mpc"]
EVStrategy = Literal["as_fast_as_possible", "spread_until_departure", "cheapest_hours", "solar_surplus"]
HeatPumpStrategy = Literal["on_demand", "cheap_hours", "solar_surplus"]
EVDischargeStrategy = Literal["never", "high_prices"]
ForecastMode = Literal["perfect", "realistic"]


class ControllerSpec(BaseModel):
    model_config = ConfigDict(extra="forbid")

    battery: BatteryStrategy = param(
        "self_consumption", "Battery strategy",
        help="idle: never used. self_consumption: store spare solar, use it when short. "
        "price_arbitrage: also charge from the grid at the day's cheapest hours and "
        "discharge at the most expensive. peak_shaving: keep grid import under a threshold. "
        "mpc: model predictive control, plans the battery and all EV charging together over the next hours "
        "with a linear program and re-plans regularly (the EV strategy below is then ignored).",
    )
    peak_threshold_kw: float = param(
        10.0, "Peak-shaving threshold", unit="kW", ge=0,
        help="Only used by peak_shaving. Target ceiling for grid import.",
    )
    mpc_horizon_hours: float = param(
        24.0, "MPC planning horizon", unit="h", ge=1, le=48,
        help="Only used by mpc. How far ahead it plans. EMHASS recommends a horizon of at least five optimisation "
        "steps; 24 h covers a daily price and solar cycle.",
        source="Example choice; EMHASS documentation: prediction horizon at least 5 x the optimisation time step",
    )
    mpc_replan_minutes: int = param(
        60, "MPC re-plan interval", unit="min", ge=1, le=1440,
        help="Only used by mpc. How often it re-optimises (also immediately when a car arrives). Shorter is more "
        "responsive but slower to simulate.",
    )
    mpc_wear_cost: bool = param(
        True, "MPC prices battery wear",
        help="Only used by mpc. Charge each kWh cycled through the battery at its wear price (replacement cost x "
        "capacity lost per cycle, from the battery's ageing model), so the plan only cycles when it pays.",
    )
    forecast: ForecastMode = param(
        "perfect", "Forecasts",
        help="What controllers know about the future. perfect: the true future (an upper bound). realistic: only "
        "what a real system would know: load = the most recent day repeated; solar = the weather forecast from "
        "about a day earlier; day-ahead prices only once published (about 13:00 for the next day); cars only "
        "once plugged in. Affects the rules that look ahead (cheapest hours, arbitrage) and mpc.",
    )
    heat_pump: HeatPumpStrategy = param(
        "on_demand", "Heat pump strategy",
        help="on_demand: heat when needed, the tank is not used. cheap_hours: fill the tank in the cheapest quarter "
        "of the next 24 h and draw on it in the dearest quarter. solar_surplus: fill the tank with spare solar. "
        "With mpc, heat pumps run on demand (the planner does not schedule them yet).",
    )
    ev_discharge: EVDischargeStrategy = param(
        "high_prices", "Car discharging (bidirectional chargers)",
        help="Only for chargers marked bidirectional. high_prices: a plugged-in car covers the site's grid import "
        "when the price is in the dearer half of the next 24 h, as long as it can still reach its target by "
        "departure. never: cars only charge. The mpc controller does not discharge cars yet.",
    )
    ev: EVStrategy = param(
        "as_fast_as_possible", "EV charging strategy",
        help="as_fast_as_possible: full power on arrival. spread_until_departure: the "
        "lowest steady power that still finishes by departure. cheapest_hours: charge in the "
        "cheapest time steps before departure. solar_surplus: charge from spare solar, and at "
        "full power only when needed to finish by departure.",
    )


class Site(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: str = "My site"
    mode: Literal["plan", "operate"] = param(
        "plan", "Mode", help="plan: long periods, hourly. operate: days, minutes.",
    )
    start: dt.date = param(dt.date(2024, 8, 1), "Start date")
    days: int = param(365, "Days to simulate", ge=1, le=366)
    step_minutes: Literal[1, 5, 15, 60] = param(60, "Time step", unit="min")
    grid: GridConnection = Field(default_factory=GridConnection)
    tariff: Tariff = Field(default_factory=Tariff)
    controller: ControllerSpec = Field(default_factory=ControllerSpec)
    assets: list[Asset] = Field(default_factory=list)

    @property
    def steps(self) -> int:
        return self.days * 24 * 60 // self.step_minutes

    @model_validator(mode="after")
    def _check_size(self) -> Site:
        if self.steps > MAX_STEPS:
            raise ValueError(
                f"{self.days} days at {self.step_minutes}-minute steps is {self.steps:,} steps; "
                f"the limit is {MAX_STEPS:,}. Use a longer step or fewer days."
            )
        return self
