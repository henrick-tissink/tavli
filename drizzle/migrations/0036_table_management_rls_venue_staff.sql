-- 0036_table_management_rls_venue_staff.sql
-- Adds venue-staff + org-member read policies for §08 tables.
-- Wave 4 sub-unit F shipped admin-only policies; this opens to venue staff
-- for the floor-plan editor + operational dashboards.
--
-- The org-member branch joins organization_members → restaurants via
-- restaurants.organization_id (added in 0013/0014). In environments that
-- have that column the full two-branch policy applies; where the column is
-- absent (dev DBs on older snapshots) we fall back to staff-only access.
-- Production (Supabase) always has the column — this guard is dev-only.

DO $$
DECLARE
  has_org_id BOOLEAN;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name   = 'restaurants'
      AND column_name  = 'organization_id'
  ) INTO has_org_id;

  -- restaurant_tables
  IF has_org_id THEN
    EXECUTE $p$
      CREATE POLICY "restaurant_tables_venue_read" ON "restaurant_tables" FOR SELECT
        USING (
          EXISTS (
            SELECT 1 FROM restaurant_staff rs
            WHERE rs.restaurant_id = restaurant_tables.restaurant_id
              AND rs.user_id = auth.uid()
              AND rs.is_active = true
          ) OR EXISTS (
            SELECT 1 FROM organization_members om
            JOIN restaurants r ON r.organization_id = om.organization_id
            WHERE r.id = restaurant_tables.restaurant_id
              AND om.user_id = auth.uid()
              AND om.is_active = true
          )
        )
    $p$;
  ELSE
    EXECUTE $p$
      CREATE POLICY "restaurant_tables_venue_read" ON "restaurant_tables" FOR SELECT
        USING (
          EXISTS (
            SELECT 1 FROM restaurant_staff rs
            WHERE rs.restaurant_id = restaurant_tables.restaurant_id
              AND rs.user_id = auth.uid()
              AND rs.is_active = true
          )
        )
    $p$;
  END IF;

  -- restaurant_table_sections
  IF has_org_id THEN
    EXECUTE $p$
      CREATE POLICY "restaurant_table_sections_venue_read" ON "restaurant_table_sections" FOR SELECT
        USING (
          EXISTS (
            SELECT 1 FROM restaurant_staff rs
            WHERE rs.restaurant_id = restaurant_table_sections.restaurant_id
              AND rs.user_id = auth.uid()
              AND rs.is_active = true
          ) OR EXISTS (
            SELECT 1 FROM organization_members om
            JOIN restaurants r ON r.organization_id = om.organization_id
            WHERE r.id = restaurant_table_sections.restaurant_id
              AND om.user_id = auth.uid()
              AND om.is_active = true
          )
        )
    $p$;
  ELSE
    EXECUTE $p$
      CREATE POLICY "restaurant_table_sections_venue_read" ON "restaurant_table_sections" FOR SELECT
        USING (
          EXISTS (
            SELECT 1 FROM restaurant_staff rs
            WHERE rs.restaurant_id = restaurant_table_sections.restaurant_id
              AND rs.user_id = auth.uid()
              AND rs.is_active = true
          )
        )
    $p$;
  END IF;

  -- table_status_log
  IF has_org_id THEN
    EXECUTE $p$
      CREATE POLICY "table_status_log_venue_read" ON "table_status_log" FOR SELECT
        USING (
          EXISTS (
            SELECT 1 FROM restaurant_staff rs
            WHERE rs.restaurant_id = table_status_log.restaurant_id
              AND rs.user_id = auth.uid()
              AND rs.is_active = true
          ) OR EXISTS (
            SELECT 1 FROM organization_members om
            JOIN restaurants r ON r.organization_id = om.organization_id
            WHERE r.id = table_status_log.restaurant_id
              AND om.user_id = auth.uid()
              AND om.is_active = true
          )
        )
    $p$;
  ELSE
    EXECUTE $p$
      CREATE POLICY "table_status_log_venue_read" ON "table_status_log" FOR SELECT
        USING (
          EXISTS (
            SELECT 1 FROM restaurant_staff rs
            WHERE rs.restaurant_id = table_status_log.restaurant_id
              AND rs.user_id = auth.uid()
              AND rs.is_active = true
          )
        )
    $p$;
  END IF;

  -- table_combinations
  IF has_org_id THEN
    EXECUTE $p$
      CREATE POLICY "table_combinations_venue_read" ON "table_combinations" FOR SELECT
        USING (
          EXISTS (
            SELECT 1 FROM restaurant_staff rs
            WHERE rs.restaurant_id = table_combinations.restaurant_id
              AND rs.user_id = auth.uid()
              AND rs.is_active = true
          ) OR EXISTS (
            SELECT 1 FROM organization_members om
            JOIN restaurants r ON r.organization_id = om.organization_id
            WHERE r.id = table_combinations.restaurant_id
              AND om.user_id = auth.uid()
              AND om.is_active = true
          )
        )
    $p$;
  ELSE
    EXECUTE $p$
      CREATE POLICY "table_combinations_venue_read" ON "table_combinations" FOR SELECT
        USING (
          EXISTS (
            SELECT 1 FROM restaurant_staff rs
            WHERE rs.restaurant_id = table_combinations.restaurant_id
              AND rs.user_id = auth.uid()
              AND rs.is_active = true
          )
        )
    $p$;
  END IF;

  -- walkin_queue
  IF has_org_id THEN
    EXECUTE $p$
      CREATE POLICY "walkin_queue_venue_read" ON "walkin_queue" FOR SELECT
        USING (
          EXISTS (
            SELECT 1 FROM restaurant_staff rs
            WHERE rs.restaurant_id = walkin_queue.restaurant_id
              AND rs.user_id = auth.uid()
              AND rs.is_active = true
          ) OR EXISTS (
            SELECT 1 FROM organization_members om
            JOIN restaurants r ON r.organization_id = om.organization_id
            WHERE r.id = walkin_queue.restaurant_id
              AND om.user_id = auth.uid()
              AND om.is_active = true
          )
        )
    $p$;
  ELSE
    EXECUTE $p$
      CREATE POLICY "walkin_queue_venue_read" ON "walkin_queue" FOR SELECT
        USING (
          EXISTS (
            SELECT 1 FROM restaurant_staff rs
            WHERE rs.restaurant_id = walkin_queue.restaurant_id
              AND rs.user_id = auth.uid()
              AND rs.is_active = true
          )
        )
    $p$;
  END IF;
END;
$$;
