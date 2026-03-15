/*
  # Add Foreign Key for Pricing Options to Service Categories

  1. Changes
    - Add foreign key constraint from pricing_options.program_id to service_categories.id
    - This properly links pricing options to their service category (program)
    
  2. Notes
    - Pricing options are linked to Programs (service_categories), not to individual session_types
    - Multiple session_types can use the same pricing options through their shared program_id
    - Example: "1 sessija 30 min - 25€" is a pricing option for Program "Aquabike" (id=2)
    - All session types under "Aquabike" can use this pricing option
*/

-- Add foreign key constraint
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE constraint_name = 'pricing_options_program_id_fkey'
  ) THEN
    ALTER TABLE pricing_options 
    ADD CONSTRAINT pricing_options_program_id_fkey 
    FOREIGN KEY (program_id) 
    REFERENCES service_categories(id) 
    ON DELETE CASCADE;
  END IF;
END $$;

-- Create index for better query performance
CREATE INDEX IF NOT EXISTS idx_pricing_options_program_id ON pricing_options(program_id);
