-- Keep outgoing loans as on-loan; loan-in denotes players borrowed by the club.
ALTER TABLE public.players
  DROP CONSTRAINT players_squad_status_valid,
  ADD CONSTRAINT players_squad_status_valid CHECK (
    squad_status IN ('first-team', 'loan-in', 'on-loan', 'academy', 'departed')
  );
