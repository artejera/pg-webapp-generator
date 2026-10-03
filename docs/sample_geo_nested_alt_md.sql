-- =============================================================================
-- PostgreSQL Sample: Nested + Alternate Master-Detail Fixture
-- Tables designed specifically to exercise HotX Groups B/C features:
--   NESTED CHAIN (depth 3):
--     countries (country_id)
--       -> federated_states (country_id, state_id)
--            -> counties (country_id, state_id, county_id)
--   ALTERNATE SIBLINGS (same master countries, 2 detail tables side by side):
--     countries (country_id)
--       -> federated_states (country_id, state_id)    [main detail]
--       -> sales_regions    (country_id, region_id)   [alternate detail]
--
-- FK tail-column rule (HotX isTailFkColumn / clientTailFkColumns):
--   The LAST ordinal-position column of each composite FK becomes the
--   clickable drill-link + Browse anchor; earlier N-1 columns form the
--   prefix that gets lock-chipped in detail views.
-- =============================================================================

BEGIN;

drop schema if exists geo cascade
create schema if not exists geo;
SET search_path TO geo, public;

-- -----------------------------------------------------------------------------
-- 1. DROP EXISTING TABLES (idempotent re-runs; safe CASCADE on children)
-- -----------------------------------------------------------------------------
DROP TABLE IF EXISTS counties         CASCADE;
DROP TABLE IF EXISTS sales_regions    CASCADE;
DROP TABLE IF EXISTS federated_states CASCADE;
DROP TABLE IF EXISTS countries        CASCADE;

-- -----------------------------------------------------------------------------
-- 2. DDL - SCHEMA DEFINITIONS
-- -----------------------------------------------------------------------------

-- Root master (level 1). One row = 1 sovereign country.
CREATE TABLE countries (
    country_id      CHAR(2)     NOT NULL,   -- ISO 3166-1 alpha-2 (US, CA, MX, ...)
    official_name   VARCHAR(120) NOT NULL,
    common_name     VARCHAR(80) NOT NULL,
    iso_numeric     CHAR(3),
    capital_city    VARCHAR(80),
    currency_code   CHAR(3),
    population      BIGINT      CHECK (population IS NULL OR population >= 0),
    area_sq_km      NUMERIC(14,2) CHECK (area_sq_km IS NULL OR area_sq_km >= 0),
    founded_date    DATE,
    tld             VARCHAR(8),              -- top-level domain e.g. '.us'
    CONSTRAINT pk_countries PRIMARY KEY (country_id)
);
COMMENT ON TABLE  countries              IS 'Top-level geographic master; all subordinate geo + sales tables share country_id as their leading PK column.';
COMMENT ON COLUMN countries.country_id   IS 'ISO 3166-1 alpha-2 uppercase two-letter code. Primary key.';
COMMENT ON COLUMN countries.population   IS 'Latest official census estimate. NULL = not disclosed.';

-- Nested detail level 2: states / provinces / Länder / departments / oblasts / etc.
-- Composite PK (country_id, state_id). Country_id = FK tail to countries.
CREATE TABLE federated_states (
    country_id      CHAR(2)     NOT NULL,
    state_id        VARCHAR(12) NOT NULL,   -- sub-national ISO or FIPS code e.g. 'CA001'
    official_name   VARCHAR(120) NOT NULL,
    short_name      VARCHAR(60) NOT NULL,
    state_type      VARCHAR(30) NOT NULL DEFAULT 'state' CHECK (state_type IN ('state','province','territory','region','oblast','department','autonomous community','canton','land','federal district')),
    capital_city    VARCHAR(80),
    governor        VARCHAR(100),
    population      BIGINT      CHECK (population IS NULL OR population >= 0),
    area_sq_km      NUMERIC(14,2) CHECK (area_sq_km IS NULL OR area_sq_km >= 0),
    admitted_date   DATE,
    state_abbrev    CHAR(2),                -- e.g. CA, TX, ON for display
    CONSTRAINT pk_federated_states PRIMARY KEY (country_id, state_id),
    CONSTRAINT fk_states_countries FOREIGN KEY (country_id)
        REFERENCES countries (country_id) ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED,
    CONSTRAINT uq_state_per_country_display UNIQUE (country_id, state_abbrev)
);
COMMENT ON TABLE  federated_states                 IS 'First-level sub-national subdivisions. Composite PK + FK both share country_id as the leading column -> HotX tail-col = state_id.';
COMMENT ON COLUMN federated_states.country_id      IS 'FK 1/1 to countries; leading column of both PK and FK.';
COMMENT ON COLUMN federated_states.state_id        IS 'TAIL FK COLUMN. Clickable drill-link in table browse; Browse anchor in CRUD forms.';

