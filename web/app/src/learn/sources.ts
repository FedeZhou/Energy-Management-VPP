// Every source cited on the Learn pages. `read` says how deeply it was checked (2026-11-08):
// "abstract" = publisher/arXiv/OpenAlex abstract read; "docs" = official documentation page read;
// "code" = this repository; "data" = our own computation on the cited open data;
// "secondary" = consistent secondary sources (primary text paywalled); "metadata" = title/venue only.

export type ReadDepth = "abstract" | "docs" | "code" | "data" | "secondary" | "metadata";

export interface Source {
  id: string;
  title: string;
  authors?: string;
  year?: number;
  venue?: string;
  url?: string;
  read: ReadDepth;
  note?: string;
}

export const READ_LABEL: Record<ReadDepth, string> = {
  abstract: "Abstract read",
  docs: "Documentation read",
  code: "This repository",
  data: "Our analysis of open data",
  secondary: "Secondary sources (standard paywalled)",
  metadata: "Title and venue only",
};

const list: Source[] = [
  // ---------- This repository ----------
  { id: "code_engine", title: "Site Lab engine: src/emsbench/sim/engine.py", read: "code" },
  { id: "code_ctrl", title: "Site Lab controllers: src/emsbench/sim/controllers.py", read: "code" },
  { id: "code_profiles", title: "Calendar windows and resampling: src/emsbench/sim/profiles.py", read: "code" },
  { id: "code_model", title: "Site model and sourced defaults: src/emsbench/sim/model.py", read: "code" },
  { id: "data_registry", title: "Data sources registry: src/emsbench/data/registry.py and docs/data-sources.md", read: "code" },
  { id: "runs_2026_11", title: "Site Lab example runs (configs/sites), 7-8 Nov 2026", read: "data",
    note: "Numbers from our own simulations; they depend on the example sizes, which are choices, not sourced values." },
  { id: "pvgis_check", title: "Solar model vs PVGIS 5.3 check, 10 profiles (pv_validations.json)", read: "data",
    url: "https://re.jrc.ec.europa.eu/api/v5_3/PVcalc" },
  { id: "eurostat_check", title: "Eurostat price components, nrg_pc_204_c / nrg_pc_205_c, 2025", read: "data",
    url: "https://doi.org/10.2908/NRG_PC_204_C" },

  // ---------- Documentation and standards ----------
  { id: "emhass_lp", title: "EMHASS: An EMS based on Linear Programming", venue: "EMHASS documentation", read: "docs",
    url: "https://emhass.readthedocs.io/en/latest/advanced_math_model.html" },
  { id: "emhass_home", title: "EMHASS documentation (overview: CVXPY, HiGHS)", venue: "EMHASS documentation", read: "docs",
    url: "https://emhass.readthedocs.io/en/latest/" },
  { id: "pvlib_losses", title: "pvlib.pvsystem.pvwatts_losses (defaults from the PVWatts Version 5 Manual, Dobos 2014)",
    venue: "pvlib documentation", read: "docs",
    url: "https://pvlib-python.readthedocs.io/en/stable/reference/generated/pvlib.pvsystem.pvwatts_losses.html" },
  { id: "iec61851", title: "IEC 61851-1 control pilot: 10% duty cycle = 6 A, the lowest current a charger may offer",
    read: "secondary", url: "https://www.beyondlogic.org/?p=1041",
    note: "Several secondary sources agree on 6 A at 10%; they differ on the exact lower boundary. Normative text: IEC 61851-1:2017." },
  { id: "iec60038", title: "IEC 60038 standard voltages: 230/400 V for 50 Hz three-phase low-voltage systems",
    read: "secondary", url: "https://webstore.iec.ch/publication/153",
    note: "IEC's own abstract does not list the table; the 230/400 V (50 Hz) value is confirmed by secondary summaries." },
  { id: "sdac_15min", title: "15-minute MTU in SDAC was implemented (first trading 30 Sep 2025, delivery 1 Oct 2025)",
    authors: "NEMO Committee", year: 2025, read: "docs",
    url: "https://nemo-committee.eu/assets/files/15-minute-mtu-in-sdac-was-implemented.pdf" },
  { id: "iso30134", title: "ISO/IEC 30134-2: Data centres, key performance indicators, Part 2: Power usage effectiveness (PUE)",
    read: "secondary", url: "https://committee.iso.org/standard/85172.html",
    note: "Scope confirmed; the ratio (total facility energy / IT energy) is the commonly cited definition." },
  { id: "uptime_2025", title: "Uptime Institute Global Data Center Survey 2025", authors: "Uptime Institute", year: 2025,
    read: "docs", url: "https://intelligence.uptimeinstitute.com/resource/uptime-institute-global-data-center-survey-2025",
    note: "Public summary only: 'average PUE levels show little change for the sixth consecutive year'." },

  // ---------- Papers ----------
  { id: "ruddick2024", title: "Real-world validation of safe reinforcement learning, model predictive control and decision tree-based home energy management systems",
    authors: "Ruddick, Ceusters, Van Kriekinge, Genov, De Cauwer, Coosemans, Messagie", year: 2024, venue: "Energy and AI",
    url: "https://arxiv.org/abs/2408.07435", read: "abstract" },
  { id: "li2025smpc", title: "Optimal BESS Management for Peak Load Shaving and Battery Health Under Prediction Uncertainty",
    authors: "Li, Kappler, Schwarz, Munzke, Dai, Hagenmeyer, Hiller", year: 2025, venue: "IEEE Transactions on Sustainable Energy",
    url: "https://doi.org/10.1109/tste.2025.3586064", read: "abstract" },
  { id: "nagy2025", title: "The CityLearn Challenge: Four Years of Advancing Common Task Frameworks for Energy Management in Smart Buildings",
    authors: "Nagy, Nweye", year: 2025, venue: "ACM e-Energy", url: "https://doi.org/10.1145/3679240.3734667", read: "abstract" },
  { id: "vazquez2019", title: "CityLearn v1.0: An OpenAI Gym Environment for Demand Response with Deep Reinforcement Learning",
    authors: "Vázquez-Canteli, Kämpf, Henze, Nagy", year: 2019, venue: "ACM BuildSys",
    url: "https://doi.org/10.1145/3360322.3360998", read: "abstract" },
  { id: "kaljevic2026", title: "Benchmarking Time Series Foundation Models for Load Forecasting Under Covariate Uncertainty",
    authors: "Kaljevic, Arzola, Zhang", year: 2026, venue: "arXiv", url: "https://arxiv.org/abs/2610.07232", read: "abstract" },
  { id: "chronos2", title: "Chronos-2: From Univariate to Universal Forecasting", authors: "Ansari, Shchur, Küken, Auer, Han, Mercado et al.",
    year: 2025, venue: "arXiv", url: "https://arxiv.org/abs/2510.15821", read: "abstract" },
  { id: "chronos2b", title: "Chronos-2: A foundation model for multivariate time series forecasting",
    authors: "Ansari, Shchur, Küken, Auer, Han, Mercado et al.", year: 2026, venue: "arXiv",
    url: "https://arxiv.org/abs/2610.41956", read: "abstract" },
  { id: "chronos1", title: "Chronos: Learning the Language of Time Series", authors: "Ansari, Stella, Türkmen et al.", year: 2024,
    venue: "arXiv", url: "https://arxiv.org/abs/2403.07815", read: "abstract" },
  { id: "chen2026", title: "To Defer or To Shift? The Role of AI Data Center Flexibility on Grid Interconnection",
    authors: "Chen, Zheng", year: 2026, venue: "arXiv", url: "https://arxiv.org/abs/2604.05376", read: "abstract" },
  { id: "lademann2026", title: "The Challenges of Using Reinforcement Learning for Controlling Industrial Energy Systems",
    authors: "Lademann, Vincent, Peters, Weigold", year: 2026, venue: "RLC 2026 workshop (arXiv)",
    url: "https://arxiv.org/abs/2605.31044", read: "abstract" },
  { id: "yu2024saferl", title: "Safe Reinforcement Learning for Power System Control: A Review", authors: "Yu, Wang, Zhang, Song",
    year: 2024, venue: "arXiv", url: "https://arxiv.org/abs/2407.00681", read: "abstract" },
  { id: "valogianni2025", title: "Toward Sustainable Electricity Markets: Capacity-Based Pricing for Electric Vehicle Smart Charging",
    authors: "Valogianni, Ketter, Collins, Adomavičius", year: 2025, venue: "Information Systems Research",
    url: "https://doi.org/10.1287/isre.2023.0078", read: "abstract" },
  { id: "sorensen2023", title: "A method for generating complete EV charging datasets and analysis of residential charging behaviour in a large Norwegian case study",
    authors: "Sørensen, Sartori, Lindberg, Andresen", year: 2023, venue: "Sustainable Energy, Grids and Networks",
    url: "https://doi.org/10.1016/j.segan.2023.101195", read: "abstract" },
  { id: "lee2019acn", title: "ACN-Data: Analysis and Applications of an Open EV Charging Dataset", authors: "Lee, Li, Low", year: 2019,
    venue: "ACM e-Energy", url: "https://doi.org/10.1145/3307772.3328313", read: "abstract" },
  { id: "lee2020acnsim", title: "ACN-Sim: An Open-Source Simulator for Data-Driven Electric Vehicle Charging Research",
    authors: "Lee, Sharma, Johansson, Low", year: 2020, venue: "arXiv", url: "https://arxiv.org/abs/2012.02809", read: "abstract" },
  { id: "xu2017", title: "Factoring the Cycle Aging Cost of Batteries Participating in Electricity Markets",
    authors: "Xu, Zhao, Zheng, Litvinov, Kirschen", year: 2017, venue: "IEEE Transactions on Power Systems",
    url: "https://doi.org/10.1109/tpwrs.2017.2733339", read: "abstract" },
  { id: "okane2022", title: "Lithium-ion battery degradation: how to model it", authors: "O'Kane, Ai, Madabattula et al.", year: 2022,
    venue: "Physical Chemistry Chemical Physics (open access)", url: "https://doi.org/10.1039/d2cp00417h", read: "abstract" },
  { id: "graner2025", title: "Accounting for Subsystem Aging Variability in Battery Energy Storage System Optimization",
    authors: "Graner, Cornejo, Hesse, Jossen", year: 2025, venue: "IEEE PES ISGT Europe", url: "https://arxiv.org/abs/2507.04813",
    read: "abstract" },
  { id: "yuan2026", title: "Reinforcement Learning-based Home Energy Management with Heterogeneous Batteries and Stochastic EV Behaviour",
    authors: "Yuan, Wang, Yu, Wik, Zou", year: 2026, venue: "arXiv", url: "https://arxiv.org/abs/2602.04578", read: "abstract" },
  { id: "huang2026vpp", title: "Virtual Power Plants for DER integration: A comprehensive review of aggregation, control, market participation and revenue allocation",
    authors: "Huang, Lv, Feng, Tu", year: 2026, venue: "Energy Strategy Reviews", url: "https://doi.org/10.1016/j.esr.2026.102356",
    read: "abstract" },
  { id: "li2026aivpp", title: "AI-Driven Virtual Power Plants: A Comprehensive Review", authors: "Li, Wang, Liu", year: 2026,
    venue: "Energies", url: "https://doi.org/10.3390/en19041084", read: "abstract" },
  { id: "yaghoubi2025", title: "A Systematic Review and Meta-Analysis of Model Predictive Control in Microgrids: Moving Beyond Traditional Methods",
    authors: "Yaghoubi, Yaghoubi, Maghami, Rahebi, Zareian Jahromi, Ghadami, Yusupov", year: 2025, venue: "Processes",
    url: "https://doi.org/10.3390/pr13072197", read: "abstract" },
  { id: "chundru2026", title: "Advances in Battery Energy Storage Management: Control and Economic Synergies",
    authors: "Chundru, Deshpande, Gankov", year: 2026, venue: "arXiv", url: "https://arxiv.org/abs/2602.06365", read: "abstract" },
  { id: "burgaud2026", title: "Reinforcement learning vs. model-based control in electric vehicle charging microgrids",
    authors: "Burgaud, Le Goff, Kergus, Fadel", year: 2026, venue: "Control Engineering Practice",
    url: "https://doi.org/10.1016/j.conengprac.2026.106890", read: "metadata", note: "No public abstract found." },
  { id: "rafayal2024", title: "Optimizing electricity peak shaving through stochastic programming and probabilistic time series forecasting",
    authors: "Rafayal, Alnaggar, Çevik", year: 2024, venue: "Journal of Building Engineering",
    url: "https://doi.org/10.1016/j.jobe.2024.109163", read: "metadata", note: "No public abstract found." },
  { id: "wilson2022", title: "End-Use Load Profiles for the U.S. Building Stock: Methodology and Results of Model Calibration, Validation, and Uncertainty Quantification",
    authors: "Wilson, Parker, Fontanini, Present, Reyna et al.", year: 2022, venue: "NREL technical report",
    url: "https://doi.org/10.2172/1854582", read: "metadata", note: "Cited by the ComStock release; report not read here." },
];

export const SOURCES: Record<string, Source> = Object.fromEntries(list.map((s) => [s.id, s]));
