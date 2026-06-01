# Swarm Platform — Automobile Product Strategy

## 1. Résumé exécutif

L'environnement Automobile est déjà un vrai produit Swarm, pas une app séparée : un utilisateur authentifié lance le template global `Automobile — Recherche véhicule`, le run est privé via `owner_id`, le rapport Markdown est consultable dans `/automobile/[runId]`, et le dashboard `/automobile` exploite les runs réels.

La meilleure prochaine capacité n'est pas un scraper massif, une API VIN ou un nouveau template. La première action recommandée est **A. URL extractor manuel** : l'utilisateur colle une URL d'annonce, le système pré-remplit les champs, puis l'utilisateur valide avant de lancer le run existant. Cette action améliore fortement le workflow actuel sans changer le modèle produit, sans marketplace de templates, sans organisations, sans dépendre tout de suite d'un flux externe permanent.

Principes de la stratégie :

- Garder Swarm Platform comme surface unique.
- Structurer seulement ce qui sert au dashboard et à la décision.
- Laisser le rapport complet en Markdown.
- Ajouter l'automatisation en amont du run, pas remplacer le jugement humain.
- Ne lancer les connecteurs coûteux ou fragiles qu'après validation du workflow manuel.

## 2. État actuel Automobile

Routes et surfaces observées :

- `/automobile` : dashboard principal avec KPIs, dernières analyses et accès à la nouvelle analyse.
- `/automobile/nouvelle` : formulaire dynamique issu du template global.
- `/automobile/[runId]` : détail du run, recommandation, tokens, coût si disponible, détails, rapport Markdown et timeline.
- `/automobile/historique` : table d'analyses, filtre par recommandation, véhicule, statut, date, durée.
- `/automobile/marche` : cote marché read-only via données APM.
- `/automobile/sourcing` : recherche AutoScout24 via Apify déjà présente côté code, à considérer comme capacité expérimentale/contrôlée, pas comme stratégie de scraping massif.

Modèle actuel :

- Template global : `owner_id = NULL`, `is_template = true`, ID `cccccccc-0001-0001-0001-000000000001`.
- Runs privés : requêtes scoppées par `ownerId`.
- Champs de run : `inputs_json`, `result_text`, `status`, `steps`, `tokens`, `cost`, `langfuse_trace_id`.
- Recommandation : extraite depuis la section `## Recommendation` du Markdown.
- Formulaire : dérivé de `config_json.inputs_schema`, avec `make` et `model` obligatoires.

État produit : le socle E2E est validé. La dette principale n'est pas l'exécution du template, mais la transformation de l'annonce source en entrée fiable et la capacité à suivre des véhicules comme objets métier.

## 3. Assets existants

Assets déjà exploitables :

- `run` : objet central d'exécution, privé, consultable, filtrable.
- `inputs_json` : contient déjà véhicule, prix, pays, URL, notes ; exploitable pour labels, filtres, déduplication simple.
- `result_text` / rapport Markdown : très utile pour lecture humaine, export, partage privé.
- `recommendation` : déjà extractible en `APPELER`, `ATTENDRE`, `ÉVITER`.
- `steps` : utile pour debug, audit, confiance et coût par agent.
- `tokens`, `status`, `finished_at`, `started_at` : utiles pour contrôle opérationnel.
- `source_url` : clé naturelle pour relier annonce, run et futur candidat.
- véhicule analysé : reconstructible depuis `make`, `model`, `year`, `mileage_km`, `fuel`, `price_eur`, `country`.

Assets à structurer ensuite :

- `vehicle_candidate` : objet minimal pour une annonce ou saisie manuelle avant analyse.
- `vehicle_decision` : statut humain `à décider`, `appeler`, `ignoré`, `acheté`, `perdu` si le besoin opérateur est confirmé.
- `recommendation_summary` : recommandation, raisons clés, score de confiance, risques majeurs.
- `source_snapshot` : URL canonique, source, date d'observation, prix observé, extraction brute nettoyée.
- `market_context` : médiane, fourchette, confiance, échantillon, date de fraîcheur.

Assets pouvant rester en Markdown :

- Rapport d'analyse complet.
- Questions vendeur.
- Liste détaillée des risques.
- Explications de fiabilité et contexte marché lorsque les sources sont incertaines.
- Notes opérateur longues.

Assets à afficher dans le dashboard :

