-- Run once in the Supabase SQL editor.
-- Adds a stable item_id TEXT column to every data table and switches saves
-- to upsert, eliminating the client-side ID collision where two users could
-- receive the same integer ID and silently overwrite each other's data.

-- Step 1: add item_id column (idempotent)
ALTER TABLE inventory   ADD COLUMN IF NOT EXISTS item_id TEXT;
ALTER TABLE reactions   ADD COLUMN IF NOT EXISTS item_id TEXT;
ALTER TABLE matrices    ADD COLUMN IF NOT EXISTS item_id TEXT;
ALTER TABLE screenings  ADD COLUMN IF NOT EXISTS item_id TEXT;
ALTER TABLE plates      ADD COLUMN IF NOT EXISTS item_id TEXT;

-- Step 2: backfill from existing JSONB (handles legacy integer IDs stored as strings)
UPDATE inventory  SET item_id = item_data->>'id' WHERE item_id IS NULL;
UPDATE reactions  SET item_id = data->>'id'      WHERE item_id IS NULL;
UPDATE matrices   SET item_id = data->>'id'      WHERE item_id IS NULL;
UPDATE screenings SET item_id = data->>'id'      WHERE item_id IS NULL;
UPDATE plates     SET item_id = data->>'id'      WHERE item_id IS NULL;

-- Step 3: remove any duplicates that the old bug may have created.
-- Keep the row with the highest postgres-assigned id (most recent insert).
DELETE FROM inventory  WHERE id IN (
    SELECT id FROM (SELECT id, ROW_NUMBER() OVER (PARTITION BY item_id ORDER BY id DESC) AS rn FROM inventory)  t WHERE rn > 1
);
DELETE FROM reactions  WHERE id IN (
    SELECT id FROM (SELECT id, ROW_NUMBER() OVER (PARTITION BY item_id ORDER BY id DESC) AS rn FROM reactions)  t WHERE rn > 1
);
DELETE FROM matrices   WHERE id IN (
    SELECT id FROM (SELECT id, ROW_NUMBER() OVER (PARTITION BY item_id ORDER BY id DESC) AS rn FROM matrices)   t WHERE rn > 1
);
DELETE FROM screenings WHERE id IN (
    SELECT id FROM (SELECT id, ROW_NUMBER() OVER (PARTITION BY item_id ORDER BY id DESC) AS rn FROM screenings) t WHERE rn > 1
);
DELETE FROM plates     WHERE id IN (
    SELECT id FROM (SELECT id, ROW_NUMBER() OVER (PARTITION BY item_id ORDER BY id DESC) AS rn FROM plates)     t WHERE rn > 1
);

-- Step 4: enforce uniqueness going forward
ALTER TABLE inventory   ADD CONSTRAINT inventory_item_id_unique   UNIQUE (item_id);
ALTER TABLE reactions   ADD CONSTRAINT reactions_item_id_unique   UNIQUE (item_id);
ALTER TABLE matrices    ADD CONSTRAINT matrices_item_id_unique    UNIQUE (item_id);
ALTER TABLE screenings  ADD CONSTRAINT screenings_item_id_unique  UNIQUE (item_id);
ALTER TABLE plates      ADD CONSTRAINT plates_item_id_unique      UNIQUE (item_id);
