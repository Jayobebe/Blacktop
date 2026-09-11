CREATE OR REPLACE FUNCTION public.area_card_kings(_lat double precision, _lng double precision, _radius_km double precision DEFAULT 50)
 RETURNS TABLE(owner_name text, collected_count bigint, active_drops bigint)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  WITH nearby AS (
    SELECT d.id, d.owner_name, d.is_active
    FROM public.card_drops d
    WHERE auth.uid() IS NOT NULL
      AND (
        6371 * acos(
          least(1, greatest(-1,
            cos(radians(_lat)) * cos(radians(d.lat)) * cos(radians(d.lng) - radians(_lng))
            + sin(radians(_lat)) * sin(radians(d.lat))
          ))
        )
      ) <= greatest(1, least(_radius_km, 500))
  ),
  names AS (
    SELECT n.owner_name AS name FROM nearby n
    UNION
    SELECT p.display_name FROM public.card_drop_collections c
    JOIN nearby n ON n.id = c.drop_id
    JOIN public.profiles p ON p.id = c.collector_id
  )
  SELECT nm.name AS owner_name,
         (SELECT COUNT(*) FROM public.card_drop_collections c
          JOIN nearby n ON n.id = c.drop_id
          JOIN public.profiles p ON p.id = c.collector_id
          WHERE p.display_name = nm.name) AS collected_count,
         (SELECT COUNT(*) FROM nearby n WHERE n.owner_name = nm.name AND n.is_active) AS active_drops
  FROM names nm
  ORDER BY collected_count DESC, active_drops DESC
  LIMIT 5;
$function$;