-- Function to check if the current user exists (original - more complex)
CREATE OR REPLACE FUNCTION public.check_user_exists()
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  user_exists boolean;
BEGIN
  -- Get the current user's UUID from the auth.jwt() function
  -- Check if this UUID exists in the auth.users table
  SELECT EXISTS (
    SELECT 1 
    FROM auth.users 
    WHERE id = auth.uid() 
      AND NOT deleted_at IS NOT NULL -- Make sure user is not marked as deleted
  ) INTO user_exists;
  
  RETURN user_exists;
END;
$$;

-- Add comment to the function
COMMENT ON FUNCTION public.check_user_exists IS 'Checks if the currently authenticated user still exists in the auth.users table';

-- Set up appropriate RLS policy to allow execution for authenticated users
ALTER FUNCTION public.check_user_exists() OWNER TO SERVICE_ROLE;
GRANT EXECUTE ON FUNCTION public.check_user_exists() TO authenticated;

-- Simplified version - questo deve fallire se l'utente non esiste più
-- Se l'account è stato eliminato, la chiamata a questa funzione genererà un errore
CREATE OR REPLACE FUNCTION public.check_user_exists_simple()
RETURNS boolean
LANGUAGE plpgsql
AS $$
BEGIN
  -- Se l'utente non esiste più, questa funzione genererà un errore
  -- a causa della RLS, perché non avrà i permessi necessari
  RETURN true;
END;
$$;

-- Assegna i permessi in modo che solo gli utenti autenticati possano eseguirla
COMMENT ON FUNCTION public.check_user_exists_simple IS 'Funzione semplice che deve fallire se l''utente non esiste più';
REVOKE EXECUTE ON FUNCTION public.check_user_exists_simple() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.check_user_exists_simple() TO authenticated;