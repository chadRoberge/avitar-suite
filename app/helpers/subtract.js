import { helper } from '@ember/component/helper';

export default helper(function subtract([a, b]) {
  if (a == null || b == null) {
    return 0;
  }

  const numA = Number(a);
  const numB = Number(b);

  if (isNaN(numA) || isNaN(numB)) {
    return 0;
  }

  return numA - numB;
});
