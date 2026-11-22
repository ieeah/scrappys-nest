import { describe, it, expect } from 'vitest';
import { resolveUnlocksItemId } from './unlocks-resolver.mjs';

describe('unlocks-resolver', () => {
  const mockItems = {
    'advanced-camera': {
      id: 'advanced-camera',
      name: 'Advanced Camera',
      item_type: 'Quick Use',
    },
    'advanced-camera-blueprint': {
      id: 'advanced-camera-blueprint',
      name: 'Advanced Camera Blueprint',
      item_type: 'Blueprint',
    },
    'anvil-i': {
      id: 'anvil-i',
      name: 'Anvil I',
      item_type: 'Weapon',
    },
    'anvil-recipe': {
      id: 'anvil-recipe',
      name: 'Anvil Blueprint',
      item_type: 'Blueprint',
    },
    'alpine-wardrobe': {
      id: 'alpine-wardrobe',
      name: 'Alpine Wardrobe',
      item_type: 'Furniture',
    },
    'alpine-wardrobe-design': {
      id: 'alpine-wardrobe-design',
      name: 'Alpine Wardrobe Design',
      item_type: 'Design',
    },
    'combat-mk-3-aggressive': {
      id: 'combat-mk-3-aggressive',
      name: 'Combat Mk. 3 (Aggressive)',
      item_type: 'Augment',
    },
    'combat-mk3-flanking': {
      id: 'combat-mk3-flanking',
      name: 'Combat Mk. 3 (Flanking)',
      item_type: 'Augment',
    },
    'combat-mk-3-flanking': {
      id: 'combat-mk-3-flanking',
      name: 'Combat Mk. 3 (Flanking) Blueprint',
      item_type: 'Blueprint',
    },
    'study-armchair': {
      id: 'study-armchair',
      name: 'Study Armchair',
      item_type: 'Furniture',
    },
    'study-armchair-res-armchair-01-a': {
      id: 'study-armchair-res-armchair-01-a',
      name: 'Study Armchair',
      item_type: 'Furniture',
    },
    'study-armchair-design-res-armchair-01-a': {
      id: 'study-armchair-design-res-armchair-01-a',
      name: 'Study Armchair Design',
      item_type: 'Design',
    },
    'study-armchair-design-res-sofa-01-y150-a': {
      id: 'study-armchair-design-res-sofa-01-y150-a',
      name: 'Study Armchair Design',
      item_type: 'Design',
    },
    'bantam': {
      id: 'bantam',
      name: 'Bantam',
      item_type: 'Weapon',
    },
    'bantam-ii': {
      id: 'bantam-ii',
      name: 'Bantam II',
      item_type: 'Weapon',
    },
    'bantam-blueprint': {
      id: 'bantam-blueprint',
      name: 'Bantam Blueprint',
      item_type: 'Blueprint',
    },
    'aphelion-rifle': {
      id: 'aphelion-rifle',
      name: 'Aphelion',
      item_type: 'Weapon',
    },
    'amplified-aphelion': {
      id: 'amplified-aphelion',
      name: 'Amplified Aphelion',
      item_type: 'Weapon',
    },
    'aphelion-rifle-blueprint': {
      id: 'aphelion-rifle-blueprint',
      name: 'Aphelion Blueprint',
      item_type: 'Blueprint',
    },
    'purification-system-blueprint': {
      id: 'purification-system-blueprint',
      name: 'Purification System Blueprint',
      item_type: 'Trinket',
    },
    'regular-iron': {
      id: 'regular-iron',
      name: 'Regular Iron',
      item_type: 'Basic Material',
    },
  };

  const mockBaseItems = {
    anvil: {
      id: 'anvil',
      blueprintItemId: 'anvil-recipe',
      variantItemIds: ['anvil-i', 'anvil-ii'],
    },
    bantam: {
      id: 'bantam',
      blueprintItemId: 'bantam-blueprint',
      variantItemIds: ['bantam-ii'],
    },
    aphelion: {
      id: 'aphelion',
      blueprintItemId: 'aphelion-rifle-blueprint',
      variantItemIds: ['amplified-aphelion', 'aphelion-rifle'],
    },
  };

  it('resolves blueprint via base items mapping', () => {
    const bp = mockItems['anvil-recipe'];
    expect(resolveUnlocksItemId(bp, mockItems, mockBaseItems)).toBe('anvil-i');
  });

  it('resolves blueprint by ID stripping suffix', () => {
    const bp = mockItems['advanced-camera-blueprint'];
    expect(resolveUnlocksItemId(bp, mockItems, mockBaseItems)).toBe('advanced-camera');
  });

  it('resolves design to corresponding furniture by ID stripping -design', () => {
    const design = mockItems['alpine-wardrobe-design'];
    expect(resolveUnlocksItemId(design, mockItems, mockBaseItems)).toBe('alpine-wardrobe');
  });

  it('resolves special cases like combat-mk-3-flanking augment', () => {
    const bp = mockItems['combat-mk-3-flanking'];
    expect(resolveUnlocksItemId(bp, mockItems, mockBaseItems)).toBe('combat-mk3-flanking');
  });

  it('prevents self-loops on designs and resolves study-armchair-design variants', () => {
    expect(resolveUnlocksItemId(mockItems['study-armchair-design-res-armchair-01-a'], mockItems, mockBaseItems))
      .toBe('study-armchair-res-armchair-01-a');
    expect(resolveUnlocksItemId(mockItems['study-armchair-design-res-sofa-01-y150-a'], mockItems, mockBaseItems))
      .toBe('study-armchair');
  });

  it('resolves baseItems blueprints to lvl 1 item and never amplified or II+', () => {
    expect(resolveUnlocksItemId(mockItems['bantam-blueprint'], mockItems, mockBaseItems)).toBe('bantam');
    expect(resolveUnlocksItemId(mockItems['aphelion-rifle-blueprint'], mockItems, mockBaseItems)).toBe('aphelion-rifle');
  });

  it('excludes Trinket items from blueprint resolution', () => {
    expect(resolveUnlocksItemId(mockItems['purification-system-blueprint'], mockItems, mockBaseItems)).toBeNull();
  });

  it('returns null for items that do not unlock anything', () => {
    const material = mockItems['regular-iron'];
    expect(resolveUnlocksItemId(material, mockItems, mockBaseItems)).toBeNull();
  });
});
