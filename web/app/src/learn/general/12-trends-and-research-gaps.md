---
title: "12. Trends, open problems and research gaps"
sidebar_position: 13
part: "Part IV · Direction"
---

# 12. Trends, open problems and research gaps

**In simple terms.** A summary of where the field is heading and which important questions are still unanswered. These open questions are where new research and new products can make the biggest difference.

## 12.1 Trends

1. **From firm to flexible connections.** EU law (Directive 2024/1711), Dutch contract types and German §14a all push sites towards conditional access. Flexibility is becoming a condition of connection rather than an optional market.
2. **From aggregate to device-level, then back to site level.** Flexibility research moved from abstract virtual batteries to detailed device models; the practical unit now is the *site*, which combines several assets behind one meter.
3. **From black-box to physics-informed models.** PIML and grey-box identification are replacing pure data-driven models where data are scarce and extrapolation matters.
4. **From deterministic to probabilistic promises.** Energinet's P90 rule, chance-constrained aggregation and performance-based standards such as AEMA all ask for flexibility *with a stated confidence*.
5. **From MPC versus RL to MPC with learning.** Evidence favours MPC when models exist; learning enters through better models, approximate or differentiable MPC and safety layers.
6. **New flexible loads.** Data centres and battery-buffered charging have become commercially important within two years.

The market (Chapters 10 and 11) adds four commercial trends:

- **From products to outcomes.** Depot operators and businesses increasingly buy a working, financed site (energy-as-a-service, revenue guarantees) rather than separate hardware and software.
- **Basic load management is a commodity.** Major charger makers ship it as standard; value moves to market access, financing and reliability.
- **Money follows asset operation.** The best-funded startups operate batteries across markets for owners and investors.
- **Consolidation.** Well-funded players are expanding through acquisitions and new markets, which makes them likely buyers of specialised tools and teams.

## 12.2 Research gaps

| Gap | Evidence | Opportunity |
| --- | --- | --- |
| G1. No composable library of control-oriented, physics-informed models for site assets | Sections 5 and 6: models exist per asset, with no common interface or uncertainty output | Modular grey-box models for battery, EV charging, heat pump, data centre and PV, each reporting its own uncertainty |
| G2. Flexibility is not quantified with a probability at site level | Section 4: chance-constrained methods target aggregators and forecast error | Site-level "promisable flexibility" with a stated confidence, including device-model uncertainty |
| G3. Device uncertainty is missing from controllers | Section 7: chance constraints usually cover forecasts only; battery SoC error causes large shortfalls | Uncertainty-aware MPC that propagates state-of-charge, health and charging-curve uncertainty |
| G4. Planning ignores the operational controller and flexible contracts | Section 8: perfect-foresight sizing overestimates value; contracts modelled as tariffs | One digital twin used for both sizing/contract choice and operation, with probability of breaching the limit as output |
| G5. Little validation on real sites | Sections 7 and 9: few field studies; simulators cover single domains | Validation on real site data (e.g. Dutch charging datasets) and with industry partners |

## 12.3 Where new research can contribute

The proposed research sits at the intersection of these gaps: composable physics-informed site models (G1), used in a digital twin to quantify how much flexibility a site can reliably promise (G2), with uncertainty-aware optimisation for operation (G3) and planning (G4), validated on real data (G5). Each component builds on established methods; the contribution is their integration around the question that businesses and grid operators actually face when signing a flexible connection contract. Chapter 13 turns this into a concrete focus and route.
