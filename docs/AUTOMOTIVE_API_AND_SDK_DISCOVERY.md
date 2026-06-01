# Automotive API & SDK Discovery Report
> Rapport de recherche — Swarm Platform Automotive Specialization  
> Date : 2026-06-01  
> Auteur : Research Agent

---

## 1. Résumé exécutif

Le marché des APIs automotive en Europe est fragmenté mais mature : des acteurs comme AutoScout24, mobile.de ou Carapis offrent un accès structuré aux annonces paneuropéennes, tandis que des providers comme Vincario/vindecoder.eu, carVertical et JATO Dynamics couvrent la couche VIN / historique / specs. La couche pièces détachées est dominée par TecDoc (TecAlliance), accessible via un Apify actor communautaire à $69/mois. Côté valuation, autobiz est le leader européen (22 marchés), mais requiert un contact commercial ; l'Argus dispose d'une API documentée pour la France. La couche fiabilité/pannes manque d'APIs structurées directes : les données TÜV et ADAC ne sont pas disponibles via une API publique, mais le site car-recalls.eu et le Safety Gate EU (RAPEX) fournissent des données ouvertes. Pour un premier test V1 de la plateforme Swarm Automotive, **AutoScout24 via l'actor Apify blackfalcondata** (pay-per-event, $0.80/1000 résultats, 8 marchés, 0 contrat requis) est le point d'entrée le plus rapide, suivi de **Vincario/vindecoder.eu** pour le décodage VIN Europe (3 lookups gratuits/mois sans carte bancaire). Un total de **32 providers** ont été analysés dans ce rapport.

---

## 2. Top 10 providers à considérer

Classement par priorité V1 (rapidité à tester + utilité dans un template Swarm Automotive) :

1. **AutoScout24 via Apify (blackfalcondata)** — Annonces EU, pay-per-event, $0.80/1000, 8 marchés, 0 contrat, incrémentin tracking. Idéal pour un premier template "sourcing VO Europe".
2. **Vincario / vindecoder.eu** — VIN decode Europe & US, 3 lookups gratuits/mois sans CB, REST API clé+secret. Couvre 50+ champs techniques. Signupself-service.
3. **Carapis** — Proxy API REST pour AutoScout24 + mobile.de + 25+ marchés, free tier sans CB, bien documenté. Alternative propre à l'Apify actor.
4. **carVertical** — VIN historique (accidents, kilométrage, vol) pour 37 pays, 11 000+ partenaires B2B. Rapport ~25€/unité, prix business à négocier. Contact commercial requis.
5. **autobiz API** — Valuation B2B/B2C pour 22 marchés Europe, leader du secteur, partenariat JATO 2025. Contact commercial requis (pas de self-service).
6. **API Argus (developer.largus.fr)** — Cote officielle France, reconnue 85+ ans, API documentée sur Postman. Idéal pour le marché FR.
7. **TecDoc via Apify (making-data-meaningful)** — Pièces + compatibilité véhicule, $69/mois, 1900+ utilisateurs, 4.4/5. Alternative rapide à la licence TecAlliance.
8. **JATO Dynamics** — Specs techniques OEM mondiales, API REST OAuth2, free trial disponible. Standard industrie, 50+ marchés.
9. **mobile.de via Apify (3x1t)** — Marché allemand, $9.99/mois + usage (~$0.30/1000), 5★/7 reviews, 2000 résultats/query.
10. **Smartcar API** — Données véhicule connecté temps réel (odométre, batterie, localisation) pour 37 marques en EU. Partenariat BMW Europe annoncé en 2025.

---

## 3. Tableau comparatif

