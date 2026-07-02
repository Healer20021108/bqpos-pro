import type { FeatureModule } from '../../core/types';
import { renderInventory } from './view';

const inventoryModule: FeatureModule = {
  id: 'inventory',
  title: '盤點模組',
  mount(container) {
    return renderInventory(container);
  },
};

export default inventoryModule;
