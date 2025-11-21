import { helper } from '@ember/component/helper';

export default helper(function or(params) {
  return params.some(Boolean);
});