| Provider | Catégorie | Pays | Type | Données obtenues | Auth | Coût estimé | Facilité | Risque | Recommandation |
|---|---|---|---|---|---|---|---|---|---|
| AutoScout24 Apify (blackfalcondata) | Annonces | 8 pays EU | Apify actor PPE | Prix, specs, images, dealer, mileage, date | API Key Apify | $0.80/1000 résultats | ★★★★★ | Moyen (scraping) | **TESTER EN PREMIER** |
| AutoScout24 Apify (3x1t) | Annonces | 8 pays EU | Apify actor location | Prix, specs, 40+ champs, dealer | API Key Apify + $9.99/mois | $9.99/mois + usage | ★★★★☆ | Moyen (scraping) | Alternative rental |
| mobile.de Apify (3x1t) | Annonces | Allemagne EU | Apify actor location | Prix, specs, 40+ champs, dealer | API Key Apify + $9.99/mois | ~$0.30/1000 + $9.99/mois | ★★★★☆ | Moyen (scraping) | Tester marché DE |
| Leboncoin Vehicle Apify (3x1t) | Annonces | France | Apify actor location | Prix, specs, localisation, Argus rating | API Key Apify + $9.99/mois | $9.99/mois + usage | ★★★☆☆ | Moyen (scraping) | France uniquement |
| Carapis | Annonces | 25+ marchés | API REST (proxy) | Listings + stats marché + dealers | Bearer token | Free tier + plans payants | ★★★★☆ | Faible (légal) | Bonne alternative |
| auto-api.com | Annonces | 18 pays EU | API REST | Prix, specs, suivi changements | api_key param | Sur demande (formulaire) | ★★★☆☆ | Faible (légal) | Contact requis |
| Vincario/vindecoder.eu | VIN/Historique | Global (EU+US) | API REST | 50+ champs techniques, specs OEM | API key + secret SHA1 | Free: 3/mois; payant ~$15-79/mois | ★★★★★ | Faible | **TESTER EN 2ÈME** |
| carVertical | VIN/Historique | 37 pays EU | API REST | Accidents, kilométrage, vol, specs | Via contact B2B | ~25€/rapport; B2B négocié | ★★★☆☆ | Faible | Après contact |
| NHTSA vPIC | VIN/Historique | USA | API REST gratuite | Specs techniques US | Aucune | Gratuit | ★★★★★ | Nul | US seulement |
| HistoVec (gouv.fr) | VIN/Historique | France | Interface web (pas d'API publique) | Historique administratif FR | N/A | Gratuit | ★★☆☆☆ | Nul | Scraping uniquement |
| autobiz API | Valuation | 22 marchés EU | API REST (contact) | Cote B2C/B2B, valeur future, rotation | Via contact commercial | Sur devis | ★★☆☆☆ | Faible | Contact requis |
| L'Argus API | Valuation | France | API REST | Cote neuf/occasion, historique prix | Sur demande | Sur devis | ★★★☆☆ | Faible | France uniquement |
| Eurotax/Schwacke (Autovista) | Valuation | 10+ pays EU | API REST (contact) | Cote, forecasts, specs | Via contact J.D. Power | Sur devis | ★★☆☆☆ | Faible | Enterprise |
| TecDoc (Apify actor) | Pièces/OEM | Multi-langues | Apify actor $69/mois | Pièces, refs OEM, compatibilité véhicule | API Key Apify | $69/mois + usage | ★★★★☆ | Moyen (indirect) | Meilleur accès pièces |
| TecDoc (TecAlliance officiel) | Pièces/OEM | Europe | API REST officielle | 10M+ pièces, 800+ marques, 110K+ modèles | Via partenariat TecAlliance | ~219€/an + commercial | ★★☆☆☆ | Nul | Long délai accès |
| JATO Dynamics | Specs techniques | 50+ marchés | API REST OAuth2 | Specs OEM, équipements, WLTP, VINView | OAuth2 JWT + Subscription Key | Sur devis (free trial dispo) | ★★★☆☆ | Faible | Specs premium |
| Vehicledatabases.com | VIN + Pièces + Specs | US + EU | API REST | VIN decode, specs, pièces OEM, réparations | API key | 15 crédits gratuits; payant ensuite | ★★★★☆ | Faible | Polyvalent EU |
| Marketcheck | Valuation + Listings | US + Canada + UK | API REST | 262M VINs, 540M listings, prix | API key | Sur devis | ★★☆☆☆ | Faible | US/UK uniquement |
| auto.dev | VIN + Listings + Recalls | USA | API REST | VIN decode, listings, recalls NHTSA, specs | API key | 1000 appels/mois gratuits | ★★★★★ | Faible | USA uniquement |
| Smartcar | Véhicule connecté | 37 marques EU | API REST | Odométre, batterie, localisation temps réel | OAuth2 (consent utilisateur) | Free tier + plans payants | ★★★☆☆ | Faible | Nécessite consent |
| Kleinanzeigen Apify | Annonces | Allemagne | Apify actor | Titre, prix, location, specs basiques | API Key Apify | ~$1.50/1000 | ★★★☆☆ | Moyen (scraping) | Marché DE secondaire |
| Copart Apify | Enchères salvage | USA + UK | Apify actor | 168 champs, VIN, dommages, enchères | API Key Apify | Sur devis + usage | ★★★☆☆ | Moyen (scraping) | Niche salvage |
| Manheim | Enchères B2B | USA | API REST (partenaire) | Inventaire, valuations MMR, achat/vente | Via demande d'accès | Sur devis | ★★☆☆☆ | Faible | USA B2B |
| RAPEX/Safety Gate EU | Fiabilité/Rappels | EU 31 pays | Open Data CSV/API | Rappels produits non-alimentaires | Aucune | Gratuit | ★★★★☆ | Nul | EU recalls officiel |
| NHTSA Recalls API | Fiabilité/Rappels | USA | API REST gratuite | Rappels par modèle/année/marque | Aucune | Gratuit | ★★★★★ | Nul | USA recalls officiel |
| Fortellis/CDK Global | DMS/Dealer | USA + Canada | API REST marketplace | Inventaire dealer, contrats, DMS data | Via partenariat CDK | Sur devis | ★★☆☆☆ | Faible | USA B2B uniquement |
| LKQ / Keystone | Pièces récupération | USA + Europe | API (partenaire) | Inventaire pièces recyclées | Via partenariat LKQ | Sur devis | ★★☆☆☆ | Faible | Niche pièces VO |
| Autodoc (Apify actor) | Pièces | Europe | Apify actor | Prix pièces, marques, disponibilité | API Key Apify | Usage seul | ★★★☆☆ | Moyen (scraping) | Cross-check prix pièces |
| HistoVec Apify (scraping) | Historique FR | France | Scraping (risqué) | Historique admin FR | N/A | Usage Apify | ★★☆☆☆ | Élevé (site gouv) | Non recommandé |
| Partslink24 | Pièces OEM | Multi | Web portal (pas d'API publique) | OEM catalog 15 marques premium | Abonnement pro | Abonnement | ★★☆☆☆ | Faible | Portal uniquement |
| carapi.app | Specs USA | USA | API REST | Year/Make/Model/Trim, specs | API key | Free dataset sans compte | ★★★★☆ | Faible | USA uniquement |
| car-recalls.eu | Fiabilité/Rappels | EU | Web (données TÜV + ADAC) | Index fiabilité TÜV, recalls EU | N/A | Gratuit (lecture) | ★★★☆☆ | Moyen (scraping) | Référence qualitative |

---

## 4. Sources annonces véhicules

### 4.1 AutoScout24

**Présence** : Europe's largest pan-European online car marketplace. 2M+ annonces actives dans 18 pays.

**API officielle** : Oui, mais réservée aux partenaires B2B (concessionnaires, intégrateurs accrédités). Documentation disponible sur `listing-creation.api.autoscout24.com/docs` et `portal.services.as24.tech/api-docs`. GitHub public : `github.com/smg-automotive/autoscout24-api-specs`. L'API Listing Creation permet à des dealers d'envoyer des annonces sur AutoScout24, pas de lire les listings en masse.

**Accès scraping** : AutoScout24 utilise la protection Akamai. Leur robots.txt interdit le scraping automatique. CGU : usage non commercial uniquement pour les particuliers. Risque légal moyen pour un usage commercial.

**Apify actors disponibles** :
- `blackfalcondata/autoscout24-scraper` — Pay-per-event : $0.005/run + $0.0008/résultat ≈ **$0.80/1000 annonces**. Couvre 8 marchés (DE, AT, NL, BE, IT, FR, ES, CH). Incremental tracking (nouvelles annonces seulement sur runs récurrents → économie 80-95% de coût). Labels de prix AutoScout24 inclus (top-price, good-price...). Support rapide (3.6h). 46 utilisateurs, 19 actifs/mois.
- `3x1t/autoscout24-scraper` — Location $9.99/mois + usage. 5★/3 reviews. 91 utilisateurs. Max 4000 résultats/query. Domaines : .com, .it, .nl, .de, .at, .be, .fr, .es.
- `3x1t/autoscout24-scraper-ppr` — Version Pay-per-result.
- `automation-lab/autoscout24-scraper` — Prix inconnu, JSON propre.

**Données disponibles** : marque, modèle, version, carrosserie, prix, rating prix (top/good/fair), images (multiples), mileage, carburant, boîte, classe d'émission, coordonnées dealer, avis dealer, dates création/modification, équipements.

**Pays couverts** : 8-18 selon l'actor.

**Coût estimé** : $0.80-$1/1000 annonces (Apify actor) + plan Apify ($49/mois Starter).

**Risque légal** : Moyen. AutoScout24 Akamai protection. Les arrêts Meta v. Bright Data (2024) et X Corp v. Bright Data (2024) ont établi que les ToS ne s'appliquent pas aux scrapers non-authentifiés. Néanmoins, AutoScout24 peut bloquer les IPs. Usage commercial sans contrat : zone grise.

**Recommandation** : Utiliser l'actor `blackfalcondata` en PPE pour les tests. Passer à un contrat partenaire B2B si volume > 100K annonces/jour.

---

### 4.2 mobile.de

**Présence** : Leader allemand, plus large marché automobile en Allemagne, opère aussi `automobile.it` en Italie. Millions d'entrées voitures, motos, utilitaires.

**API officielle** : Oui, `services.mobile.de/` — API B2B partenaires pour dealers. Pas de self-service public. Nécessite accréditation.

**Apify actors** :
- `3x1t/mobile-de-scraper` — Location $9.99/mois, ~$0.30/1000 résultats. 5★/7 reviews. 660 utilisateurs, 47 actifs/mois. Max 2000 résultats/query. 40+ attributs extraits. Le plus populaire.
- `3x1t/mobile-de-scraper-ppr` — Version Pay-per-result.
- `ivanvs/mobile-de-scraper` — Alternative communautaire.

**Données disponibles** : marque, modèle, année, carburant, puissance, boîte, kilométrage, classe d'émission, dates contrôle technique, condition, prix brut/net/TVA, rating prix, équipements, coordonnées vendeur, notes, images, descriptions.

**Pays couverts** : Principalement Allemagne, EU pour certains listings.

**Coût estimé** : $9.99/mois + usage (~$0.30/1000).

**Risque légal** : Moyen. CGU mobile.de interdisent le scraping automatisé. Même cadre légal qu'AutoScout24.

**Alternative** : auto-api.com propose un accès direct API mobile.de (nécessite formulaire de contact, pas de pricing public). Carapis également.

---

### 4.3 Leboncoin

**Présence** : Première plateforme de petites annonces en France. Section "Véhicules" majeure (voitures, motos, utilitaires).

**API officielle** : Aucune API publique pour lecture. Interface B2B pour dépôt d'annonces pros (via partenaires).

**Apify actors** :
- `3x1t/leboncoin-vehicle-scraper` — Location $9.99/mois + usage. Spécialisé annonces véhicules. Champs : titre, prix, marque, modèle, mileage, carburant, boîte, sièges, portes, couleur, équipements, coordonnées, rating Argus intégré. Max 3500 résultats/query. 0 review, 19 utilisateurs, actifs: 3/mois. Relativement nouveau.
- `3x1t/leboncoin-vehicle-scraper-ppe` — Version Pay-per-event.
- `saswave/advanced-leboncoin-scraper` — Généraliste.
- `scrapifier/leboncoin-universal-scraper` — Généraliste.

**Données disponibles** : Titre, prix EUR, marque, modèle, version, mileage, carburant, boîte, équipements, localisation GPS, date création, rating Argus (intégré nativement dans l'annonce Leboncoin).

**Pays couverts** : France uniquement.

**Coût estimé** : $9.99/mois + usage.

**Risque légal** : Moyen-élevé. Leboncoin (filiale d'Axel Springer) a des CGU strictes contre le scraping. Moins de jurisprudence favorable que pour des acteurs pan-EU.

---

### 4.4 Kleinanzeigen (ex-eBay Kleinanzeigen)

**Présence** : Leader allemand des petites annonces généralistes. Section voitures importante mais moins pro qu'AutoScout24.

**API officielle** : Aucune API publique.

**Apify actors** :
- `lexis-solutions/ebay-kleinanzeigen` — Scraper général. Prix, description, location, specs.
- `fatihtahta/ebay-kleinanzeigen-scraper` — $1.50/1000 résultats.
- `gio21/kleinanzeigen-scraper` — Spécialisé autos (km, année, carburant).
- `santamaria-automations/kleinanzeigen-de-scraper` — German classifieds.

**Données disponibles** : titre, prix EUR, localisation (code postal), specs véhicule basiques (km, année, carburant), photos, vendeur, description.

**Pays couverts** : Allemagne uniquement.

**Coût estimé** : ~$1.50/1000 résultats.

**Risque légal** : Moyen. Mêmes considérations que mobile.de.

---

### 4.5 eBay Motors (eBay international)

**Présence** : Catégories Motors sur eBay US, UK, DE, FR, IT. Mix particuliers/professionnels.

**API officielle** : Oui. eBay Developers Program (`developer.ebay.com`) offre : Trading API, Inventory API, Finding API, Metadata API (getMotorsListingPolicies). Gratuit pour créer un compte développeur. Accès aux listings Motors via Browse API (lecture) et Sell API (publication).

**Données disponibles** : titre, prix, VIN requis, format (enchère/fixe/classifié), catégorie précise (Cars & Trucks, Parts & Accessories), condition, specs item-specifics.

**Pays couverts** : USA, UK, DE, FR, IT, AU et autres marchés eBay.

**Coût estimé** : Gratuit pour lire les listings. Frais de listing si publication (5$ réserve pour Motors USA).

**Risque légal** : Faible — API officielle.

**Limite** : Moins adapté marché EU B2B VO. Plus orienté C2C et USA.

---

### 4.6 LaCentrale

**Présence** : Référence française des annonces automobiles occasion. Vient de lancer LaCentrale Pro (janvier 2026) : marketplace B2B réservée aux professionnels.

**API officielle** : Pas d'API publique documentée. Usage interne. LaCentrale intègre l'API iovox pour la gestion des appels entrants.

**Tendance 2026** : La Centrale se mue en "plateforme IA agentique" selon leurs communications de 2026. Des APIs B2B pourraient émerger via LaCentrale Pro.

**Scraping** : Techniquement possible mais risque légal (CGU strictes, propriété d'Axel Springer).

**Alternative** : Leboncoin actor Apify inclut parfois des croisements LaCentrale.

**Recommandation** : Surveiller l'évolution LaCentrale Pro pour un accès B2B futur. Ne pas scraper en production sans accord.

---

### 4.7 Carapis

**Type** : API REST proxy vers 25+ marchés auto mondiaux.

**Marchés EU couverts** : AutoScout24 (EU), mobile.de (DE), Auto.ru (RU), Avito.ru (RU).

**Marchés hors-EU** : Encar (KR), Che168 (CN), Guazi (CN), Goo-net (JP), BeForward (JP), CarDekho (IN), AutoTrader (US), CarGurus (US), Cars.com (US), Carvana (US), WebMotors (BR), Dubizzle (UAE), Arabam (TR), OLX.

**Données disponibles** : Listings + specs + pricing history + statistiques marché + dealer profiles + batch search + webhooks.

**Auth** : Bearer token (format `autoscout24_parser_sk_[64 hex]`).

**Rate limits** :
- Free : 10 req/min, 100 req/h, 2 concurrents
- Basic : 60 req/min, 1000 req/h, 5 concurrents
- Pro : 300 req/min, 10 000 req/h, 20 concurrents
- Enterprise : Custom

**Free tier** : Disponible, signup self-service sur my.carapis.com, sans CB.

**Avantage** : Endpoint `/statistics` pour distribution de prix, parts de marché, tendances. Endpoint `/dealers/search` pour profiling marchand.

**Risque légal** : Plus faible qu'un scraper direct (Carapis assume la responsabilité technique).

---

### 4.8 auto-api.com

**Type** : API REST directe vers AutoScout24, mobile.de, Encar et autres.

**Données** : Specs complètes, suivi des changements (ajouté/modifié/supprimé), exports CSV/JSON/Excel journaliers.

**Auth** : `api_key` en paramètre query.

**Accès** : Via formulaire de contact ("accès fourni dans 2 minutes" selon leur site).

**SDKs** : PHP, Node.js, Python, Go, C#, Java, Ruby, Rust.

**Pricing** : Non public. Contact requis.

**Unique** : Détection des nouvelles annonces en 60 secondes pour AutoScout24, 1-2 minutes pour mobile.de.

---

## 5. VIN / historique véhicule

### 5.1 Vincario / vindecoder.eu

**Provider** : Vincario (marque commerciale), vindecoder.eu (marque grand public). Mêmes services.

**Couverture** : Global — Europe étendue + Amérique du Nord + autres marchés.

**Données retournées** (50+ champs) :
- Marque, modèle, année-modèle, carrosserie, série, transmission
- Type de moteur, cylindrée, émissions CO2, normes Euro
- Dimensions : empattement, hauteur, longueur, largeur, poids
- Performance : vitesse max, capacité coffre, systèmes freinage, suspension
- Pays de fabrication, usine, chiffre de contrôle, numéro série

**Auth** : REST JSON avec `api_key` + `secret_key`. Hash de contrôle SHA1.

**Free tier** : 3 lookups/mois gratuits, sans carte bancaire. Réinitialisé automatiquement.

**Plans payants** : À partir de ~$15/mois (Grow) jusqu'à ~$79/mois (Scale). Les VINs invalides ou non reconnus ne sont pas décomptés.

**Particularité** : Suspension automatique à l'épuisement du quota mensuel (pas de surcharge surprise).

**Disponibilité d'une API marché** : vindecoder.eu propose aussi un endpoint "Vehicle Market Value" pour estimer la valeur marchande depuis le VIN.

**Recommandation** : Provider idéal pour tests EU. Self-service, gratuit pour commencer.

---

### 5.2 carVertical

**Provider** : carVertical (Lituanie, fondé 2017). 6M+ utilisateurs, 11 000+ partenaires B2B.

**Couverture** : 37 pays, 38 marchés. 1000+ sources de données (registres nationaux, assurances, forces de l'ordre, garages officiels). Blockchain pour garantie d'intégrité.

**Données retournées** :
- Historique accidents (44% des voitures mondial détectées endommagées)
- Fraude kilométrage
- Statut vol
- Propriétaires précédents
- Données techniques specs
- Alerte origin USA (véhicules importés des USA)

**API produits** :
1. Vehicle History Report API (rapport dynamique web ou PDF)
2. VIN Decoder API (ML-powered, précision multi-marchés)
3. US-Origin Alert Feature

**Auth** : Via équipe B2B (formulaire de contact). Pas de self-service.

**Pricing** :
- Particuliers : 24.99€/rapport (1 rapport), dégressif à partir de 2
- Business : "Plus de 73% d'économie" vs tarif standard. Aucun contrat obligatoire.

**Accès** : Contact B2B requis. Support multilingue (EN, FR, DE, IT, PL, LT).

**Recommandation** : Excellent pour enrichissement fiches VO avec historique. Nécessite contact commercial.

---

### 5.3 NHTSA vPIC (USA)

**Provider** : National Highway Traffic Safety Administration, gouvernement américain.

**Couverture** : USA uniquement (véhicules homologués pour vente aux États-Unis).

**Données** : Specs techniques complètes par VIN pour véhicules US : marque, modèle, année, carrosserie, motorisation, boîte, etc.

**Auth** : Aucune. API publique gratuite.

**Endpoint principal** : `https://vpic.nhtsa.dot.gov/api/`

**Coût** : Gratuit, illimité.

**Limite** : USA uniquement. VINs européens = résultats limités ou vides.

**Complementaire** : auto.dev/open-recalls pour les rappels NHTSA.

---

### 5.4 HistoVec (France)

**Provider** : Ministère de l'Intérieur français. Données SIV (Système d'Immatriculation des Véhicules).

**Couverture** : France uniquement.

**Données** : Dates d'immatriculation, accidents déclarés, propriétaires précédents, statut administratif du véhicule. 48M+ rapports générés depuis le lancement.

**Accès** : Interface web uniquement (`histovec.interieur.gouv.fr`). Aucune API publique. Nécessite numéro de plaque + données du propriétaire.

**Coût** : Gratuit pour les particuliers.

**Limite** : Données disponibles principalement post-2009. Pas d'API officielle.

**Scraping** : Non recommandé (site gouvernemental, données personnelles, risque RGPD élevé).

---

### 5.5 vehicledatabases.com

**Provider** : Vehicle Databases (USA, couverture étendue).

**Couverture** : US + Canada (1980-présent) + Europe (endpoint dédié 1980-présent).

**Données** :
- Basic : Marque, modèle, année, finition, carrosserie, moteur, boîte, carburant, traction
- Advanced : MSRP, facture, efficacité énergétique, détails EV/hybride, notations sécurité, packs OEM, garantie

**APIs disponibles** : 25+ APIs — VIN decode, specs véhicule, maintenance schedules, rappels, valeurs marché, historique complet.

**Auth** : API key.

**Free tier** : 15 crédits gratuits à l'inscription.

**Pricing** : Sur devis après trial.

**Pièces** : API dédiée OEM parts catalog (noms pièces, numéros, dessins) par VIN.

---

### 5.6 auto.dev

**Provider** : auto.dev (USA, developer-first).

**Couverture** : USA principalement (plate-to-VIN uniquement pour plaques US).

**APIs disponibles** (11 core) : VIN Decode, Vehicle Listings, Photos, Specifications, Recalls, Total Cost of Ownership, Payments, Interest Rates, OEM Build Data, Open Recalls, Plate-to-VIN, Taxes & Fees.

**Auth** : API key (signup puis dashboard).

**Free tier** : 1000 appels/mois gratuits (plan Starter).

**Plans payants** : Growth et Scale (14 jours free trial).

**Limite principale** : USA uniquement. Pas de couverture EU confirmée.

---

## 6. Prix / cote / market value

### 6.1 autobiz API

**Provider** : autobiz (France, leader européen de la cotation et reprise VO).

**Couverture** : 22 marchés européens (France, Allemagne, Italie, Espagne, UK, Belgique, Pays-Bas, Portugal, Autriche, Pologne, etc.).

**Partenariat 2025** : Alliance stratégique autobiz x JATO Dynamics — fusion des données specs JATO + intelligence marché autobiz pour identification et valorisation dans 22 marchés EU.

**Données via API** :
- Identification véhicule depuis texte, immatriculation, VIN
- Cote B2C (particulier)
- Cote B2B (professionnel)
- Valeur future (résiduelle)
- Valeur de reprise
- Taux de rotation stock
- Attractivité du modèle sur le marché
- Données de vente sur 12 mois

**Auth** : Via contact commercial (formulaire). Pas de self-service.

**Architecture** : Microservices, 99.9% disponibilité.

**Pricing** : Sur devis. Pas de pricing public.

**Accès** : Formulaire de contact sur `corporate.autobiz.com`. Réponse via équipe commerciale.

**Recommandation** : Incontournable pour un template Swarm "Estimation VO Europe". Nécessite un RDV commercial.

---

### 6.2 API Argus (developer.largus.fr)

**Provider** : L'Argus (France, référence depuis 85+ ans). Propriété du groupe La Centrale / Axel Springer.

**Couverture** : France principalement.

**Données** : Cote Argus (neuf et occasion), reconnue par les professionnels et les professions réglementées (assurances, huissiers, etc.).

**Auth** : Via portail développeur Postman (documentation live maintenue).

**Accès** : `developer.largus.fr`. Documentation sur Postman Documenter.

**Pricing** : Non public. Contact commercial probable.

**Usage** : B2B (concessionnaires, assureurs, loueurs, régulateurs).

**Recommandation** : Premier choix pour un cas d'usage France. Contacter via le portail.

---

### 6.3 Autovista Group (Eurotax, Schwacke, Glass's, Rødboka)

**Provider** : Autovista Group, acquis par J.D. Power en 2023. 5 marques régionales.

**Couverture** :
- Eurotax : Autriche, Espagne, Suisse, Pologne, Hongrie, Roumanie, Portugal, Tchéquie, Slovaquie, Slovénie
- Schwacke : Allemagne
- Glass's : UK, Irlande
- Rødboka : Scandinavie

**Données** : Cote véhicule, prévisions valeur résiduelle, specs techniques, estimations réparation. Vue 360° du véhicule.

**Auth** : Via contact J.D. Power / Autovista Group.

**Pricing** : Sur devis. Positionnement enterprise.

**Accès** : Contact commercial uniquement. Pas de self-service.

**Recommandation** : Solution enterprise pour couverture EU complète. Délai de contractualisation important.

---

### 6.4 Marketcheck

**Provider** : MarketCheck (USA).

**Couverture** : US, Canada, UK. Europe continentale non couverte.

**Données** : 84k dealers, 262M VINs uniques, 540M listings retail, 146 trillions de données. Historical Price API pour tendances prix passés.

**Auth** : API key.

**Pricing** : Sur devis. Flexible pour professionnels.

**Limite** : Europe continentale non couverte.

---

### 6.5 vindecoder.eu — Vehicle Market Value

**Provider** : Vincario.

**Endpoint** : `/vehicle-market-value` — estimation de la valeur marchande d'un véhicule depuis le VIN.

**Couverture** : Europe + USA.

**Intérêt** : Combinaison VIN decode + estimation prix en un seul provider. Idéal pour prototype.

---

## 7. Fiabilité / pannes

### 7.1 TÜV Report (Allemagne)

**Source** : Basé sur ~10.2 millions d'inspections techniques annuelles en Allemagne (juillet 2023 - juin 2024 pour l'édition 2025). 228 modèles évalués, 6 catégories d'âge.

**Données** : Taux de défaillance par modèle et tranche d'âge, types de défauts courants, coût estimé de réparation.

**API** : Aucune API publique officielle. Les données sont publiées dans un rapport annuel (PDF + presse).

**Accès programmatique** : Via car-recalls.eu (site tiers qui compile les données TÜV + ADAC). Scraping possible mais CGU à vérifier.

**Exemple 2025** : Honda Jazz (2-3 ans) = 2.4% taux défaut. Tesla Model 3 = 14.2%.

**Recommandation** : Intégrer comme donnée qualitative référencée, pas via API temps réel. Créer une base statique JSON annuellement mise à jour.

---

### 7.2 ADAC (Allemagne)

**Source** : Automobile-Club allemand (24M membres). Données pannes roadside + evaluations techniques.

**API** : Aucune API publique.

**Accès** : Site ADAC (données pannes par modèle). car-recalls.eu compile aussi certaines données ADAC.

---

### 7.3 EU Safety Gate (RAPEX)

**Provider** : Commission Européenne. Système d'alerte rapide EU pour produits dangereux non-alimentaires.

**Couverture** : 31 pays EEE (EU + Norvège, Islande, Liechtenstein).

**Données** : Rappels produits (inclus véhicules) par pays d'origine, risques identifiés, mesures prises.

**API officielle** : Oui. Open Data via European Data Portal (`data.europa.eu`). Format CSV hebdomadaire. API disponible via `ec.europa.eu/safety-gate`.

**Auth** : Aucune. Open Data gratuit.

**Apify actor** : `studio-amba/safetygate-scraper` — accès programmatique aux données Safety Gate.

**Fréquence** : Mises à jour hebdomadaires (le vendredi).

**Recommandation** : Source officielle gratuite pour enrichir les fiches véhicule avec les rappels EU.

---

### 7.4 NHTSA Recalls API (USA)

**Provider** : NHTSA.

**Endpoint** : `https://www.nhtsa.gov/nhtsa-datasets-and-apis` — rappels par année/marque/modèle.

**Auth** : Aucune.

**Coût** : Gratuit.

**Complément** : auto.dev agrège NHTSA recalls dans leur endpoint `/open-recalls`.

---

### 7.5 Reliability Index (UK — Warrantywise)

**Provider** : Warrantywise (assureur UK).

**Données** : Index fiabilité basé sur 180 000+ demandes de réparation. Probabilité de panne par modèle, coût moyen de réparation.

**API** : Aucune API publique. Données via site web.

**Accès** : Publication annuelle. Scraping possible (site UK sans protection particulière).

---

### 7.6 MotorEasy Car Reliability Index (UK)

**Provider** : MotorEasy.

**Données** : Fréquence pannes, coûts réparation, problèmes mécaniques courants par modèle.

**API** : Aucune API publique référencée.

---

### 7.7 car-recalls.eu

**Type** : Agrégateur EU de données fiabilité.

**Données** : TÜV Report, ADAC, Safety Gate EU, NHTSA (US), rappels par modèle. Mise à jour hebdomadaire.

**Auth** : Aucune (site public).

**Scraping** : Techniquement possible. Pas d'API publique. Données peu structurées.

**Utilité** : Référence qualitative pour enrichir les templates Swarm (lier un modèle à ses rappels connus).

---

## 8. Pièces / OEM / compatibilité

### 8.1 TecDoc (TecAlliance)

**Provider** : TecAlliance (coentreprise des constructeurs et équipementiers européens). Standard industriel européen pour les pièces de rechange.

**Données** :
- 10M+ produits/pièces
- 800+ fabricants de pièces
- 110 000+ modèles véhicules (voitures, camions, utilitaires, motos)
- Références OEM croisées
- Compatibilité pièce ↔ véhicule par arbre (marque > modèle > motorisation > pièce)

**API officielle** : Oui. WebService API via TecAlliance. Licence commerciale requise. Accès via TecAlliance directement ou partenaires autorisés.

**Accès développeur** : Via `tecalliance.net/tecdoc-catalogue/`. Coût licence de base : ~219€/an pour accès online catalogue. API full developer : nécessite contrat commercial.

**Apify actor alternatif** : `making-data-meaningful/tecdoc` — **$69/mois + usage**. 1900+ utilisateurs, 4.4/5 (3 reviews), 31 actifs/mois. Multi-langues, filtrage par pays (Germany ID: 62). Données : fabricants, modèles, moteurs, catégories pièces (hiérarchiques), articles avec specs, références OEM croisées, applicabilité véhicule. Dernier update : 8 jours avant rédaction.

**Recommandation** : L'Apify actor est la voie la plus rapide pour tester. Licence TecAlliance officielle pour production.

---

### 8.2 Partslink24

**Provider** : Partslink24 (portail OEM premium).

**Données** : 15+ catalogues OEM premium (Audi, Porsche, BMW, Land Rover, etc.). Pièces OEM, illustrations, mapping VIN → pièce, codes peinture, options véhicule.

**Accès** : Portail web uniquement. Abonnement professionnel. Pas d'API publique documentée.

**Usage** : Carrossiers, réparateurs agrées. Non adapté à une intégration programmatique standard.

---

### 8.3 Autodoc

**Provider** : Autodoc (leader européen pièces détachées en ligne). B2C + B2B (Autodoc PRO : garages indépendants). Présent en France, Autriche, Belgique, Allemagne, Italie, Pays-Bas.

**Données** : Prix pièces, marques, disponibilité, fiches techniques, images.

**API officielle** : Intégration TecAlliance Order Manager (B2B). Pas d'API publique documentée pour les développeurs externes.

**Apify actor** : `lexis-solutions/autodoc-co-uk-scraper` — Scraper du site UK. Usage : veille concurrentielle prix pièces.

**Chiffres 2025** : 72.5M articles vendus, 18.9M commandes, 9.3M clients actifs.

---

### 8.4 vehicledatabases.com — Auto Parts API

**Provider** : Vehicle Databases.

**Données** : OEM car parts catalog par VIN. Noms pièces, numéros de référence, dessins techniques.

**Auth** : API key.

**Free tier** : 15 crédits gratuits.

**Avantage** : Combiné avec leur VIN decode EU, permet une approche one-stop-shop pour un template Swarm.

---

### 8.5 LKQ Corporation / Keystone Automotive

**Provider** : LKQ (leader mondial pièces alternatives, recyclées, spécialité).

**Présence** : USA + Europe (LKQ Europe).

**API** : B2B uniquement (partenaires agréés). API développée pour gestion du catalogue produit (CEEU region, 300+ clients B2B). Intégration WooCommerce via Keystone Automotive pour revendeurs.

**Accès** : Partenariat LKQ requis.

**Usage Swarm** : Pertinent pour un template "Pièces VO / Salvage" ciblant les marchands de VO avec pièces.

---

### 8.6 JATO Dynamics — Specifications API

**Provider** : JATO Dynamics (standards industry worldwide).

**Couverture** : 50+ marchés mondiaux.

**APIs disponibles** :
- JATO Index API (catalogue véhicules mondial, métadonnées)
- VINView API (décode VIN/VRM → JATO Instance ID)
- Specifications API (équipements standard OEM, options, packs, couleurs, codes officiels, prix)
- Comparison endpoint (comparaison multi-véhicules)
- WLTP Dynamic Values
- Incentives data

**Auth** : OAuth 2.0 JWT + Subscription Key (Primary + Secondary). Token valide 60 minutes.

**Free trial** : Disponible via developer portal (`developer.jato.com`).

**Pricing** : Sur devis.

**Avantage** : Référence absolue pour specs techniques OEM. Partenariat autobiz 2025 renforce la couverture valuation.

---

## 9. Stock marchand / dealer inventory

### 9.1 CDK Global / Fortellis

**Provider** : CDK Global (USA, leader DMS). Marketplace API : Fortellis (`fortellis.io`).

**Couverture** : USA + Canada principalement. Milliers de dealers.

**APIs disponibles** : Inventory Management, Buying & Selling, Auctions, Vehicle Information, CRM intégrations, Digital Contracting.

**Accès** : Via marketplace Fortellis. Pay-as-you-go. Développeurs peuvent créer un compte et accéder à des APIs sandbox.

**Auth** : OAuth 2.0.

**Limite** : USA/Canada. Pas de couverture Europe.

---

### 9.2 Manheim (Cox Automotive)

**Provider** : Manheim (plus grand réseau d'enchères automobiles aux USA). Filiale Cox Automotive.

**APIs disponibles** : Auction Information, Buying & Selling, Events & Subscriptions, Images, Inventory Management, Vehicle Information (Manheim Market Report — valuation de référence).

**Accès** : Via `developer.manheim.com`. Demande d'accès requise.

**Pricing** : Sur devis.

**Auth** : OAuth2 (authentification + autorisation documentées).

**Limite** : USA principalement.

---

### 9.3 Google Vehicle Listings (Structured Data)

**Statut** : Feature introduite en octobre 2023, **dépréciée en juin 2025**. Les dealers peuvent toujours utiliser schema.org/Vehicle pour l'indexation mais les rich results spécifiques vehiclelisting ne sont plus servis.

**Implication** : Pas une API à intégrer. Pertinent pour l'indexation SEO des templates Swarm.

**Schéma** : `schema.org/Vehicle` — champs : make, model, year, mileage, price, condition. Implémentation en JSON-LD sur chaque fiche véhicule générée.

---

### 9.4 Smartcar API (Véhicule connecté)

**Provider** : Smartcar (USA, fondé 2015).

**Couverture EU** : 37 marques, 30+ pays européens. Partenariat BMW Group Europe annoncé février 2025.

**Données** : Via consentement propriétaire du véhicule. Odométre, état batterie (EV), localisation, clé numérique, données chargement.

**Auth** : OAuth 2.0 (le propriétaire du véhicule autorise l'accès).

**Free tier** : Disponible. Signup self-service.

**Limite** : Nécessite le consentement explicite du propriétaire du véhicule (flow OAuth). Pas adapté pour scraping de stock marchand sans accord.

**Usage Swarm** : Pertinent pour un template "Fleet Management" ou "Usage-Based Insurance".

---

### 9.5 Stock marchand via AutoScout24 / mobile.de

Les Apify actors AutoScout24 et mobile.de extraient aussi les **informations dealer** (nom, localisation, note, spécialisation, inventaire affiché). Ces données constituent un proxy pour le stock marchand sans nécessiter d'accès DMS direct.

---

## 10. Apify actors utiles

Récapitulatif des actors Apify les plus pertinents pour la spécialisation Automotive Swarm.

### 10.1 AutoScout24 Scraper (blackfalcondata)
- **URL** : [apify.com/blackfalcondata/autoscout24-scraper](https://apify.com/blackfalcondata/autoscout24-scraper)
- **Pricing** : Pay-per-event. $0.005/run + $0.0008/résultat ≈ **$0.80/1000**
- **Champs** : listing ID, titre, URL, marque, modèle, prix, mileage, date immat, carburant, boîte, puissance, dealer (contact, notes), 24+ images, specs complètes, price rating AutoScout24
- **Qualité** : 46 users, 19 actifs/mois, support 3.6h, dernière MAJ il y a 1 jour
- **Atout unique** : Incremental tracking (NEW / UPDATED / REAPPEARED / EXPIRED). 80-95% d'économie sur runs récurrents.

### 10.2 AutoScout24 Scraper (3x1t)
- **URL** : [apify.com/3x1t/autoscout24-scraper](https://apify.com/3x1t/autoscout24-scraper)
- **Pricing** : Location $9.99/mois + usage
- **Champs** : marque, modèle, version, type, carrosserie, prix, rating, images, descriptions, équipements, dealer, dates, mileage, carburant, boîte, émissions
- **Limites** : Max 4000 résultats/query (workaround: sub-searches)
- **Qualité** : 5★/3 reviews, 91 users, 10 actifs/mois

### 10.3 Mobile.de Scraper (3x1t)
- **URL** : [apify.com/3x1t/mobile-de-scraper](https://apify.com/3x1t/mobile-de-scraper)
- **Pricing** : Location $9.99/mois + usage (~$0.30/1000)
- **Champs** : 40+ attributs véhicule, prix brut/net/TVA, rating, coordonnées dealer, notes, images, descriptions
- **Limites** : Max 2000 résultats/query
- **Qualité** : **5★/7 reviews**, 660 users, 47 actifs/mois. **Meilleur ratio qualité/prix**

### 10.4 Leboncoin Vehicle Scraper (3x1t)
- **URL** : [apify.com/3x1t/leboncoin-vehicle-scraper](https://apify.com/3x1t/leboncoin-vehicle-scraper)
- **Pricing** : Location $9.99/mois + usage
- **Champs** : Prix, marque, modèle, mileage, carburant, boîte, couleur, équipements, GPS, date, rating Argus intégré
- **Limites** : Max 3500 résultats/query, France uniquement
- **Qualité** : 19 users, 3 actifs/mois, 0 review (actor récent)

### 10.5 Auto Parts Catalog — TecDoc (making-data-meaningful)
- **URL** : [apify.com/making-data-meaningful/tecdoc](https://apify.com/making-data-meaningful/tecdoc)
- **Pricing** : **$69/mois + usage**
- **Champs** : Fabricants, modèles, moteurs, catégories pièces (hiérarchiques), articles + specs, refs OEM croisées, applicabilité véhicule. Multi-langues, filtrage par pays.
- **Qualité** : 4.4★/3 reviews, 1900+ users, 31 actifs/mois, support 1h

### 10.6 Vincario VIN Decoder (Apify actor officiel)
- **URL** : [apify.com/vincario/vincario-vin-decoder-api-services](https://apify.com/vincario/vincario-vin-decoder-api-services)
- **Pricing** : Basé sur les crédits Vincario (3 gratuits/mois)
- **Champs** : 50+ champs techniques. Identique à l'API directe.
- **Note** : Préférer l'API REST directe Vincario (plus flexible, même coût).

### 10.7 Kleinanzeigen Scraper (fatihtahta)
- **URL** : [apify.com/fatihtahta/ebay-kleinanzeigen-scraper](https://apify.com/fatihtahta/ebay-kleinanzeigen-scraper)
- **Pricing** : ~$1.50/1000 résultats
- **Champs** : Titre, prix EUR, localisation, specs véhicule basiques, photos, vendeur
- **Usage** : Marché allemand C2C secondaire

### 10.8 Copart Scraper (parseforge)
- **URL** : [apify.com/parseforge/copart-public-search-scraper](https://apify.com/parseforge/copart-public-search-scraper)
- **Pricing** : Sur devis + usage
- **Champs** : 168 champs par véhicule — lot metadata, VIN decode, classification dommages, odométre, titre, timing enchères, yard GPS, enchères actuelles, BIN price, réserve, galerie photos
- **Usage** : Template "Sourcing Salvage / Enchères"

### 10.9 Safety Gate Scraper (studio-amba)
- **URL** : [apify.com/studio-amba/safetygate-scraper](https://apify.com/studio-amba/safetygate-scraper)
- **Pricing** : Usage Apify uniquement
- **Champs** : Alertes rappels EU (tous produits, filtrables par catégorie "vehicles")
- **Usage** : Enrichissement fiabilité — données officielles EU

### 10.10 NHTSA Recalls Tracker (wiry_kingdom)
- **URL** : [apify.com/wiry_kingdom/nhtsa-recalls-tracker](https://apify.com/wiry_kingdom/nhtsa-recalls-tracker)
- **Pricing** : Usage Apify uniquement
- **Champs** : Rappels NHTSA par modèle/année/marque
- **Usage** : Enrichissement US recalls

---

## 11. Risques légaux / stabilité

### 11.1 Scraping : cadre légal 2025-2026

La jurisprudence 2024 a évolué favorablement pour les scrapers non-authentifiés :
- **Meta v. Bright Data (2024)** : Le ToS ne peut pas lier un acteur qui ne s'est jamais authentifié. Le scraping de données publiquement accessibles sans login peut être légal.
- **X Corp v. Bright Data (2024)** : Même principe — les CGU ne créent pas de contrat opposable sans acceptation active.

**Conséquences pratiques** :
- Scraping de pages publiques AutoScout24 sans compte = zone grise favorable
- Scraping avec compte authentifié = violation CGU certaine
- Utilisation commerciale des données = risque plus élevé (droit sui generis des bases de données en EU — directive 96/9/CE)

**RGPD** : Les données personnelles des vendeurs (nom, téléphone, email) extraites des annonces sont des données personnelles au sens RGPD. Leur collecte et traitement nécessitent une base légale. Pour un usage B2B (analyse de marché sans contact des vendeurs), le risque est faible. Pour un usage CRM/prospection, une base légale est requise.

### 11.2 robots.txt des principales plateformes

| Plateforme | robots.txt | Protection technique |
|---|---|---|
| AutoScout24 | Interdit les bots | Akamai bot protection, rate limiting 1-5 req/min |
| mobile.de | Interdit les bots | Protection anti-scraping active |
| Leboncoin | Interdit les bots | Cloudflare, détection comportementale |
| Kleinanzeigen | Interdit les bots | Protection modérée |
| HistoVec | Gouvernemental | Protection basique |

### 11.3 Stabilité des Apify actors

Risques de rupture lors des mises à jour des sites cibles :
- AutoScout24 met régulièrement à jour son front-end (Akamai)
- Les actors communautaires peuvent être abandonnés (vérifier "last modified")
- Privilegier les actors avec : MAJ < 30 jours, maintenance active, issues response time < 7 jours

**Actors stables identifiés** :
- `blackfalcondata/autoscout24-scraper` : MAJ il y a 1 jour, support 3.6h (exceptionnel)
- `making-data-meaningful/tecdoc` : MAJ il y a 8 jours, 1h support
- `3x1t/mobile-de-scraper` : MAJ il y a 5 mois — à surveiller

### 11.4 Risques providers APIs

| Provider | Stabilité | Risque |
|---|---|---|
| Vincario/vindecoder.eu | Élevée (entreprise établie) | Faible |
| carVertical | Élevée (11K partenaires) | Faible |
| Carapis | Moyenne (startup) | Moyen |
| autobiz | Élevée (leader EU) | Faible |
| auto-api.com | Inconnue | Moyen |
| TecAlliance TecDoc | Très élevée (consortium industriel) | Faible |
| JATO Dynamics | Élevée (50+ ans) | Faible |

### 11.5 Coûts réels à prendre en compte

**Plan Apify recommandé pour tests** : Starter $49/mois (inclut $5 de crédits compute).

**Coût total estimé pour un test initial** :
- Apify Starter : $49/mois
- AutoScout24 actor (blackfalcondata PPE) : ~$4-8 pour 5000-10000 annonces de test
- Mobile.de actor (3x1t) : $9.99/mois location
- TecDoc actor : $69/mois
- Vincario VIN : 3 lookups gratuits, puis ~$15/mois
- **Total test réaliste** : ~$80-140/mois pour couvrir annonces + pièces + VIN

---

## 12. Recommandation V1

### Source listings à tester en premier

**AutoScout24 via Apify actor `blackfalcondata/autoscout24-scraper`**

Justification :
1. Pay-per-event = pas de coût fixe obligatoire hors plan Apify
2. 8 marchés EU couverts (DE, AT, NL, BE, IT, FR, ES, CH) en un seul actor
3. Incremental tracking natif → idéal pour un Swarm "monitoring VO"
4. Price ratings AutoScout24 intégrés (top-price, good-price, fair-price)
5. Données dealer complètes (contact, notes, spécialisation)
6. Support ultra-réactif (3.6h) = actor maintenu activement
7. Pas de contrat commercial requis
8. Données immédiatement exploitables dans un template Swarm

### Source pièces / VIN à tester ensuite

**Vincario (vindecoder.eu) — VIN decode**

Justification :
1. Signup self-service, 3 lookups gratuits sans CB → peut tester en 5 minutes
2. 50+ champs techniques couvrant EU et US
3. API REST simple (clé + secret SHA1) → intégration backend rapide
4. Plans payants abordables (~$15/mois) si validation concluante
5. Endpoint bonus "Vehicle Market Value" pour estimation prix depuis VIN
6. Données de qualité documentée pour véhicules européens

---

## 13. Premier test recommandé

**Provider** : AutoScout24 via Apify actor `blackfalcondata/autoscout24-scraper`

**Pourquoi** : C'est le point d'entrée le plus rapide et le plus complet pour un template Swarm "Sourcing VO Europe". Données riches, 8 marchés, incremental tracking, pricing transparent (PPE), aucun contrat commercial.

**Effort estimé** : 2-4 heures pour un agent CrewAI fonctionnel.

**Données attendues** :
```json
{
  "id": "string",
  "title": "string",
  "url": "string",
  "make": "BMW",
  "model": "320d",
  "price": 18500,
  "currency": "EUR",
  "priceRating": "good-price",
  "mileage": 95000,
  "year": 2019,
  "fuel": "diesel",
  "transmission": "automatic",
  "power_kw": 140,
  "country": "DE",
  "city": "München",
  "dealer": {
    "name": "...",
    "rating": 4.3,
    "contact": "..."
  },
  "images": ["url1", "url2", ...],
  "features": ["Navigation", "Climatisation", ...],
  "changeType": "NEW|UPDATED|REAPPEARED|EXPIRED"
}
```

**Risques** :
- AutoScout24 peut bloquer l'actor si Akamai est mis à jour (risque modéré, actor maintenu activement)
- Données personnelles vendeurs soumises au RGPD (stocker sans contacter = faible risque)
- Pas d'API officielle = pas de garantie de continuité

**Comment tester** :
1. Créer un compte Apify (plan Starter $49/mois ou Free $0)
2. Ouvrir [apify.com/blackfalcondata/autoscout24-scraper](https://apify.com/blackfalcondata/autoscout24-scraper)
3. Lancer un test avec une URL de recherche AutoScout24 (ex: `https://www.autoscout24.com/lst/bmw/320d?sort=age&desc=0&cy=DE&atype=C`)
4. Paramétrer `maxResults: 100`, `mode: "incremental"`
5. Vérifier l'output JSON → intégrer dans un tool CrewAI Python
6. Créer un agent "Sourcing Analyst" qui parse les résultats et génère un rapport marché

---

## 14. Deuxième test recommandé

**Provider** : Vincario / vindecoder.eu

**Pourquoi** : Complète le premier test avec la couche VIN — indispensable pour enrichir les annonces VO (specs techniques, données constructeur). Self-service total, 3 lookups gratuits immédiats, API REST simple.

**Effort estimé** : 1-2 heures pour intégration dans un tool CrewAI.

**Données attendues** :
```json
{
  "vin": "WBAWX31090P152929",
  "make": "BMW",
  "model": "3 Series",
  "model_year": 2019,
  "body": "Sedan",
  "drive": "Rear-Wheel Drive",
  "fuel_type": "Diesel",
  "engine_displacement": 1995,
  "transmission_gears": 8,
  "emission_standard": "Euro 6d",
  "co2_emissions": 117,
  "max_speed": 240,
  "manufacturer_country": "Germany",
  "plant": "München"
}
```

**Risques** :
- VINs non reconnus ne sont pas décomptés (protection coût)
- Couverture EU déclarée mais profondeur variable selon pays et âge du véhicule
- Plans payants nécessaires si > 3 lookups/mois

**Comment tester** :
1. Signup sur `vincario.com` (ou `vindecoder.eu`) sans CB
2. Récupérer `api_key` + `secret_key` dans le dashboard
3. Tester l'endpoint REST : `GET https://api.vindecoder.eu/3.4/{api_key}/{control_sum}/decode/{vin}.json`
4. Intégrer comme tool CrewAI (`vin_decoder_tool`) appelé automatiquement après extraction d'une annonce AutoScout24
5. Valider la qualité des données sur 3 VINs de voitures allemandes récentes

---

## 15. Questions ouvertes

Les points suivants n'ont pas pu être confirmés et nécessitent un contact direct ou une investigation complémentaire :

1. **autobiz API pricing** — Aucun tarif public. Nécessite RDV commercial. Question : les tarifs sont-ils accessibles pour une startup / petite plateforme ou seulement pour grands groupes automobiles ?

2. **AutoScout24 API officielle (Listing Reading)** — L'API officielle est documentée pour la création d'annonces (dealers). Existe-t-il un endpoint de lecture en masse pour partenaires ? Le portail `portal.services.as24.tech/api-docs` n'a pas livré de détails précis.

3. **TecDoc accès direct developer** — Le prix officiel ~219€/an semble concerner l'accès catalogue online, pas l'API complète. Quel est le coût réel d'une licence API TecAlliance pour un intégrateur logiciel ?

4. **Carapis pricing** — Free tier documenté, plans payants non détaillés. Quel est le coût au-delà du free tier ? Quel est le SLA réel ?

5. **Leboncoin Vehicule Scraper qualité** — Actor récent (0 review, 3 actifs/mois). La qualité des données est-elle suffisante en production ? Un test réel est nécessaire.

6. **mobile.de API officielle** — services.mobile.de propose une API B2B partenaires. Les conditions d'accès et délais de contractualisation sont inconnus. Vaut-il la peine de contacter mobile.de directement pour un accès API officiel ?

7. **HistoVec API** — Le gouvernement français n'expose pas d'API publique HistoVec. Y a-t-il un accès B2B via le SIV pour les professionnels ? (Rapprochement avec Ministère de l'Intérieur).

8. **Argus API pricing** — Documentation sur Postman, mais pricing non public. Quel est le modèle tarifaire (abonnement fixe, pay-per-call, licence annuelle) ?

9. **Smartcar EU viabilité** — Partenariat BMW annoncé. Quels autres constructeurs EU sont couverts en pratique en 2026 ? La couverture des véhicules d'occasion (sans compte connecté du propriétaire) est-elle nulle ?

10. **auto-api.com pricing** — Formulaire de contact avec promesse "accès en 2 minutes". Y a-t-il un free trial ? Quel est le pricing réel pour AutoScout24 + mobile.de ?

11. **JATO Dynamics free trial** — Le portail developer.jato.com offre un free trial. Quelle est la durée et la limite du trial ? Quels endpoints sont accessibles sans abonnement ?

12. **Fiabilité TÜV via API** — Les données TÜV Report ne sont pas disponibles via une API publique. Existe-t-il un partenariat possible avec TÜV SÜD ou TÜV Rheinland pour un accès programmé aux données de fiabilité historiques ?

---

*Rapport généré le 2026-06-01. Sources : Apify Store, sites officiels providers, documentation API publique, recherches web. 32 providers analysés. Dernière vérification des URLs : 2026-06-01.*
