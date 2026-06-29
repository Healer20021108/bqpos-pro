// 環球清帳模組進入點。對殼層只暴露 FeatureModule 介面。

import type { FeatureModule } from '../../core/types';
import { renderUniversal } from './view';

const universalModule: FeatureModule = {
  id: 'universal',
  title: '環球清帳',
  mount(container) {
    return renderUniversal(container);
  },
};

export default universalModule;
