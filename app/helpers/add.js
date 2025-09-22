import { helper } from '@ember/component/helper';

export default helper(function add(params) {
  return params.reduce((sum, val) => {
    const num = Number(val);
    return sum + (isNaN(num) ? 0 : num);
  }, 0);
});