-- Nested detail level 3: counties / parishes / municipalities / raions / arrondissements.
-- Composite PK (country_id, state_id, county_id). Two leading columns match
-- federated_states exactly (prefix lock at depth-3). Tail column = county_id.
CREATE TABLE counties (
    country_id      CHAR(2)     NOT NULL,
    state_id        VARCHAR(12) NOT NULL,
    county_id       VARCHAR(16) NOT NULL,   -- e.g. FIPS '06037' for LA county
    official_name   VARCHAR(120) NOT NULL,
    short_name      VARCHAR(80) NOT NULL,
    county_type     VARCHAR(30) NOT NULL DEFAULT 'county' CHECK (county_type IN ('county','parish','borough','municipality','census division','arrondissement','raion','district')),
    county_seat     VARCHAR(80),
    population      BIGINT      CHECK (population IS NULL OR population >= 0),
    area_sq_km      NUMERIC(14,2) CHECK (area_sq_km IS NULL OR area_sq_km >= 0),
    median_hh_usd   NUMERIC(12,2) CHECK (median_hh_usd IS NULL OR median_hh_usd >= 0),
    founded_year    SMALLINT    CHECK (founded_year IS NULL OR founded_year > 1500),
    CONSTRAINT pk_counties PRIMARY KEY (country_id, state_id, county_id),
    CONSTRAINT fk_counties_states FOREIGN KEY (country_id, state_id)
        REFERENCES federated_states (country_id, state_id) ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED
);
COMMENT ON TABLE  counties                      IS 'Second-level subdivisions. 3-col composite PK; FK 2-col (country_id,state_id) -> federated_states; TAIL COL = county_id. This forms a depth-3 chain in HotX: countries -> federated_states -> counties, with each intermediate row exposing a "Use as sub-header" button.';
COMMENT ON COLUMN counties.country_id          IS 'From chain root; inherited as prefix lock when row inside federated_states detail card.';
COMMENT ON COLUMN counties.state_id            IS 'Second-level FK prefix; locked when a state row is selected as sub-header.';
COMMENT ON COLUMN counties.county_id           IS 'TAIL FK COLUMN. Clickable drill + Browse anchor in CRUD.';

-- ---------------------------------------------------------------------------
-- ALTERNATE DETAIL sibling table.
-- Shares the SAME master (countries.country_id) as federated_states but is
-- an entirely separate business-meaning dimension (sales ops vs. geography).
-- HotX detects this via buildMasterDetailChains DFS and tags it isAlternate
-- with a purple "Alternate Detail #N / total: sales_regions" badge.
-- ---------------------------------------------------------------------------
CREATE TABLE sales_regions (
    country_id      CHAR(2)     NOT NULL,
    region_id       VARCHAR(12) NOT NULL,   -- e.g. 'WEST' 'US-NE' 'CA-EN'
    region_name     VARCHAR(100) NOT NULL,
    region_code     VARCHAR(20),            -- internal reporting code e.g. R-01
    headquarters    VARCHAR(100),
    regional_director VARCHAR(100),
    annual_revenue_usd NUMERIC(18,2) CHECK (annual_revenue_usd IS NULL OR annual_revenue_usd >= 0),
    territory_states_qty SMALLINT CHECK (territory_states_qty IS NULL OR territory_states_qty >= 0),
    established_date DATE,
    operating_costs_usd NUMERIC(18,2) CHECK (operating_costs_usd IS NULL OR operating_costs_usd >= 0),
    CONSTRAINT pk_sales_regions PRIMARY KEY (country_id, region_id),
    CONSTRAINT fk_sales_countries FOREIGN KEY (country_id)
        REFERENCES countries (country_id) ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED,
    CONSTRAINT uq_region_code_per_country UNIQUE (country_id, region_code)
);
COMMENT ON TABLE  sales_regions              IS 'Alternate (non-geographic) detail of countries. Same leading FK prefix country_id as federated_states. HotX shows this as a PURPLE alternate-detail card stacked directly below the federated_states card when a country row is selected as master header.';
COMMENT ON COLUMN sales_regions.country_id  IS 'Leading FK to countries, shared prefix lock on detail page.';
COMMENT ON COLUMN sales_regions.region_id   IS 'TAIL FK COLUMN. Drill link + Browse anchor.';

-- -----------------------------------------------------------------------------
-- 3. SEED DATA
-- -----------------------------------------------------------------------------

-- ---------- countries ----------
INSERT INTO countries (country_id, official_name, common_name, iso_numeric, capital_city, currency_code, population, area_sq_km, founded_date, tld) VALUES
  ('US', 'United States of America',       'United States',  '840', 'Washington, D.C.', 'USD', 334914895,  9833517.00, '1776-07-04', '.us'),
  ('CA', 'Canada',                          'Canada',         '124', 'Ottawa',          'CAD',  39566248,  9984670.00, '1867-07-01', '.ca');

