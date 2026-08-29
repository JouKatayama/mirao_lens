-- ML-016 Privacy / deletion
-- Provides an account self-deletion function for authenticated users.
-- Deleting from auth.users cascades to all user-owned tables via existing FK constraints.

CREATE OR REPLACE FUNCTION delete_own_account()
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  DELETE FROM auth.users WHERE id = auth.uid();
$$;

GRANT EXECUTE ON FUNCTION delete_own_account() TO authenticated;
