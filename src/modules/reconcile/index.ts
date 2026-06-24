// 雙POS對帳模組進入點。對殼層只暴露 FeatureModule 介面。

import type { FeatureModule } from '../../core/types';
import { renderReconcile } from './view';

const reconcileModule: FeatureModule = {
  id: 'reconcile',
  title: '雙POS對帳',
  mount(container) {
    return renderReconcile(container);
  },
};

export default reconcileModule;