-- ---------- federated_states ----------
-- US states
INSERT INTO federated_states (country_id, state_id, official_name, short_name, state_type, capital_city, governor, population, area_sq_km, admitted_date, state_abbrev) VALUES
  ('US', 'US-CA', 'State of California',         'California', 'state', 'Sacramento',   'Gavin Newsom',      38940231, 423970.00, '1850-09-09', 'CA'),
  ('US', 'US-TX', 'State of Texas',              'Texas',      'state', 'Austin',       'Greg Abbott',      30503301, 695663.00, '1845-12-29', 'TX'),
  ('US', 'US-NY', 'State of New York',           'New York',   'state', 'Albany',       'Kathy Hochul',     19677151, 141297.00, '1788-07-26', 'NY');

-- Canada provinces (using the same table via state_type)
INSERT INTO federated_states (country_id, state_id, official_name, short_name, state_type, capital_city, governor, population, area_sq_km, admitted_date, state_abbrev) VALUES
  ('CA', 'CA-ON', 'Province of Ontario',         'Ontario',    'province', 'Toronto',    'Doug Ford',        15265721, 1076395.00, '1867-07-01', 'ON'),
  ('CA', 'CA-QC', 'Province of Quebec',          'Quebec',     'province', 'Quebec City','François Legault', 8787554,  1542056.00, '1867-07-01', 'QC');

-- ---------- counties ----------
-- California counties (state_id = US-CA)
INSERT INTO counties (country_id, state_id, county_id, official_name, short_name, county_type, county_seat, population, area_sq_km, median_hh_usd, founded_year) VALUES
  ('US', 'US-CA', '06037', 'County of Los Angeles',   'Los Angeles',   'county', 'Los Angeles',   9818605, 12310.00, 78276.00, 1850),
  ('US', 'US-CA', '06001', 'County of Alameda',       'Alameda',       'county', 'Oakland',       1648556,  1910.00, 115089.00, 1853),
  ('US', 'US-CA', '06073', 'County of San Diego',     'San Diego',     'county', 'San Diego',     3276208, 10895.00, 95868.00, 1850);

-- Texas counties (state_id = US-TX)
INSERT INTO counties (country_id, state_id, county_id, official_name, short_name, county_type, county_seat, population, area_sq_km, median_hh_usd, founded_year) VALUES
  ('US', 'US-TX', '48201', 'Harris County',           'Harris',        'county', 'Houston',       4780913,  4604.00, 66891.00, 1836),
  ('US', 'US-TX', '48029', 'Bexar County',            'Bexar',         'county', 'San Antonio',   2059530,  3255.00, 62476.00, 1836),
  ('US', 'US-TX', '48113', 'Dallas County',           'Dallas',        'county', 'Dallas',        2613539,  2338.00, 69868.00, 1846);

-- New York counties (state_id = US-NY)
INSERT INTO counties (country_id, state_id, county_id, official_name, short_name, county_type, county_seat, population, area_sq_km, median_hh_usd, founded_year) VALUES
  ('US', 'US-NY', '36061', 'New York County',         'New York',      'borough', 'Manhattan',    1629000,    59.00, 127561.00, 1683),
  ('US', 'US-NY', '36047', 'Kings County',            'Kings',         'borough', 'Brooklyn',     2736074,   183.00,  90718.00, 1683),
  ('US', 'US-NY', '36081', 'Queens County',           'Queens',        'borough', 'Queens',       2405464,   281.00,  88206.00, 1683);

-- Ontario divisions (CA-ON)
INSERT INTO counties (country_id, state_id, county_id, official_name, short_name, county_type, county_seat, population, area_sq_km, median_hh_usd, founded_year) VALUES
  ('CA', 'CA-ON', 'CA-ON-TO', 'Toronto Division',      'Toronto',      'census division', 'Toronto', 2794356,  630.00,  99860.00, 1834),
  ('CA', 'CA-ON', 'CA-ON-OT', 'Ottawa Division',       'Ottawa',       'census division', 'Ottawa',   1017449, 2790.00,  92200.00, 1855);

-- Quebec MRCs (CA-QC)
INSERT INTO counties (country_id, state_id, county_id, official_name, short_name, county_type, county_seat, population, area_sq_km, median_hh_usd, founded_year) VALUES
  ('CA', 'CA-QC', 'CA-QC-MT', 'Communauté métropolitaine de Montréal', 'Montréal', 'municipality', 'Montréal', 4291982, 3838.00, 82434.00, 1642),
  ('CA', 'CA-QC', 'CA-QC-QC', 'Communauté urbaine de Québec',          'Québec',   'municipality', 'Québec',    839311,  3056.00, 78214.00, 1832);

