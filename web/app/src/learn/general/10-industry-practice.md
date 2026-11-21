---
title: "10. Industry practice"
sidebar_position: 11
part: "Part III · Market"
---

# 10. Industry practice

**In simple terms.** This chapter looks at what companies actually sell and do today: batteries with energy management software, new contracts from grid operators, battery-buffered fast chargers and flexible data centres. It shows what already works in practice and what is still missing.

Industry is moving faster than research on deployment, but slower on guarantees. Products control batteries and loads behind the meter. What they mostly cannot do is state, with a quantified confidence, how much flexibility a site can promise.

## 10.1 Behind-the-meter batteries and energy management systems

In the Netherlands, batteries behind the meter have become a leading answer to congestion. The national enterprise agency RVO presents them as a way for businesses to grow or electrify despite an overloaded grid, and to earn money from smart operation ([RVO, 2026](https://www.rvo.nl/nieuws/overbelast-elektriciteitsnet-biedt-kansen-voor-batterijopslag)). A DNV study for RVO notes that congestion makes batteries attractive especially for companies that cannot get extra capacity ([DNV for RVO, 2026](https://rvo.nl/sites/default/files/2026-04/Implementatie%20kleinschalige%20batterijen.pdf)).

The energy management system (EMS) market, however, is fragmented. The first phase of the Dutch National EMS Programme, commissioned by RVO, TKI Urban Energy and others, concluded that the impact of EMSs is still limited: products are stand-alone, disconnected from system goals, and offered by many different types of companies ([Solar Magazine, May 2026](https://solarmagazine.nl/nieuws-zonne-energie/i43687/nationaal-ems-programma-van-pilots-naar-een-schaalbaar-flexibel-ecosysteem); [full report](https://romutrechtregion.nl/wp-content/uploads/2026/03/20260331_Rapport_Nationaal_EMS_Programma.pdf)). TNO has warned that EMSs will not relieve congestion as long as open standards are missing ([Solar Magazine, Sept 2026](https://solarmagazine.nl/nieuws-zonne-energie/i44910/waarschuwing-tno-energiemanagementsysteem-lost-netcongestie-niet-op-zolang-open-standaarden-ontbreken)).

## 10.2 Grid operators offering battery-based contracts

Grid operators are starting to design contracts around site batteries. Liander's **FlexPlus Batterij** lets businesses leave the waiting list for extra capacity if they invest in a battery that stays partly available to the grid; investors may be eligible for RVO's Flex-E subsidy covering up to 40% of investment costs ([Solar Magazine, Sept 2026](https://solarmagazine.nl/nieuws-zonne-energie/i44673/bedrijven-kunnen-wachtlijst-omzeilen-door-batterij-te-delen-met-stroomnet)). Contracts like this make the research question concrete: the business must know how much of its battery it can give to the grid without hurting its own operation.

## 10.3 Battery-buffered EV charging

Battery-buffered fast charging is the clearest commercial case of flexibility replacing grid capacity. ADS-TEC Energy reports more than 3,700 charging points delivered worldwide and positions the technology for fuel stations whose connection is too small for fast charging ([ADS-TEC, 2026](https://www.barchart.com/story/news/2008680/profitable-electrification-for-fuel-stations-ads-tec-energy-at-uniti-expo-2026)). Its chargers have also been prequalified for grid balancing in Austria with Salzburg AG ([Energy-Storage.news, Dec 2025](https://www.energy-storage.news/ads-tec-battery-buffered-ev-fast-chargers-put-into-ancillary-services-market-in-austria/)), showing that one site battery can serve charging, peak limits and grid services at once.

## 10.4 Flexible data centres

Data centres are the newest and fastest-moving flexible load. Emerald AI demonstrated a 25% reduction in a cluster's power during peak hours for three hours while meeting AI quality-of-service targets, in a field trial in Phoenix ([arXiv 2507.00909](https://arxiv.org/abs/2507.00909)), and raised $150 million in 2026 ([SiliconANGLE](https://siliconangle.com/2026/09/17/nvidia-google-and-emerald-ai-launch-flexible-data-center-consortium/)). In September 2026, Emerald AI, Google and NVIDIA launched the AI Energy Management Alliance, explicitly performance-based: it focuses on the measurable service a facility delivers, including response speed, duration and predictability ([NVIDIA](https://blogs.nvidia.com/blog/ai-energy-management-alliance/)). Google reports more than 1 GW of demand response capacity, and NVIDIA offers DSX Flex to optimise a facility's grid use, on-site generation and batteries ([SiliconANGLE](https://siliconangle.com/2026/09/17/nvidia-google-and-emerald-ai-launch-flexible-data-center-consortium/)).

The alliance's emphasis on *predictability* is the same need this research addresses: a grid operator connects a flexible load faster only if it trusts the promised flexibility.

## 10.5 Assessment

Hardware and control products exist; standardised, quantified flexibility promises do not. Judging from public product descriptions, industry relies mostly on rule-based or deterministic optimisation with safety margins set by experience; none of the products reviewed here publishes a quantified reliability. The gap between products and policy goals is visible in Dutch government-commissioned work (Section 3.4: only 5–10% of trajectories led to a contract) and in the National EMS Programme's findings.
