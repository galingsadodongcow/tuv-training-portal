-- ============================================================================
-- Ledger reconcile — record applied migrations in the Supabase migration ledger
-- ----------------------------------------------------------------------------
-- The live DB is updated by applying supabase/bundles/2026_program_all_migrations.sql
-- with `psql -f` (see apply-supabase.yml). `psql -f` never writes
-- supabase_migrations.schema_migrations, so the ledger has always drifted far
-- behind the live schema — most recently, 20260812240000..20260814010000 are
-- applied in production but absent from the ledger. The migration-parity gate
-- (#138) keeps the *bundle* honest; this keeps the *ledger* honest, so
-- `select version from supabase_migrations.schema_migrations` reflects what has
-- actually been applied.
--
-- Idempotent: every version is inserted with `on conflict (version) do nothing`,
-- so re-applying the bundle (or this migration) is a no-op. Records every
-- migration filename present in supabase/migrations/ at authoring time, including
-- this one. New migrations added later should extend this list (or ship their own
-- one-line reconcile insert) until the apply path writes the ledger directly.
-- ============================================================================

insert into supabase_migrations.schema_migrations (version, name) values
  ('20260805000000', 'security_hardening'),
  ('20260808030000', 'escalation_rules'),
  ('20260808040000', 'concurrency_soft_delete'),
  ('20260808050000', 'sap_reference_only'),
  ('20260808060000', 'enforce_pax_policy'),
  ('20260808070000', 'business_owner_client_update'),
  ('20260808080000', 'add_session_review_approval'),
  ('20260808090000', 'course_fee_unique'),
  ('20260808100000', 'event_notifications'),
  ('20260808110000', 'attendance_certificates'),
  ('20260808120000', 'organizations'),
  ('20260808130000', 'global_search'),
  ('20260808140000', 'order_notes'),
  ('20260808150000', 'course_pax_attributes'),
  ('20260808160000', 'accounts_receivable'),
  ('20260808170000', 'assessment_certification'),
  ('20260808180000', 'document_attachments'),
  ('20260808190000', 'communications'),
  ('20260808200000', 'quotations'),
  ('20260808210000', 'crm_depth'),
  ('20260808220000', 'trainer_management'),
  ('20260808230000', 'session_profitability'),
  ('20260808240000', 'waitlist_sla'),
  ('20260808250000', 'analytics'),
  ('20260808260000', 'access_scoping'),
  ('20260808270000', 'feedback_quality'),
  ('20260808280000', 'pricing_country_audit'),
  ('20260808290000', 'rls_hardening'),
  ('20260808300000', 'rls_ownership'),
  ('20260808310000', 'enable_rls_all'),
  ('20260809030000', 'pax_option_b_per_session'),
  ('20260811000000', 'lock_search_rpcs'),
  ('20260811010000', 'security_invoker_views'),
  ('20260811020000', 'search_path_and_roster_grants'),
  ('20260811030000', 'orders_sales_field_guard'),
  ('20260811040000', 'ops_reassign_and_transfer_guard'),
  ('20260812000000', 'phase1_workflow_integrity'),
  ('20260812010000', 'lock_trigger_fn_execute'),
  ('20260812100000', 'phaseb_roles_enum'),
  ('20260812110000', 'phaseb_role_rls'),
  ('20260812120000', 'phaseb_customer360'),
  ('20260812130000', 'phaseb_payments_money'),
  ('20260812140000', 'phaseb_audit_r02'),
  ('20260812150000', 'phaseb_handoff'),
  ('20260812160000', 'phaseb_revoke_anon_execute'),
  ('20260812170000', 'ros01_participant_status'),
  ('20260812180000', 'srch01_global_search'),
  ('20260812190000', 'sv01_saved_views'),
  ('20260812200000', 'sal01_create_order'),
  ('20260812210000', 'rls_customer_authority'),
  ('20260812220000', 's6_category_hierarchy'),
  ('20260812230000', 's6_retire_course_category'),
  ('20260812240000', 'fix_quote_sales_fk_and_sla_grant'),
  ('20260812250000', 'handoff_notifications'),
  ('20260812260000', 'lock_payment_status_to_ledger'),
  ('20260812270000', 'seed_saved_view_defaults'),
  ('20260812280000', 'con01_contact_status'),
  ('20260812290000', 'srch01_session_ordering'),
  ('20260812300000', 'idx01_hot_fk_indexes'),
  ('20260812310000', 'qte01_quote_line_course_fk'),
  ('20260814010000', 'portal_performance_security_hardening'),
  ('20260814020000', 'ledger_reconcile')
on conflict (version) do nothing;
