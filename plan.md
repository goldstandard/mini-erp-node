## Plan: End-to-End Pricing Platform Expansion

Rozsireni nad aktualni stav postavi jednotnou cenotvorbu: polymer ceny z indexu + customer/regionalni pravidla + converting cost modul pro Product Development + priprava podkladu pro profitability dashboardy a pozdejsi optimalizaci linek. Doporuceny pristup je fazovy s produkcne pouzitelnym MVP po kazde fazi, s plnou auditovatelnosti zmen.

**Steps**
1. Phase 0 - Domain baseline and data contract (blocking)
1. Potvrdit jednotnou definici vysledne prodejni ceny: materialova cast (index-driven polymer + ostatni materialy) + converting cost + obchodni pravidla.
1. Potvrdit primarni dimenze pravidel: customer + region + composition variant (podle rozhodnuti uzivatele).
1. Definovat canonical skladbu composition variant (napr. SMS, SMMS, mono/bico, treatment classes), aby lookup pravidel nebyl ad-hoc.
1. Definovat region mapovani (vyroba/dodavka) a fallback prioritu pravidel.

1. Phase 1 - Polymer index pricing consolidation (depends on 1)
1. Znovupouzit existujici index pipeline a sjednotit ji do jedne internal service vrstvy pro cenotvorbu volane z BOM i budoucich dashboardu.
1. Normalizovat vstupy pro vypocet polymer ceny z indexu (index, varianta Min/Mid/Max, multiplikatory, fixni upravy).
1. Doplnit robustni fallback logiku a diagnostiku zdroje ceny (z jakeho pravidla/hodnoty cena vznikla).
1. Zachovat kompatibilitu s existujicim vypoctem a endpointy; nova logika bude nejdrive read-through bez rozbiti stavajicich flows.

1. Phase 2 - Customer selling index rules with versioning (depends on 1, parallelizable with Phase 1 implementation detail)
1. Pridat datovy model pro customer-specific index rules s historizaci (hlavicka pravidla + hodnoty v case + audit).
1. Implementovat lookup prioritu: exact match (customer+region+variant) -> customer+region default -> global default.
1. Dodat admin/management UI pro spravu pravidel vcetne validity v case (effective from) a preview dopadu na cenu.
1. Pridat import/export sablonu pro bulk udrzbu pravidel.
1. Propojit lookup do cenotvorby tak, aby kazdy vypocet vracel i metadata o pouzitem pravidle.

