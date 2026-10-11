ALTER TABLE user_settings ADD COLUMN ai_features_enabled INTEGER NOT NULL DEFAULT 1
    CHECK (ai_features_enabled IN (0, 1));
