-- Migration 0020 : field_order + field_options dans config_json du template APM
--
-- Convention (lue par parseInputSchema côté front) :
--   config_json.field_order  : array<string> — ordre d'affichage des champs
--   config_json.field_options : Record<string, string[]> — options pour <select>
--
-- Si field_order absent → ordre des clés JSON (non garanti).
-- Si field_options[key] absent → champ libre (input text/number/url/textarea).

update public.swarms
set config_json = config_json
  || jsonb_build_object(
    'field_order', jsonb_build_array(
      'make','model','year','mileage_km','fuel','price_eur','country','source_url','notes'
    ),
    'field_options', jsonb_build_object(
      'fuel',    jsonb_build_array('diesel','essence','hybride','électrique'),
      'country', jsonb_build_array('FR','DE','IT','ES','BE','NL','PT','CH','AT','GB')
    )
  ),
  updated_at = now()
where id = 'cccccccc-0001-0001-0001-000000000001';
