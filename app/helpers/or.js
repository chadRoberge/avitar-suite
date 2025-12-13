import { helper } from '@ember/component/helper';

export default helper(function or(params) {
  // Return the first truthy value, not a boolean
  return params.find((param) => param) || params[params.length - 1];
});
