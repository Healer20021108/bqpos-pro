import type { FeatureModule } from '../../core/types';
import { renderKk } from './view';

const kkModule: FeatureModule = {
  id: 'kk',
  title: 'KK清帳',
  mount(container) {
    return renderKk(container);
  },
};

export default kkModule;
