import { helper } from '@ember/component/helper';

export function countChecked([items]) {
  if (!items || !Array.isArray(items)) {
    return 0;
  }
  return items.filter((item) => item.checked).length;
}

export default helper(countChecked);
