import { useEffect, useState } from "react";
import { api, type TariffComponents } from "../api";
import { useStore } from "../store";
import "./data-panel.css";

// Spot-price profiles -> Eurostat country code.
const SPOT_COUNTRY: Record<string, string> = {
  "ec/de_lu_da": "DE", "ec/nl_da": "NL", "ec/fr_da": "FR", "ec/dk1_da": "DK",
};

let cache: Promise<TariffComponents[]> | null = null;
const loadTariffs = () => (cache ??= api.tariffs().catch(() => { cache = null; return []; }));

const eur = (v: number) => `€${v.toFixed(3)}`;

/** Suggests a realistic price adder (network costs + taxes) for the chosen spot-price zone,
 *  from Eurostat's published price components, and explains flat or non-European tariffs. */
export function TariffSuggestion() {
  const tariff = useStore((s) => s.site.tariff);
  const updateSection = useStore((s) => s.updateSection);
  const [rows, setRows] = useState<TariffComponents[]>([]);
  useEffect(() => { loadTariffs().then(setRows); }, []);

  const profile = tariff.price_profile;
  if (profile.startsWith("eurostat/")) {
    return (
      <div className="ts-box">
        <p>This is an all-in retail price from Eurostat (energy, network, taxes). Keep the price adder at 0.</p>
      </div>
    );
  }
  const country = SPOT_COUNTRY[profile];
  if (!country) {
    return profile.startsWith("cl2022/") ? (
      <div className="ts-box"><p>California tariff from CityLearn. Eurostat add-on suggestions cover European spot prices only.</p></div>
    ) : null;
  }
  const options = rows.filter((r) => r.country === country);
  if (!options.length) return null;
  const home = options.find((r) => r.consumer === "household");
  const biz = options.find((r) => r.consumer === "business");
  const shown = home ?? biz!;
  const applied = options.find((r) => Math.abs(r.adder - tariff.price_adder) < 5e-5);

  return (
    <div className="ts-box">
      <span className="ts-title">Realistic add-on for {shown.country_name}</span>
      <p>Spot prices miss grid fees and taxes. Eurostat {shown.year} averages for a typical tariff:</p>
      <div className="ts-breakdown">
        {home && <>
          <span>Households: network {eur(home.network)} + taxes incl. VAT {eur(home.taxes)}</span>
          <span className="ts-sum">{eur(home.adder)}/kWh</span>
        </>}
        {biz && <>
          <span>Businesses: network {eur(biz.network)} + taxes excl. VAT {eur(biz.taxes)}</span>
          <span className="ts-sum">{eur(biz.adder)}/kWh</span>
        </>}
      </div>
      <div className="ts-actions">
        {home && <button className="btn" onClick={() => updateSection("tariff", { price_adder: home.adder })}>Use household add-on</button>}
        {biz && <button className="btn" onClick={() => updateSection("tariff", { price_adder: biz.adder })}>Use business add-on</button>}
        {tariff.price_adder !== 0 && <button className="btn" onClick={() => updateSection("tariff", { price_adder: 0 })}>Spot only</button>}
      </div>
      {applied && <span className="ts-applied">Using the {applied.consumer} add-on ({eur(applied.adder)}/kWh).</span>}
      <p className="ts-source">
        Approximation: the supplier's margin is not included, and VAT is averaged. Source: {shown.source}, {shown.band}; CC BY 4.0.
      </p>
    </div>
  );
}
