/*
  # Add Foreign Key Constraints (NOT VALID)

  1. Changes
    - Add foreign key constraint from `appointments.client_id` to `clients.id`
    - Add foreign key constraint from `appointments.staff_id` to `staff.id`
    - Add foreign key constraint from `appointments.location_id` to `locations.id`
    - Add foreign key constraint from `sales.client_id` to `clients.id`
    - Add foreign key constraint from `sales.location_id` to `locations.id`
    - Add foreign key constraint from `sale_items.sale_id` to `sales.id`
    - Add foreign key constraint from `classes.class_description_id` to `class_descriptions.id`
    - Add foreign key constraint from `classes.location_id` to `locations.id`
    - Add foreign key constraint from `classes.staff_id` to `staff.id`
    - Add foreign key constraint from `class_visits.class_id` to `classes.id`
    - Add foreign key constraint from `class_visits.client_id` to `clients.id`

  2. Notes
    - All foreign keys use NOT VALID to allow existing orphaned records
    - This allows joins in Supabase queries using the constraint names
    - Future inserts/updates will be validated
    - ON DELETE SET NULL to prevent cascade deletions (except sale_items which uses CASCADE)
*/

-- Appointments foreign keys
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'appointments_client_id_fkey'
  ) THEN
    ALTER TABLE appointments
    ADD CONSTRAINT appointments_client_id_fkey
    FOREIGN KEY (client_id)
    REFERENCES clients(id)
    ON DELETE SET NULL
    NOT VALID;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'appointments_staff_id_fkey'
  ) THEN
    ALTER TABLE appointments
    ADD CONSTRAINT appointments_staff_id_fkey
    FOREIGN KEY (staff_id)
    REFERENCES staff(id)
    ON DELETE SET NULL
    NOT VALID;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'appointments_location_id_fkey'
  ) THEN
    ALTER TABLE appointments
    ADD CONSTRAINT appointments_location_id_fkey
    FOREIGN KEY (location_id)
    REFERENCES locations(id)
    ON DELETE SET NULL
    NOT VALID;
  END IF;
END $$;

-- Sales foreign keys
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'sales_client_id_fkey'
  ) THEN
    ALTER TABLE sales
    ADD CONSTRAINT sales_client_id_fkey
    FOREIGN KEY (client_id)
    REFERENCES clients(id)
    ON DELETE SET NULL
    NOT VALID;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'sales_location_id_fkey'
  ) THEN
    ALTER TABLE sales
    ADD CONSTRAINT sales_location_id_fkey
    FOREIGN KEY (location_id)
    REFERENCES locations(id)
    ON DELETE SET NULL
    NOT VALID;
  END IF;
END $$;

-- Sale items foreign key
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'sale_items_sale_id_fkey'
  ) THEN
    ALTER TABLE sale_items
    ADD CONSTRAINT sale_items_sale_id_fkey
    FOREIGN KEY (sale_id)
    REFERENCES sales(id)
    ON DELETE CASCADE
    NOT VALID;
  END IF;
END $$;

-- Classes foreign keys
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'classes_class_description_id_fkey'
  ) THEN
    ALTER TABLE classes
    ADD CONSTRAINT classes_class_description_id_fkey
    FOREIGN KEY (class_description_id)
    REFERENCES class_descriptions(id)
    ON DELETE SET NULL
    NOT VALID;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'classes_location_id_fkey'
  ) THEN
    ALTER TABLE classes
    ADD CONSTRAINT classes_location_id_fkey
    FOREIGN KEY (location_id)
    REFERENCES locations(id)
    ON DELETE SET NULL
    NOT VALID;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'classes_staff_id_fkey'
  ) THEN
    ALTER TABLE classes
    ADD CONSTRAINT classes_staff_id_fkey
    FOREIGN KEY (staff_id)
    REFERENCES staff(id)
    ON DELETE SET NULL
    NOT VALID;
  END IF;
END $$;

-- Class visits foreign keys
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'class_visits_class_id_fkey'
  ) THEN
    ALTER TABLE class_visits
    ADD CONSTRAINT class_visits_class_id_fkey
    FOREIGN KEY (class_id)
    REFERENCES classes(id)
    ON DELETE SET NULL
    NOT VALID;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'class_visits_client_id_fkey'
  ) THEN
    ALTER TABLE class_visits
    ADD CONSTRAINT class_visits_client_id_fkey
    FOREIGN KEY (client_id)
    REFERENCES clients(id)
    ON DELETE SET NULL
    NOT VALID;
  END IF;
END $$;
