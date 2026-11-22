/**
 * Risolve l'item sbloccato da un Blueprint o Design.
 *
 * Utilizzato da scripts/fetch-items.mjs per popolare il campo unlocks_item_id
 * nel catalogo degli oggetti.
 */

const DESIGN_ALIASES = {
  'study-armchair-design-res-sofa-01-y150-a': 'study-armchair',
};

function isBlueprint(item) {
  if (!item || item.item_type === 'Trinket') return false;
  return (
    item.item_type === 'Blueprint' ||
    item.subcategory === 'Blueprint' ||
    (typeof item.id === 'string' && (item.id.endsWith('-blueprint') || item.id.endsWith('-recipe')))
  );
}

function isDesign(item) {
  if (!item) return false;
  return item.item_type === 'Design' || item.subcategory === 'Design';
}

function isNonBaseVariant(id) {
  return id.startsWith('amplified-') || /-(ii|iii|iiii|iv)$/.test(id);
}

/**
 * Risolve l'ID dell'oggetto sbloccato da un blueprint o design.
 *
 * @param {Object} item L'oggetto da verificare (deve avere id, name, item_type, ecc.)
 * @param {Record<string, Object>} itemsMap Mappa di tutti gli oggetti per ID
 * @param {Object} baseItemsMap Mappa degli oggetti base (da item-variants.json)
 * @returns {string | null} ID dell'oggetto sbloccato, oppure null se non risolvibile o non applicabile
 */
export function resolveUnlocksItemId(item, itemsMap, baseItemsMap = {}) {
  if (!item) return null;

  if (!isBlueprint(item) && !isDesign(item)) {
    return null;
  }

  // 1. Logica per Design (arredi / personalizzazione rifugio)
  if (isDesign(item)) {
    if (DESIGN_ALIASES[item.id] && itemsMap[DESIGN_ALIASES[item.id]]) {
      return DESIGN_ALIASES[item.id];
    }
    const strippedId = item.id.replace(/-design$/, '').replace(/-design-/, '-');
    if (strippedId !== item.id && itemsMap[strippedId] && !isDesign(itemsMap[strippedId])) {
      return strippedId;
    }
    return null;
  }

  // 2. Casi speciali noti per Blueprint
  if (item.id === 'combat-mk-3-flanking') {
    return 'combat-mk3-flanking';
  }

  // 3. Verifica corrispondenza con baseItems (armi con varianti o ricette mappate)
  const bases = Object.values(baseItemsMap.baseItems ?? baseItemsMap);
  for (const base of bases) {
    if (base && base.blueprintItemId === item.id) {
      if (base.id && itemsMap[base.id] && !isBlueprint(itemsMap[base.id])) {
        return base.id;
      }
      if (Array.isArray(base.variantItemIds)) {
        const tier1 = base.variantItemIds.find(vId => vId.endsWith('-i') && itemsMap[vId]);
        if (tier1) return tier1;
        const baseVariant = base.variantItemIds.find(vId => !isNonBaseVariant(vId) && itemsMap[vId]);
        if (baseVariant) return baseVariant;
      }
      return null;
    }
  }

  // 4. Rimozione suffisso -(recipe|blueprint|bp)$
  const strippedId = item.id.replace(/-(recipe|blueprint|bp)$/, '');
  if (itemsMap[strippedId] && !isBlueprint(itemsMap[strippedId])) {
    return strippedId;
  }
  if (itemsMap[`${strippedId}-i`]) {
    return `${strippedId}-i`;
  }

  // 5. Match per nome pulito (rimuove il suffisso Blueprint/Recipe/Schema)
  if (item.name) {
    const cleanName = item.name.replace(/\s+(Blueprint|Recipe|Schema)$/i, '').trim().toLowerCase();

    // Corrispondenza esatta per nome pulito
    for (const candidate of Object.values(itemsMap)) {
      if (!isBlueprint(candidate) && candidate.name && candidate.name.toLowerCase() === cleanName) {
        return candidate.id;
      }
    }

    // Corrispondenza che inizia per nome pulito
    for (const candidate of Object.values(itemsMap)) {
      if (!isBlueprint(candidate) && candidate.name && candidate.name.toLowerCase().startsWith(cleanName)) {
        return candidate.id;
      }
    }
  }

  return null;
}
