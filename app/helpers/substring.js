import { helper } from '@ember/component/helper';

/**
 * substring helper
 * Usage: {{substring string start end}}
 * Example: {{substring "Hello" 0 1}} => "H"
 */
export default helper(function substring([string, start, end]) {
  if (!string) {
    return '';
  }
  return String(string).substring(start, end);
});
