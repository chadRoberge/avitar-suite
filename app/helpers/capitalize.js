import { helper } from '@ember/component/helper';

export default helper(function capitalize([str]) {
  if (!str || typeof str !== 'string') {
    return '';
  }

  return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
});
