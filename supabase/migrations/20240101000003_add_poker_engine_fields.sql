-- Add columns for extended poker state and optimistic locking
ALTER TABLE active_hands 
ADD COLUMN pots JSONB DEFAULT '[]'::jsonb,
ADD COLUMN last_aggressor_id UUID,
ADD COLUMN last_raise_was_complete BOOLEAN DEFAULT TRUE,
ADD COLUMN bb_has_acted BOOLEAN DEFAULT FALSE,
ADD COLUMN version INTEGER DEFAULT 1;

-- Add comment
COMMENT ON COLUMN active_hands.pots IS 'Array of Pot objects for side pot support';
COMMENT ON COLUMN active_hands.version IS 'Optimistic locking version counter';
