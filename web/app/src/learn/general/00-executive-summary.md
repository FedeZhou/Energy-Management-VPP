---
title: "Executive summary"
sidebar_position: 1
---

# Executive summary

**The problem.** Electricity grids are full in many regions. In the Netherlands about 15,000 requests for a connection or more capacity were waiting at the end of 2025, with societal damage estimated at €10–40 billion a year ([Fieldfisher](https://www.fieldfisher.com/en/insights/legislative-developments-in-the-combat-against-e-grid-congestion-in-the-netherlands)). Connection queues exist in at least 16 EU countries. Building new grid takes many years, so flexibility (batteries, smart EV charging, heat pumps, solar curtailment, flexible data centres) is the fastest lever.

**The policy response, and why it stalls.** EU law now requires flexible connection agreements where capacity is short ([Directive 2024/1711, Art. 6a](https://eur-lex.europa.eu/eli/dir/2024/1711/oj/eng)). Uptake is low: only 5–10% of Dutch congestion-management trajectories led to a contract, mainly because businesses are unsure what a contract means for them and their flexibility is not reliable enough ([BlueTerra & Trinomics, 2026](https://www.tweedekamer.nl/downloads/document?id=2026D33903)). The bottleneck is trust, not technology.

**State of the art.** The building blocks are mature: ways to represent flexibility, physics-informed models of batteries and buildings, model predictive control with probabilistic guarantees, and stochastic battery sizing. Five gaps remain: (1) asset models are built in isolation rather than as composable blocks that report their own uncertainty; (2) flexibility is rarely quantified with a stated probability for a single site; (3) controllers model forecast uncertainty but not uncertainty in the devices themselves, such as battery state of charge; (4) planning assumes perfect foresight, which oversizes batteries, and models tariffs rather than flexible contracts; (5) there is little validation on real sites.

**Market.** Generic energy management and battery trading are crowded. Money flows to whoever operates the assets (Entrix: €43 million, 3 GW contracted) and to integrated, financed offers (Decade Energy: €22 million, zero-capex depot energy systems, over 1,500 feasibility studies). Basic load management comes as standard with chargers from major makers. Grid operators and alliances increasingly ask for predictable flexibility, but none of the companies reviewed here quantifies it for a site: that is the clearest white space.

**Recommended focus.** Reliable flexibility for EV-heavy business sites (depots, charging hubs, retail and fuel-station sites): battery sizing and contract choice with a stated probability of breaching the grid limit, plus an uncertainty-aware controller that keeps the promise, both built on one site model.

**Skills to build.** Energy markets, optimisation under uncertainty, probabilistic forecasting and customer discovery.
