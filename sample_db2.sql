-- =============================================================================
-- PostgreSQL Sample Database: Automotive Operations
-- Includes: DDL (Tables, Constraints, Foreign Keys) + Data Cases
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- 1. DROP EXISTING TABLES (Enables clean re-runs)
-- -----------------------------------------------------------------------------
DROP TABLE IF EXISTS car_instance_part CASCADE;
DROP TABLE IF EXISTS car_instance CASCADE;
DROP TABLE IF EXISTS car_model_part CASCADE;
DROP TABLE IF EXISTS car_part CASCADE;
DROP TABLE IF EXISTS car_model CASCADE;
DROP TABLE IF EXISTS car_factory CASCADE;

-- -----------------------------------------------------------------------------
-- 2. DDL - SCHEMA DEFINITIONS
-- -----------------------------------------------------------------------------

-- Factories where vehicles are manufactured
CREATE TABLE car_factory (
    factory_id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    country VARCHAR(50) NOT NULL,
    city VARCHAR(50) NOT NULL,
    established_year INT CHECK (established_year >= 1800)
);

-- Car blueprints/designs (e.g., Mustang, Model 3, Civic)
CREATE TABLE car_model (
    model_id SERIAL PRIMARY KEY,
    make VARCHAR(50) NOT NULL,
    model_name VARCHAR(50) NOT NULL,
    body_style VARCHAR(30) NOT NULL,
    engine_type VARCHAR(30) NOT NULL,
    base_msrp NUMERIC(10, 2) NOT NULL CHECK (base_msrp > 0),
    CONSTRAINT uq_make_model UNIQUE (make, model_name)
);

-- Individual physical components (e.g., V6 Engine, 18-inch Alloy Wheel)
CREATE TABLE car_part (
    part_id SERIAL PRIMARY KEY,
    part_number VARCHAR(50) NOT NULL UNIQUE,
    name VARCHAR(100) NOT NULL,
    category VARCHAR(50) NOT NULL,
    cost NUMERIC(10, 2) NOT NULL CHECK (cost >= 0)
);

-- Bill of Materials (BOM): Links parts standardly required for a specific car model
CREATE TABLE car_model_part (
    model_id INT NOT NULL,
    part_id INT NOT NULL,
    quantity_required INT NOT NULL DEFAULT 1 CHECK (quantity_required > 0),
    CONSTRAINT pk_car_model_part PRIMARY KEY (model_id, part_id),
    CONSTRAINT fk_cmp_car_model FOREIGN KEY (model_id) REFERENCES car_model(model_id) ON DELETE CASCADE,
    CONSTRAINT fk_cmp_car_part FOREIGN KEY (part_id) REFERENCES car_part(part_id) ON DELETE CASCADE
);

-- Actual physical vehicles built (represented by VIN)
CREATE TABLE car_instance (
    vin CHAR(17) PRIMARY KEY,
    model_id INT NOT NULL,
    factory_id INT NOT NULL,
    manufacture_date DATE NOT NULL,
    color VARCHAR(30) NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'In Stock' 
        CHECK (status IN ('In Production', 'In Stock', 'Sold', 'In Maintenance')),
    CONSTRAINT fk_ci_car_model FOREIGN KEY (model_id) REFERENCES car_model(model_id),
    CONSTRAINT fk_ci_car_factory FOREIGN KEY (factory_id) REFERENCES car_factory(factory_id)
);

-- Installed parts on specific physical cars (allows tracking actual parts/serial numbers used)
CREATE TABLE car_instance_part (
    vin CHAR(17) NOT NULL,
    part_id INT NOT NULL,
    installed_date DATE NOT NULL,
    serial_number VARCHAR(100),
    CONSTRAINT pk_car_instance_part PRIMARY KEY (vin, part_id),
    CONSTRAINT fk_cip_car_instance FOREIGN KEY (vin) REFERENCES car_instance(vin) ON DELETE CASCADE,
    CONSTRAINT fk_cip_car_part FOREIGN KEY (part_id) REFERENCES car_part(part_id) ON DELETE CASCADE
);

-- -----------------------------------------------------------------------------
-- 3. DATA CASES (INSERT STATEMENTS)
-- -----------------------------------------------------------------------------

