import { helper } from '@ember/component/helper';

export default helper(function dateFormat([date, format = 'MMM DD, YYYY']) {
  if (!date) {
    return '';
  }

  if (date === 'now') {
    date = new Date();
  }

  const dateObj = new Date(date);
  if (isNaN(dateObj.getTime())) {
    return '';
  }

  // Simple format handling for common formats
  const months = [
    'Jan',
    'Feb',
    'Mar',
    'Apr',
    'May',
    'Jun',
    'Jul',
    'Aug',
    'Sep',
    'Oct',
    'Nov',
    'Dec',
  ];

  if (format === 'MMM DD, YYYY') {
    return `${months[dateObj.getMonth()]} ${dateObj.getDate().toString().padStart(2, '0')}, ${dateObj.getFullYear()}`;
  }

  if (format === 'MM/DD/YYYY') {
    return `${(dateObj.getMonth() + 1).toString().padStart(2, '0')}/${dateObj.getDate().toString().padStart(2, '0')}/${dateObj.getFullYear()}`;
  }

  // Default fallback
  return dateObj.toLocaleDateString();
});
