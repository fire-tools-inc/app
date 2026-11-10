-- Removes the master permission only; model configuration and financial data remain.
ALTER TABLE user_settings DROP COLUMN ai_features_enabled;