- Véhicule, prix, kilométrage, carburant, pays/source.
- Recommandation et statut.
- Date, durée, tokens/coût si disponible.
- Lien rapport et lien annonce.
- Indicateur `à décider` quand une décision humaine devient disponible.

Assets à attacher à un véhicule/candidat :

- `source_url`, `source_name`, `source_id` si disponible.
- `run_id` du dernier rapport.
- `inputs_json` normalisé.
- `recommendation`.
- `price_history` plus tard.
- `raw_payload` nettoyé et limité.

## 4. Dashboard Automobile actuel

Le dashboard actuel fait le bon choix de partir de runs réels. Il évite le décoratif et donne déjà une surface de pilotage simple :

- Total analyses, complétées, taux de succès.
- Dernières analyses.
- Véhicule reconstruit depuis les inputs.
- Statut et recommandation.
- Accès au rapport.
- Page historique avec filtre par recommandation.
- Détail run avec rapport, tokens, steps et source URL si renseignée.

Limites actuelles :

- `/automobile` reste plus proche d'une home de module que d'un cockpit décisionnel.
- Les véhicules ne sont pas encore des objets persistants indépendants du run.
- Les filtres sont surtout centrés sur la recommandation.
- La source, le pays, le prix et le carburant sont visibles surtout dans les détails ou l'historique.
- Le coût réel Kimi/Hypercli peut rester indisponible, donc les tokens sont plus fiables que le montant.

## 5. Améliorations UI/UX proposées

Hiérarchie recommandée :

- Ligne 1 : action principale `Nouvelle analyse` et, plus tard, `Coller une URL`.
- Ligne 2 : KPIs décisionnels : `À décider`, `APPELER`, `ATTENDRE`, `ÉVITER`, `Runs en erreur`.
- Ligne 3 : liste prioritaire des véhicules récents ou à décider.
- Ligne 4 : historique complet avec filtres.

Améliorations utiles :

- État vide orienté action : expliquer le parcours en 3 étapes et proposer `Nouvelle analyse`.
- Filtres : recommandation, statut run, pays, carburant, fourchette de prix, source.
- Recherche : marque, modèle, URL, notes.
- Tri : date, prix, kilométrage, recommandation, tokens.
- Badges recommandation : garder `APPELER`, `ATTENDRE`, `ÉVITER`, ajouter `UNKNOWN` discret si extraction impossible.
- Table plutôt que cards pour l'historique ; cards seulement pour les 3-5 décisions prioritaires.
- Graphique `Répartition des recommandations` seulement s'il aide à voir la qualité du sourcing.
- Graphique `Tokens par analyse` utile pour surveiller dérive de coût.
- Timeline activité utile si l'utilisateur enchaîne plusieurs analyses par semaine.
- Pas de heatmap pour l'instant : elle n'éclaire aucune décision immédiate.
- Score de confiance seulement si le rapport force une incertitude structurée ; ne pas inventer un score opaque.

Graphiques à éviter maintenant :

- Cartes géographiques.
- Heatmaps de marque/modèle.
- Courbes de marché sans échantillon solide.
- Graphiques de coût en dollars si le pricing Kimi n'est pas fiable.

## 6. Workflow utilisateur cible

V1 :

1. Ouvrir `/automobile`.
2. Lancer `Recherche véhicule` manuelle.
3. Lire le rapport.
4. Décider `APPELER`, `ATTENDRE` ou `ÉVITER`.

V2 :

1. Coller une URL d'annonce.
2. Extraction automatique des champs.
3. Validation/correction humaine.
4. Lancement du run existant.
5. Rapport.
6. Dashboard alimenté.

V3 :

1. Rechercher ou scraper légèrement une source autorisée.
2. Obtenir une liste de candidats.
3. L'utilisateur sélectionne les candidats pertinents.
4. Run approfondi uniquement sur sélection.

V4 :

1. Brancher API/feed marchand ou source contractuelle.
2. Détecter opportunités.
3. Envoyer alertes.
4. Comparer prix et historique.
5. Piloter un pipeline de décision.

## 7. Sourcing manuel

Le meilleur workflow manuel est `URL first`, mais avec validation humaine obligatoire :

1. L'utilisateur colle une URL.
2. Le système tente d'extraire titre, marque, modèle, année, kilométrage, carburant, prix, pays, vendeur/source et image principale.
3. Le formulaire existant est pré-rempli.
4. L'utilisateur corrige les champs.
5. Le système vérifie les doublons par URL canonique.
6. L'utilisateur lance le run `Automobile — Recherche véhicule`.
7. Le run conserve `source_url` et, plus tard, `candidate_id`.

