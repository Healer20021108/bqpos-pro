// 模組註冊表：新增功能時，在這裡 import 並加入陣列即可，分頁會自動出現。
//
// 未來新增模組範例：
//   import visionModule from './vision';
//   export const modules = [exchangeModule, visionModule];

import type { FeatureModule } from '../core/types';
import exchangeModule from './exchange';
import reconcileModule from './reconcile';
import universalModule from './universal';
import kkModule from './kk';
import inventoryModule from './inventory';

export const modules: FeatureModule[] = [
  exchangeModule,
  reconcileModule,
  universalModule,
  kkModule,
  inventoryModule,
];
