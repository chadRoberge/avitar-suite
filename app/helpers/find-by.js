import { helper } from '@ember/component/helper';

export default helper(function findBy([property, value, array]) {
  if (!array || !Array.isArray(array)) {
    return null;
  }

  return array.find((item) => item[property] === value) || null;
});