-- Car Factories
INSERT INTO car_factory (factory_id, name, country, city, established_year) VALUES
(1, 'Gigafactory Texas', 'USA', 'Austin', 2021),
(2, 'Wolfsburg Plant', 'Germany', 'Wolfsburg', 1938),
(3, 'Toyota City Assembly', 'Japan', 'Toyota', 1959);

-- Car Models
INSERT INTO car_model (model_id, make, model_name, body_style, engine_type, base_msrp) VALUES
(1, 'AeroMotors', 'Apex GT', 'Coupe', 'Gasoline V8', 65000.00),
(2, 'VoltDrive', 'Pulse', 'Sedan', 'Electric Dual-Motor', 48000.00),
(3, 'TerraCorp', 'Highlander Trail', 'SUV', 'Hybrid V6', 42000.00);

-- Car Parts
INSERT INTO car_part (part_id, part_number, name, category, cost) VALUES
(101, 'ENG-V8-50L', '5.0L V8 Engine Block', 'Powertrain', 8500.00),
(102, 'BAT-EV-85KW', '85kWh Lithium-Ion Battery Pack', 'Powertrain', 9200.00),
(103, 'ENG-HYB-25L', '2.5L Hybrid Engine Assembly', 'Powertrain', 5400.00),
(104, 'WHL-ALU-19IN', '19-inch Sport Alloy Wheel', 'Chassis', 350.00),
(105, 'BRA-CER-01', 'Carbon Ceramic Brake Kit', 'Braking', 1200.00),
(106, 'ECU-MOD-400', 'Central Control ECU Module', 'Electronics', 650.00);

-- Car Model Parts (Design Specifications / Standard BOM)
INSERT INTO car_model_part (model_id, part_id, quantity_required) VALUES
(1, 101, 1), -- Apex GT requires V8 Engine
(1, 104, 4), -- Apex GT requires 4 Sport Alloy Wheels
(1, 105, 1), -- Apex GT requires Ceramic Brakes
(1, 106, 1), -- Apex GT requires ECU
(2, 102, 1), -- VoltDrive Pulse requires 85kWh Battery
(2, 104, 4), -- VoltDrive Pulse requires 4 Sport Alloy Wheels
(2, 106, 1), -- VoltDrive Pulse requires ECU
(3, 103, 1), -- Highlander Trail requires Hybrid Engine
(3, 106, 1); -- Highlander Trail requires ECU

-- Car Instances (Physical Vehicles)
INSERT INTO car_instance (vin, model_id, factory_id, manufacture_date, color, status) VALUES
('1FA6P8CF0H5100001', 1, 1, '2025-01-15', 'Velocity Red', 'Sold'),
('1FA6P8CF0H5100002', 1, 1, '2025-02-10', 'Shadow Black', 'In Stock'),
('5YJ3E1EA7JF100001', 2, 1, '2025-03-01', 'Pearl White', 'In Stock'),
('JTMBD3FV1KD100001', 3, 3, '2024-11-20', 'Midnight Blue', 'Sold');

-- Installed Parts on Specific Physical Vehicles
INSERT INTO car_instance_part (vin, part_id, installed_date, serial_number) VALUES
('1FA6P8CF0H5100001', 101, '2025-01-12', 'ENG-V8-2025-0089'),
('1FA6P8CF0H5100001', 105, '2025-01-13', 'BRK-CC-2025-0142'),
('5YJ3E1EA7JF100001', 102, '2025-02-28', 'BAT-85-2025-0991'),
('JTMBD3FV1KD100001', 103, '2024-11-18', 'HYB-25-2024-5510');

-- -----------------------------------------------------------------------------
-- 4. SAMPLE QUERY (Verify schema setup)
-- -----------------------------------------------------------------------------
SELECT 
    ci.vin,
    cm.make,
    cm.model_name,
    cf.name AS manufactured_at,
    ci.color,
    ci.status,
    cp.name AS installed_engine
FROM car_instance ci
JOIN car_model cm ON ci.model_id = cm.model_id
JOIN car_factory cf ON ci.factory_id = cf.factory_id
LEFT JOIN car_instance_part cip ON ci.vin = cip.vin
LEFT JOIN car_part cp ON cip.part_id = cp.part_id AND cp.category = 'Powertrain';

COMMIT;