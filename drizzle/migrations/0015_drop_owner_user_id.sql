-- 0015_drop_owner_user_id.sql
-- §3.6 sub-unit C. Closes the column-ownership swap by dropping
-- restaurants.owner_user_id + retiring everything that referenced it.
--
-- Phases:
--   1. Pre-flight: every restaurant has a restaurant_staff(owner) row.
--   2. Rewrite is_owner_of() to check restaurant_staff ∪ organization_members.
--   3. Rewrite claim_invitation() to seed orgs+staff instead of owner_user_id.
--   4. Rewrite inline owner_user_id policies via is_owner_of().
--   5. DROP COLUMN restaurants.owner_user_id (cascades index + FK).

BEGIN;

-- ─── Phase 1: pre-flight ────────────────────────────────────────────────
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM "restaurants" r
    WHERE NOT EXISTS (
      SELECT 1 FROM "restaurant_staff" rs
      WHERE rs."restaurant_id" = r."id"
        AND rs."role" = 'owner'
        AND rs."is_active" = true
    )
  ) THEN
    RAISE EXCEPTION 'Restaurant without restaurant_staff(owner) row — backfill from sub-unit A is incomplete; refusing to drop owner_user_id';
  END IF;
END $$;

-- ─── Phase 2: rewrite is_owner_of ───────────────────────────────────────
CREATE OR REPLACE FUNCTION public.is_owner_of(p_restaurant_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    EXISTS (
      SELECT 1 FROM public.restaurant_staff rs
      WHERE rs.restaurant_id = p_restaurant_id
        AND rs.user_id = auth.uid()
        AND rs.role = 'owner'
        AND rs.is_active = true
    )
    OR EXISTS (
      SELECT 1 FROM public.organization_members om
      JOIN public.restaurants r ON r.organization_id = om.organization_id
      WHERE r.id = p_restaurant_id
        AND om.user_id = auth.uid()
        AND om.role = 'owner'
        AND om.is_active = true
    );
$$;

-- ─── Phase 3: rewrite claim_invitation ──────────────────────────────────
-- The function's signature is preserved (single caller in
-- src/app/onboard/[token]/account/actions.ts:66). Behavior change: no
-- longer writes owner_user_id; instead seeds organizations +
-- organization_members(owner) + restaurant_staff(owner) +
-- profiles.default_organization_id.
CREATE OR REPLACE FUNCTION public.claim_invitation(
  p_raw_token text,
  p_user_id uuid,
  p_full_name text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_token_hash text;
  v_invitation public.invitations%rowtype;
  v_restaurant_id uuid;
  v_org_id uuid;
  v_partner_email text;
  v_partner_locale varchar(2);
  v_partner_name text;
BEGIN
  v_token_hash := encode(extensions.digest(p_raw_token, 'sha256'::text), 'hex');

  SELECT * INTO v_invitation
  FROM public.invitations
  WHERE token_hash = v_token_hash
  FOR UPDATE;

  IF v_invitation.id IS NULL THEN
    RAISE EXCEPTION 'Invalid invitation token' USING ERRCODE = 'TV101';
  END IF;
  IF v_invitation.status <> 'pending' THEN
    RAISE EXCEPTION 'Invitation is %', v_invitation.status USING ERRCODE = 'TV102';
  END IF;
  IF v_invitation.expires_at < now() THEN
    UPDATE public.invitations SET status = 'expired' WHERE id = v_invitation.id;
    RAISE EXCEPTION 'Invitation has expired' USING ERRCODE = 'TV103';
  END IF;

  UPDATE public.profiles
     SET role = 'restaurant_owner',
         full_name = coalesce(p_full_name, full_name)
   WHERE id = p_user_id;

  -- Read the partner's email + locale from their profile (the org needs them).
  SELECT email, SUBSTRING(locale FOR 2), full_name
    INTO v_partner_email, v_partner_locale, v_partner_name
    FROM public.profiles
   WHERE id = p_user_id;

  -- Seed the org now (or fetch if the partner already has a default_organization_id).
  -- A claim_invitation call always seeds a fresh org — the invitation carries
  -- a new restaurant identity, so the partner's existing default is preserved
  -- (default_organization_id is updated to the new org only when not set).
  INSERT INTO public.organizations (name, primary_contact_email, locale, status)
  VALUES (
    coalesce(v_invitation.proposed_name, v_partner_name, 'New Restaurant'),
    v_partner_email,
    coalesce(v_partner_locale, 'ro'),
    'active'
  )
  RETURNING id INTO v_org_id;

  INSERT INTO public.organization_members (organization_id, user_id, role, is_active)
  VALUES (v_org_id, p_user_id, 'owner', true);

  IF v_invitation.restaurant_id IS NULL THEN
    INSERT INTO public.restaurants (
      slug, name, cuisines, city_id, organization_id, status, email
    ) VALUES (
      'pending-' || substr(p_user_id::text, 1, 8),
      coalesce(v_invitation.proposed_name, 'New Restaurant'),
      ARRAY[]::text[],
      v_invitation.city_id,
      v_org_id,
      'draft',
      v_invitation.email
    )
    RETURNING id INTO v_restaurant_id;
  ELSE
    UPDATE public.restaurants
       SET organization_id = v_org_id
     WHERE id = v_invitation.restaurant_id;
    v_restaurant_id := v_invitation.restaurant_id;
  END IF;

  INSERT INTO public.restaurant_staff (restaurant_id, user_id, role, is_active)
  VALUES (v_restaurant_id, p_user_id, 'owner', true);

  -- Set the partner's default-org pointer if not already set.
  UPDATE public.profiles
     SET default_organization_id = v_org_id
   WHERE id = p_user_id
     AND default_organization_id IS NULL;

  UPDATE public.invitations
     SET status = 'claimed',
         claimed_at = now(),
         claimed_by_user_id = p_user_id,
         restaurant_id = v_restaurant_id
   WHERE id = v_invitation.id;

  INSERT INTO public.draft_restaurants (owner_user_id, invitation_id, current_step)
  VALUES (p_user_id, v_invitation.id, 'profile')
  ON CONFLICT (owner_user_id) DO UPDATE
     SET invitation_id = excluded.invitation_id,
         updated_at = now();

  RETURN v_restaurant_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.claim_invitation(text, uuid, text) TO authenticated;

-- ─── Phase 4: rewrite inline owner_user_id policies ─────────────────────

-- 4a. restaurants table itself (0001_rls_and_triggers.sql lines 76, 84) —
-- two policies use inline owner_user_id.
DROP POLICY IF EXISTS "restaurants_owner_read" ON public.restaurants;
CREATE POLICY "restaurants_owner_read" ON public.restaurants FOR SELECT
  USING (public.is_owner_of(id));

DROP POLICY IF EXISTS "restaurants_owner_update" ON public.restaurants;
CREATE POLICY "restaurants_owner_update" ON public.restaurants FOR UPDATE
  USING (public.is_owner_of(id))
  WITH CHECK (public.is_owner_of(id));

-- 4b. storage bucket policy (0002_storage_bucket.sql).
-- The bucket has a single FOR ALL policy gating both INSERT and DELETE
-- (and UPDATE/SELECT) on the upload path corresponding to a restaurant
-- the user owns. Rewrite the inline owner_user_id check via is_owner_of.
DROP POLICY IF EXISTS "restaurant_photos_owner_all" ON storage.objects;
CREATE POLICY "restaurant_photos_owner_all"
  ON storage.objects FOR ALL
  TO authenticated
  USING (
    bucket_id = 'restaurant-photos'
    AND EXISTS (
      SELECT 1 FROM public.restaurants r
      WHERE r.id::text = (storage.foldername(name))[1]
        AND public.is_owner_of(r.id)
    )
  )
  WITH CHECK (
    bucket_id = 'restaurant-photos'
    AND EXISTS (
      SELECT 1 FROM public.restaurants r
      WHERE r.id::text = (storage.foldername(name))[1]
        AND public.is_owner_of(r.id)
    )
  );

-- 4c. corporate_foundations (0008_corporate_foundations.sql).
-- 5 policies with 8 inline r."owner_user_id" = auth.uid() references.
-- Rewrite each by DROP+CREATE with public.is_owner_of(r."id").

-- event_requests_owner_read (0008 line 243). The owner clause is one of
-- three OR'd predicates (owner OR requester OR company-member). Preserve
-- the full body; only the owner subquery's inline check changes.
DROP POLICY IF EXISTS "event_requests_owner_read" ON public.event_requests;
CREATE POLICY "event_requests_owner_read" ON public.event_requests FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.restaurants r
      WHERE r."id" = "event_requests"."restaurant_id"
        AND public.is_owner_of(r."id")
    )
    OR "requested_by_user_id" = auth.uid()
    OR (
      "company_id" IS NOT NULL
      AND EXISTS (
        SELECT 1 FROM public.company_members cm
        WHERE cm."company_id" = "event_requests"."company_id"
          AND cm."user_id" = auth.uid()
      )
    )
  );

