CREATE TABLE telemetry_config_versions (
  server_id INT PRIMARY KEY REFERENCES servers(id),
  version INT NOT NULL DEFAULT 1,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO telemetry_config_versions (server_id, version)
SELECT id, 1 FROM servers
ON CONFLICT DO NOTHING;

CREATE OR REPLACE FUNCTION bump_config_version()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE telemetry_config_versions
  SET version = version + 1, updated_at = NOW()
  WHERE server_id = COALESCE(NEW.server_id, OLD.server_id);
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_bump_config_version
AFTER INSERT OR UPDATE OR DELETE ON mvps
FOR EACH ROW EXECUTE FUNCTION bump_config_version();