-- ---------- sales_regions ----------
-- US divisions (alternate sibling of federated_states under the same US country master)
INSERT INTO sales_regions (country_id, region_id, region_name, region_code, headquarters, regional_director,
                           annual_revenue_usd, territory_states_qty, established_date, operating_costs_usd) VALUES
  ('US', 'US-WEST',   'U.S. West Region',            'R-US-01', 'San Francisco', 'Sarah Chen',           4850000000.00,  3, '1955-03-12', 1820000000.00),
  ('US', 'US-SOUTH',  'U.S. South Region',           'R-US-02', 'Atlanta',       'Marcus Williams',    3920000000.00, 16, '1960-11-01', 1410000000.00),
  ('US', 'US-MIDW',   'U.S. Midwest Region',         'R-US-03', 'Chicago',       'Linda Kowalski',     2870000000.00, 12, '1958-06-20', 1050000000.00),
  ('US', 'US-NE',     'U.S. Northeast Region',       'R-US-04', 'Boston',        'Raj Patel',          3540000000.00, 11, '1952-08-15', 1340000000.00);

-- Canada sales (alternate siblings under the CA country master)
INSERT INTO sales_regions (country_id, region_id, region_name, region_code, headquarters, regional_director,
                           annual_revenue_usd, territory_states_qty, established_date, operating_costs_usd) VALUES
  ('CA', 'CA-EN',     'Anglophone Canada Region',   'R-CA-01', 'Toronto', 'Emma Thompson',   980000000.00,  7, '1972-05-03', 370000000.00),
  ('CA', 'CA-FR',     'Francophone Canada Region',  'R-CA-02', 'Montréal','Luc St-Laurent',  720000000.00,  1, '1974-09-22', 290000000.00);

-- -----------------------------------------------------------------------------
-- 4. Quick row-count sanity prints (useful when running in psql interactive)
-- -----------------------------------------------------------------------------
DO $$
DECLARE
    r_countries  BIGINT;
    r_states     BIGINT;
    r_counties   BIGINT;
    r_regions    BIGINT;
BEGIN
    SELECT count(*) INTO r_countries  FROM countries;
    SELECT count(*) INTO r_states     FROM federated_states;
    SELECT count(*) INTO r_counties   FROM counties;
    SELECT count(*) INTO r_regions    FROM sales_regions;
    RAISE NOTICE 'Fixture loaded: % countries, % states/provinces, % counties/divisions, % sales regions',
        r_countries, r_states, r_counties, r_regions;
END $$;

create table geo.labor_union (
    labor_id character(2), labor_name varchar(120), country_id character(2), primary key (labor_id), FOREIGN KEY (country_id) REFERENCES geo.countries (country_id) ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED);

COMMIT;

-- =============================================================================
-- Expected HotX runtime output (manual verification checklist, post-import):
--
-- [NESTED CHAIN — depth 3 with color-coded md-depth-1..3 left borders]
--   1. Open 'countries' table.
--   2. Select row country_id='US' → becomes master header.
--   3. Underneath appear TWO cards (alternate siblings):
--      Card A [main, depth 1]: federated_states (3 rows CA / TX / NY)
--         Click "Use as sub-header" on CA row → pushes onto _subMasters[]
--         → Under CA's federated_states card, depth-2 card: counties (3 rows)
--           with prefix lock chips 🔒 country_id = US AND 🔒 state_id = US-CA
--      Card B [PURPLE alternate badge "Alternate Detail #1 / 2: sales_regions"]:
--         sales_regions (4 rows: WEST / SOUTH / MIDW / NE)
--         prefix lock chip 🔒 country_id = US
--
-- [FK TAIL-COL DRILL (Group C1)]
--   - federated_states.state_id       blue dotted underline → reads 1 foreign row
--   - counties.county_id              blue dotted underline → reads 1 foreign row
--   - sales_regions.region_id         blue dotted underline → reads 1 foreign row
--
-- [FK TAIL-COL BROWSE (Group C2)]
--   - Create new counties row: state_id input shows "Browse federated_states (fk_counties_states)"
--     mini-browser opens with 🔒 country_id already prefiltered from the CRUD grid;
--     select a row → state_id fills, NULL checkbox unchecks, synthetic input event fires.
--
-- [SEARCH (Group D)]
--   - counties depth-2 card: search toolbar shows 🔒 country_id + 🔒 state_id lock chips,
--     editor grid skips locked cols; LIKE search on short_name='%Ang%' finds Los Angeles,
--     San Antonio, Kings, Longueuil etc. Submit applies filter + prefix lock together.
--
-- [LIMITS (Group E)]
--   - limit=9999 → amber clamp banner, 9999→1000, warnings[0].code ROWS_LIMIT_CLAMPED
-- =============================================================================