Réponses produit :

- Oui, créer un mode `URL only`, mais uniquement comme pré-remplissage, pas comme run automatique.
- Oui, extraire automatiquement depuis l'URL, d'abord pour quelques domaines allowlistés.
- Oui, utiliser un scraper ponctuel si le HTML/JSON-LD ne suffit pas, mais jamais en planifié V1.
- Oui, demander confirmation humaine avant de consommer des tokens.
- Éviter les doublons par `normalized_source_url` puis par hash contenu `make/model/year/mileage/price`.
- Relier `URL → run → rapport` d'abord via `inputs_json.source_url`; plus tard via `vehicle_candidates.linked_run_id`.

Ce qui rend cette étape prioritaire : elle réduit la friction sans créer un nouveau produit, sans table obligatoire au départ, et sans dépendre d'une source unique.

## 8. Scraping / Apify

Approche progressive obligatoire :

1. URL ponctuelle.
2. Source unique.
3. Run manuel.
4. Planifié léger.
5. Multi-source plus tard.

Catégories de sources :

- AutoScout24 : données riches Europe, actor Apify déjà identifié et wrapper existant. Valeur élevée, difficulté moyenne, coût modéré, risque légal/stabilité moyen. V1 seulement en usage manuel ou requête ponctuelle ; planifié en V2 après validation.
- mobile.de : excellent marché Allemagne, données riches, actor mature. V2 pour compléter AutoScout24 sur DE ; pas première étape.
- Leboncoin : très pertinent France, mais risque/stabilité plus élevés et qualité actor moins prouvée. Later.
- La Centrale : forte valeur France, mais pas d'API publique claire et scraping sensible. Later ou partenariat.
- Subito, Milanuncios, coches.net : utiles pour Italie/Espagne, mais à traiter après preuve multi-pays. Later.
- Marketplaces B2B : meilleure voie long terme si contrat, moins risquée juridiquement. V3/V4.
- Dealer websites : intéressant pour stocks locaux, mais très fragmenté. Later.
- Google Search / SERP : utile pour discovery, mais signal bruité et compliance à cadrer. Later.
- Extraction page annonce : cas le plus simple et le plus utile maintenant. V1.

Intégration Swarm recommandée :

- V1 : endpoint d'extraction URL ponctuelle, allowlist de domaines, timeout court, fallback manuel.
- V2 : `vehicle_candidates` pour stocker les annonces validées.
- V3 : source unique AutoScout24 avec max results bas, déclenchement manuel, pas de cron large.
- V4 : watchlists planifiées et multi-source, uniquement avec budget, quotas et revue légale.

## 9. APIs / SDKs utiles

Annonces / listings :

- Marketplaces officielles ou feeds marchands : très forte valeur, risque faible, intégration moyenne à difficile, coût souvent commercial. Priorité V3/V4.
- Carapis ou agrégateurs : valeur forte pour tests structurés, dépendance provider, coût à vérifier. Priorité V2 si l'extraction URL valide l'usage.
- Google Vehicle Listings : utile pour marchands et SEO, moins direct pour sourcing utilisateur. Later.

VIN / historique :

- VIN decoder : valeur moyenne à forte pour specs, faible risque si API contractuelle, coût abordable. Priorité V2 sur véhicules shortlistés.
- Historique véhicule : très forte valeur pour accident/kilométrage/vol, mais coût par rapport élevé. Priorité V2/V3 avec confirmation de coût.
- Rappels constructeur : valeur utile, souvent open data partielle. Priorité V2 comme enrichissement low-cost.

Prix / cote :

- Valuation API : valeur forte pour décision `APPELER/ATTENDRE/ÉVITER`, coût et accès souvent B2B. Priorité V3.
- Market price/comparables : valeur élevée si échantillon fiable ; peut démarrer avec données APM existantes. Priorité V2.
- Cote VO type Argus/autobiz/Eurotax : crédible mais commerciale. V3/V4.

Pièces / OEM :

- TecDoc/TecAlliance : valeur forte pour pièces et compatibilité, intégration/coût plus lourds. Later sauf cas parts-first.
- Autodoc/eBay parts : utile pour estimation coût pièces, risque scraping/API variable. Later.
- Pièces occasion : utile pour stratégie achat/réparation, mais niche. Later.

Fiabilité / pannes :

