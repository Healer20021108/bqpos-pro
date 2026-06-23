// 換錢決策模組進入點。對殼層只暴露 FeatureModule 介面。

import type { FeatureModule } from '../../core/types';
import { renderExchange } from './view';

const exchangeModule: FeatureModule = {
  id: 'exchange',
  title: '換錢決策',
  mount(container) {
    return renderExchange(container);
  },
};

export default exchangeModule;
