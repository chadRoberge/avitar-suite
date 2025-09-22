import { helper } from '@ember/component/helper';

export default helper(function formatCurrency([amount]) {
  if (amount == null || isNaN(amount)) {
    return '$0';
  }

  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
});