- Recalls officiels : valeur claire, coût faible, couverture variable Europe. V2.
- Problèmes connus : souvent semi-structuré, nécessite sources et incertitude. V2/V3 avec citation.
- Forums : utile mais hallucination/qualité à risque. À résumer avec prudence, pas comme vérité factuelle.
- Coûts entretien : valeur élevée, mais difficile à fiabiliser sans base partenaire. V3.

## 10. Équipe AI / swarms futurs

Équipe minimale V1, déjà proche de l'existant :

- Data Collector : structure les inputs et signale les données manquantes.
- Risk Analyst : analyse risques mécaniques, administratifs et marché.
- Decision Writer : produit un rapport lisible et une recommandation.

Agent à ajouter seulement avec l'URL extractor :

- Source Extractor : extrait les champs d'une annonce et marque chaque champ comme `extrait`, `déduit` ou `manquant`. Cette tâche doit rester hors du run final tant que possible pour éviter de consommer un gros crew.

Agents plus tard :

- Duplicate Checker : peut être déterministe d'abord, IA seulement pour titres ambigus.
- Candidate Ranker : utile quand il existe une liste de candidats.
- Market Comparator : utile avec comparables structurés.
- Recall Checker : idéalement déterministe via API/open data.
- Reliability Researcher : utile avec sources citées et incertitude forcée.
- OEM Resolver / Parts Price Scout : later, uniquement si la stratégie pièces devient prioritaire.

Agents inutiles maintenant :

- 20 agents spécialisés par sous-domaine.
- Agent vendeur autonome qui contacte des vendeurs.
- Agent pricing sophistiqué sans données de marché fiables.
- Agent scraper autonome non borné.

Tâches déterministes :

- Validation URL, pays, année, prix, kilométrage.
- Déduplication par URL/hash.
- Calculs de tokens, durée, statut.
- Normalisation source et carburant.
- Mapping badge recommandation.

Tâches humaines :

- Valider les champs extraits.
- Décider d'appeler un vendeur.
- Interpréter un rapport incertain.
- Confirmer tout coût VIN/historique payant.
- Valider une source de scraping en production.

## 11. Dashboard de contrôle

Une seule surface suffit pour l'instant : `/automobile`, avec des sections mieux priorisées.

Sections recommandées :

- Vue d'ensemble : total, complétées, à décider, erreurs, tokens.
- À décider : véhicules avec rapport terminé mais aucune décision humaine.
- Derniers véhicules : véhicule, source, prix, pays, recommandation, lien rapport.
- Recommandations : compte `APPELER`, `ATTENDRE`, `ÉVITER`, `UNKNOWN`.
- Sources : plus tard, source, succès extraction, erreurs, dernière utilisation.
- Runs : table historique actuelle enrichie.
- Coûts : tokens par run et total période ; dollars seulement si fiable.
- Alertes : erreurs engine, extraction impossible, doublons détectés, source en échec.

Questions auxquelles le dashboard doit répondre :

- Qu'est-ce qui a été analysé ?
- Quelles voitures méritent une action ?
- Quelles voitures sont à éviter ?
- Quels rapports attendent une décision ?
- Quels runs ont échoué ?
- Quelles sources produisent des données exploitables ?
- Combien de tokens ont été consommés ?
- Quels doublons évitent un run inutile ?

## 12. Data model minimal futur

Ne pas créer ce modèle avant d'avoir validé le besoin avec l'URL extractor. Quand nécessaire, le minimum est :

`vehicle_candidates` :

- `id`
- `owner_id`
- `source_type` : `manual`, `url`, `scraper`, `api`
- `source_name`
- `source_url`
- `source_id`
- `normalized_source_url`
- `make`
- `model`
- `year`
- `mileage_km`
- `fuel`
- `price_eur`
- `country`
- `image_url`
- `status` : `new`, `shortlisted`, `researched`, `ignored`, `error`
- `linked_run_id`
- `recommendation`
- `last_seen_at`
- `created_at`
- `updated_at`
- `notes`

`vehicle_candidate_events` later :

- `candidate_id`
- `event_type`
- `payload`
- `created_at`

Ce qui ne doit pas devenir structuré trop tôt :

- Rapport complet.
- Raisonnement détaillé.
- Description annonce longue.
- Données vendeur personnelles.
- Prix historiques multi-source avant d'avoir une vraie liste de candidats.

## 13. Risques

Risques produit et techniques :

