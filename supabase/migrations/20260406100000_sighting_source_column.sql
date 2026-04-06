-- Add source column to mvp_sightings to distinguish regular sightings from convex mirror
ALTER TABLE mvp_sightings ADD COLUMN IF NOT EXISTS source TEXT DEFAULT 'sniffer';