-- restaurant_event_settings_owner_write (0008 line 265).
DROP POLICY IF EXISTS "restaurant_event_settings_owner_write" ON public.restaurant_event_settings;
CREATE POLICY "restaurant_event_settings_owner_write"
  ON public.restaurant_event_settings FOR ALL
  USING (EXISTS (
    SELECT 1 FROM public.restaurants r
    WHERE r."id" = "restaurant_event_settings"."restaurant_id"
      AND public.is_owner_of(r."id")
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.restaurants r
    WHERE r."id" = "restaurant_event_settings"."restaurant_id"
      AND public.is_owner_of(r."id")
  ));

-- availability_exceptions_owner_write (0008 line 282).
DROP POLICY IF EXISTS "availability_exceptions_owner_write" ON public.availability_exceptions;
CREATE POLICY "availability_exceptions_owner_write"
  ON public.availability_exceptions FOR ALL
  USING (EXISTS (
    SELECT 1 FROM public.restaurants r
    WHERE r."id" = "availability_exceptions"."restaurant_id"
      AND public.is_owner_of(r."id")
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.restaurants r
    WHERE r."id" = "availability_exceptions"."restaurant_id"
      AND public.is_owner_of(r."id")
  ));

-- partner_notifications_owner_read (0008 line 296).
DROP POLICY IF EXISTS "partner_notifications_owner_read" ON public.partner_notifications;
CREATE POLICY "partner_notifications_owner_read"
  ON public.partner_notifications FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.restaurants r
    WHERE r."id" = "partner_notifications"."restaurant_id"
      AND public.is_owner_of(r."id")
  ));

