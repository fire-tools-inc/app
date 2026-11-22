-- Removes backend synchronization metadata. Data loss: list positions (rows
-- fall back to creation order), asset class targets, the FIRE variant
-- calculator inputs (fire type, lean/fat multipliers, barista income, coast
-- age), the UI language, domain revisions/initialization and the database
-- instance id. Clients that synchronized with this database must
-- re-initialize after the rollback. Export a backup before rolling back.
DROP TRIGGER IF EXISTS sync_user_settings_insert;
DROP TRIGGER IF EXISTS sync_user_settings_update;
DROP TRIGGER IF EXISTS sync_user_settings_delete;
DROP TRIGGER IF EXISTS sync_calculator_inputs_insert;
DROP TRIGGER IF EXISTS sync_calculator_inputs_update;
DROP TRIGGER IF EXISTS sync_calculator_inputs_delete;
DROP TRIGGER IF EXISTS sync_assets_insert;
DROP TRIGGER IF EXISTS sync_assets_update;
DROP TRIGGER IF EXISTS sync_assets_delete;
DROP TRIGGER IF EXISTS sync_asset_class_targets_insert;
DROP TRIGGER IF EXISTS sync_asset_class_targets_update;
DROP TRIGGER IF EXISTS sync_asset_class_targets_delete;
DROP TRIGGER IF EXISTS sync_expense_tracker_config_insert;
DROP TRIGGER IF EXISTS sync_expense_tracker_config_update;
DROP TRIGGER IF EXISTS sync_expense_tracker_config_delete;
DROP TRIGGER IF EXISTS sync_expense_planning_insert;
DROP TRIGGER IF EXISTS sync_expense_planning_update;
DROP TRIGGER IF EXISTS sync_expense_planning_delete;
DROP TRIGGER IF EXISTS sync_expense_years_insert;
DROP TRIGGER IF EXISTS sync_expense_years_update;
DROP TRIGGER IF EXISTS sync_expense_years_delete;
DROP TRIGGER IF EXISTS sync_expense_months_insert;
DROP TRIGGER IF EXISTS sync_expense_months_update;
DROP TRIGGER IF EXISTS sync_expense_months_delete;
DROP TRIGGER IF EXISTS sync_expense_entries_insert;
DROP TRIGGER IF EXISTS sync_expense_entries_update;
DROP TRIGGER IF EXISTS sync_expense_entries_delete;
DROP TRIGGER IF EXISTS sync_income_entries_insert;
DROP TRIGGER IF EXISTS sync_income_entries_update;
DROP TRIGGER IF EXISTS sync_income_entries_delete;
DROP TRIGGER IF EXISTS sync_category_budgets_insert;
DROP TRIGGER IF EXISTS sync_category_budgets_update;
DROP TRIGGER IF EXISTS sync_category_budgets_delete;
DROP TRIGGER IF EXISTS sync_custom_categories_insert;
DROP TRIGGER IF EXISTS sync_custom_categories_update;
DROP TRIGGER IF EXISTS sync_custom_categories_delete;
DROP TRIGGER IF EXISTS sync_category_overrides_insert;
DROP TRIGGER IF EXISTS sync_category_overrides_update;
DROP TRIGGER IF EXISTS sync_category_overrides_delete;
DROP TRIGGER IF EXISTS sync_net_worth_config_insert;
DROP TRIGGER IF EXISTS sync_net_worth_config_update;
DROP TRIGGER IF EXISTS sync_net_worth_config_delete;
DROP TRIGGER IF EXISTS sync_net_worth_years_insert;
DROP TRIGGER IF EXISTS sync_net_worth_years_update;
DROP TRIGGER IF EXISTS sync_net_worth_years_delete;
DROP TRIGGER IF EXISTS sync_net_worth_months_insert;
DROP TRIGGER IF EXISTS sync_net_worth_months_update;
DROP TRIGGER IF EXISTS sync_net_worth_months_delete;
DROP TRIGGER IF EXISTS sync_asset_holdings_insert;
DROP TRIGGER IF EXISTS sync_asset_holdings_update;
DROP TRIGGER IF EXISTS sync_asset_holdings_delete;
DROP TRIGGER IF EXISTS sync_cash_entries_insert;
DROP TRIGGER IF EXISTS sync_cash_entries_update;
DROP TRIGGER IF EXISTS sync_cash_entries_delete;
DROP TRIGGER IF EXISTS sync_pension_entries_insert;
DROP TRIGGER IF EXISTS sync_pension_entries_update;
DROP TRIGGER IF EXISTS sync_pension_entries_delete;
DROP TRIGGER IF EXISTS sync_debt_entries_insert;
DROP TRIGGER IF EXISTS sync_debt_entries_update;
DROP TRIGGER IF EXISTS sync_debt_entries_delete;
DROP TRIGGER IF EXISTS sync_tax_entries_insert;
DROP TRIGGER IF EXISTS sync_tax_entries_update;
DROP TRIGGER IF EXISTS sync_tax_entries_delete;
DROP TRIGGER IF EXISTS sync_financial_operations_insert;
DROP TRIGGER IF EXISTS sync_financial_operations_update;
DROP TRIGGER IF EXISTS sync_financial_operations_delete;

DROP TABLE asset_class_targets;

ALTER TABLE user_settings DROP COLUMN language;

ALTER TABLE calculator_inputs DROP COLUMN coast_target_age;
ALTER TABLE calculator_inputs DROP COLUMN barista_annual_income;
ALTER TABLE calculator_inputs DROP COLUMN fat_expense_multiplier;
ALTER TABLE calculator_inputs DROP COLUMN lean_expense_multiplier;
ALTER TABLE calculator_inputs DROP COLUMN fire_type;

ALTER TABLE financial_operations DROP COLUMN position;
ALTER TABLE tax_entries DROP COLUMN position;
ALTER TABLE debt_entries DROP COLUMN position;
ALTER TABLE pension_entries DROP COLUMN position;
ALTER TABLE cash_entries DROP COLUMN position;
ALTER TABLE asset_holdings DROP COLUMN position;
ALTER TABLE category_overrides DROP COLUMN position;
ALTER TABLE custom_categories DROP COLUMN position;
ALTER TABLE category_budgets DROP COLUMN position;
ALTER TABLE income_entries DROP COLUMN position;
ALTER TABLE expense_entries DROP COLUMN position;
ALTER TABLE assets DROP COLUMN position;

DROP TABLE sync_domains;
DROP TABLE sync_meta;
