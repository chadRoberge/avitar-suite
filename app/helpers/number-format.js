import { helper } from '@ember/component/helper';

export default helper(function numberFormat([amount, decimals = 0]) {
  if (amount == null || isNaN(amount)) {
    return '0';
  }

  const decimalPlaces = Math.max(0, parseInt(decimals) || 0);

  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: decimalPlaces,
    maximumFractionDigits: decimalPlaces,
  }).format(amount);
});