-- partner_notifications_owner_update (0008 line 304).
DROP POLICY IF EXISTS "partner_notifications_owner_update" ON public.partner_notifications;
CREATE POLICY "partner_notifications_owner_update"
  ON public.partner_notifications FOR UPDATE
  USING (EXISTS (
    SELECT 1 FROM public.restaurants r
    WHERE r."id" = "partner_notifications"."restaurant_id"
      AND public.is_owner_of(r."id")
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.restaurants r
    WHERE r."id" = "partner_notifications"."restaurant_id"
      AND public.is_owner_of(r."id")
  ));

-- 4d. private_spaces + quote_line_items (0010_private_spaces_and_quote_lines.sql).
-- 2 policies with 4 inline references.

-- private_spaces_owner_write (0010 line 48).
DROP POLICY IF EXISTS "private_spaces_owner_write" ON public.restaurant_private_spaces;
CREATE POLICY "private_spaces_owner_write"
  ON public.restaurant_private_spaces FOR ALL
  USING (EXISTS (
    SELECT 1 FROM public.restaurants r
    WHERE r."id" = "restaurant_private_spaces"."restaurant_id"
      AND public.is_owner_of(r."id")
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.restaurants r
    WHERE r."id" = "restaurant_private_spaces"."restaurant_id"
      AND public.is_owner_of(r."id")
  ));

-- quote_lines_owner_write (0010 line 66).
DROP POLICY IF EXISTS "quote_lines_owner_write" ON public.event_request_quote_line_items;
CREATE POLICY "quote_lines_owner_write"
  ON public.event_request_quote_line_items FOR ALL
  USING (EXISTS (
    SELECT 1 FROM public.event_requests er
    JOIN public.restaurants r ON r."id" = er."restaurant_id"
    WHERE er."id" = "event_request_quote_line_items"."event_request_id"
      AND public.is_owner_of(r."id")
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.event_requests er
    JOIN public.restaurants r ON r."id" = er."restaurant_id"
    WHERE er."id" = "event_request_quote_line_items"."event_request_id"
      AND public.is_owner_of(r."id")
  ));

-- 4e. audit_logs (0011_audit_logs.sql line 47).
DROP POLICY IF EXISTS "audit_logs_restaurant_owner_read" ON public.audit_logs;
CREATE POLICY "audit_logs_restaurant_owner_read" ON public.audit_logs FOR SELECT
  USING (
    "restaurant_id" IS NOT NULL
    AND public.is_owner_of("restaurant_id")
  );

-- ─── Phase 5: drop the column ───────────────────────────────────────────
-- Index restaurants_owner_idx + FK restaurants_owner_user_id_profiles_id_fk
-- cascade automatically.
ALTER TABLE public.restaurants DROP COLUMN owner_user_id;

COMMIT;
