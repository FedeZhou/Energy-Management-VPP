---
title: "6. Physics-informed machine learning and grey-box identification"
sidebar_position: 7
---

# 6. Physics-informed machine learning and grey-box identification

**In simple terms.** Pure physics models need a lot of expert work, and pure machine learning needs a lot of data and can give nonsense outside what it has seen. Physics-informed machine learning combines the two: the AI learns from data but must respect known physical rules, for example that energy cannot appear from nowhere. A "grey-box" model is part known equations (white box) and part learned (black box). The result is an accurate model built from limited data.

Physics-informed machine learning (PIML) is now a leading approach for combining limited data with physical knowledge. In energy, it is most advanced for building thermal models and battery degradation, but most models are built for prediction rather than for use inside an optimiser.

## 6.1 Foundations

Karniadakis et al. define physics-informed learning as integrating noisy data and mathematical models through neural networks or kernel methods, either by enforcing physical laws in training or by designing architectures that satisfy physical invariants by construction ([Nature Reviews Physics, 2021](https://doi.org/10.1038/s42254-021-00314-5)). Three families are relevant here:

| Family | Idea | Strength for this research |
| --- | --- | --- |
| Physics-informed neural networks (PINNs) | Physical equations as a soft penalty in the loss | Little data needed; good for parameter estimation |
| Neural ODEs and universal differential equations | Known dynamics plus a learned residual term inside an ODE | Natural grey-box structure; continuous time |
| Physics-constrained architectures | Network structure enforces physics, such as energy balance or stability | Guarantees consistency even on unseen data |

Lai et al. illustrate the grey-box idea with physics-informed neural ODEs that split dynamics into a known physics term and a discrepancy term learned by a neural network ([ETH Zurich, 2021](https://research-collection.ethz.ch/bitstream/handle/20.500.11850/488395/3/SI_NODE_V4_3.pdf)). Toscano et al. survey recent algorithmic advances, including Kolmogorov-Arnold variants and uncertainty quantification ([arXiv 2410.13228](https://arxiv.org/abs/2410.13228)).

![Figure 11. The grey-box idea. Known physics (for a battery, the energy balance and an equivalent circuit) is combined with a learned correction; in a PINN the physics enters the training loss, in a neural ODE or physics-constrained network it is part of the model itself.](figures/greybox.svg)

*Figure 11. The grey-box idea. Known physics (for a battery, the energy balance and an equivalent circuit) is combined with a learned correction; in a PINN the physics enters the training loss, in a neural ODE or physics-constrained network it is part of the model itself.*

## 6.2 Applications in power and energy systems

- **Grid dynamics.** Misyris, Venzke and Chatzivasileiadis introduced PINNs to power systems, showing that they need substantially less training data and determined rotor angle and frequency up to 87 times faster than conventional methods ([2020](https://arxiv.org/abs/1911.03737)). At TU Delft, Karaçelebi and Cremer used neural ODEs for frequency monitoring and emergency control ([Sustainable Energy, Grids and Networks, 2025](https://doi.org/10.1016/j.segan.2025.101815)).
- **Buildings and heat pumps.** Drgoňa et al. and Di Natale et al. (Section 5.3) are the reference examples of *control-oriented* physics-constrained models. A review of PIML for building energy modelling categorises the paradigms for integrating physics into ML ([Ma et al.](https://pure.psu.edu/en/publications/a-review-of-physics-informed-machine-learning-for-building-energy/)).
- **Batteries.** Wang et al. proposed a PINN combining empirical degradation and state-space equations for stable state-of-health estimation across battery types ([Nature Communications, 2024](https://doi.org/10.1038/s41467-024-48779-z)). Navidi et al. compared four PIML approaches on four years of ageing data from 24 cells, including their ability to extrapolate to untested conditions ([arXiv 2404.04429](https://arxiv.org/abs/2404.04429)). Guo et al. review "grey box" lifetime models that combine physics and data ([Journal of Energy Storage, 2022](https://doi.org/10.1016/j.est.2022.105992)).
- **Renewables broadly.** A 2025 review finds wind energy the main application area, with PIML for solar still in an infant stage and neural networks the most-used ML method ([Parsa, Applied Energy, 2025](https://opus.lib.uts.edu.au/handle/10453/193137)).

## 6.3 Adapting models to new assets

A site-level tool must work on assets it has not seen. Battery research is moving towards transfer learning and domain adaptation. Lu et al. estimated state of health without target-battery labels using domain adaptation on 65 commercial batteries ([Nature Communications, 2023](https://doi.org/10.1038/s41467-023-38458-w)). Rocha Azevedo et al. found that chemistry did not hinder transfer, but differences in charging protocol did ([DOAJ](https://doaj.org/article/e3adaaf98bd44dffbd35d8f3059c742e)). Reviews note that transfer learning improves robustness within narrow regimes but does not yet give representations valid across evolving operating conditions ([arXiv 2610.21391](https://arxiv.org/abs/2610.21391)).

## 6.4 Embedding learned models in optimisation

To be useful for planning and control, a learned model must be solvable inside an optimiser. Tools now exist for this: OMLT embeds trained neural networks and gradient-boosted trees in Pyomo optimisation problems, with full-space, reduced-space and MILP formulations ([Ceccon et al., JMLR, 2022](https://jmlr.org/papers/v23/22-0277.html)). Drgoňa et al. explicitly designed their building model to be control-oriented.

## 6.5 Assessment

PIML is mature enough to build accurate, physically consistent asset models from limited data. What is missing is a **library of control-oriented grey-box models with a common interface** across batteries, EV charging, heat pumps and data centres, each reporting its own uncertainty and composable into a site model. EV charging and data-centre loads in particular have received little physics-informed treatment.
