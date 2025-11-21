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

  if (format === 'MM/DD/YY') {
    const year = dateObj.getFullYear().toString().slice(-2);
    return `${(dateObj.getMonth() + 1).toString().padStart(2, '0')}/${dateObj.getDate().toString().padStart(2, '0')}/${year}`;
  }

  if (format === 'MMM DD, YYYY hh:mm A') {
    const hours = dateObj.getHours();
    const minutes = dateObj.getMinutes();
    const ampm = hours >= 12 ? 'PM' : 'AM';
    const displayHours = hours % 12 || 12;
    return `${months[dateObj.getMonth()]} ${dateObj.getDate().toString().padStart(2, '0')}, ${dateObj.getFullYear()} ${displayHours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')} ${ampm}`;
  }

  // Default fallback
  return dateObj.toLocaleDateString();
});
