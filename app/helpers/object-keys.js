import { helper } from '@ember/component/helper';

export default helper(function objectKeys([obj]) {
  if (!obj || typeof obj !== 'object') {
    return [];
  }
  return Object.keys(obj);
});
