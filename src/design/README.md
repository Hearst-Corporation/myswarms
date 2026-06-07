# `src/design/` — source unique du LOOK produit

Le look de MySwarms vit **ici**, pas éparpillé dans `globals.css` ni en doublon du package.

## Architecture (une seule source de vérité par dimension)

```
@hearst/cockpit-shell/tokens.css   ← tokens de base --ct-* (partagé, NE PAS recopier)
        ↓
src/app/globals.css                ← BASE seule (tailwind, mapping --background/--foreground, @theme)
        ↓
src/design/look.css                ← LE LOOK : overrides --ct-* du produit + règles .ct-*/.hive-*
                                      + accents [data-product="hive|automobile|..."]
```

Ordre d'import (dans `src/app/layout.tsx`) : `globals.css` → `tokens.css` → `design/look.css`.
`look.css` charge **après** le package → il **gagne** la cascade.

## Règles (non négociables)

1. **Token only.** Couleur / spacing / typo / radius / z-index / shadow = un token `--ct-*`.
   On l'override **une fois**, ici (`:root` de `look.css`). Jamais de hex/px en dur, jamais
   de constante JS qui recopie un token (ex. pas de `lib/z-index.ts` → lire `var(--ct-z-*)`).
2. **Ne JAMAIS re-déclarer** ce que le package fournit déjà à l'identique. Surcharger = seulement
   ce qui **diffère** du package. Une re-déclaration identique = doublon = collision = bug
   « je change X, Y casse ». (Voir `/design-adrien dedupe`.)
3. **`!important` = alarme.** S'il en faut un, c'est que la valeur devrait être dans le package
   (source partagée `~/.claude/assets/cockpit/`) ou que deux sources se battent → corriger la cause.
4. **Changement GLOBAL** (qui doit valoir pour tous les cockpits) = source partagée
   `~/.claude/assets/cockpit/` + rebuild du package, **pas** ici.
5. **Hardcodes de valeurs** dans les composants (px/hex en dur dans un `.tsx`) = ce n'est pas ici,
   c'est `/uiux-adrien` (hygiène des valeurs). Ici on tient l'**architecture**.

## Où change quoi

| Je veux… | Fichier |
|---|---|
| Changer un accent / couleur / spacing du produit | `src/design/look.css` (`:root`) |
| Restyler une primitive `.ct-*` du produit | `src/design/look.css` |
| Ajouter un token de base pour TOUS les cockpits | `~/.claude/assets/cockpit/` + rebuild |
| La base technique (tailwind, reset, @theme) | `src/app/globals.css` |