1. Phase 3 - Product Development module: Converting Cost (priority #1 after pricing; depends on 1-2)
1. Vytvorit novy modul pro PD uzivatele (stranka, API, permission key, navigace).
1. Dodat spravu Converting Cost jako hodnoty navazane na recepturu (pole v recepture) s verzovanym auditem.
1. Audit pozadavek uzivatele: zaznamenavat kazdou zmenu (hodnota, datum, uzivatel) a zobrazit historii na detailu receptury/modulu.
1. Implementovat servisni vrstvu pro vypocet complete selling price, kde Converting Cost je povinna komponenta.
1. Pridat role-based opravnneni: read/modify pro PD a read-only pro dalsi role dle matice.

1. Phase 4 - 3D gravure (aperturing) and spooling modules (depends on 3 for shared pricing integration)
1. Vytvorit samostatne moduly pro aperturing a spooling se stejnym auth/audit patternem jako PD modul.
1. Definovat vstupy, vypocetni modely a ukladani vysledku tak, aby slo vysledky zahrnout do total converting/selling cost.
1. Pridat moznost volitelneho zapocteni modulu do finalni ceny podle receptury/zakaznika.

1. Phase 5 - Pricing analytics and dashboards (depends on 1-4)
1. Dodat dashboardy ziskovosti, alternativnich vyhodnoceni a rankingu nad sjednocenym pricing modelem.
1. Prvni release dashboardu postavit na existujicich BOM summary datech (cost-side ranking) i bez sales dat.
1. Pripravit datovy kontrakt pro rozsireni o rocni prodeje (trzby/marze), aby slo plynule prejit na profit ranking.

1. Phase 6 - Line optimization foundation (depends on 5 and sales+production datasets)
1. Po doplneni rocnich prodeju a produkcnich behu pridat optimalizacni vrstvu vyuziti linek (what-if scenare, presuny receptur mezi linkami).
1. Vyhodnocovat trade-off cost vs. throughput vs. kapacita vs. regionalni dodavky.

**Parallelization and dependency notes**
1. Phase 1 a schema navrh casti Phase 2 mohou bezet paralelne, ale aktivace customer rules v produkcni cenotvorbe blokuje na dokonceni obou.
1. UI prace (Phase 2/3) muze bezet paralelne s backend vrstvou, pokud je nejdrive fixnut API kontrakt.
1. Dashboardy muzou zacit nad cost-only metrikami driv, profitabilita a optimalizace linek blokuje na sales/production data.

**Relevant files**
- `server.js` - centralni routovani, middleware permissions, BOM cost flow (`computeBomRecipeCostItem`, `computeBomRecipeSummaryCosts`), DB migrace.
- `src/backend/rm-prices.js` - existujici index/formula pipeline (`calculatePolymerPrices`, `applyFormula`) pro polymer pricing.
- `src/backend/polymer-indexes.js` - sprava indexu a variant (Min/Mid/Max), zdroj hodnot pro vypocet.
- `src/backend/costing.js` - cost engine pattern pro agregaci material/process costs.
- `src/backend/line-rates-db.js` - vstupy pro process/converting slozku ceny.
- `src/backend/auth.js` - audit log API + permission model + group-based access.
- `src/frontend/admin-access.html` - existujici vzor pro matrix opravnneni, audit vizualizaci a admin management.
- `src/frontend/bom-recipe-browser.html` - zaklad dashboard patternu pro summary, filtry, exporty.

**Verification**
1. Contract tests pro pricing pipeline: stejny vstup -> deterministicky vystup + trace pouziteho pravidla.
1. Migration tests: vytvoreni novych tabulek, backward compatibility bez customer rules dat.
1. Permission tests: PD modify vs read-only role enforcement na novych endpoint ech.
1. Audit tests: kazda zmena converting cost vytvori audit zaznam s hodnotou, timestamp, user id.
1. Integration tests: BOM recipe -> selling price vypocet zahrnujici polymer index + converting cost + customer rule.
1. UI tests: customer rules CRUD, history timeline, dashboard filtry/export bez regresi.
1. Performance check: summary/ranking endpointy pod realistic load a indexy DB dotazu.

**Decisions**
- Pricing output v 1. vlne: kompletni prodejni cena.
- Customer pravidla v 1. vlne: customer + region + composition variant.
- Priorita po pricing casti: Product Development modul (Converting Cost) pred aperturing/spooling.
- History requirement: explicitni audit vsech uprav converting cost (hodnota, datum, uzivatel).

**Scope boundaries**
- Included now: plan pro architekturu, data model, API, UI a fazovani delivery.
- Excluded for first profitability wave: plna marzova analytika bez sales dat; line optimization bez production run dat.

**Further Considerations**
1. Composition variant taxonomy governance: Option A central controlled enum. Option B editable dictionary with approval workflow. Doporučení: Option B s validacnim whitelistem pro flexibilitu.
1. Rule conflict resolution pri vice aktivnich pravidlech: Option A strict uniqueness + hard fail. Option B priority score. Doporučení: Option A v prvni vlne.
1. Retention audit detailu: Option A neomezena historie. Option B retention policy + archivace. Doporučení: Option B (operacne udrzitelne).

**Release roadmap (proposed)**
1. Release R0 (1 week) - Foundations and contracts
1. Deliverables: finalni specifikace pricing formule, composition taxonomy v1, region fallback pravidla, API/data contracts, feature flags.
1. Exit criteria: schvalena specifikace stakeholdery, test scenare pripraveny, migration scripts navrzeny.

1. Release R1 (2 weeks) - Polymer index pricing core
1. Deliverables: sjednocena internal pricing service nad existujicimi indexy, trace metadata source-of-price, fallback diagnostika, regression-safe integrace do BOM cost flow.
1. Exit criteria: parity s aktualnim vypoctem na referencnich datech, kontrakt testy green, bez regresi v BOM summary/export.

1. Release R2 (2 weeks) - Customer rules engine + data model
1. Deliverables: DB schema pro customer+region+composition rules s effective-date verzovanim, CRUD API, lookup priorita, import/export sablona.
1. Exit criteria: deterministic lookup, migration bez dopadu na stavajici data, audit udalosti pro zmeny pravidel.

1. Release R3 (2 weeks) - Customer rules UI + activation
1. Deliverables: admin/management UI pro pravidla, preview vypoctu, validace konfliktu pravidel, postupna aktivace feature flag.
1. Exit criteria: business acceptance na pilot zakaznicich, uspesny smoke test CZ/EG/RSA, rollback plan overen.

1. Release R4 (2 weeks) - Product Development module (Converting Cost)
1. Deliverables: novy PD modul (page + API + permissions), pole Converting Cost navazane na recepturu, historie zmen (hodnota, datum, uzivatel), audit log integrace.
1. Exit criteria: kazda uprava Converting Cost dohledatelna v historii, read/modify role enforcement funguje, integrace do complete selling price aktivni.

1. Release R5 (2 weeks) - Aperturing and Spooling modules
1. Deliverables: moduly 3D gravure (aperturing) a spooling, vypocetni modely, ukladani vysledku, volitelne zahrnuti do finalni ceny.
1. Exit criteria: vypocetni konzistence na referencnich use-cases, audit a permissions v souladu s PD modulem.

1. Release R6 (2 weeks) - Pricing dashboards v1 (cost-side)
1. Deliverables: dashboardy rankingu, alternativnich scenaru a cost profitability proxy nad sjednocenym pricing modelem, exporty a filtry.
1. Exit criteria: reporty vykazuji konzistentni cisla s API summary, vykon endpointu v limitech.

1. Release R7 (1 week prep + data onboarding) - Sales/production data enablement
1. Deliverables: datovy kontrakt pro rocni prodeje a production runs, ingest pipeline stub, validacni pravidla dat kvality.
1. Exit criteria: pripraveny podklad pro profit margin analytics a line optimization.

1. Release R8 (2-3 weeks) - Optimization v1
1. Deliverables: what-if analyzy vyuziti linek, scenare presunu receptur mezi linkami, ranking dopadu na cost/throughput/capacity/region.
1. Exit criteria: potvrzena business relevance scenaru, baseline KPI dashboard pro operativni rizeni.

**Milestones**
1. M1: Complete selling price engine ready (R1-R3).
1. M2: PD converting governance ready with full history/audit (R4).
1. M3: Extended costing inputs ready (R5).
1. M4: Decision-ready dashboards (R6).
1. M5: Optimization-ready data foundation and first optimizer (R7-R8).

**Resourcing suggestion**
1. Stream A (Backend/Data): pricing service, schema, migrations, performance.
1. Stream B (Frontend/Product): rules UI, PD module UI, dashboards.
1. Stream C (QA/Enablement): contract tests, regression packs, pilot rollout, data quality gates.

**Risk gates per release**
1. Gate G1 (R1): numerical parity and deterministic outputs.
1. Gate G2 (R2-R3): rule conflicts, migration safety, controlled rollout.
1. Gate G3 (R4): audit completeness for converting cost changes.
1. Gate G4 (R6): analytics correctness and response-time SLA.
1. Gate G5 (R8): optimization recommendations validated on historical scenarios.

**Target state tree schema**
```text
Pricing Platform (Target)
├── 1) Core Pricing Engine
│   ├── Polymer Index Pricing
│   │   ├── Index sources (Min/Mid/Max)
│   │   ├── Formula layer (multipliers, fixed adjustments)
│   │   └── Price trace metadata (source, fallback path)
│   ├── Customer Selling Rules
│   │   ├── Dimensions: customer + region + composition variant
│   │   ├── Effective-date versioning
│   │   ├── Lookup priority
│   │   │   ├── exact match
│   │   │   ├── regional default
│   │   │   └── global default
│   │   └── Rule import/export
│   └── Complete Selling Price
│       ├── Material cost component
│       ├── Converting cost component
│       ├── Optional aperturing/spooling components
│       └── Final price output + audit trace
├── 2) Product Development Domain
│   ├── Converting Cost Module
│   │   ├── Recipe-bound converting cost field
│   │   ├── Full change history (value, timestamp, user)
│   │   ├── API + UI for manage/view
│   │   └── Permission model (read/modify)
│   ├── 3D Gravure (Aperturing) Module
│   │   ├── Input model
│   │   ├── Calculation model
│   │   └── Optional contribution to final price
│   └── Spooling Module
│       ├── Input model
│       ├── Calculation model
│       └── Optional contribution to final price
├── 3) Data & Governance Layer
│   ├── Versioned configuration tables
│   ├── Audit logs (who changed what and when)
│   ├── Permission matrix integration
│   └── Migration + backward compatibility controls
├── 4) Analytics & Decision Support
│   ├── Pricing dashboards v1 (cost-side)
│   │   ├── Ranking
│   │   ├── Alternative scenario evaluation
│   │   └── Exportable reports
│   ├── Profitability dashboards v2 (after sales data)
│   │   ├── Revenue + margin views
│   │   └── Customer/product/line comparisons
│   └── Optimization v1 (after sales + production data)
│       ├── What-if line allocation scenarios
│       ├── Capacity/throughput trade-off analysis
│       └── Regional supply feasibility checks
└── 5) Release Outcome
	├── M1: Complete selling price engine ready
	├── M2: PD converting governance with full audit
	├── M3: Extended costing inputs integrated
	├── M4: Decision-ready dashboards
	└── M5: Optimization-ready foundation + first optimizer
```
