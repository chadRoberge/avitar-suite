import { helper } from '@ember/component/helper';

export default helper(function mod([dividend, divisor]) {
  const num1 = Number(dividend);
  const num2 = Number(divisor);

  if (isNaN(num1) || isNaN(num2) || num2 === 0) {
    return 0;
  }

  return num1 % num2;
});