- Scraping légal : CGU, droit base de données EU, RGPD si données vendeur.
- Stabilité des sources : marketplaces qui changent HTML, Akamai/Cloudflare, actors abandonnés.
- Coût LLM : multiplication des runs si pas de déduplication.
- Coût VIN/historique : peut dépasser le coût LLM de très loin.
- Qualité annonces : champs manquants, prix faux, kilométrage incohérent, annonces expirées.
- Doublons : même véhicule multi-source ou même URL relancée.
- Hallucinations : risque si le rapport affirme des pannes sans source ou sans incertitude.
- APIs instables ou commerciales : pricing non public, accès B2B lent.
- Multi-tenant futur : `owner_id` suffit maintenant, mais credentials par user/workspace seront nécessaires plus tard.
- Quota Apify : usage planifié peut consommer vite si non borné.
- Pricing Kimi absent : afficher tokens plutôt que faux coûts.
- Dashboard trop complexe : risque de perdre la décision principale.
- Trop d'agents : plus lent, plus coûteux, plus difficile à auditer.

Garde-fous recommandés :

- Confirmation humaine avant run.
- Déduplication par URL.
- Allowlist de domaines pour extraction URL.
- Timeout court et fallback manuel.
- Pas de stockage PII vendeur en V1.
- Sources et incertitude obligatoires dans le prompt.
- Quotas par utilisateur avant tout scraping planifié.

## 14. Priorités V1 / V2 / V3

V1 :

- URL extractor manuel.
- Dashboard polish ciblé sur décision : `à décider`, source URL, prix, pays, filtres simples.
- Déduplication soft par `source_url`.
- Amélioration du prompt pour forcer sources/incertitude.

V2 :

- `vehicle_candidates` minimal si le flux URL est utilisé.
- Extraction source unique plus robuste, idéalement AutoScout24 d'abord.
- VIN decoder ou recalls uniquement sur candidats shortlistés.
- Comparaison marché simple avec données existantes et niveau de confiance.

V3 :

- Candidate list avec statuts.
- Recherche/sourcing source unique déclenchée manuellement.
- Watchlists légères.
- Multi-source après validation juridique et quotas.
- APIs valuation ou feeds marchands si accès contractuel.

## 15. Première action recommandée

Choix : **A. URL extractor manuel**.

Pourquoi ce choix :

- Il améliore directement le parcours actuel sans changer le template principal.
- Il réduit la saisie manuelle des 9 champs.
- Il respecte la logique Swarm : template global, run privé, dashboard privé.
- Il peut fonctionner sans base nouvelle au départ.
- Il prépare naturellement `vehicle_candidates` sans l'imposer.
- Il limite les risques scraping car l'utilisateur fournit une URL ponctuelle.
- Il garde l'humain dans la boucle avant tout run coûteux.

Définition produit de la première action :

- Entrée : une URL d'annonce.
- Sortie : formulaire `Recherche véhicule` pré-rempli.
- Champs marqués : `extrait`, `déduit`, `manquant`.
- Bouton final : `Lancer l'analyse` après validation.
- Fallback : si extraction impossible, garder `source_url` et laisser la saisie manuelle.
- Déduplication : avertir si la même URL a déjà un run récent.

## 16. Ce qu'il ne faut pas faire maintenant

- Ne pas créer une app Automobile séparée.
- Ne pas créer organizations/workspaces/billing/tenant branding.
- Ne pas créer un marketplace de templates.
- Ne pas lancer de scraping massif ou planifié.
- Ne pas brancher VIN/historique payant par défaut.
- Ne pas créer un template Parts Search maintenant.
- Ne pas multiplier les agents.
- Ne pas stocker des données vendeur personnelles.
- Ne pas faire un dashboard décoratif.
- Ne pas automatiser la décision d'appeler un vendeur.
- Ne pas ajouter une table complexe avant d'avoir validé le flux URL.

## Roadmap simple

## Maintenant

1. Implémenter **A. URL extractor manuel** avec validation humaine, fallback manuel et déduplication URL.
2. Polir le dashboard autour de la décision : `à décider`, source, prix, pays, recommandation, tokens.

## Après

1. Créer `vehicle_candidates` seulement si le flux URL est utilisé régulièrement.
2. Ajouter une source unique AutoScout24 en mode manuel contrôlé, sans planification.
3. Ajouter un enrichissement VIN/recalls uniquement sur candidats shortlistés et avec coût explicite.

## Plus tard

Multi-source, watchlists planifiées, APIs valuation, pièces/OEM, rapports fiabilité profonds, feeds marchands et pipeline d'opportunités.

