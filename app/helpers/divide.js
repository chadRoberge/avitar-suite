import { helper } from '@ember/component/helper';

export default helper(function divide([dividend, divisor]) {
  if (divisor === 0) return 0;
  return Math.round((dividend / divisor) * 100) / 100; // Round to 2 decimal places
});
