import { helper } from '@ember/component/helper';

export default helper(function ne([a, b]) {
  return a !== b;
});
