import { helper } from '@ember/component/helper';

export default helper(function multiply(params) {
  return params.reduce((result, val) => {
    const num = Number(val);
    return result * (isNaN(num) ? 1 : num);
  }, 1);
});
