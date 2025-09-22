import { helper } from '@ember/component/helper';

export default helper(function includes([array, item]) {
  if (!Array.isArray(array)) {
    return false;
  }
  return array.includes(item);
});
